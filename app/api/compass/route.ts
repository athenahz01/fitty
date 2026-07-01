import { NextResponse } from "next/server";

import {
  generateCompass,
  type CompassCareer,
  type CompassMajor,
} from "@/lib/compass";
import {
  compassRequestSchema,
  formatValidationError,
} from "@/lib/compass/schema";
import { compassEnabled, majorSimilarities } from "@/lib/compass/server";
import type { InferenceSchool } from "@/lib/model/inference";
import {
  assertMoneyLineage,
  buildMoneyPlan,
  type MoneyMeritRule,
  type MoneyNetPriceRow,
  type MoneyPlan,
  type MoneySchool,
} from "@/lib/money";
import { moneyEnabled } from "@/lib/money/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RateBucket = { count: number; resetAt: number };

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, RateBucket>();

const SCHOOL_COLUMNS =
  "unitid,name,country,setting,size,admit_rate,ed_admit_rate,rd_admit_rate,sat_25,sat_75,act_25,act_75,gpa_avg,test_policy,c7_factors,selectivity_tier";

function requesterKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

function checkRateLimit(request: Request) {
  const key = requesterKey(request);
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT) {
    return false;
  }
  current.count += 1;
  return true;
}

export async function POST(request: Request) {
  if (!compassEnabled()) {
    return NextResponse.json(
      { error: "Major/Career Compass is not enabled." },
      { status: 404 },
    );
  }

  if (!checkRateLimit(request)) {
    return NextResponse.json(
      { error: "Too many compass requests. Try again in a minute." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = compassRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatValidationError(parsed.error) },
      { status: 400 },
    );
  }

  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Supabase configuration is missing.",
      },
      { status: 500 },
    );
  }

  const [majorsResult, careersResult] = await Promise.all([
    supabase
      .from("compass_majors")
      .select("major_name,scorecard_field,median_earnings_10yr,source_url,provenance"),
    supabase
      .from("compass_careers")
      .select(
        "major_name,career_title,onet_code,median_wage_annual,source_url,provenance",
      ),
  ]);

  if (majorsResult.error || careersResult.error) {
    return NextResponse.json(
      { error: "Unable to load compass reference data." },
      { status: 500 },
    );
  }

  const majors = (majorsResult.data ?? []) as CompassMajor[];
  const careers = (careersResult.data ?? []) as CompassCareer[];

  let school: InferenceSchool | undefined;
  let money: MoneyPlan | undefined;
  if (parsed.data.unitid !== undefined) {
    const { data, error } = await supabase
      .from("schools")
      .select(SCHOOL_COLUMNS)
      .eq("unitid", parsed.data.unitid)
      .maybeSingle();
    if (error) {
      return NextResponse.json(
        { error: "Unable to load the school for admit odds." },
        { status: 500 },
      );
    }
    if (data) {
      school = data as unknown as InferenceSchool;

      if (moneyEnabled()) {
        const [meritResult, netPriceResult] = await Promise.all([
          supabase
            .from("money_merit_rules")
            .select(
              [
                "rule_id",
                "unitid",
                "school_name",
                "country",
                "scholarship_name",
                "residency",
                "currency",
                "amount_basis",
                "annual_amount",
                "total_value",
                "renewable_years",
                "gpa_min",
                "gpa_max",
                "sat_min",
                "sat_max",
                "act_min",
                "act_max",
                "percentage_min",
                "percentage_max",
                "priority",
                "source_url",
                "provenance",
                "notes",
              ].join(","),
            )
            .eq("unitid", parsed.data.unitid),
          supabase
            .from("money_net_price_bands")
            .select(
              [
                "unitid",
                "school_name",
                "country",
                "residency",
                "income_band",
                "currency",
                "sticker_price",
                "net_price",
                "median_earnings_10yr",
                "basis",
                "earnings_basis",
                "source_url",
                "earnings_source_url",
                "source_year",
                "provenance",
                "notes",
              ].join(","),
            )
            .eq("unitid", parsed.data.unitid),
        ]);

        if (meritResult.error || netPriceResult.error) {
          return NextResponse.json(
            { error: "Unable to load money reference data for ROI." },
            { status: 500 },
          );
        }

        const moneyNetRows = (netPriceResult.data ?? []) as unknown as MoneyNetPriceRow[];
        if (moneyNetRows.length > 0) {
          const moneyMeritRules = (meritResult.data ?? []) as unknown as MoneyMeritRule[];
          try {
            assertMoneyLineage({
              merit_rules: moneyMeritRules,
              net_price_bands: moneyNetRows,
            });
            const moneySchool = data as unknown as MoneySchool;
            money = buildMoneyPlan({
              school: moneySchool,
              profile: parsed.data.profile ?? {},
              meritRules: moneyMeritRules,
              netPriceRows: moneyNetRows,
              incomeBand: "overall",
              residency: moneySchool.country === "CA" ? "domestic" : "out_of_state",
            });
          } catch (error) {
            return NextResponse.json(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : "Money reference data failed lineage validation.",
              },
              { status: 500 },
            );
          }
        }
      }
    }
  }

  // Embedding-based major fit (best-effort). Numbers in the response (earnings,
  // admit odds) come from the data layer / Phase 1 engine, never from a model.
  let similarity: Record<string, number> = {};
  try {
    similarity = await majorSimilarities(
      parsed.data.interests,
      majors.map((major) => major.major_name),
    );
  } catch {
    similarity = {};
  }

  const result = generateCompass({
    majors,
    careers,
    studentInterests: parsed.data.interests,
    majorSimilarity: similarity,
    school,
    profile: parsed.data.profile,
    money,
  });

  return NextResponse.json(result);
}

import { NextResponse } from "next/server";

import {
  assertMoneyLineage,
  buildMoneyPlan,
  type MoneyMeritRule,
  type MoneyNetPriceRow,
  type MoneySchool,
} from "@/lib/money";
import {
  formatValidationError,
  moneyRequestSchema,
} from "@/lib/money/schema";
import { moneyEnabled } from "@/lib/money/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const SCHOOL_COLUMNS = "unitid,name,country";

export async function POST(request: Request) {
  if (!moneyEnabled()) {
    return NextResponse.json(
      { error: "Money is not enabled." },
      { status: 404 },
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

  const parsed = moneyRequestSchema.safeParse(body);
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

  const [schoolResult, meritResult, netPriceResult] = await Promise.all([
    supabase
      .from("schools")
      .select(SCHOOL_COLUMNS)
      .eq("unitid", parsed.data.unitid)
      .maybeSingle(),
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

  if (schoolResult.error) {
    return NextResponse.json(
      { error: "Unable to load the selected school." },
      { status: 500 },
    );
  }
  if (!schoolResult.data) {
    return NextResponse.json(
      { error: "School was not found." },
      { status: 404 },
    );
  }
  if (meritResult.error || netPriceResult.error) {
    return NextResponse.json(
      { error: "Unable to load sourced money reference data." },
      { status: 500 },
    );
  }

  const school = schoolResult.data as unknown as MoneySchool;
  const meritRules = (meritResult.data ?? []) as unknown as MoneyMeritRule[];
  const netPriceRows = (netPriceResult.data ?? []) as unknown as MoneyNetPriceRow[];

  if (netPriceRows.length === 0) {
    return NextResponse.json(
      { error: "No sourced money data is loaded for this school." },
      { status: 404 },
    );
  }

  try {
    assertMoneyLineage({ merit_rules: meritRules, net_price_bands: netPriceRows });
    const result = buildMoneyPlan({
      school,
      profile: parsed.data.profile,
      meritRules,
      netPriceRows,
      incomeBand: parsed.data.income_band,
      residency: parsed.data.residency,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Money calculation failed.",
      },
      { status: 500 },
    );
  }
}

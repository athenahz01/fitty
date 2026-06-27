import { NextResponse } from "next/server";

import { buildClimbRoadmap, type ClimbSchool } from "@/lib/climb";
import { climbEnabled } from "@/lib/climb/server";
import { climbRequestSchema, formatValidationError } from "@/lib/climb/schema";
import { assertNoForbiddenDemographicKeys } from "@/lib/outcomes/schemas";
import { createSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

type RateBucket = {
  count: number;
  resetAt: number;
};

const RATE_LIMIT = 24;
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, RateBucket>();

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
  if (!climbEnabled()) {
    return NextResponse.json(
      { error: "Climb Roadmap is not enabled." },
      { status: 404 },
    );
  }

  if (!checkRateLimit(request)) {
    return NextResponse.json(
      { error: "Too many Climb Roadmap requests." },
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

  try {
    assertNoForbiddenDemographicKeys(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Forbidden key." },
      { status: 400 },
    );
  }

  const parsed = climbRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatValidationError(parsed.error) },
      { status: 400 },
    );
  }

  const unitids = [...new Set(parsed.data.schools.map((school) => school.unitid))].sort(
    (left, right) => left - right,
  );

  let supabase;
  try {
    supabase = createSupabaseServerClient();
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

  const { data, error } = await supabase
    .from("schools")
    .select(
      "unitid,name,country,setting,size,admit_rate,ed_admit_rate,rd_admit_rate,sat_25,sat_75,act_25,act_75,gpa_avg,test_policy,c7_factors,selectivity_tier",
    )
    .in("unitid", unitids);

  if (error) {
    return NextResponse.json(
      { error: "Unable to load schools for Climb Roadmap." },
      { status: 500 },
    );
  }

  const schools = (data ?? []) as ClimbSchool[];
  if (schools.length === 0) {
    return NextResponse.json(
      { error: "No supported schools were found for Climb Roadmap." },
      { status: 404 },
    );
  }

  return NextResponse.json(buildClimbRoadmap(parsed.data.profile, schools));
}

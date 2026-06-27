import { NextResponse } from "next/server";

import { vectorToSql } from "@/lib/fit/matching";
import { assertNoForbiddenDemographicKeys } from "@/lib/outcomes/schemas";
import {
  STUDENTS_LIKE_YOU_K,
  STUDENTS_LIKE_YOU_MATCH_COUNT,
  studentsLikeYouResponse,
} from "@/lib/similarity";
import {
  formatValidationError,
  studentsLikeYouRequestSchema,
} from "@/lib/similarity/schema";
import {
  embedSimilarityProfile,
  studentsLikeYouEnabled,
} from "@/lib/similarity/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RateBucket = {
  count: number;
  resetAt: number;
};

const RATE_LIMIT = 20;
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

async function optionalSubjectId(
  request: Request,
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return null;
  }

  if (!authorization.startsWith("Bearer ")) {
    throw new Error("Invalid bearer token.");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new Error("Invalid bearer token.");
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Invalid bearer token.");
  }

  return data.user.id;
}

export async function POST(request: Request) {
  if (!studentsLikeYouEnabled()) {
    return NextResponse.json(
      { error: "Students-Like-You is not enabled." },
      { status: 404 },
    );
  }

  if (!checkRateLimit(request)) {
    return NextResponse.json(
      { error: "Too many Students-Like-You requests." },
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

  const parsed = studentsLikeYouRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatValidationError(parsed.error) },
      { status: 400 },
    );
  }

  let embedded;
  try {
    embedded = await embedSimilarityProfile(parsed.data.profile);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to embed the student profile.",
      },
      { status: 500 },
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

  let subjectId: string | null;
  try {
    subjectId = await optionalSubjectId(request, supabase);
  } catch {
    return NextResponse.json(
      { error: "Invalid Supabase user bearer token." },
      { status: 401 },
    );
  }

  const { data, error } = await supabase.rpc("match_similar_cohort", {
    p_profile_embedding: vectorToSql(embedded.vector),
    p_unitid: parsed.data.unitid ?? null,
    p_exclude_subject_id: subjectId,
    p_exclude_cycle_year: parsed.data.profile.cycle_year ?? null,
    p_k: STUDENTS_LIKE_YOU_K,
    p_match_count: STUDENTS_LIKE_YOU_MATCH_COUNT,
  });

  if (error) {
    return NextResponse.json(
      { error: "Unable to load similar-student cohorts." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    studentsLikeYouResponse({
      rows: data ?? [],
      model: embedded.model,
      dim: embedded.dim,
    }),
  );
}

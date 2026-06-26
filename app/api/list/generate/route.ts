import { NextResponse } from "next/server";

import { embedFitQuery } from "@/lib/fit/embed-query";
import { vectorToSql } from "@/lib/fit/matching";
import type { FitRequest } from "@/lib/fit/schema";
import { generateList, type ListCandidate } from "@/lib/list-builder";
import {
  formatValidationError,
  listRequestSchema,
} from "@/lib/list-builder/schema";
import { listBuilderEnabled } from "@/lib/list-builder/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const CANDIDATE_POOL_SIZE = 80;
const CANDIDATE_COLUMNS =
  "unitid,name,country,setting,size,admit_rate,sat_25,sat_75,act_25,act_75,gpa_avg,test_policy,c7_factors,selectivity_tier,program_areas,programs,net_price_avg,sticker_cost";

export async function POST(request: Request) {
  if (!listBuilderEnabled()) {
    return NextResponse.json(
      { error: "Smart List Builder is not enabled." },
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

  const parsed = listRequestSchema.safeParse(body);
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

  const { profile, preferences } = parsed.data;
  const queryText = [preferences.intended_major, preferences.interests]
    .filter(Boolean)
    .join(". ");

  let candidates: ListCandidate[] = [];

  if (queryText.length > 0) {
    // With a major/interest query we reuse the Fit Finder retrieval path so the
    // candidate pool carries the same embedding similarity the fit number is
    // built from. Canada is excluded this round (see note below).
    let embedding;
    try {
      embedding = await embedFitQuery({
        intended_major: preferences.intended_major,
        interests: preferences.interests,
        application_round: "regular",
      } as FitRequest);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to embed the list query.",
        },
        { status: 500 },
      );
    }

    const { data, error } = await supabase.rpc("match_fit_schools", {
      p_query_embedding: vectorToSql(embedding.vector),
      p_match_count: CANDIDATE_POOL_SIZE,
      p_preferred_region: null,
      p_preferred_size: null,
      p_preferred_setting: null,
      p_cost_ceiling: null,
      // Smart List Builder is US-only this round: Canadian admit scoring needs a
      // per-program native-basis average, which the list flow does not collect
      // yet. CA inclusion is gated behind ADMIRA_CANADA_ENABLED for a later
      // increment; until then we never pull CA rows into the pool.
      p_include_canada: false,
    });

    if (error) {
      return NextResponse.json(
        { error: "Unable to match schools for this list query." },
        { status: 500 },
      );
    }

    candidates = (data ?? []) as ListCandidate[];
  } else {
    // No major/interest text: fit cannot be scored, so we fall back to a stable
    // US candidate pool ordered by unitid (deterministic) and let the engine
    // bucket purely by admit tier. Fit is honestly reported as unscored.
    const { data, error } = await supabase
      .from("schools")
      .select(CANDIDATE_COLUMNS)
      .eq("country", "US")
      .order("unitid", { ascending: true })
      .limit(CANDIDATE_POOL_SIZE);

    if (error) {
      return NextResponse.json(
        { error: "Unable to load a candidate school pool." },
        { status: 500 },
      );
    }

    candidates = ((data ?? []) as unknown[]).map((row) => ({
      ...(row as ListCandidate),
      similarity: null,
    }));
  }

  const result = generateList({
    profile: {
      sat_score: profile.sat_score,
      act_score: profile.act_score,
      gpa: profile.gpa,
      application_round: profile.application_round,
    },
    preferences: {
      intended_major: preferences.intended_major,
      interests: preferences.interests,
      budget: preferences.budget,
      shape: preferences.shape,
    },
    candidates,
  });

  return NextResponse.json(result);
}

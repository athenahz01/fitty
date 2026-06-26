import { NextResponse } from "next/server";

import { embedFitQuery } from "@/lib/fit/embed-query";
import { computeFitScore } from "@/lib/fit/fit-score";
import { buildClimbLevers } from "@/lib/fit/levers";
import {
  FIT_CANDIDATE_POOL_SIZE,
  FIT_DISCLAIMERS,
  buildBalancedFitResponse,
  schoolMatchesHardFilters,
  vectorToSql,
  type FitSchoolCandidate,
} from "@/lib/fit/matching";
import { fitRequestSchema, formatValidationError } from "@/lib/fit/schema";
import { fitFinderEnabled } from "@/lib/fit/server";
import { canadaEnabled } from "@/lib/geo/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!fitFinderEnabled()) {
    return NextResponse.json({ error: "Fit Finder is not enabled." }, { status: 404 });
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

  const parsed = fitRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatValidationError(parsed.error) },
      { status: 400 },
    );
  }

  let embedding;
  try {
    embedding = await embedFitQuery(parsed.data);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to embed the fit query.",
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

  const { data, error } = await supabase.rpc("match_fit_schools", {
    p_query_embedding: vectorToSql(embedding.vector),
    p_match_count: FIT_CANDIDATE_POOL_SIZE,
    p_preferred_region: parsed.data.preferred_region ?? null,
    p_preferred_size: parsed.data.preferred_size ?? null,
    p_preferred_setting: parsed.data.preferred_setting ?? null,
    p_cost_ceiling: parsed.data.cost_ceiling ?? null,
    p_include_canada: canadaEnabled(),
  });

  if (error) {
    return NextResponse.json(
      { error: "Unable to match schools for this fit query." },
      { status: 500 },
    );
  }

  const candidates = ((data ?? []) as FitSchoolCandidate[]).filter((school) =>
    schoolMatchesHardFilters(school, parsed.data),
  );
  const unitids = candidates.map((candidate) => candidate.unitid);
  const extraRowsByUnitid = new Map<
    number,
    Pick<
      FitSchoolCandidate,
      "ed_admit_rate" | "rd_admit_rate" | "programs" | "control"
    >
  >();

  if (unitids.length > 0) {
    const { data: extraRows, error: extraError } = await supabase
      .from("schools")
      .select("unitid,ed_admit_rate,rd_admit_rate,programs,control")
      .in("unitid", unitids);

    if (extraError) {
      return NextResponse.json(
        { error: "Unable to load school lever data." },
        { status: 500 },
      );
    }

    for (const row of extraRows ?? []) {
      extraRowsByUnitid.set(Number(row.unitid), {
        ed_admit_rate: row.ed_admit_rate,
        rd_admit_rate: row.rd_admit_rate,
        programs: (row.programs as string[] | null) ?? null,
        control: (row.control as "public" | "private" | null) ?? null,
      });
    }
  }

  const enrichedCandidates = candidates.map((candidate) => ({
    ...candidate,
    programs: candidate.programs ?? null,
    control: candidate.control ?? null,
    ...(extraRowsByUnitid.get(candidate.unitid) ?? {}),
  }));
  const candidatesByUnitid = new Map(
    enrichedCandidates.map((candidate) => [candidate.unitid, candidate]),
  );
  const balanced = buildBalancedFitResponse(enrichedCandidates, parsed.data);
  const results = await Promise.all(
    balanced.results.map(async (result) => {
      const candidate = candidatesByUnitid.get(result.school.unitid);
      if (!candidate) {
        return result;
      }

      return {
        ...result,
        fit_score: await computeFitScore(parsed.data, candidate),
        climb_levers: buildClimbLevers(parsed.data, candidate),
      };
    }),
  );

  return NextResponse.json({
    query: {
      embedded: true,
      dim: embedding.dim,
      model: embedding.model,
    },
    results,
    balance: balanced.balance,
    weak_program_match: balanced.weak_program_match,
    top_program_fit: balanced.top_program_fit,
    disclaimers: FIT_DISCLAIMERS,
  });
}

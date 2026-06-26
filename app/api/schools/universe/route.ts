import { NextResponse } from "next/server";
import { z } from "zod";

import { embedFitQuery } from "@/lib/fit/embed-query";
import { vectorToSql } from "@/lib/fit/matching";
import type { FitRequest } from "@/lib/fit/schema";
import {
  buildUniverse,
  type SimilarProgram,
  type UniverseProgram,
} from "@/lib/universe";
import { universeEnabled } from "@/lib/universe/server";
import { canadaEnabled } from "@/lib/geo/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const SIMILAR_LIMIT = 4;
const SCHOOL_COLUMNS =
  "unitid,name,country,province_state,state,setting,size,selectivity_tier,admit_rate,sat_25,sat_75,act_25,act_75,gpa_avg,test_policy,net_price_avg,sticker_cost,median_earnings_10yr,completion_rate,program_areas,programs";

const requestSchema = z.object({
  unitid: z.preprocess(
    (value) => (typeof value === "string" ? Number(value) : value),
    z.number().int(),
  ),
});

export async function POST(request: Request) {
  if (!universeEnabled()) {
    return NextResponse.json(
      { error: "School Universe is not enabled." },
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

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A numeric unitid is required." }, { status: 400 });
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

  const { data: school, error: schoolError } = await supabase
    .from("schools")
    .select(SCHOOL_COLUMNS)
    .eq("unitid", parsed.data.unitid)
    .maybeSingle();

  if (schoolError) {
    return NextResponse.json(
      { error: `Unable to load school ${parsed.data.unitid}.` },
      { status: 500 },
    );
  }

  if (!school) {
    return NextResponse.json(
      { error: `School ${parsed.data.unitid} was not found.` },
      { status: 404 },
    );
  }

  const schoolRow = school as Record<string, unknown>;

  if (schoolRow.country === "CA" && !canadaEnabled()) {
    return NextResponse.json(
      { error: `School ${parsed.data.unitid} was not found.` },
      { status: 404 },
    );
  }

  const { data: programRows, error: programError } = await supabase
    .from("program_requirements")
    .select(
      "program_name,cutoff_avg_low,cutoff_avg_high,cutoff_basis,prerequisites,supplemental_app,broad_based_admission,source_url",
    )
    .eq("unitid", parsed.data.unitid);

  if (programError) {
    return NextResponse.json(
      { error: "Unable to load program requirements." },
      { status: 500 },
    );
  }

  const programs = (programRows ?? []) as UniverseProgram[];

  // Similar programs via the Fit Finder embeddings: embed this school's program
  // text, match nearest neighbors, drop self, keep same-country. Best-effort —
  // if the embedding model or match is unavailable we return an honest empty
  // set (the assembler adds a note) rather than failing the whole page.
  let similar: SimilarProgram[] = [];
  const programAreas = (schoolRow.program_areas as string[] | null) ?? [];
  const programText = programAreas.length > 0 ? programAreas.join(", ") : String(schoolRow.name);

  try {
    const embedding = await embedFitQuery({
      interests: programText,
      application_round: "regular",
    } as FitRequest);

    const { data: matches } = await supabase.rpc("match_fit_schools", {
      p_query_embedding: vectorToSql(embedding.vector),
      p_match_count: SIMILAR_LIMIT + 6,
      p_preferred_region: null,
      p_preferred_size: null,
      p_preferred_setting: null,
      p_cost_ceiling: null,
      p_include_canada: canadaEnabled(),
    });

    similar = ((matches ?? []) as Array<Record<string, unknown>>)
      .filter(
        (row) =>
          Number(row.unitid) !== parsed.data.unitid &&
          row.country === schoolRow.country,
      )
      .slice(0, SIMILAR_LIMIT)
      .map((row) => ({
        unitid: Number(row.unitid),
        name: String(row.name),
        similarity:
          typeof row.similarity === "number" ? row.similarity : null,
        program_areas: (row.program_areas as string[] | null) ?? null,
      }));
  } catch {
    similar = [];
  }

  const universe = buildUniverse({
    school: schoolRow as Parameters<typeof buildUniverse>[0]["school"],
    programs,
    similar,
  });

  return NextResponse.json(universe);
}

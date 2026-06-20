import { NextResponse } from "next/server";

import { buildChancePayload, getActiveArtifact } from "@/lib/model/inference";
import { buildClimbLevers } from "@/lib/fit/levers";
import { chanceRequestSchema, formatValidationError } from "@/lib/model/schema";
import { createSupabaseServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = chanceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatValidationError(parsed.error) },
      { status: 400 },
    );
  }

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

  const { data: school, error } = await supabase
    .from("schools")
    .select(
      "unitid,name,setting,size,admit_rate,ed_admit_rate,rd_admit_rate,sat_25,sat_75,act_25,act_75,gpa_avg,test_policy,c7_factors,selectivity_tier",
    )
    .eq("unitid", parsed.data.unitid)
    .maybeSingle();

  if (error) {
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

  const runtimeArtifact = getActiveArtifact();
  const payload = buildChancePayload(parsed.data, school, runtimeArtifact);

  return NextResponse.json({
    ...payload,
    climb_levers: buildClimbLevers(parsed.data, school, runtimeArtifact),
  });
}

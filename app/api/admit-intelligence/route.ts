import { NextResponse } from "next/server";
import { z } from "zod";

import { canadaEnabled } from "@/lib/geo/server";
import { buildCanadaProfileStudio } from "@/lib/profile";
import {
  findCanadaProgram,
  scoreCanadaProgram,
  type CanadaProgramRequirement,
} from "@/lib/score/canada";
import { admitIntelligenceEnabled } from "@/lib/score/server";
import { buildUsAdmitIntelligence } from "@/lib/score/us";
import { createSupabaseServerClient } from "@/lib/supabase";
import type { Database, GradingBasis } from "@/lib/types";

export const runtime = "nodejs";

const admitRequestSchema = z.object({
  unitid: z.number().int(),
  sat_score: z.number().int().min(400).max(1600).optional(),
  act_score: z.number().int().min(1).max(36).optional(),
  gpa: z.number().min(0).max(5).optional(),
  application_round: z.enum(["regular", "early"]).default("regular"),
  intended_major: z.string().trim().max(160).optional(),
  activity_context: z.string().trim().max(800).optional(),
  applicant_average: z.number().min(0).max(100).optional(),
  applicant_basis: z
    .enum(["gpa_4_0", "percentage", "cegep_r_score"])
    .default("percentage"),
  completed_prerequisites: z.array(z.string().trim().min(1).max(120)).max(24).optional(),
  program_name: z.string().trim().max(180).optional(),
});

type SchoolRow = Database["public"]["Tables"]["schools"]["Row"];

function formatValidationError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}

function asCanadaProgram(row: unknown): CanadaProgramRequirement {
  return row as CanadaProgramRequirement;
}

export async function POST(request: Request) {
  if (!admitIntelligenceEnabled()) {
    return NextResponse.json(
      { error: "Admit Intelligence is not enabled." },
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

  const parsed = admitRequestSchema.safeParse(body);
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
      "unitid,name,country,province_state,admission_system,grading_basis,broad_based_admission,setting,size,admit_rate,ed_admit_rate,rd_admit_rate,sat_25,sat_75,act_25,act_75,gpa_avg,test_policy,c7_factors,selectivity_tier",
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

  const schoolRow = school as SchoolRow;

  if (schoolRow.country === "CA") {
    if (!canadaEnabled()) {
      return NextResponse.json(
        { error: `School ${parsed.data.unitid} was not found.` },
        { status: 404 },
      );
    }

    if (parsed.data.applicant_average === undefined) {
      return NextResponse.json(
        { error: "applicant_average is required for Canadian programs." },
        { status: 400 },
      );
    }

    const { data: programRows, error: programError } = await supabase
      .from("program_requirements")
      .select(
        "program_name,cutoff_avg_low,cutoff_avg_high,cutoff_basis,prerequisites,supplemental_app,broad_based_admission,source_url",
      )
      .eq("unitid", schoolRow.unitid);

    if (programError) {
      return NextResponse.json(
        { error: "Unable to load Canadian program requirements." },
        { status: 500 },
      );
    }

    const program = findCanadaProgram(
      (programRows ?? []).map(asCanadaProgram),
      parsed.data.program_name ?? parsed.data.intended_major,
    );

    if (!program) {
      return NextResponse.json(
        { error: "No Canadian program requirement row is loaded for this school." },
        { status: 404 },
      );
    }

    const result = scoreCanadaProgram({
      applicantAverage: parsed.data.applicant_average,
      applicantBasis: parsed.data.applicant_basis as GradingBasis,
      completedPrerequisites: parsed.data.completed_prerequisites,
      program,
    });

    return NextResponse.json({
      score: result.score,
      tier: result.tier,
      drivers: result.drivers,
      confidence: result.confidence,
      country: "CA",
      program: {
        name: program.program_name,
        source_url: program.source_url,
        cutoff: result.cutoff,
      },
      profile: buildCanadaProfileStudio({
        applicantAverage: parsed.data.applicant_average,
        program,
        result,
        activityContext: parsed.data.activity_context,
      }),
      probability: {
        calibrated: result.calibrated,
      },
    });
  }

  const result = buildUsAdmitIntelligence(
    {
      unitid: parsed.data.unitid,
      sat_score: parsed.data.sat_score,
      act_score: parsed.data.act_score,
      gpa: parsed.data.gpa,
      application_round: parsed.data.application_round,
      intended_major: parsed.data.intended_major,
      activity_context: parsed.data.activity_context,
    },
    schoolRow,
  );

  return NextResponse.json(result);
}

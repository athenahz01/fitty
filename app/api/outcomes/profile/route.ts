import { NextResponse } from "next/server";

import {
  applicantProfileSchema,
  assertNoForbiddenDemographicKeys,
} from "@/lib/outcomes/schemas";
import {
  captureDisabledResponse,
  errorResponse,
  outcomeCaptureEnabled,
  readJsonBody,
  subjectIdFromRequest,
  writeAccessLog,
} from "@/lib/outcomes/server";
import { vectorToSql } from "@/lib/fit/matching";
import { embedSimilarityProfile } from "@/lib/similarity/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  if (!outcomeCaptureEnabled()) {
    return captureDisabledResponse();
  }

  try {
    const subjectId = await subjectIdFromRequest(request);
    const body = await readJsonBody(request);
    assertNoForbiddenDemographicKeys(body);
    const parsed = applicantProfileSchema.parse(body);
    const supabase = createSupabaseServiceRoleClient();
    const embedded = await embedSimilarityProfile({
      cycle_year: parsed.cycle_year,
      gpa: parsed.gpa,
      sat_score: parsed.sat_score,
      act_score: parsed.act_score,
      test_submitted: parsed.test_submitted,
      course_rigor: parsed.course_rigor ?? "unknown",
      activities_tier: parsed.activities_tier ?? "unknown",
      intended_major: parsed.intended_major ?? undefined,
      application_round: parsed.application_round,
      demonstrated_interest: parsed.demonstrated_interest ?? "unknown",
    });

    const { data, error } = await supabase
      .from("applicant_profiles")
      .insert({
        ...parsed,
        subject_id: subjectId,
        course_rigor: parsed.course_rigor ?? null,
        activities_tier: parsed.activities_tier ?? null,
        intended_major: parsed.intended_major ?? null,
        demonstrated_interest: parsed.demonstrated_interest ?? null,
        gpa: parsed.gpa ?? null,
        sat_score: parsed.sat_score ?? null,
        act_score: parsed.act_score ?? null,
        profile_embedding: vectorToSql(embedded.vector),
        profile_embedding_model: embedded.model,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await writeAccessLog(
      subjectId,
      "profile_created",
      1,
      "subject created a consented applicant profile for modeling",
    );

    return NextResponse.json({ applicant_profile: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 400);
  }
}

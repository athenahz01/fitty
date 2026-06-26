import type { InferenceSchool } from "../model/inference";
import type { ChanceRequest } from "../model/schema";
import type { CanadaProgramRequirement, CanadaScoreResult } from "../score/canada";

export type ProfileAxisKey =
  | "academics"
  | "rigor"
  | "test"
  | "extracurricular"
  | "fit";

export type ProfileAxis = {
  key: ProfileAxisKey;
  label: string;
  value: number;
  admitted: number;
  status: "strong" | "steady" | "stretch";
  note: string;
};

export type ProfileStudio = {
  axes: ProfileAxis[];
  method: string;
};

type BuildUsProfileInput = {
  request: ChanceRequest & {
    intended_major?: string;
    activity_context?: string;
  };
  school: InferenceSchool;
};

type BuildCanadaProfileInput = {
  applicantAverage: number;
  program: CanadaProgramRequirement;
  result: CanadaScoreResult;
  activityContext?: string;
};

function clampScore(value: number) {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function status(value: number, admitted = 75): ProfileAxis["status"] {
  if (value >= admitted + 6) {
    return "strong";
  }
  if (value >= admitted - 8) {
    return "steady";
  }
  return "stretch";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scoreFromBand(value: number | undefined, low: unknown, high: unknown) {
  const lowNumber = numberOrNull(low);
  const highNumber = numberOrNull(high);
  if (value === undefined || lowNumber === null || highNumber === null) {
    return 55;
  }
  if (value >= highNumber) {
    return 90;
  }
  if (value <= lowNumber) {
    return 48;
  }
  return 64 + ((value - lowNumber) / Math.max(1, highNumber - lowNumber)) * 20;
}

function ratingValue(value: unknown) {
  switch (value) {
    case "Very Important":
      return 86;
    case "Important":
      return 76;
    case "Considered":
      return 64;
    case "Not Considered":
      return 54;
    default:
      return 60;
  }
}

function activityScore(activityContext?: string) {
  const length = activityContext?.trim().length ?? 0;
  if (length >= 120) {
    return 82;
  }
  if (length >= 40) {
    return 70;
  }
  return 55;
}

function axis(
  key: ProfileAxisKey,
  label: string,
  value: number,
  admitted: number,
  note: string,
): ProfileAxis {
  const score = clampScore(value);
  return {
    key,
    label,
    value: score,
    admitted,
    status: status(score, admitted),
    note,
  };
}

export function buildUsProfileStudio(input: BuildUsProfileInput): ProfileStudio {
  const satScore = scoreFromBand(
    input.request.sat_score,
    input.school.sat_25,
    input.school.sat_75,
  );
  const actScore = scoreFromBand(
    input.request.act_score,
    input.school.act_25,
    input.school.act_75,
  );
  const gpaAverage = numberOrNull(input.school.gpa_avg);
  const gpaScore =
    input.request.gpa !== undefined && gpaAverage !== null
      ? 58 + ((input.request.gpa - gpaAverage) / 0.35) * 12
      : 58;
  const academics = clampScore((satScore + actScore + gpaScore) / 3);
  const rigor = clampScore((academics + ratingValue(input.school.c7_factors?.rigor)) / 2);
  const test =
    input.school.test_policy === "blind"
      ? 72
      : clampScore(Math.max(satScore, actScore));
  const extracurricular = clampScore(
    (activityScore(input.request.activity_context) +
      ratingValue(input.school.c7_factors?.extracurriculars)) /
      2,
  );
  const fit = input.request.intended_major?.trim() ? 72 : 58;

  return {
    method:
      "US axes compare submitted academics to CDS C9-C12-style score bands and C7 importance ratings.",
    axes: [
      axis("academics", "Academics", academics, 78, "GPA and submitted tests against loaded admitted-student bands."),
      axis("rigor", "Rigor", rigor, 78, "Academic read blended with the school's CDS rigor rating."),
      axis("test", "Test", test, 76, "Submitted SAT/ACT against the public middle 50 where available."),
      axis("extracurricular", "Extracurricular Impact", extracurricular, 74, "Activity context blended with CDS extracurricular importance."),
      axis("fit", "Fit", fit, 72, "Intended major presence against the school/program context available today."),
    ],
  };
}

export function buildCanadaProfileStudio(
  input: BuildCanadaProfileInput,
): ProfileStudio {
  const low = input.result.cutoff.low ?? input.applicantAverage;
  const high = input.result.cutoff.high ?? low + 3;
  const academics =
    input.applicantAverage < low
      ? 45 + (input.applicantAverage - low) * 2
      : input.applicantAverage <= high
        ? 66 + ((input.applicantAverage - low) / Math.max(1, high - low)) * 14
        : 82 + Math.min(12, (input.applicantAverage - high) * 2);
  const prereqDriver = input.result.drivers.find(
    (driver) => driver.label === "Prerequisites",
  );
  const prereqValue =
    prereqDriver?.direction === "negative"
      ? 58
      : prereqDriver?.direction === "positive"
        ? 84
        : 68;
  const broadBased = input.program.broad_based_admission ? 68 : 76;
  const extracurricular = input.program.broad_based_admission
    ? activityScore(input.activityContext)
    : 66;

  return {
    method:
      "Canada axes compare applicant average to the program cutoff band in its native basis, with prerequisites and broad-based flags from program_requirements.",
    axes: [
      axis("academics", "Academics", academics, 76, "Applicant average against the published program cutoff band."),
      axis("rigor", "Rigor", prereqValue, 76, "Loaded prerequisite match for the selected Canadian program."),
      axis("test", "Test", 72, 72, "Canadian seed rows do not require SAT/ACT for this cutoff read."),
      axis("extracurricular", "Extracurricular Impact", extracurricular, 72, "Activity context matters most when broad-based review is flagged."),
      axis("fit", "Fit", broadBased, 74, "Program-level fit from the selected requirement row and review system."),
    ],
  };
}

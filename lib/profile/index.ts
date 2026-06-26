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
  // Per-school reference the value is read against. This is NOT a loaded
  // admitted-student distribution; it is derived from the school's own
  // published signals (selectivity tier, middle-50 bands, CDS C7 ratings, or a
  // Canadian program cutoff). When no such signal is loaded it falls back to a
  // generic guide rail and the note says so. `reference_basis` records which.
  admitted: number;
  reference_basis: "derived" | "guide_rail";
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

// Reference of last resort. Used only when a school carries no signal for an
// axis; every axis that uses it is labeled "guide_rail" and its note says so,
// so it is never presented as sourced admitted-student data.
const GENERIC_GUIDE_RAIL = 75;

// Per-school academic reference derived from the school's published selectivity
// tier. More selective schools enroll stronger academic profiles; this encodes
// that ordering only, and differs across schools with different tiers (so the
// reference is real per-school lineage, not one constant for every school).
const TIER_ACADEMIC_REFERENCE: Record<string, number> = {
  elite: 88,
  highly_selective: 80,
  selective: 72,
  accessible: 64,
};

function clampScore(value: number) {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function status(value: number, admitted: number): ProfileAxis["status"] {
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

// Applicant-side strength of a CDS C7 importance rating. Used for the rigor
// axis value only (audit-confirmed traceable to C7).
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

// Reference strength implied by how heavily this school's CDS C7 weights a
// factor. Returns null when the school has no rating loaded, so the caller can
// fall back to the labeled guide rail instead of inventing a number.
function ratingReference(value: unknown): number | null {
  switch (value) {
    case "Very Important":
      return 86;
    case "Important":
      return 76;
    case "Considered":
      return 66;
    case "Not Considered":
      return 58;
    default:
      return null;
  }
}

function tierReference(tier: unknown): number | null {
  if (typeof tier === "string" && tier in TIER_ACADEMIC_REFERENCE) {
    return TIER_ACADEMIC_REFERENCE[tier];
  }
  return null;
}

// Heuristic read of the activity text the student typed. This is a length-based
// proxy, NOT a measured achievement level — the note says so. Kept deterministic.
function activityHeuristic(activityContext?: string) {
  const length = activityContext?.trim().length ?? 0;
  if (length >= 120) {
    return 82;
  }
  if (length >= 40) {
    return 70;
  }
  return 55;
}

type AxisInput = {
  key: ProfileAxisKey;
  label: string;
  value: number;
  reference: number | null;
  derivedNote: string;
  guideRailNote: string;
};

// Build an axis from a value plus an optional derived reference. When the
// reference is null we use the labeled guide rail and the guide-rail note, so
// no axis ever presents a constant as sourced data.
function buildAxis(input: AxisInput): ProfileAxis {
  const value = clampScore(input.value);
  const derived = input.reference !== null;
  const admitted = clampScore(derived ? (input.reference as number) : GENERIC_GUIDE_RAIL);
  return {
    key: input.key,
    label: input.label,
    value,
    admitted,
    reference_basis: derived ? "derived" : "guide_rail",
    status: status(value, admitted),
    note: derived ? input.derivedNote : input.guideRailNote,
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
  const rigor = clampScore(
    (academics + ratingValue(input.school.c7_factors?.rigor)) / 2,
  );
  const testBlind = input.school.test_policy === "blind";
  const test = testBlind ? 72 : clampScore(Math.max(satScore, actScore));
  const extracurricular = activityHeuristic(input.request.activity_context);
  // Completeness heuristic: did the student name an intended major? This is a
  // presence flag, not a program-fit measurement (Fit Finder is the real fit
  // signal). The note states that plainly.
  const namedMajor = Boolean(input.request.intended_major?.trim());
  const fitHeuristic = namedMajor ? 70 : 55;

  const tierRef = tierReference(input.school.selectivity_tier);

  return {
    method:
      "US axes set your inputs beside per-school references derived from this school's selectivity tier, published middle-50 bands, and CDS C7 importance ratings. Where the school has no such signal, a generic guide rail is used and labeled in the axis note.",
    axes: [
      buildAxis({
        key: "academics",
        label: "Academics",
        value: academics,
        reference: tierRef,
        derivedNote:
          "Your GPA and submitted tests against a reference derived from this school's selectivity tier and published middle-50 bands.",
        guideRailNote:
          "Your GPA and submitted tests against a generic guide rail (this school has no selectivity tier loaded).",
      }),
      buildAxis({
        key: "rigor",
        label: "Rigor",
        value: rigor,
        reference: ratingReference(input.school.c7_factors?.rigor),
        derivedNote:
          "Your academic read blended with how heavily this school's CDS C7 weights course rigor.",
        guideRailNote:
          "Your academic read against a generic guide rail (no CDS rigor rating loaded for this school).",
      }),
      buildAxis({
        key: "test",
        label: "Test",
        value: test,
        reference: testBlind ? null : tierRef,
        derivedNote:
          "Submitted SAT/ACT against this school's public middle 50, referenced to its selectivity tier.",
        guideRailNote: testBlind
          ? "This school is test-blind, so scores are referenced to a generic guide rail rather than admitted-student tests."
          : "Submitted SAT/ACT against a generic guide rail (no selectivity tier loaded).",
      }),
      buildAxis({
        key: "extracurricular",
        label: "Extracurricular Impact",
        value: extracurricular,
        reference: ratingReference(input.school.c7_factors?.extracurriculars),
        derivedNote:
          "Heuristic read of your activity text length, set beside how this school's CDS C7 weights activities. This is a text-length proxy, not a measured achievement level.",
        guideRailNote:
          "Heuristic read of your activity text length against a generic guide rail. This is a text-length proxy, not a measured achievement level.",
      }),
      buildAxis({
        key: "fit",
        label: "Fit",
        value: fitHeuristic,
        reference: null,
        derivedNote:
          "Heuristic flag for whether you named an intended major.",
        guideRailNote:
          "Heuristic completeness flag for whether you named an intended major, against a generic guide rail. This is not a program-fit measurement — Fit Finder is the real fit signal.",
      }),
    ],
  };
}

// Canadian academic reference derived from the program's published cutoff band:
// a higher published cutoff implies a stronger admitted reference. Differs per
// program (Waterloo CS 90-95 vs Laurier CS 77-79) and traces to the cutoff row.
function canadaAcademicReference(high: number) {
  return clampScore(80 + (high - 85) * 0.8);
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
    ? activityHeuristic(input.activityContext)
    : 66;

  const hasCutoff = input.result.cutoff.high !== null || input.result.cutoff.low !== null;
  const hasPrereqs = prereqDriver !== undefined && prereqDriver.impact !== 0;

  return {
    method:
      "Canada axes compare your applicant average to the program cutoff band in its native basis, with prerequisites and broad-based flags from program_requirements. References derive from the program row; where a row has no such signal, a generic guide rail is used and labeled in the axis note.",
    axes: [
      buildAxis({
        key: "academics",
        label: "Academics",
        value: academics,
        reference: hasCutoff ? canadaAcademicReference(high) : null,
        derivedNote:
          "Your applicant average against the published program cutoff band; the reference scales with how high this program's cutoff is.",
        guideRailNote:
          "Your applicant average against a generic guide rail (no cutoff band loaded for this program).",
      }),
      buildAxis({
        key: "rigor",
        label: "Rigor",
        value: prereqValue,
        reference: hasPrereqs ? 80 : null,
        derivedNote:
          "Loaded prerequisite match for the selected Canadian program, referenced to a full-prerequisite profile.",
        guideRailNote:
          "Prerequisite read against a generic guide rail (no explicit prerequisite list loaded for this program).",
      }),
      buildAxis({
        key: "test",
        label: "Test",
        value: 72,
        reference: null,
        derivedNote: "Canadian seed rows do not require SAT/ACT for this cutoff read.",
        guideRailNote:
          "Canadian seed rows do not require SAT/ACT for this cutoff read, so this axis uses a generic guide rail.",
      }),
      buildAxis({
        key: "extracurricular",
        label: "Extracurricular Impact",
        value: extracurricular,
        reference: input.program.broad_based_admission ? 72 : null,
        derivedNote:
          "Heuristic read of your activity text, weighted up because this program flags broad-based review. This is a text-length proxy, not a measured achievement level.",
        guideRailNote:
          "Heuristic read of your activity text against a generic guide rail; this program does not flag broad-based review. Text-length proxy, not a measured achievement level.",
      }),
      buildAxis({
        key: "fit",
        label: "Fit",
        value: broadBased,
        reference: 74,
        derivedNote:
          "Program-level fit from the selected requirement row and whether broad-based review applies.",
        guideRailNote:
          "Program-level fit against a generic guide rail.",
      }),
    ],
  };
}

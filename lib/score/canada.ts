import type { GradingBasis, ProgramRequirement } from "../types";

import type { Driver } from "./drivers";
import { toHeadlineScore } from "./headline";
import { tierFromProbability, type AdmitTier } from "./tiers";

export type CanadaProgramRequirement = Pick<
  ProgramRequirement,
  | "program_name"
  | "cutoff_avg_low"
  | "cutoff_avg_high"
  | "cutoff_basis"
  | "prerequisites"
  | "supplemental_app"
  | "broad_based_admission"
  | "source_url"
>;

export type CanadaScoreInput = {
  applicantAverage: number;
  applicantBasis: GradingBasis;
  completedPrerequisites?: string[];
  program: CanadaProgramRequirement;
};

export type CanadaScoreResult = {
  calibrated: number;
  score: number;
  tier: AdmitTier;
  confidence: number;
  drivers: Driver[];
  cutoff: {
    low: number | null;
    high: number | null;
    basis: GradingBasis;
  };
};

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
}

function clampProbability(value: number) {
  return Math.min(0.95, Math.max(0.05, value));
}

function normalizePrereq(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function prerequisitesFromRow(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function prerequisiteMatch(
  required: string[],
  completed: string[] | undefined,
) {
  if (required.length === 0) {
    return 1;
  }
  if (!completed || completed.length === 0) {
    return 0;
  }

  const completedTokens = new Set(completed.map(normalizePrereq));
  const matched = required.filter((requirement) => {
    const token = normalizePrereq(requirement);
    return [...completedTokens].some(
      (completedToken) =>
        completedToken.includes(token) || token.includes(completedToken),
    );
  });

  return matched.length / required.length;
}

function probabilityFromCutoff(applicantAverage: number, low: number, high: number) {
  if (applicantAverage < low) {
    return clampProbability(0.29 + (applicantAverage - low) * 0.035);
  }

  if (applicantAverage <= high) {
    const span = Math.max(1, high - low);
    return 0.36 + ((applicantAverage - low) / span) * 0.18;
  }

  return clampProbability(0.56 + Math.min(0.34, (applicantAverage - high) * 0.045));
}

function driver(
  label: string,
  direction: Driver["direction"],
  impact: number,
  detail: string,
): Driver {
  return {
    label,
    direction,
    impact: Math.round(impact * 100) / 100,
    detail,
  };
}

// Pure basis-compatibility check shared by the route. Returns a user-facing
// 400 message when the applicant's basis cannot be compared to the program's
// native cutoff basis (or no basis is loaded), or null when scoring is safe.
// The route returns 400 with this message; scoreCanadaProgram keeps its own
// throw as defense-in-depth.
export function canadaBasisError(
  applicantBasis: GradingBasis,
  program: Pick<CanadaProgramRequirement, "cutoff_basis" | "program_name">,
): string | null {
  if (!program.cutoff_basis) {
    return `This program ("${program.program_name}") has no cutoff basis loaded, so it cannot be scored yet.`;
  }
  if (applicantBasis !== program.cutoff_basis) {
    return `This program is scored on ${program.cutoff_basis}; resubmit applicant_average in that basis (sent ${applicantBasis}).`;
  }
  return null;
}

export function scoreCanadaProgram(input: CanadaScoreInput): CanadaScoreResult {
  assertFinite(input.applicantAverage, "applicant average");

  const cutoffBasis = input.program.cutoff_basis;
  if (!cutoffBasis) {
    throw new Error("Canada program cutoff_basis is required");
  }

  if (input.applicantBasis !== cutoffBasis) {
    throw new Error(
      `Cannot compare ${input.applicantBasis} applicant average to ${cutoffBasis} cutoff`,
    );
  }

  const low = input.program.cutoff_avg_low;
  const high = input.program.cutoff_avg_high ?? low;
  if (low === null || high === null) {
    throw new Error("Canada program cutoff_avg_low is required");
  }

  const orderedHigh = Math.max(low, high);
  const baseProbability = probabilityFromCutoff(
    input.applicantAverage,
    low,
    orderedHigh,
  );
  const requirements = prerequisitesFromRow(input.program.prerequisites);
  const prereqMatch = prerequisiteMatch(requirements, input.completedPrerequisites);
  const prereqPenalty = requirements.length === 0 ? 0 : (1 - prereqMatch) * 0.22;
  const broadBasedPenalty =
    input.program.broad_based_admission || input.program.supplemental_app
      ? 0.03
      : 0;
  const calibrated = clampProbability(
    baseProbability - prereqPenalty - broadBasedPenalty,
  );
  const tier = tierFromProbability(calibrated);

  const margin = input.applicantAverage - low;
  const drivers = [
    driver(
      "Admission average",
      margin >= 0 ? "positive" : "negative",
      Math.abs(margin),
      `${input.applicantAverage} ${cutoffBasis} vs ${low}${high ? `-${orderedHigh}` : ""} published band.`,
    ),
    driver(
      "Prerequisites",
      prereqMatch >= 1 ? "positive" : "negative",
      requirements.length === 0 ? 0 : 1 - prereqMatch,
      requirements.length === 0
        ? "No explicit prerequisite list is loaded for this row."
        : `${Math.round(prereqMatch * 100)}% of loaded prerequisites matched.`,
    ),
    driver(
      "Broad-based review",
      broadBasedPenalty > 0 ? "negative" : "neutral",
      broadBasedPenalty,
      broadBasedPenalty > 0
        ? "Supplemental or broad-based review tempers a cutoff-only read."
        : "This row is treated as cutoff-led reference data.",
    ),
  ].sort((left, right) => right.impact - left.impact);

  return {
    calibrated,
    score: toHeadlineScore(calibrated),
    tier,
    confidence: Math.round((0.82 - broadBasedPenalty - prereqPenalty / 2) * 100) / 100,
    drivers,
    cutoff: {
      low,
      high: input.program.cutoff_avg_high,
      basis: cutoffBasis,
    },
  };
}

export function findCanadaProgram(
  programs: CanadaProgramRequirement[],
  requestedProgram?: string | null,
) {
  if (programs.length === 0) {
    return null;
  }

  const query = requestedProgram?.trim().toLowerCase();
  if (!query) {
    return programs[0];
  }

  return (
    programs.find((program) =>
      program.program_name.toLowerCase().includes(query),
    ) ??
    programs.find((program) =>
      query.includes(program.program_name.toLowerCase()),
    ) ??
    programs[0]
  );
}

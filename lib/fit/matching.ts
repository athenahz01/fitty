import type { FitRequest } from "./schema";
import { EMBEDDING_DIM } from "./embedding-model";
import {
  PROGRAM_FIT_WEAK_THRESHOLD,
  blendProgramFit,
  keywordProgramScore,
} from "./program-fit";
import type { InferenceSchool } from "../model/inference";
import { buildChancePayload } from "../model/inference";
import type {
  AdmissionSystem,
  Country,
  GradingBasis,
  SchoolRegion,
  SchoolSizeBand,
  SelectivityTier,
} from "../types";

export const FIT_CANDIDATE_POOL_SIZE = 60;
export const FIT_RESULT_LIMIT = 12;

type BandLabel = "reach" | "target" | "likely";
type CostStatus = "within_ceiling" | "over_ceiling" | "unknown";

export type FitSchoolCandidate = InferenceSchool & {
  state: string | null;
  province_state: string | null;
  country: Country;
  admission_system: AdmissionSystem | null;
  grading_basis: GradingBasis;
  broad_based_admission: boolean;
  region: SchoolRegion | null;
  size_band: SchoolSizeBand | null;
  setting: "city" | "suburb" | "town" | "rural" | null;
  selectivity_tier: SelectivityTier | null;
  net_price_avg: number | null;
  sticker_cost: number | null;
  program_areas: string[] | null;
  programs: string[] | null;
  control: "public" | "private" | null;
  median_earnings_10yr: number | null;
  completion_rate: number | null;
  similarity?: number | null;
};

export type FitResult = {
  school: {
    unitid: number;
    name: string;
    country: Country;
    province_state: string | null;
    region: SchoolRegion | null;
    size_band: SchoolSizeBand | null;
    setting: "city" | "suburb" | "town" | "rural" | null;
    selectivity_tier: SelectivityTier | null;
    net_price_avg: number | null;
    sticker_cost: number | null;
    program_areas: string[] | null;
  };
  match_reasons: {
    matched: string[];
    notable: string[];
    cost_status: CostStatus;
  };
  probability: {
    point: number;
    calibrated: number;
    low: number;
    high: number;
    width: number;
    coverage: number;
  };
  band: {
    label: BandLabel;
    wide_band: boolean;
  };
};

export type FitBalance = Record<BandLabel, number> & {
  note: string;
};

const BAND_ORDER = ["reach", "target", "likely"] as const;
const STOPWORDS = new Set([
  "and",
  "the",
  "with",
  "for",
  "school",
  "schools",
  "college",
  "colleges",
  "program",
  "programs",
  "major",
  "majors",
  "style",
  "learning",
]);

export const FIT_DISCLAIMERS = [
  "Fit uses published attributes only; campus culture and social fit are not modeled.",
  "Affordability uses published net price or sticker cost. Merit aid is not predicted.",
  "Chances are calibrated ranges, not guarantees.",
];

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeToken(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (normalized.length > 4 && normalized.endsWith("s")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function preferenceTokens(input: FitRequest) {
  const text = [
    input.interests,
    input.intended_major,
    input.learning_style_notes,
  ]
    .filter(Boolean)
    .join(" ");

  return new Set(
    text
      .split(/[^a-zA-Z0-9]+/)
      .map(normalizeToken)
      .filter((token) => token.length >= 4 && !STOPWORDS.has(token)),
  );
}

function programMatches(input: FitRequest, programAreas: string[] | null) {
  if (!programAreas || programAreas.length === 0) {
    return [];
  }

  const tokens = preferenceTokens(input);
  if (tokens.size === 0) {
    return [];
  }

  return [...programAreas]
    .sort((left, right) => left.localeCompare(right))
    .filter((program) => {
      const programTokens = program
        .split(/[^a-zA-Z0-9]+/)
        .map(normalizeToken)
        .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
      return programTokens.some((token) => tokens.has(token));
    });
}

function costBasis(school: Pick<FitSchoolCandidate, "net_price_avg" | "sticker_cost">) {
  return toNumber(school.net_price_avg) ?? toNumber(school.sticker_cost);
}

export function schoolMatchesHardFilters(
  school: FitSchoolCandidate,
  input: FitRequest,
) {
  if (input.preferred_region && school.region !== input.preferred_region) {
    return false;
  }
  if (input.preferred_size && school.size_band !== input.preferred_size) {
    return false;
  }
  if (input.preferred_setting && school.setting !== input.preferred_setting) {
    return false;
  }
  if (input.cost_ceiling !== undefined) {
    const cost = costBasis(school);
    if (cost !== null && cost > input.cost_ceiling) {
      return false;
    }
  }
  if (input.selectivity_tier && school.selectivity_tier !== input.selectivity_tier) {
    return false;
  }
  if (input.control && school.control !== input.control) {
    return false;
  }
  if (input.min_grad_rate !== undefined) {
    const completion = toNumber(school.completion_rate);
    // Only exclude when a graduation rate is published and falls below the
    // floor; missing data is never used to silently drop a school.
    if (completion !== null && completion < input.min_grad_rate) {
      return false;
    }
  }

  return true;
}

export function costStatus(school: FitSchoolCandidate, input: FitRequest): CostStatus {
  if (input.cost_ceiling === undefined) {
    return "unknown";
  }

  const cost = costBasis(school);
  if (cost === null) {
    return "unknown";
  }

  return cost <= input.cost_ceiling ? "within_ceiling" : "over_ceiling";
}

export function buildMatchReasons(
  school: FitSchoolCandidate,
  input: FitRequest,
) {
  const matched = [];
  const notable = [];

  if (input.preferred_region && school.region === input.preferred_region) {
    matched.push("region");
  }
  if (input.preferred_size && school.size_band === input.preferred_size) {
    matched.push("size");
  }
  if (input.preferred_setting && school.setting === input.preferred_setting) {
    matched.push("setting");
  }

  const currentCostStatus = costStatus(school, input);
  if (currentCostStatus === "within_ceiling") {
    matched.push("cost within ceiling");
  }

  if (input.selectivity_tier && school.selectivity_tier === input.selectivity_tier) {
    matched.push(`selectivity ${school.selectivity_tier.replace(/_/g, " ")}`);
  }
  if (input.control && school.control === input.control) {
    matched.push(school.control);
  }
  if (input.min_grad_rate !== undefined) {
    const completion = toNumber(school.completion_rate);
    if (completion !== null && completion >= input.min_grad_rate) {
      matched.push(`graduation rate ${Math.round(completion * 100)}%`);
    }
  }

  for (const program of programMatches(input, school.program_areas)) {
    matched.push(`programs: ${program.toLowerCase()}`);
  }

  const completion = toNumber(school.completion_rate);
  if (completion !== null) {
    notable.push(`completion ${completion.toFixed(2)}`);
  }

  const earnings = toNumber(school.median_earnings_10yr);
  if (earnings !== null) {
    notable.push(`median earnings 10yr ${Math.round(earnings)}`);
  }

  return {
    matched,
    notable,
    cost_status: currentCostStatus,
  };
}

export function vectorToSql(vector: readonly number[]) {
  if (
    vector.length !== EMBEDDING_DIM ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(`Query vector must have ${EMBEDDING_DIM} finite dimensions`);
  }

  return `[${vector.map((value) => value.toFixed(8)).join(",")}]`;
}

export function buildFitResult(
  candidate: FitSchoolCandidate,
  input: FitRequest,
): FitResult {
  const chance = buildChancePayload(
    {
      unitid: candidate.unitid,
      sat_score: input.sat_score,
      act_score: input.act_score,
      gpa: input.gpa,
      application_round: input.application_round,
    },
    candidate,
  );

  return {
    school: {
      unitid: candidate.unitid,
      name: candidate.name,
      country: candidate.country,
      province_state: candidate.province_state,
      region: candidate.region,
      size_band: candidate.size_band,
      setting: candidate.setting,
      selectivity_tier: candidate.selectivity_tier,
      net_price_avg: candidate.net_price_avg,
      sticker_cost: candidate.sticker_cost,
      program_areas: candidate.program_areas,
    },
    match_reasons: buildMatchReasons(candidate, input),
    probability: chance.probability,
    band: {
      label: chance.band.label,
      wide_band: chance.band.wide_band,
    },
  };
}

export function fitQueryText(input: FitRequest) {
  return [input.intended_major, input.interests]
    .map((value) => value?.replace(/\s+/g, " ").trim())
    .filter((value): value is string => Boolean(value))
    .join(". ");
}

// Cheap program/interest fit used for ranking the candidate pool: the same
// hybrid blend the full fit score reports, but without the extra radar
// embedding, so the whole pool can be ordered before the detailed score is
// computed for the survivors.
export function programFitScore(
  input: FitRequest,
  candidate: FitSchoolCandidate,
): number | null {
  const query = fitQueryText(input);
  if (!query) {
    return null;
  }
  const keyword = keywordProgramScore(
    query,
    candidate.programs,
    candidate.program_areas,
  );
  return blendProgramFit(keyword.score, candidate.similarity);
}

function balanceNote(counts: Record<BandLabel, number>, total: number) {
  const nonzero = BAND_ORDER.filter((label) => counts[label] > 0);
  if (total === 0) {
    return "No schools matched the filters and embedded candidate pool.";
  }
  if (nonzero.length === 1) {
    return `Every returned school landed in ${nonzero[0]} based on the chancing ranges.`;
  }
  if (nonzero.length < BAND_ORDER.length) {
    return "Ranked by program fit. Some chance bands are not present after filters.";
  }
  return "Ranked by program fit, then labeled reach, target, or likely by the chance range.";
}

export type RankedFitResponse = {
  results: FitResult[];
  balance: FitBalance;
  weak_program_match: boolean;
  top_program_fit: number | null;
};

// Rank the candidate pool by program/interest fit (descending), keep the top
// results, then label the set across reach/target/likely with the existing
// chance band. A school the student merely overshoots on stats can no longer
// outrank one that genuinely matches the requested programs.
export function buildBalancedFitResponse(
  candidates: FitSchoolCandidate[],
  input: FitRequest,
  limit = FIT_RESULT_LIMIT,
): RankedFitResponse {
  const hasProgramQuery = fitQueryText(input).length > 0;
  const scored = candidates
    .filter((candidate) => schoolMatchesHardFilters(candidate, input))
    .map((candidate) => ({
      candidate,
      programFit: programFitScore(input, candidate),
    }))
    .sort((left, right) => {
      const leftFit = left.programFit ?? -1;
      const rightFit = right.programFit ?? -1;
      if (rightFit !== leftFit) {
        return rightFit - leftFit;
      }
      const leftSim = left.candidate.similarity ?? -1;
      const rightSim = right.candidate.similarity ?? -1;
      if (rightSim !== leftSim) {
        return rightSim - leftSim;
      }
      return left.candidate.unitid - right.candidate.unitid;
    });

  const selected = scored.slice(0, limit);
  const results = selected.map((entry) => buildFitResult(entry.candidate, input));

  const counts = {
    reach: results.filter((result) => result.band.label === "reach").length,
    target: results.filter((result) => result.band.label === "target").length,
    likely: results.filter((result) => result.band.label === "likely").length,
  };

  const topProgramFit = selected.length > 0 ? selected[0].programFit : null;
  const weakProgramMatch =
    hasProgramQuery &&
    selected.length > 0 &&
    (topProgramFit ?? 0) < PROGRAM_FIT_WEAK_THRESHOLD;

  return {
    results,
    balance: {
      ...counts,
      note: balanceNote(counts, results.length),
    } satisfies FitBalance,
    weak_program_match: weakProgramMatch,
    top_program_fit: topProgramFit,
  };
}

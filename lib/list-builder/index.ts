// Smart List Builder — pure, deterministic engine (Phase 2).
//
// Given a student profile + preferences + a candidate pool of schools, this
// returns an auto-balanced reach/target/safety list with a one-line, honest
// rationale per school. It is framework-free (no Supabase, no env, no time, no
// RNG) so the API route, the offline tests, and any evaluation share one source
// of truth. The API route is the only thing that touches the database; it hands
// this engine the already-fetched candidate rows.
//
// ── Objective function (the ONLY thing that drives order) ───────────────────
//
//   desirability(school) = W_FIT * fitNorm + W_COST * affordability
//
//     fitNorm       = (fit ?? 50) / 100                    in [0, 1]
//     affordability = 1                      when no budget is given
//                   = 1                      when net price <= budget
//                   = max(0, 1 - over/budget) when net price >  budget
//                   = 0.6 (neutral)          when a budget is given but the
//                                            school has no published net price
//
//   W_FIT = 0.7, W_COST = 0.3 (exported, documented, the same for every school).
//
// There is NO per-school boost, no sponsored weight, and no hardcoded
// "preferred" school. Two schools with the same desirability are ordered by
// `unitid` ascending — a stable tie-break, never a quality signal. A reviewer
// can reproduce the order by hand from (tier-bucket, desirability, unitid).
//
// ── Balance ─────────────────────────────────────────────────────────────────
//
// Tiers come from the Phase 1 admit engine (NOT a new calculation): each US
// school's tier is `tierFromProbability(calibrated)` on the same public-prior
// chance the /api/admit-intelligence route returns, so a school's tier here is
// identical to its tier there. The four engine tiers fold into three list
// buckets: Reach→reach, Target→target, Likely|Safety→safety. The list takes the
// top `shape` schools per bucket by desirability (default 3 reach / 4 target /
// 3 safety), so it spreads across tiers instead of collapsing to all-reach.
//
// ── Honesty rules ────────────────────────────────────────────────────────────
//
// * Net cost is `net_price_avg` only. When it is absent we say so; we never
//   substitute sticker price or invent a number. (Merit / predicted aid is
//   Phase 4 and deliberately absent here.)
// * Every rationale clause is generated from this school's real computed
//   tier + fit + net cost — never a templated claim that isn't checked.
// * Outcome data (earnings, completion) is NOT fed into ranking (leakage —
//   that is Phase 3 territory).
// * Canada is out of scope this round (CA admit scoring needs a per-program
//   native-basis average); non-US candidates are excluded and counted.

import {
  blendProgramFit,
  keywordProgramScore,
  PROGRAM_FIT_WEAK_THRESHOLD,
} from "../fit/program-fit";
import { buildChancePayload, type InferenceSchool } from "../model/inference";
import { tierFromProbability, type AdmitTier } from "../score/tiers";
import type { Country } from "../types";

export const OBJECTIVE_WEIGHTS = { fit: 0.7, cost: 0.3 } as const;
export const DEFAULT_LIST_SHAPE = { reach: 3, target: 4, safety: 3 } as const;
export const OVERLOOKING_COUNT = 2;
export const OVERLOOKING_MIN_FIT = 55;
// Neutral affordability for a budgeted student when a school publishes no net
// price: missing data is never used to silently drop or boost a school.
export const UNKNOWN_COST_AFFORDABILITY = 0.6;
export const NEUTRAL_FIT = 50;
export const LIST_BUILDER_METHOD = "list_builder_objective_v1";

export type ListBucket = "reach" | "target" | "safety";

export type ListShape = { reach: number; target: number; safety: number };

// A candidate is an inference-ready school row plus the fit/cost fields the
// engine reads. The API fills these from `match_fit_schools` + `schools`.
export type ListCandidate = InferenceSchool & {
  country: Country;
  programs?: string[] | null;
  program_areas?: string[] | null;
  net_price_avg?: number | null;
  sticker_cost?: number | null;
  similarity?: number | null;
};

export type ListProfile = {
  sat_score?: number;
  act_score?: number;
  gpa?: number;
  application_round?: "regular" | "early";
};

export type ListPreferences = {
  intended_major?: string;
  interests?: string;
  budget?: number;
  shape?: ListShape;
};

export type ListSchool = {
  unitid: number;
  name: string;
  tier: AdmitTier;
  bucket: ListBucket;
  fit: number | null;
  net_cost: number | null;
  // true/false only when both a budget and a net price exist; null otherwise.
  affordable: boolean | null;
  rationale: string;
};

export type ListObjective = {
  method: typeof LIST_BUILDER_METHOD;
  weights: typeof OBJECTIVE_WEIGHTS;
  shape: ListShape;
  description: string;
};

export type GeneratedList = {
  list: ListSchool[];
  overlooking: ListSchool[];
  objective: ListObjective;
  balance: {
    reach: number;
    target: number;
    safety: number;
    note: string;
  };
  excluded: {
    canada: number;
  };
};

type ScoredCandidate = {
  candidate: ListCandidate;
  tier: AdmitTier;
  bucket: ListBucket;
  fit: number | null;
  net_cost: number | null;
  affordable: boolean | null;
  desirability: number;
};

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bucketFromTier(tier: AdmitTier): ListBucket {
  switch (tier) {
    case "Reach":
      return "reach";
    case "Target":
      return "target";
    case "Likely":
    case "Safety":
      return "safety";
  }
}

// Tier from the SAME public-prior chance the admit-intelligence route uses, so
// a school's list tier is identical to its /api/admit-intelligence tier.
function tierForCandidate(
  profile: ListProfile,
  candidate: ListCandidate,
): AdmitTier {
  const chance = buildChancePayload(
    {
      unitid: candidate.unitid,
      sat_score: profile.sat_score,
      act_score: profile.act_score,
      gpa: profile.gpa,
      application_round: profile.application_round ?? "regular",
    },
    candidate,
  );
  return tierFromProbability(chance.probability.calibrated);
}

// Program/interest fit: the exact hybrid (keyword + semantic) blend Fit Finder
// ranks by, so a school's fit number is the same here as on its program page.
function fitForCandidate(
  preferences: ListPreferences,
  candidate: ListCandidate,
): number | null {
  const query = [preferences.intended_major, preferences.interests]
    .map((value) => value?.replace(/\s+/g, " ").trim())
    .filter((value): value is string => Boolean(value))
    .join(". ");
  if (!query) {
    return null;
  }
  const keyword = keywordProgramScore(
    query,
    candidate.programs ?? null,
    candidate.program_areas ?? null,
  );
  return blendProgramFit(keyword.score, candidate.similarity);
}

function affordabilityRead(netCost: number | null, budget: number | undefined) {
  if (budget === undefined) {
    // Cost is not a stated constraint: it does not differentiate order.
    return { affordable: null as boolean | null, score: 1 };
  }
  if (netCost === null) {
    return { affordable: null as boolean | null, score: UNKNOWN_COST_AFFORDABILITY };
  }
  if (netCost <= budget) {
    return { affordable: true, score: 1 };
  }
  const over = netCost - budget;
  return {
    affordable: false,
    score: Math.max(0, 1 - over / Math.max(1, budget)),
  };
}

function desirabilityOf(fit: number | null, affordabilityScore: number) {
  const fitNorm = (fit ?? NEUTRAL_FIT) / 100;
  return (
    OBJECTIVE_WEIGHTS.fit * Math.max(0, Math.min(1, fitNorm)) +
    OBJECTIVE_WEIGHTS.cost * Math.max(0, Math.min(1, affordabilityScore))
  );
}

function capitalize(value: string) {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

// One-line rationale. Every clause is generated from this row's real computed
// values; nothing is asserted that the data does not support.
function rationaleFor(scored: ScoredCandidate, budget: number | undefined) {
  let fitClause: string;
  if (scored.fit === null) {
    fitClause = "fit not scored (add a major or interests)";
  } else if (scored.fit >= 65) {
    fitClause = `strong program fit (${scored.fit})`;
  } else if (scored.fit >= PROGRAM_FIT_WEAK_THRESHOLD) {
    fitClause = `moderate program fit (${scored.fit})`;
  } else {
    fitClause = `weak program fit (${scored.fit})`;
  }

  const tierClause = `${scored.tier.toLowerCase()} odds`;

  let costClause: string;
  if (scored.net_cost === null) {
    costClause = "net price not published";
  } else if (budget !== undefined) {
    costClause = scored.affordable
      ? `under your $${budget.toLocaleString("en-US")} budget`
      : `over your $${budget.toLocaleString("en-US")} budget`;
  } else {
    costClause = `net price $${scored.net_cost.toLocaleString("en-US")}`;
  }

  return capitalize(`${fitClause}, ${tierClause}, ${costClause}.`);
}

function toListSchool(scored: ScoredCandidate, budget: number | undefined): ListSchool {
  return {
    unitid: scored.candidate.unitid,
    name: scored.candidate.name,
    tier: scored.tier,
    bucket: scored.bucket,
    fit: scored.fit,
    net_cost: scored.net_cost,
    affordable: scored.affordable,
    rationale: rationaleFor(scored, budget),
  };
}

// Deterministic ordering: objective desirability first, unitid as the stable
// tie-break. unitid is NEVER allowed to override a desirability difference.
function byDesirability(left: ScoredCandidate, right: ScoredCandidate) {
  if (right.desirability !== left.desirability) {
    return right.desirability - left.desirability;
  }
  return left.candidate.unitid - right.candidate.unitid;
}

function balanceNote(counts: ListShape) {
  const present = (["reach", "target", "safety"] as const).filter(
    (bucket) => counts[bucket] > 0,
  );
  if (present.length === 0) {
    return "No US schools in the candidate pool could be scored into a list.";
  }
  if (present.length === 1) {
    return `Every school landed in ${present[0]} — the candidate pool did not span tiers for this profile.`;
  }
  return "Balanced across reach, target, and safety by the Phase 1 admit tier; ordered within each by the documented objective.";
}

export function generateList(input: {
  profile: ListProfile;
  preferences: ListPreferences;
  candidates: ListCandidate[];
}): GeneratedList {
  const { profile, preferences } = input;
  const shape = preferences.shape ?? { ...DEFAULT_LIST_SHAPE };
  const budget = preferences.budget;

  const usCandidates = input.candidates.filter(
    (candidate) => candidate.country === "US",
  );
  const excludedCanada = input.candidates.length - usCandidates.length;

  // De-duplicate by unitid (lowest unitid wins) so a repeated row cannot tilt
  // the balance, and the engine stays deterministic regardless of input order.
  const seen = new Set<number>();
  const scored: ScoredCandidate[] = [];
  for (const candidate of [...usCandidates].sort(
    (left, right) => left.unitid - right.unitid,
  )) {
    if (seen.has(candidate.unitid)) {
      continue;
    }
    seen.add(candidate.unitid);

    const tier = tierForCandidate(profile, candidate);
    const fit = fitForCandidate(preferences, candidate);
    const netCost = finiteNumber(candidate.net_price_avg);
    const affordability = affordabilityRead(netCost, budget);
    scored.push({
      candidate,
      tier,
      bucket: bucketFromTier(tier),
      fit,
      net_cost: netCost,
      affordable: affordability.affordable,
      desirability: desirabilityOf(fit, affordability.score),
    });
  }

  const byBucket: Record<ListBucket, ScoredCandidate[]> = {
    reach: [],
    target: [],
    safety: [],
  };
  for (const entry of scored) {
    byBucket[entry.bucket].push(entry);
  }
  (["reach", "target", "safety"] as const).forEach((bucket) => {
    byBucket[bucket].sort(byDesirability);
  });

  const selected: ScoredCandidate[] = [];
  const counts: ListShape = { reach: 0, target: 0, safety: 0 };
  (["reach", "target", "safety"] as const).forEach((bucket) => {
    const picks = byBucket[bucket].slice(0, shape[bucket]);
    counts[bucket] = picks.length;
    selected.push(...picks);
  });

  const selectedIds = new Set(selected.map((entry) => entry.candidate.unitid));

  // "Schools you're overlooking": affordable, genuinely-fitting schools that did
  // not make the cut, biased toward tiers the list under-filled so the surprise
  // row adds diversity. Fit/data-driven, deterministic — never random.
  const overlooking = scored
    .filter((entry) => !selectedIds.has(entry.candidate.unitid))
    .filter(
      (entry) =>
        entry.fit !== null &&
        entry.fit >= OVERLOOKING_MIN_FIT &&
        entry.affordable !== false,
    )
    .map((entry) => ({
      entry,
      deficit: Math.max(0, shape[entry.bucket] - counts[entry.bucket]),
    }))
    .sort((left, right) => {
      if (right.deficit !== left.deficit) {
        return right.deficit - left.deficit;
      }
      return byDesirability(left.entry, right.entry);
    })
    .slice(0, OVERLOOKING_COUNT)
    .map(({ entry }) => toListSchool(entry, budget));

  return {
    list: selected.map((entry) => toListSchool(entry, budget)),
    overlooking,
    objective: {
      method: LIST_BUILDER_METHOD,
      weights: OBJECTIVE_WEIGHTS,
      shape,
      description:
        "Order = W_FIT * (fit/100) + W_COST * affordability, tie-broken by unitid. Tiers are the Phase 1 admit tiers; the list keeps the top schools per reach/target/safety bucket. No per-school boosts; outcomes never enter ranking.",
    },
    balance: {
      ...counts,
      note: balanceNote(counts),
    },
    excluded: {
      canada: excludedCanada,
    },
  };
}

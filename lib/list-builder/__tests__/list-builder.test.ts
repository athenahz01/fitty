import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIST_SHAPE,
  generateList,
  OBJECTIVE_WEIGHTS,
  type ListCandidate,
} from "../index";
import { buildUsAdmitIntelligence } from "../../score/us";

// Profile used for every tier in this file. Tiers below were confirmed against
// the committed public-prior artifact (see probe in the Phase 2 handoff note).
const profile = {
  sat_score: 1480,
  act_score: 33,
  gpa: 3.9,
  application_round: "regular" as const,
};

const preferences = {
  intended_major: "Computer Science",
  interests: "computing and machine learning",
  budget: 30000,
};

type SchoolSpec = {
  unitid: number;
  name: string;
  selectivity_tier: string;
  sat_25: number;
  sat_75: number;
  act_25: number;
  act_75: number;
  programs: string[];
  net_price_avg: number | null;
  similarity?: number | null;
};

function makeCandidate(spec: SchoolSpec): ListCandidate {
  return {
    unitid: spec.unitid,
    name: spec.name,
    country: "US",
    selectivity_tier: spec.selectivity_tier,
    sat_25: spec.sat_25,
    sat_75: spec.sat_75,
    act_25: spec.act_25,
    act_75: spec.act_75,
    gpa_avg: 3.8,
    test_policy: "required",
    size: 12000,
    admit_rate: 0.3,
    programs: spec.programs,
    program_areas: spec.programs,
    net_price_avg: spec.net_price_avg,
    sticker_cost: spec.net_price_avg === null ? null : spec.net_price_avg + 30000,
    similarity: spec.similarity ?? null,
  };
}

// Reach (elite / highly-selective bands above the applicant)
const reaches: SchoolSpec[] = [
  { unitid: 101, name: "Reach Elite", selectivity_tier: "elite", sat_25: 1520, sat_75: 1580, act_25: 34, act_75: 36, programs: ["Computer Science"], net_price_avg: 25000, similarity: 0.55 },
  { unitid: 102, name: "Reach HS A", selectivity_tier: "highly_selective", sat_25: 1380, sat_75: 1500, act_25: 31, act_75: 34, programs: ["Computer Science"], net_price_avg: 30000, similarity: 0.5 },
  { unitid: 103, name: "Reach HS B", selectivity_tier: "highly_selective", sat_25: 1400, sat_75: 1520, act_25: 32, act_75: 34, programs: ["Computer Science"], net_price_avg: 40000, similarity: 0.3 },
];
// Target (selective 1350-1500 → calibrated ~0.41 Target). Identical bands keep
// the tier fixed; fit/cost vary to exercise ordering.
const targets: SchoolSpec[] = [
  { unitid: 201, name: "Target A", selectivity_tier: "selective", sat_25: 1350, sat_75: 1500, act_25: 30, act_75: 34, programs: ["Computer Science"], net_price_avg: 22000, similarity: 0.5 },
  { unitid: 202, name: "Target B", selectivity_tier: "selective", sat_25: 1350, sat_75: 1500, act_25: 30, act_75: 34, programs: ["Computer Science"], net_price_avg: 35000, similarity: 0.3 },
  { unitid: 203, name: "Target C", selectivity_tier: "selective", sat_25: 1350, sat_75: 1500, act_25: 30, act_75: 34, programs: ["Computer Science"], net_price_avg: 18000, similarity: 0.55 },
];
// Safety bucket = Likely + Safety engine tiers
const safeties: SchoolSpec[] = [
  { unitid: 301, name: "Likely A", selectivity_tier: "selective", sat_25: 1300, sat_75: 1460, act_25: 29, act_75: 33, programs: ["Computer Science"], net_price_avg: 20000, similarity: 0.4 },
  { unitid: 302, name: "Likely B", selectivity_tier: "selective", sat_25: 1250, sat_75: 1400, act_25: 28, act_75: 32, programs: ["Computer Science"], net_price_avg: 16000, similarity: 0.45 },
  { unitid: 303, name: "Safety A", selectivity_tier: "accessible", sat_25: 1050, sat_75: 1230, act_25: 21, act_75: 27, programs: ["Computer Science"], net_price_avg: 14000, similarity: 0.5 },
  { unitid: 304, name: "Safety B no price", selectivity_tier: "accessible", sat_25: 900, sat_75: 1080, act_25: 17, act_75: 22, programs: ["Computer Science"], net_price_avg: null, similarity: 0.5 },
];

const cohort = [...reaches, ...targets, ...safeties].map(makeCandidate);

describe("Smart List Builder engine", () => {
  it("spreads across tiers and never exceeds the configured shape (balance)", () => {
    const result = generateList({ profile, preferences, candidates: cohort });

    const buckets = new Set(result.list.map((school) => school.bucket));
    expect(buckets.size).toBeGreaterThanOrEqual(3); // not degenerate
    expect(result.balance.reach).toBeGreaterThan(0);
    expect(result.balance.target).toBeGreaterThan(0);
    expect(result.balance.safety).toBeGreaterThan(0);

    // No bucket exceeds its configured cap.
    expect(result.balance.reach).toBeLessThanOrEqual(DEFAULT_LIST_SHAPE.reach);
    expect(result.balance.target).toBeLessThanOrEqual(DEFAULT_LIST_SHAPE.target);
    expect(result.balance.safety).toBeLessThanOrEqual(DEFAULT_LIST_SHAPE.safety);

    // Bucket labels agree with the per-school tier.
    for (const school of result.list) {
      const expectedBucket =
        school.tier === "Reach"
          ? "reach"
          : school.tier === "Target"
            ? "target"
            : "safety";
      expect(school.bucket).toBe(expectedBucket);
    }
  });

  it("every rationale clause matches the row's real fit, tier, and net cost", () => {
    const result = generateList({ profile, preferences, candidates: cohort });

    for (const school of [...result.list, ...result.overlooking]) {
      const rationale = school.rationale.toLowerCase();

      // Tier clause
      expect(rationale).toContain(`${school.tier.toLowerCase()} odds`);

      // Fit clause
      if (school.fit === null) {
        expect(rationale).toContain("fit not scored");
      } else if (school.fit >= 65) {
        expect(rationale).toContain(`strong program fit (${school.fit})`);
      } else if (school.fit >= 45) {
        expect(rationale).toContain(`moderate program fit (${school.fit})`);
      } else {
        expect(rationale).toContain(`weak program fit (${school.fit})`);
      }

      // Cost clause — net cost is net_price_avg only; missing is stated, not faked.
      if (school.net_cost === null) {
        expect(rationale).toContain("net price not published");
      } else if (school.affordable === true) {
        expect(rationale).toContain("under your");
      } else if (school.affordable === false) {
        expect(rationale).toContain("over your");
      }
    }
  });

  it("never fabricates a net cost: missing net_price_avg stays null", () => {
    const result = generateList({ profile, preferences, candidates: cohort });
    const noPrice = [...result.list, ...result.overlooking].find(
      (school) => school.unitid === 304,
    );
    // 304 has net_price_avg null and a sticker price set — the engine must NOT
    // substitute the sticker; net_cost stays null and the copy says so.
    if (noPrice) {
      expect(noPrice.net_cost).toBeNull();
      expect(noPrice.rationale).toContain("net price not published");
    }
  });

  it("list tier equals the /api/admit-intelligence tier for the same profile/school (consistency)", () => {
    const result = generateList({ profile, preferences, candidates: cohort });
    const byId = new Map(cohort.map((candidate) => [candidate.unitid, candidate]));

    for (const school of result.list) {
      const candidate = byId.get(school.unitid)!;
      const admit = buildUsAdmitIntelligence(
        {
          unitid: candidate.unitid,
          sat_score: profile.sat_score,
          act_score: profile.act_score,
          gpa: profile.gpa,
          application_round: profile.application_round,
        },
        candidate,
      );
      expect(school.tier).toBe(admit.tier);
    }
  });

  it("is deterministic: identical input twice yields an identical ordered list", () => {
    const first = generateList({ profile, preferences, candidates: cohort });
    const second = generateList({ profile, preferences, candidates: cohort });
    expect(first).toEqual(second);
  });

  it("order depends only on the objective: shuffling input does not change output (no bias)", () => {
    const shuffled = [...cohort].reverse();
    const fromCohort = generateList({ profile, preferences, candidates: cohort });
    const fromShuffled = generateList({
      profile,
      preferences,
      candidates: shuffled,
    });
    expect(fromShuffled).toEqual(fromCohort);
  });

  it("a higher-objective school outranks a lower one regardless of unitid", () => {
    // Two same-tier (Target) schools: the one with the better fit/cost wins even
    // though it has the LARGER unitid, proving unitid is only a tie-break.
    const a = makeCandidate({
      unitid: 999, // larger id, but better fit + cheaper
      name: "Strong cheap target",
      selectivity_tier: "selective",
      sat_25: 1350,
      sat_75: 1500,
      act_25: 30,
      act_75: 34,
      programs: ["Computer Science"],
      net_price_avg: 12000,
      similarity: 0.6,
    });
    const b = makeCandidate({
      unitid: 200, // smaller id, but worse fit + pricier
      name: "Weak pricey target",
      selectivity_tier: "selective",
      sat_25: 1350,
      sat_75: 1500,
      act_25: 30,
      act_75: 34,
      programs: ["History"],
      net_price_avg: 40000,
      similarity: 0.2,
    });
    const result = generateList({
      profile,
      preferences,
      candidates: [b, a],
    });
    const ids = result.list
      .filter((school) => school.bucket === "target")
      .map((school) => school.unitid);
    expect(ids.indexOf(999)).toBeLessThan(ids.indexOf(200));
  });

  it("scopes Canada out and counts it; no major means fit is honestly unscored", () => {
    const withCanada = [
      ...cohort,
      makeCandidate({
        unitid: 401,
        name: "Canadian School",
        selectivity_tier: "selective",
        sat_25: 1300,
        sat_75: 1450,
        act_25: 29,
        act_75: 33,
        programs: ["Computer Science"],
        net_price_avg: 15000,
      }),
    ];
    withCanada[withCanada.length - 1].country = "CA";

    const result = generateList({ profile, preferences, candidates: withCanada });
    expect(result.excluded.canada).toBe(1);
    expect(result.list.every((school) => school.unitid !== 401)).toBe(true);

    const noMajor = generateList({
      profile,
      preferences: { budget: 30000 },
      candidates: cohort,
    });
    for (const school of noMajor.list) {
      expect(school.fit).toBeNull();
      expect(school.rationale.toLowerCase()).toContain("fit not scored");
    }
  });

  it("exposes the objective weights and shape it actually used", () => {
    const result = generateList({ profile, preferences, candidates: cohort });
    expect(result.objective.weights).toEqual(OBJECTIVE_WEIGHTS);
    expect(result.objective.shape).toEqual(DEFAULT_LIST_SHAPE);
    expect(result.objective.method).toBe("list_builder_objective_v1");
  });
});

import { describe, expect, it } from "vitest";

import { buildUsAdmitIntelligence } from "../../score/us";
import { buildClimbRoadmap } from "../index";
import type { ClimbProfileInput } from "../schema";

const baseSchool = {
  unitid: 1,
  name: "Crossing U",
  country: "US",
  setting: "city",
  size: 10000,
  admit_rate: 0.5,
  ed_admit_rate: null,
  rd_admit_rate: null,
  sat_25: 1200,
  sat_75: 1400,
  act_25: 27,
  act_75: 32,
  gpa_avg: 3.4,
  test_policy: "optional",
  c7_factors: {},
  selectivity_tier: "selective",
} as const;

const profile = {
  sat_score: 1040,
  gpa: 2.5,
  application_round: "regular",
} satisfies ClimbProfileInput;

describe("Climb Roadmap", () => {
  it("computes each projected delta from the actual Admit Intelligence recompute", () => {
    const roadmap = buildClimbRoadmap(profile, [baseSchool]);
    const testMove = roadmap.ranked_moves.find(
      (move) => move.lever.feature === "test_score",
    );

    expect(testMove).toBeDefined();
    const before = buildUsAdmitIntelligence(
      { unitid: baseSchool.unitid, ...profile },
      baseSchool,
    );
    const after = buildUsAdmitIntelligence(
      {
        unitid: baseSchool.unitid,
        ...profile,
        sat_score: testMove?.counterfactual.sat_score,
      },
      baseSchool,
    );

    expect(testMove?.before.score).toBe(before.score);
    expect(testMove?.before.tier).toBe(before.tier);
    expect(testMove?.after.score).toBe(after.score);
    expect(testMove?.after.tier).toBe(after.tier);
    expect(testMove?.delta_score).toBe(after.score - before.score);
  });

  it("only claims tier crossing when the recomputed score crosses the shared threshold", () => {
    const roadmap = buildClimbRoadmap(profile, [baseSchool]);
    const crossing = roadmap.ranked_moves.find((move) => move.crosses_tier);

    expect(crossing).toBeDefined();
    expect(crossing?.before.tier).toBe("Reach");
    expect(crossing?.after.tier).toBe("Target");
    expect(crossing?.tier_claim).toBe("Reach -> Target");
  });

  it("does not fabricate deltas for fixed or model-unseen factors", () => {
    const roadmap = buildClimbRoadmap(profile, [baseSchool]);
    const contextFeatures = roadmap.context.map((item) => item.feature);

    expect(contextFeatures).toContain("essays");
    expect(contextFeatures).toContain("recommendations");
    expect(contextFeatures).toContain("demonstrated_interest");
    expect(contextFeatures).toContain("gpa_to_date");
    expect(contextFeatures).toContain("remaining_course_rigor");
    expect(JSON.stringify(roadmap.context)).not.toContain("delta_score");
  });

  it("is deterministic for the same profile and schools", () => {
    const first = buildClimbRoadmap(profile, [baseSchool]);
    const second = buildClimbRoadmap(profile, [baseSchool]);

    expect(second).toEqual(first);
  });
});

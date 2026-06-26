import { describe, expect, it } from "vitest";

import { buildUniverse, LINEAGE } from "../index";

const school = {
  unitid: 166683,
  name: "Massachusetts Institute of Technology",
  country: "US" as const,
  province_state: null,
  state: "MA",
  setting: "city" as const,
  size: 4500,
  selectivity_tier: "elite" as const,
  admit_rate: 0.045,
  sat_25: 1520,
  sat_75: 1580,
  act_25: 34,
  act_75: 36,
  gpa_avg: null,
  test_policy: "required" as const,
  net_price_avg: 22000,
  sticker_cost: 82000,
  median_earnings_10yr: 124000,
  completion_rate: 0.95,
  program_areas: ["Engineering", "Computer and information sciences"],
  programs: ["Computer Science", "Mechanical Engineering"],
};

describe("School Universe assembler", () => {
  it("tags every figure with a named source and never invents a missing one", () => {
    const universe = buildUniverse({ school, programs: [], similar: [] });

    expect(universe.headline.admit_rate).toEqual({
      value: 0.045,
      source: LINEAGE.admit_rate,
    });
    expect(universe.cost.net_price_avg.value).toBe(22000);
    expect(universe.cost.net_price_avg.source).toBe(LINEAGE.net_price_avg);

    // gpa_avg is null in the source row → reported as null, not fabricated.
    expect(universe.admissions.gpa_avg.value).toBeNull();
    expect(universe.admissions.gpa_avg.source).toBe(LINEAGE.gpa_avg);
  });

  it("adds honest notes when cost, programs, or similar data are missing", () => {
    const universe = buildUniverse({
      school: { ...school, net_price_avg: null },
      programs: [],
      similar: [],
    });

    expect(universe.cost.net_price_avg.value).toBeNull();
    expect(universe.notes.join(" ")).toContain("net price is not published");
    expect(universe.notes.join(" ")).toContain("program_requirements");
    expect(universe.notes.join(" ")).toContain("Similar programs");
  });

  it("does not substitute sticker price for a missing net price", () => {
    const universe = buildUniverse({
      school: { ...school, net_price_avg: null, sticker_cost: 80000 },
      programs: [],
      similar: [],
    });
    expect(universe.cost.net_price_avg.value).toBeNull();
    expect(universe.cost.sticker_cost.value).toBe(80000);
  });
});

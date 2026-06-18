import { describe, expect, it } from "vitest";

import { sanitizeAnalyticsProperties } from "../analytics";

describe("analytics privacy guard", () => {
  it("keeps Fit Finder analytics to booleans and counts", () => {
    const sanitized = sanitizeAnalyticsProperties({
      result_count: 3,
      has_region_filter: true,
      has_size_filter: false,
      has_setting_filter: true,
      has_affordability_filter: true,
      interests: "robotics",
      intended_major: "computer science",
      gpa: 3.9,
      sat_score: 1540,
      cost_ceiling: 30000,
      unitid: 166683,
      school_name: "Massachusetts Institute of Technology",
      state: "MA",
    });

    expect(sanitized).toEqual({
      result_count: 3,
      has_region_filter: true,
      has_size_filter: false,
      has_setting_filter: true,
      has_affordability_filter: true,
    });
  });
});

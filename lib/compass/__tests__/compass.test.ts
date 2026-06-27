import { describe, expect, it } from "vitest";

import {
  assertCareerLineage,
  generateCompass,
  ROI_STUB,
  type CompassCareer,
  type CompassMajor,
} from "../index";
import { buildUsAdmitIntelligence } from "../../score/us";

const school = {
  unitid: 166683,
  name: "Massachusetts Institute of Technology",
  setting: "city",
  size: 4500,
  admit_rate: 0.045,
  sat_25: 1520,
  sat_75: 1580,
  act_25: 34,
  act_75: 36,
  gpa_avg: null,
  test_policy: "required",
  c7_factors: { rigor: "Very Important" },
  selectivity_tier: "elite",
};

const profile = {
  sat_score: 1290,
  gpa: 3.1,
  application_round: "regular" as const,
};

const majors: CompassMajor[] = [
  {
    major_name: "Computer Science",
    scorecard_field: "Computer and Information Sciences",
    median_earnings_10yr: 112000,
    source_url: "https://collegescorecard.ed.gov/fields/cs",
    provenance: "curated_public",
  },
  {
    major_name: "History",
    scorecard_field: "History",
    median_earnings_10yr: null, // missing on purpose — must stay null
    source_url: "https://collegescorecard.ed.gov/fields/history",
    provenance: "curated_public",
  },
];

const careers: CompassCareer[] = [
  {
    major_name: "Computer Science",
    career_title: "Software Developer",
    onet_code: "15-1252.00",
    median_wage_annual: 130000,
    source_url: "https://www.onetonline.org/link/summary/15-1252.00",
    provenance: "curated_public",
  },
  {
    major_name: "History",
    career_title: "Archivist",
    onet_code: "25-4011.00",
    median_wage_annual: null,
    source_url: "https://www.onetonline.org/link/summary/25-4011.00",
    provenance: "curated_public",
  },
];

describe("Compass assembler", () => {
  it("admit odds equal the Phase 1 admit-intelligence tier/score for the same profile/school", () => {
    const compass = generateCompass({
      majors,
      careers,
      studentInterests: "computer science and software",
      school,
      profile,
    });

    const admit = buildUsAdmitIntelligence(
      {
        unitid: school.unitid,
        sat_score: profile.sat_score,
        gpa: profile.gpa,
        application_round: profile.application_round,
      },
      school,
    );

    expect(compass.admit?.tier).toBe(admit.tier);
    expect(compass.admit?.score).toBe(admit.score);
  });

  it("keeps ROI a labeled stub with no number anywhere", () => {
    const compass = generateCompass({ majors, careers });
    expect(compass.roi.available).toBe(false);
    expect(compass.roi).toEqual(ROI_STUB);
    // No ROI figure: no currency, percentage, or multi-digit return number.
    expect(compass.roi.note).not.toMatch(/[$%]/);
    expect(compass.roi.note).not.toMatch(/\d{2,}/);
    expect(compass.roi.note.toLowerCase()).toContain("money module");
    for (const major of compass.majors) {
      expect(major.roi.available).toBe(false);
    }
  });

  it("passes sourced earnings through and never fabricates a missing one", () => {
    const compass = generateCompass({ majors, careers });
    const cs = compass.majors.find((m) => m.major_name === "Computer Science");
    const history = compass.majors.find((m) => m.major_name === "History");

    expect(cs?.median_earnings_10yr).toEqual({
      value: 112000,
      source_url: "https://collegescorecard.ed.gov/fields/cs",
    });
    // Missing earnings stays null with its source, not invented.
    expect(history?.median_earnings_10yr.value).toBeNull();
    expect(history?.median_earnings_10yr.source_url).toBe(
      "https://collegescorecard.ed.gov/fields/history",
    );

    const archivistWage = compass.majors
      .find((m) => m.major_name === "History")
      ?.careers.find((c) => c.career_title === "Archivist")?.median_wage_annual;
    expect(archivistWage?.value).toBeNull();
  });

  it("every major and career row carries a source_url (lineage)", () => {
    const compass = generateCompass({ majors, careers });
    for (const major of compass.majors) {
      expect(major.median_earnings_10yr.source_url).toMatch(/^https?:\/\//);
      for (const career of major.careers) {
        expect(career.median_wage_annual.source_url).toMatch(/^https?:\/\//);
      }
    }
    // The loader-side lineage gate throws on a missing source_url.
    expect(() =>
      assertCareerLineage([{ source_url: "" }]),
    ).toThrow(/source_url/);
    expect(() => assertCareerLineage(majors)).not.toThrow();
  });

  it("ranks majors by embedding similarity when supplied, else keyword overlap", () => {
    const bySimilarity = generateCompass({
      majors,
      careers,
      majorSimilarity: { "Computer Science": 0.2, History: 0.9 },
    });
    expect(bySimilarity.majors[0].major_name).toBe("History");

    const byKeyword = generateCompass({
      majors,
      careers,
      studentInterests: "computer programming and software",
    });
    expect(byKeyword.majors[0].major_name).toBe("Computer Science");
  });
});

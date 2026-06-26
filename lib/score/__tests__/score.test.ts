import { describe, expect, it } from "vitest";

import { scoreCanadaProgram } from "../canada";
import { driversAreConsistent } from "../drivers";
import { toHeadlineScore } from "../headline";
import { tierFromProbability } from "../tiers";
import { buildUsAdmitIntelligence } from "../us";

const usSchool = {
  unitid: 166683,
  name: "Massachusetts Institute of Technology",
  setting: "city",
  size: 4535,
  admit_rate: 0.0455,
  sat_25: 1520,
  sat_75: 1580,
  act_25: 34,
  act_75: 36,
  gpa_avg: null,
  test_policy: "required",
  c7_factors: {
    rigor: "Very Important",
    extracurriculars: "Important",
  },
  selectivity_tier: "elite",
};

const caProgram = {
  program_name: "Computer Science",
  cutoff_avg_low: 90,
  cutoff_avg_high: 93,
  cutoff_basis: "percentage" as const,
  prerequisites: ["ENG4U", "MHF4U", "MCV4U"],
  supplemental_app: false,
  broad_based_admission: false,
  source_url: "https://www.ouinfo.ca/programs/example/cs",
};

describe("toHeadlineScore", () => {
  it("is deterministic, bounded, and monotonic", () => {
    const values = [0, 0.031, 0.3, 0.55, 0.8, 1];
    const scores = values.map(toHeadlineScore);
    expect(scores).toEqual([0, 3, 30, 55, 80, 100]);
    expect(values.map(toHeadlineScore)).toEqual(scores);
    expect(scores).toEqual([...scores].sort((left, right) => left - right));
  });
});

describe("tierFromProbability", () => {
  it("uses one shared threshold table", () => {
    expect(tierFromProbability(0.299)).toBe("Reach");
    expect(tierFromProbability(0.3)).toBe("Target");
    expect(tierFromProbability(0.549)).toBe("Target");
    expect(tierFromProbability(0.55)).toBe("Likely");
    expect(tierFromProbability(0.799)).toBe("Likely");
    expect(tierFromProbability(0.8)).toBe("Safety");
  });
});

describe("US Admit Intelligence", () => {
  it("keeps headline score and drivers directionally consistent", () => {
    const result = buildUsAdmitIntelligence(
      {
        unitid: usSchool.unitid,
        sat_score: 1290,
        gpa: 3.1,
        application_round: "regular",
      },
      usSchool,
    );

    expect(result.tier).toBe("Reach");
    expect(driversAreConsistent(result.tier, result.drivers)).toBe(true);
    expect(result.drivers.some((driver) => driver.direction === "negative")).toBe(
      true,
    );
  });

  it("returns MIT as reach for a 3.1 GPA and 1290 SAT obvious case", () => {
    const result = buildUsAdmitIntelligence(
      {
        unitid: usSchool.unitid,
        sat_score: 1290,
        gpa: 3.1,
        application_round: "regular",
      },
      usSchool,
    );

    expect(result.tier).toBe("Reach");
    expect(result.score).toBeLessThan(30);
  });
});

describe("Canada deterministic scorer", () => {
  it("compares applicant average to cutoffs in the native basis", () => {
    const result = scoreCanadaProgram({
      applicantAverage: 92,
      applicantBasis: "percentage",
      completedPrerequisites: ["ENG4U", "MHF4U", "MCV4U"],
      program: caProgram,
    });

    expect(result.tier).toBe("Target");
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.score).toBeLessThan(55);
  });

  it("drops below cutoff to reach and penalizes missing prerequisites", () => {
    const result = scoreCanadaProgram({
      applicantAverage: 78,
      applicantBasis: "percentage",
      completedPrerequisites: ["ENG4U"],
      program: caProgram,
    });

    expect(result.tier).toBe("Reach");
    expect(
      result.drivers.find((driver) => driver.label === "Prerequisites")
        ?.direction,
    ).toBe("negative");
  });

  it("refuses cross-basis comparisons instead of using placeholder conversions", () => {
    expect(() =>
      scoreCanadaProgram({
        applicantAverage: 3.9,
        applicantBasis: "gpa_4_0",
        completedPrerequisites: ["ENG4U", "MHF4U", "MCV4U"],
        program: caProgram,
      }),
    ).toThrow(/Cannot compare/);
  });

  it("tempers broad-based programs without breaking the cutoff tier flip", () => {
    const result = scoreCanadaProgram({
      applicantAverage: 90,
      applicantBasis: "percentage",
      completedPrerequisites: ["ENG4U", "MHF4U", "MCV4U"],
      program: {
        ...caProgram,
        supplemental_app: true,
        broad_based_admission: true,
      },
    });

    expect(result.tier).toBe("Target");
    expect(
      result.drivers.find((driver) => driver.label === "Broad-based review")
        ?.direction,
    ).toBe("negative");
  });
});

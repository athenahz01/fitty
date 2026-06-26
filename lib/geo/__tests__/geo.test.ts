import { describe, expect, it } from "vitest";

import {
  fromComparisonSpace,
  normalizeCountry,
  normalizeGradingBasis,
  provinceOrState,
  toComparisonSpace,
} from "../index";

describe("normalizeCountry", () => {
  it("normalizes US and CA aliases without defaulting unknown values", () => {
    expect(normalizeCountry("United States")).toBe("US");
    expect(normalizeCountry("usa")).toBe("US");
    expect(normalizeCountry("Canada")).toBe("CA");
    expect(normalizeCountry("CAN")).toBe("CA");
    expect(() => normalizeCountry("GB")).toThrow(/unsupported country/i);
    expect(() => normalizeCountry(null)).toThrow(/country is required/i);
  });
});

describe("normalizeGradingBasis", () => {
  it("normalizes explicit grading systems", () => {
    expect(normalizeGradingBasis("GPA 4.0")).toBe("gpa_4_0");
    expect(normalizeGradingBasis("percentage")).toBe("percentage");
    expect(normalizeGradingBasis("R-score")).toBe("cegep_r_score");
  });

  it("handles US and CA defaults explicitly", () => {
    expect(normalizeGradingBasis(undefined, { country: "US" })).toBe("gpa_4_0");
    expect(
      normalizeGradingBasis(undefined, {
        country: "CA",
        provinceState: "ON",
      }),
    ).toBe("percentage");
    expect(
      normalizeGradingBasis(undefined, {
        country: "CA",
        provinceState: "Quebec",
        admissionSystem: "quebec_cegep",
      }),
    ).toBe("cegep_r_score");
  });

  it("does not let a missing country fall through to a US default", () => {
    expect(() => normalizeGradingBasis(undefined)).toThrow(/country is required/i);
  });
});

describe("provinceOrState", () => {
  it("uses province_state for both countries and normalizes CA explicitly", () => {
    expect(
      provinceOrState({
        country: "US",
        state: "NY",
      }),
    ).toBe("NY");
    expect(
      provinceOrState({
        country: "US",
        province_state: "California",
      }),
    ).toBe("CA");
    expect(
      provinceOrState({
        country: "CA",
        province_state: "Ontario",
      }),
    ).toBe("ON");
    expect(
      provinceOrState({
        country: "CA",
        state: "Quebec",
      }),
    ).toBe("QC");
  });
});

describe("grading comparison space", () => {
  it("converts GPA, percentage, and CEGEP R-score into the same scaffold", () => {
    expect(toComparisonSpace(3.6, "gpa_4_0")).toBeCloseTo(90);
    expect(fromComparisonSpace(90, "gpa_4_0")).toBeCloseTo(3.6);
    expect(toComparisonSpace(92, "percentage")).toBe(92);
    expect(fromComparisonSpace(92, "percentage")).toBe(92);

    const rScore = 36;
    const comparison = toComparisonSpace(rScore, "cegep_r_score");
    expect(comparison).toBeCloseTo(84);
    expect(fromComparisonSpace(comparison, "cegep_r_score")).toBeCloseTo(rScore);
  });
});

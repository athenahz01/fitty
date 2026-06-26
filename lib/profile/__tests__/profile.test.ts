import { describe, expect, it } from "vitest";

import { buildCanadaProfileStudio, buildUsProfileStudio } from "../index";
import { scoreCanadaProgram } from "../../score/canada";

describe("Profile Studio axes", () => {
  it("builds five deterministic US axes from profile and school data", () => {
    const first = buildUsProfileStudio({
      request: {
        unitid: 166683,
        sat_score: 1540,
        act_score: 35,
        gpa: 3.95,
        application_round: "regular",
        intended_major: "Computer Science",
        activity_context: "Robotics captain and research internship.",
      },
      school: {
        unitid: 166683,
        name: "Massachusetts Institute of Technology",
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
      },
    });
    const second = buildUsProfileStudio({
      request: {
        unitid: 166683,
        sat_score: 1540,
        act_score: 35,
        gpa: 3.95,
        application_round: "regular",
        intended_major: "Computer Science",
        activity_context: "Robotics captain and research internship.",
      },
      school: {
        unitid: 166683,
        name: "Massachusetts Institute of Technology",
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
      },
    });

    expect(first).toEqual(second);
    expect(first.axes).toHaveLength(5);
    expect(first.axes.map((axis) => axis.key)).toEqual([
      "academics",
      "rigor",
      "test",
      "extracurricular",
      "fit",
    ]);
    for (const axis of first.axes) {
      expect(axis.value).toBeGreaterThanOrEqual(0);
      expect(axis.value).toBeLessThanOrEqual(100);
      expect(axis.note.length).toBeGreaterThan(10);
    }
  });

  it("builds Canada axes from native cutoff and prerequisite data", () => {
    const program = {
      program_name: "Computer Science",
      cutoff_avg_low: 90,
      cutoff_avg_high: 93,
      cutoff_basis: "percentage" as const,
      prerequisites: ["ENG4U", "MHF4U", "MCV4U"],
      supplemental_app: true,
      broad_based_admission: true,
      source_url: "https://www.ouinfo.ca/programs/example/cs",
    };
    const result = scoreCanadaProgram({
      applicantAverage: 92,
      applicantBasis: "percentage",
      completedPrerequisites: ["ENG4U", "MHF4U", "MCV4U"],
      program,
    });
    const profile = buildCanadaProfileStudio({
      applicantAverage: 92,
      program,
      result,
      activityContext: "AIF, robotics, and math contests.",
    });

    expect(profile.axes).toHaveLength(5);
    expect(profile.method).toContain("native basis");
    expect(profile.axes.find((axis) => axis.key === "academics")?.value).toBeGreaterThan(
      65,
    );
  });
});

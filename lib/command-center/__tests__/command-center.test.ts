import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { assembleCommandCenter } from "../index";

const school = {
  unitid: 170976,
  name: "University of Michigan",
  country: "US",
  admission_system: "common_app",
} as const;

const program = {
  id: "11111111-1111-4111-8111-111111111111",
  unitid: school.unitid,
  program_name: "Computer Science",
  system: "common_app",
  cutoff_avg_low: 3.7,
  cutoff_avg_high: 4,
  cutoff_basis: "gpa_4_0",
  prerequisites: ["Calculus", "Lab science"],
  test_policy: "required",
  supplemental_app: true,
  broad_based_admission: true,
  source_url: "https://example.com/program-requirements",
} as const;

describe("Command Center assembler", () => {
  it("creates exactly one task for every loaded required item and no invented extras", () => {
    const plan = assembleCommandCenter({
      schools: [school],
      programRequirements: [program],
      deadlines: [],
    });

    expect(plan.progress.total).toBe(6);
    expect(plan.schools[0].tasks.map((task) => task.requirement_key)).toEqual([
      `${program.id}:computer-science:academic-cutoff`,
      `${program.id}:computer-science:broad-based-review`,
      `${program.id}:computer-science:prerequisite:calculus`,
      `${program.id}:computer-science:prerequisite:lab-science`,
      `${program.id}:computer-science:supplemental-app`,
      `${program.id}:computer-science:testing`,
    ]);
    expect(
      plan.schools[0].tasks.every(
        (task) => task.source_url === "https://example.com/program-requirements",
      ),
    ).toBe(true);
  });

  it("shows sourced deadlines only when a deadline row carries lineage", () => {
    const plan = assembleCommandCenter({
      schools: [school],
      programRequirements: [program],
      deadlines: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          unitid: school.unitid,
          program_requirement_id: program.id,
          admission_system: "common_app",
          deadline_kind: "regular",
          label: "Regular application deadline",
          deadline_date: "2026-01-15",
          source_url: "https://example.com/deadline",
          source_name: "Example admissions",
        },
      ],
    });

    expect(plan.schools[0].deadline).toEqual({
      status: "loaded",
      label: "Regular application deadline",
      date: "2026-01-15",
      source_url: "https://example.com/deadline",
    });
    expect(
      plan.schools[0].tasks.some(
        (task) =>
          task.category === "deadline" &&
          task.due_date === "2026-01-15" &&
          task.source_url === "https://example.com/deadline",
      ),
    ).toBe(true);
  });

  it("omits deadlines honestly when no sourced row is loaded", () => {
    const plan = assembleCommandCenter({
      schools: [school],
      programRequirements: [program],
      deadlines: [],
    });

    expect(plan.schools[0].deadline).toEqual({
      status: "not_loaded",
      label: "Deadline not loaded",
    });
    expect(plan.schools[0].tasks.some((task) => task.category === "deadline")).toBe(
      false,
    );
    expect(JSON.stringify(plan)).not.toContain("2026-");
  });

  it("derives progress from requirement status rows deterministically", () => {
    const first = assembleCommandCenter({
      schools: [school],
      programRequirements: [program],
      deadlines: [],
      statuses: [
        {
          unitid: school.unitid,
          program_requirement_id: program.id,
          requirement_key: `${program.id}:computer-science:testing`,
          status: "done",
          source_url: program.source_url,
        },
      ],
    });
    const second = assembleCommandCenter({
      schools: [school],
      programRequirements: [program],
      deadlines: [],
      statuses: [
        {
          unitid: school.unitid,
          program_requirement_id: program.id,
          requirement_key: `${program.id}:computer-science:testing`,
          status: "done",
          source_url: program.source_url,
        },
      ],
    });

    expect(first.progress).toEqual({ total: 6, done: 1, percent: 17 });
    expect(second).toEqual(first);
  });

  it("migration carries owner RLS, private vault, deadline lineage, and no pgcrypto", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/202606270002_v2_phase5_climb_command_center.sql",
      ),
      "utf8",
    );

    expect(sql).not.toMatch(/pgcrypto/i);
    expect(sql).toContain("subject_id = auth.uid()");
    expect(sql).toContain("admira-document-vault");
    expect(sql).toContain("source_url text not null");
    expect(sql).toContain("public = false");
  });
});

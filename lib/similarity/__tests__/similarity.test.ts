import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STUDENTS_LIKE_YOU_K,
  buildSimilarityProfileDocument,
  studentsLikeYouResponse,
} from "../index";

const readyRow = {
  unitid: 166683,
  school_name: "Massachusetts Institute of Technology",
  cohort_size: 5,
  admitted_count: 2,
  denied_count: 2,
  waitlisted_count: 1,
  deferred_count: 0,
  admit_rate: 0.4,
  denied_rate: 0.4,
  waitlisted_rate: 0.2,
  deferred_rate: 0,
  similarity_min: 0.71,
  similarity_max: 0.9,
  attribute_cards: [
    { kind: "gpa", label: "GPA band", value: "3.75-3.99", count: 5 },
    { kind: "test", label: "Test band", value: "1500+ SAT", count: 4 },
  ],
  admit_insights: [
    { label: "Admitted rigor", value: "Most Rigorous", count: 5 },
    { label: "Admitted activities", value: "National", count: 2 },
  ],
  provenance: {
    curated_public: 5,
    consented_user: 0,
    source_urls: ["https://mitadmissions.org/apply/process/stats/"],
  },
};

describe("Students-Like-You privacy shaping", () => {
  it("suppresses sub-k cohorts at the engine boundary", () => {
    const response = studentsLikeYouResponse({
      rows: [{ ...readyRow, cohort_size: STUDENTS_LIKE_YOU_K - 1 }],
      model: "test-model",
      dim: 384,
    });

    expect(response.status).toBe("empty");
    expect(response.cohorts).toEqual([]);
    expect(response.message).toContain("Not enough similar students");
  });

  it("returns only k-safe aggregate cards and admit insights", () => {
    const response = studentsLikeYouResponse({
      rows: [readyRow],
      model: "test-model",
      dim: 384,
    });

    expect(response.status).toBe("ready");
    expect(response.cohorts).toHaveLength(1);
    expect(response.cohorts[0].cohort_size).toBe(5);
    expect(response.cohorts[0].attribute_cards).toEqual([
      { kind: "gpa", label: "GPA band", value: "3.75-3.99", count: 5 },
    ]);
    expect(response.cohorts[0].admit_insights).toEqual([
      { label: "Admitted rigor", value: "Most Rigorous", count: 5 },
    ]);
  });

  it("does not return private identifiers or forbidden demographic keys", () => {
    const response = studentsLikeYouResponse({
      rows: [readyRow],
      model: "test-model",
      dim: 384,
    });
    const serialized = JSON.stringify(response).toLowerCase();

    expect(serialized).not.toContain("subject_id");
    expect(serialized).not.toContain("profile_id");
    expect(serialized).not.toContain("consent_record_id");
    expect(serialized).not.toContain("race");
    expect(serialized).not.toContain("ethnicity");
  });

  it("orders cohorts deterministically by size then unitid", () => {
    const first = studentsLikeYouResponse({
      rows: [
        { ...readyRow, unitid: 200, school_name: "B", cohort_size: 5 },
        { ...readyRow, unitid: 100, school_name: "A", cohort_size: 5 },
        { ...readyRow, unitid: 300, school_name: "C", cohort_size: 7 },
      ],
      model: "test-model",
      dim: 384,
    });
    const second = studentsLikeYouResponse({
      rows: [
        { ...readyRow, unitid: 300, school_name: "C", cohort_size: 7 },
        { ...readyRow, unitid: 100, school_name: "A", cohort_size: 5 },
        { ...readyRow, unitid: 200, school_name: "B", cohort_size: 5 },
      ],
      model: "test-model",
      dim: 384,
    });

    expect(first).toEqual(second);
    expect(first.cohorts.map((cohort) => cohort.unitid)).toEqual([300, 100, 200]);
  });

  it("embeds controlled and banded features, not raw free text", () => {
    const document = buildSimilarityProfileDocument({
      cycle_year: 2026,
      gpa: 3.91,
      sat_score: 1540,
      act_score: 35,
      test_submitted: true,
      course_rigor: "most_rigorous",
      activities_tier: "national",
      intended_major: "Jane Private Neuroscience",
      application_round: "regular",
      demonstrated_interest: "moderate",
    });

    expect(document).toContain("gpa:3.75-3.99");
    expect(document).toContain("test:1500+ SAT");
    expect(document).toContain("major:intended major supplied");
    expect(document).not.toContain("Jane");
    expect(document).not.toContain("Neuroscience");
  });
});

describe("Students-Like-You seed and SQL gates", () => {
  it("requires source_url and curated_public provenance on every seed row", () => {
    const seed = JSON.parse(
      readFileSync("pipeline/data/students_like_you_seed.json", "utf8"),
    ) as {
      records: Array<{ provenance?: string; source_url?: string }>;
    };

    expect(seed.records.length).toBeGreaterThanOrEqual(15);
    for (const record of seed.records) {
      expect(record.provenance).toBe("curated_public");
      expect(record.source_url).toMatch(/^https:\/\//);
    }
  });

  it("keeps k-anonymity, consent, and no-self gates in SQL", () => {
    const migration = readFileSync(
      "supabase/migrations/202606270001_v2_phase3_students_like_you.sql",
      "utf8",
    ).toLowerCase();

    expect(migration).toContain("create or replace function public.match_similar_cohort");
    expect(migration).toContain("count(distinct ranked.subject_id)");
    expect(migration).toContain("having count(distinct ranked.subject_id) >=");
    expect(migration).toContain("consent.revoked_at is null");
    expect(migration).toContain("outcome.subject_id <> p_exclude_subject_id");
    expect(migration).toContain("revoke all on function public.match_similar_cohort");
    expect(migration).toContain("to service_role");
  });
});

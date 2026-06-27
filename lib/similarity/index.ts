import type { StudentsLikeYouProfileInput } from "./schema";

export const STUDENTS_LIKE_YOU_K = 5;
export const STUDENTS_LIKE_YOU_MATCH_COUNT = 80;

export type AttributeCard = {
  kind: string;
  label: string;
  value: string;
  count: number;
};

export type AdmitInsight = {
  label: string;
  value: string;
  count: number;
};

export type SimilarCohort = {
  unitid: number;
  school_name: string;
  cohort_size: number;
  outcomes: {
    admitted: number;
    denied: number;
    waitlisted: number;
    deferred: number;
  };
  rates: {
    admitted: number;
    denied: number;
    waitlisted: number;
    deferred: number;
  };
  similarity: {
    min: number | null;
    max: number | null;
  };
  attribute_cards: AttributeCard[];
  admit_insights: AdmitInsight[];
  provenance: {
    curated_public: number;
    consented_user: number;
    source_urls: string[];
  };
};

export type StudentsLikeYouResponse = {
  status: "ready" | "empty";
  k: number;
  message?: string;
  query: {
    embedded: true;
    dim: number;
    model: string;
  };
  cohorts: SimilarCohort[];
  feedback: {
    enabled: false;
    reason: string;
  };
};

type RpcCohortRow = {
  unitid: number;
  school_name: string;
  cohort_size: number;
  admitted_count: number;
  denied_count: number;
  waitlisted_count: number;
  deferred_count: number;
  admit_rate: number;
  denied_rate: number;
  waitlisted_rate: number;
  deferred_rate: number;
  similarity_min: number | null;
  similarity_max: number | null;
  attribute_cards: unknown;
  admit_insights: unknown;
  provenance: unknown;
};

const privateKeyPattern =
  /^(subject_id|profile_id|consent_record_id|email|name|raw_profile|race|ethnicity|ethnic_origin|racial_identity)$/i;

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function arrayOfRecords(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function safeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function parseAttributeCards(value: unknown): AttributeCard[] {
  return arrayOfRecords(value)
    .map((item) => ({
      kind: safeText(item.kind),
      label: safeText(item.label),
      value: safeText(item.value),
      count: Math.round(finiteNumber(item.count)),
    }))
    .filter((item) => item.label && item.value && item.count >= STUDENTS_LIKE_YOU_K)
    .sort(
      (left, right) =>
        left.kind.localeCompare(right.kind) ||
        right.count - left.count ||
        left.value.localeCompare(right.value),
    );
}

function parseAdmitInsights(value: unknown): AdmitInsight[] {
  return arrayOfRecords(value)
    .map((item) => ({
      label: safeText(item.label),
      value: safeText(item.value),
      count: Math.round(finiteNumber(item.count)),
    }))
    .filter((item) => item.label && item.value && item.count >= STUDENTS_LIKE_YOU_K)
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.label.localeCompare(right.label) ||
        left.value.localeCompare(right.value),
    );
}

function parseProvenance(value: unknown): SimilarCohort["provenance"] {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const sourceUrls = Array.isArray(record.source_urls)
    ? record.source_urls
        .filter((item): item is string => typeof item === "string")
        .sort((left, right) => left.localeCompare(right))
    : [];

  return {
    curated_public: Math.round(finiteNumber(record.curated_public)),
    consented_user: Math.round(finiteNumber(record.consented_user)),
    source_urls: sourceUrls,
  };
}

export function gpaBand(value: number | undefined) {
  if (value === undefined) {
    return "GPA not reported";
  }
  if (value >= 4) {
    return "4.0+";
  }
  if (value >= 3.75) {
    return "3.75-3.99";
  }
  if (value >= 3.5) {
    return "3.50-3.74";
  }
  if (value >= 3) {
    return "3.00-3.49";
  }
  return "Below 3.00";
}

export function testBand(profile: Pick<
  StudentsLikeYouProfileInput,
  "sat_score" | "act_score" | "test_submitted"
>) {
  if (!profile.test_submitted) {
    return "No submitted test";
  }
  if (profile.sat_score !== undefined) {
    if (profile.sat_score >= 1500) return "1500+ SAT";
    if (profile.sat_score >= 1400) return "1400-1490 SAT";
    if (profile.sat_score >= 1300) return "1300-1390 SAT";
    return "Below 1300 SAT";
  }
  if (profile.act_score !== undefined) {
    if (profile.act_score >= 34) return "34+ ACT";
    if (profile.act_score >= 30) return "30-33 ACT";
    if (profile.act_score >= 26) return "26-29 ACT";
    return "Below 26 ACT";
  }
  return "Test not reported";
}

function controlledLabel(value: string | undefined, fallback: string) {
  if (!value || value === "unknown") {
    return fallback;
  }
  return value.replace(/_/g, " ");
}

export function buildSimilarityProfileDocument(
  profile: StudentsLikeYouProfileInput,
) {
  const majorSignal =
    profile.intended_major?.trim() &&
    profile.intended_major.trim().toLowerCase() !== "undecided"
      ? "intended major supplied"
      : "major undecided";

  return [
    `cycle:${profile.cycle_year ?? "not reported"}`,
    `gpa:${gpaBand(profile.gpa)}`,
    `test:${testBand(profile)}`,
    `rigor:${controlledLabel(profile.course_rigor, "rigor not reported")}`,
    `activities:${controlledLabel(profile.activities_tier, "activities not reported")}`,
    `round:${profile.application_round}`,
    `interest:${controlledLabel(profile.demonstrated_interest, "interest not reported")}`,
    `major:${majorSignal}`,
  ].join(" | ");
}

export function cohortsFromRpcRows(rows: RpcCohortRow[]): SimilarCohort[] {
  return rows
    .filter((row) => row.cohort_size >= STUDENTS_LIKE_YOU_K)
    .map((row) => ({
      unitid: row.unitid,
      school_name: row.school_name,
      cohort_size: row.cohort_size,
      outcomes: {
        admitted: row.admitted_count,
        denied: row.denied_count,
        waitlisted: row.waitlisted_count,
        deferred: row.deferred_count,
      },
      rates: {
        admitted: finiteNumber(row.admit_rate),
        denied: finiteNumber(row.denied_rate),
        waitlisted: finiteNumber(row.waitlisted_rate),
        deferred: finiteNumber(row.deferred_rate),
      },
      similarity: {
        min: row.similarity_min,
        max: row.similarity_max,
      },
      attribute_cards: parseAttributeCards(row.attribute_cards),
      admit_insights: parseAdmitInsights(row.admit_insights),
      provenance: parseProvenance(row.provenance),
    }))
    .sort(
      (left, right) =>
        right.cohort_size - left.cohort_size || left.unitid - right.unitid,
    );
}

export function studentsLikeYouResponse(input: {
  rows: RpcCohortRow[];
  model: string;
  dim: number;
}): StudentsLikeYouResponse {
  const cohorts = cohortsFromRpcRows(input.rows);
  const response: StudentsLikeYouResponse = {
    status: cohorts.length > 0 ? "ready" : "empty",
    k: STUDENTS_LIKE_YOU_K,
    ...(cohorts.length === 0
      ? { message: "Not enough similar students yet." }
      : {}),
    query: {
      embedded: true,
      dim: input.dim,
      model: input.model,
    },
    cohorts,
    feedback: {
      enabled: false,
      reason:
        "Cohort-to-Admit-Intelligence feedback is intentionally off for Phase 3 while exclusion logic is audited separately.",
    },
  };

  assertNoPrivateKeys(response);
  return response;
}

export function assertNoPrivateKeys(value: unknown, path = "response") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateKeys(item, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (privateKeyPattern.test(key)) {
      throw new Error(`${path}.${key} must not be returned in Students-Like-You.`);
    }
    assertNoPrivateKeys(nested, `${path}.${key}`);
  }
}

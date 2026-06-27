import { readFile } from "node:fs/promises";
import path from "node:path";

import { EMBEDDING_DIM, EMBEDDING_MODEL_ID } from "../../lib/fit/embedding-model";
import { vectorToSql } from "../../lib/fit/matching";
import { buildSimilarityProfileDocument } from "../../lib/similarity";
import type { StudentsLikeYouProfileInput } from "../../lib/similarity/schema";
import { createSupabaseServiceRoleClient } from "../../lib/supabase-server";

type SeedRecord = Omit<StudentsLikeYouProfileInput, "cycle_year"> & {
  id: string;
  subject_id: string;
  consent_record_id: string;
  profile_id: string;
  outcome_id: string;
  unitid: number;
  cycle_year: number;
  outcome: "admitted" | "denied" | "waitlisted" | "deferred";
  provenance: "curated_public";
  source_url: string;
};

type SeedFile = {
  version: string;
  description: string;
  records: SeedRecord[];
};

type TensorLike = {
  tolist: () => unknown;
};

type FeatureExtractor = (
  documents: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<TensorLike>;

type TransformersModule = {
  pipeline: (
    task: "feature-extraction",
    model: string,
  ) => Promise<FeatureExtractor>;
};

function requireSeedRecord(record: SeedRecord) {
  if (record.provenance !== "curated_public") {
    throw new Error(`${record.id} must use curated_public provenance`);
  }
  if (!record.source_url) {
    throw new Error(`${record.id} is missing source_url`);
  }
}

function vectorFromRaw(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Embedding output did not include vectors");
  }

  return value.map((item) => {
    if (!Array.isArray(item)) {
      throw new Error("Embedding output included a non-vector item");
    }
    const vector = item.map((entry) => Number(entry));
    if (
      vector.length !== EMBEDDING_DIM ||
      vector.some((entry) => !Number.isFinite(entry))
    ) {
      throw new Error(`Embedding output must be ${EMBEDDING_DIM} finite dimensions`);
    }
    return vector;
  });
}

async function embedDocuments(documents: string[]) {
  const transformersModule = (await import(
    "@xenova/transformers"
  )) as TransformersModule;
  const extractor = await transformersModule.pipeline(
    "feature-extraction",
    EMBEDDING_MODEL_ID,
  );
  const output = await extractor(documents, { pooling: "mean", normalize: true });
  return vectorFromRaw(output.tolist());
}

async function main() {
  const seedPath = path.join(
    process.cwd(),
    "pipeline",
    "data",
    "students_like_you_seed.json",
  );
  const seed = JSON.parse(await readFile(seedPath, "utf8")) as SeedFile;

  seed.records.forEach(requireSeedRecord);

  const documents = seed.records.map((record) =>
    buildSimilarityProfileDocument(record),
  );
  const vectors = await embedDocuments(documents);
  const supabase = createSupabaseServiceRoleClient();
  const consentText = `${seed.description} Source lineage is stored per row. These curated_public archetypes are seed data for k-anonymous cohort modeling.`;

  const consentRows = seed.records.map((record) => ({
    id: record.consent_record_id,
    subject_id: record.subject_id,
    consent_version: seed.version,
    consent_text: consentText,
    purpose: "real_outcome_modeling" as const,
    revoked_at: null,
  }));

  const profileRows = seed.records.map((record, index) => ({
    id: record.profile_id,
    subject_id: record.subject_id,
    consent_record_id: record.consent_record_id,
    cycle_year: record.cycle_year,
    gpa: record.gpa ?? null,
    course_rigor: record.course_rigor ?? "unknown",
    sat_score: record.sat_score ?? null,
    act_score: record.act_score ?? null,
    test_submitted: record.test_submitted,
    activities_tier: record.activities_tier ?? "unknown",
    intended_major: record.intended_major ?? null,
    application_round: record.application_round,
    demonstrated_interest: record.demonstrated_interest ?? "unknown",
    profile_embedding: vectorToSql(vectors[index]),
    profile_embedding_model: EMBEDDING_MODEL_ID,
    provenance: record.provenance,
    source_url: record.source_url,
  }));

  const outcomeRows = seed.records.map((record) => ({
    id: record.outcome_id,
    subject_id: record.subject_id,
    profile_id: record.profile_id,
    consent_record_id: record.consent_record_id,
    unitid: record.unitid,
    outcome: record.outcome,
    application_round: record.application_round,
    cycle_year: record.cycle_year,
    provenance: record.provenance,
    source_url: record.source_url,
  }));

  const consent = await supabase
    .from("consent_records")
    .upsert(consentRows, { onConflict: "id" });
  if (consent.error) {
    throw new Error(consent.error.message);
  }

  const profiles = await supabase
    .from("applicant_profiles")
    .upsert(profileRows, { onConflict: "id" });
  if (profiles.error) {
    throw new Error(profiles.error.message);
  }

  const outcomes = await supabase
    .from("application_outcomes")
    .upsert(outcomeRows, { onConflict: "id" });
  if (outcomes.error) {
    throw new Error(outcomes.error.message);
  }

  console.log(
    `Students-Like-You seed ingested: ${seed.records.length} curated_public records from ${seed.version}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Seed ingest failed");
  process.exitCode = 1;
});

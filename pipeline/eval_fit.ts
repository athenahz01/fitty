// Offline relevance evaluation for the Fit Finder ranking. Run: npm run fit:eval
//
// This is the recommendation-quality gate, the counterpart to the chance
// calibration gate. It loads curated queries with expected-relevant schools,
// embeds school and query documents with the SAME pinned model used live
// (Xenova/all-MiniLM-L6-v2 via embed_xenova.mjs), and compares two rankings:
//   - baseline: semantic similarity alone over the OLD thin school document
//     (broad program buckets only) - what "embeddings over thin docs" produced.
//   - new: program-fit hybrid (keyword over specific program titles + semantic)
//     over the ENRICHED document - the shipped ranking.
// It reports precision@5, hit-rate@5, and mean rank of expected schools, writes
// pipeline/reports/fit_eval_report.md, and exits non-zero below the quality bar.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { EMBEDDING_MODEL_ID } from "../lib/fit/embedding-model";
import { blendProgramFit, keywordProgramScore } from "../lib/fit/program-fit";
import { buildFitQueryDocument } from "../lib/fit/query-document";
import type { FitRequest } from "../lib/fit/schema";

const execFileAsync = promisify(execFile);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TOP_K = 5;

type EvalSchool = {
  unitid: number;
  name: string;
  region: string | null;
  size_band: string | null;
  setting: string | null;
  selectivity_tier: string | null;
  control: string | null;
  programs: string[] | null;
  program_areas: string[] | null;
};

type EvalQuery = {
  id: string;
  intended_major?: string;
  interests?: string;
  preferred_size?: string;
  preferred_setting?: string;
  preferred_region?: string;
  expected_unitids: number[];
};

type Fixtures = {
  schools: EvalSchool[];
  queries: EvalQuery[];
  quality_bar: {
    min_precision_at_5: number;
    min_hit_rate_at_5: number;
    must_beat_baseline: boolean;
  };
};

function sortedUnique(values: string[] | null) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort(
    (left, right) => left.toLowerCase().localeCompare(right.toLowerCase()),
  );
}

// Faithful TypeScript mirror of pipeline/fit_school_documents.build_school_document.
// includePrograms=false reproduces the pre-enrichment thin document.
function buildSchoolDocument(school: EvalSchool, includePrograms: boolean) {
  const sentences = [`${school.name}.`];
  const descriptor = [school.control, school.size_band, school.setting]
    .filter(Boolean)
    .join(" ");
  if (descriptor && school.region) {
    sentences.push(`${descriptor} school in the ${school.region}.`);
  } else if (descriptor) {
    sentences.push(`${descriptor} school.`);
  } else if (school.region) {
    sentences.push(`School in the ${school.region}.`);
  }
  if (includePrograms) {
    const programs = sortedUnique(school.programs);
    if (programs.length > 0) {
      sentences.push(`Fields of study: ${programs.join(", ")}.`);
    }
  }
  const areas = sortedUnique(school.program_areas);
  if (areas.length > 0) {
    sentences.push(`Program areas: ${areas.join(", ")}.`);
  }
  if (school.selectivity_tier) {
    sentences.push(`Admissions: selectivity ${school.selectivity_tier}.`);
  }
  return sentences.join(" ");
}

function queryText(query: EvalQuery) {
  return [query.intended_major, query.interests]
    .map((value) => value?.replace(/\s+/g, " ").trim())
    .filter((value): value is string => Boolean(value))
    .join(". ");
}

function passesFilters(school: EvalSchool, query: EvalQuery) {
  if (query.preferred_region && school.region !== query.preferred_region) {
    return false;
  }
  if (query.preferred_size && school.size_band !== query.preferred_size) {
    return false;
  }
  if (query.preferred_setting && school.setting !== query.preferred_setting) {
    return false;
  }
  return true;
}

function cosine(left: number[], right: number[]) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

async function embed(documents: string[]) {
  const dir = await mkdtemp(join(tmpdir(), "fit-eval-"));
  const inputPath = join(dir, "input.json");
  const outputPath = join(dir, "output.json");
  await writeFile(
    inputPath,
    JSON.stringify({ modelId: EMBEDDING_MODEL_ID, documents }),
    "utf8",
  );
  await execFileAsync(
    "node",
    [join(ROOT, "pipeline", "embed_xenova.mjs"), inputPath, outputPath],
    { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 },
  );
  const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
    vectors: number[][];
  };
  return payload.vectors;
}

type Ranked = { unitid: number; score: number }[];

function rankings(scores: Ranked) {
  return [...scores].sort((left, right) => right.score - left.score);
}

function metrics(ranked: Ranked, expected: Set<number>) {
  const top = ranked.slice(0, TOP_K);
  const hits = top.filter((entry) => expected.has(entry.unitid)).length;
  const precision = hits / TOP_K;
  const hitRate = hits > 0 ? 1 : 0;
  const ranks = [...expected].map((unitid) => {
    const index = ranked.findIndex((entry) => entry.unitid === unitid);
    return index === -1 ? ranked.length + 1 : index + 1;
  });
  const meanRank = ranks.reduce((total, rank) => total + rank, 0) / ranks.length;
  return { precision, hitRate, meanRank, topUnitids: top.map((entry) => entry.unitid) };
}

function mean(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

async function main() {
  const fixtures = JSON.parse(
    await readFile(join(ROOT, "pipeline", "data", "fit_eval_fixtures.json"), "utf8"),
  ) as Fixtures;
  const schools = fixtures.schools;
  const nameByUnitid = new Map(schools.map((school) => [school.unitid, school.name]));

  const newDocs = schools.map((school) => buildSchoolDocument(school, true));
  const oldDocs = schools.map((school) => buildSchoolDocument(school, false));
  const queryDocs = fixtures.queries.map((query) =>
    buildFitQueryDocument({
      intended_major: query.intended_major,
      interests: query.interests,
      preferred_size: query.preferred_size,
      preferred_setting: query.preferred_setting,
      preferred_region: query.preferred_region,
    } as FitRequest),
  );

  console.log(
    `Embedding ${newDocs.length + oldDocs.length + queryDocs.length} documents with ${EMBEDDING_MODEL_ID}...`,
  );
  const vectors = await embed([...newDocs, ...oldDocs, ...queryDocs]);
  const newVecs = vectors.slice(0, schools.length);
  const oldVecs = vectors.slice(schools.length, schools.length * 2);
  const queryVecs = vectors.slice(schools.length * 2);

  const rows = fixtures.queries.map((query, queryIndex) => {
    const expected = new Set(query.expected_unitids);
    const qVec = queryVecs[queryIndex];
    const text = queryText(query);
    const pool = schools
      .map((school, schoolIndex) => ({ school, schoolIndex }))
      .filter(({ school }) => passesFilters(school, query));

    const newRanked = rankings(
      pool.map(({ school, schoolIndex }) => ({
        unitid: school.unitid,
        score: blendProgramFit(
          keywordProgramScore(text, school.programs, school.program_areas).score,
          cosine(qVec, newVecs[schoolIndex]),
        ),
      })),
    );
    const oldRanked = rankings(
      pool.map(({ school, schoolIndex }) => ({
        unitid: school.unitid,
        score: cosine(qVec, oldVecs[schoolIndex]),
      })),
    );

    return {
      query,
      new: metrics(newRanked, expected),
      old: metrics(oldRanked, expected),
    };
  });

  const newPrecision = mean(rows.map((row) => row.new.precision));
  const oldPrecision = mean(rows.map((row) => row.old.precision));
  const newHitRate = mean(rows.map((row) => row.new.hitRate));
  const oldHitRate = mean(rows.map((row) => row.old.hitRate));
  const newMeanRank = mean(rows.map((row) => row.new.meanRank));
  const oldMeanRank = mean(rows.map((row) => row.old.meanRank));

  const bar = fixtures.quality_bar;
  const passPrecision = newPrecision >= bar.min_precision_at_5;
  const passHitRate = newHitRate >= bar.min_hit_rate_at_5;
  const passImprovement = !bar.must_beat_baseline || newPrecision > oldPrecision;
  const passed = passPrecision && passHitRate && passImprovement;

  const lines: string[] = [];
  lines.push("# Fit Finder relevance evaluation");
  lines.push("");
  lines.push(`Model: ${EMBEDDING_MODEL_ID}. Queries: ${rows.length}. Top-K: ${TOP_K}.`);
  lines.push("");
  lines.push("Baseline = semantic similarity over the old thin document.");
  lines.push("New = program-fit hybrid (keyword + semantic) over the enriched document.");
  lines.push("");
  lines.push("## Aggregate");
  lines.push("");
  lines.push("| Metric | Baseline | New |");
  lines.push("| --- | --- | --- |");
  lines.push(`| Precision@5 | ${oldPrecision.toFixed(3)} | ${newPrecision.toFixed(3)} |`);
  lines.push(`| Hit-rate@5 | ${oldHitRate.toFixed(3)} | ${newHitRate.toFixed(3)} |`);
  lines.push(`| Mean rank of expected (lower is better) | ${oldMeanRank.toFixed(2)} | ${newMeanRank.toFixed(2)} |`);
  lines.push("");
  lines.push("## Per query (new ranking)");
  lines.push("");
  lines.push("| Query | P@5 base | P@5 new | Hit new | Top 5 (new) |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const row of rows) {
    const top = row.new.topUnitids
      .map((unitid) => nameByUnitid.get(unitid) ?? String(unitid))
      .join("; ");
    lines.push(
      `| ${row.query.id} | ${row.old.precision.toFixed(2)} | ${row.new.precision.toFixed(2)} | ${row.new.hitRate ? "yes" : "no"} | ${top} |`,
    );
  }
  lines.push("");
  lines.push("## Quality bar");
  lines.push("");
  lines.push(`- Precision@5 >= ${bar.min_precision_at_5}: ${passPrecision ? "PASS" : "FAIL"} (${newPrecision.toFixed(3)})`);
  lines.push(`- Hit-rate@5 >= ${bar.min_hit_rate_at_5}: ${passHitRate ? "PASS" : "FAIL"} (${newHitRate.toFixed(3)})`);
  lines.push(`- Beats baseline precision: ${passImprovement ? "PASS" : "FAIL"} (${newPrecision.toFixed(3)} vs ${oldPrecision.toFixed(3)})`);
  lines.push("");
  lines.push(`Result: ${passed ? "PASS" : "FAIL"}`);
  lines.push("");

  const report = lines.join("\n");
  await writeFile(join(ROOT, "pipeline", "reports", "fit_eval_report.md"), report, "utf8");
  console.log(report);

  if (!passed) {
    console.error("fit:eval FAILED the quality bar");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

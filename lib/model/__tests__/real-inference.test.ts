import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildChancePayload,
  buildChancePayloadForArtifact,
  engineerFeatures,
  getActiveArtifact,
  isServeableRealModel,
  predict,
  publicPriorArtifact,
  realOutcomeArtifact,
  type InferenceSchool,
  type RuntimeArtifact,
} from "../inference";
import { chanceRequestSchema } from "../schema";
import realTestVectors from "../test_vectors.real.json";

const TOLERANCE = 1e-6;

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function nullableNumber(value: string) {
  if (value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function loadSchools() {
  const csvPath = join(
    process.cwd(),
    "pipeline",
    "data",
    "schools_public_cache.csv",
  );
  const [headerLine, ...lines] = readFileSync(csvPath, "utf-8")
    .trim()
    .split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  const schools = new Map<number, InferenceSchool>();

  lines.forEach((line) => {
    const cells = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
    schools.set(Number(row.unitid), {
      unitid: Number(row.unitid),
      name: row.name,
      setting: row.setting || null,
      size: nullableNumber(row.size),
      admit_rate: nullableNumber(row.admit_rate),
      sat_25: nullableNumber(row.sat_25),
      sat_75: nullableNumber(row.sat_75),
      act_25: nullableNumber(row.act_25),
      act_75: nullableNumber(row.act_75),
      gpa_avg: nullableNumber(row.gpa_avg),
      test_policy: row.test_policy || "unknown",
      c7_factors: row.c7_factors ? JSON.parse(row.c7_factors) : {},
      selectivity_tier: row.selectivity_tier,
    });
  });

  return schools;
}

const schools = loadSchools();
const originalRealModelFlag = process.env.ADMIRA_REAL_MODEL_ENABLED;

function restoreRealModelFlag() {
  if (originalRealModelFlag === undefined) {
    delete process.env.ADMIRA_REAL_MODEL_ENABLED;
  } else {
    process.env.ADMIRA_REAL_MODEL_ENABLED = originalRealModelFlag;
  }
}

function validRealArtifact(): RuntimeArtifact {
  return {
    ...realOutcomeArtifact,
    version: "2026.06.17-supabase",
    honesty_label: "Real-outcome model trained on consented outcomes.",
  };
}

function shapeOf(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.length > 0 ? [shapeOf(value[0])] : [];
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, shapeOf((value as Record<string, unknown>)[key])]),
    );
  }

  return typeof value;
}

afterEach(() => {
  restoreRealModelFlag();
});

describe("real outcome artifact contract", () => {
  it("round-trips generated real-model vectors behind the same TS contract", () => {
    realTestVectors.forEach((vector) => {
      const school = schools.get(vector.input.unitid);
      expect(school).toBeDefined();
      const request = chanceRequestSchema.parse({
        unitid: vector.input.unitid,
        sat_score: vector.input.sat_score,
        act_score: vector.input.act_score,
        gpa: vector.input.gpa,
        application_round: vector.input.application_round,
      });
      const features = engineerFeatures(request, school!);

      const output = predict(features, {}, realOutcomeArtifact, school!);
      const comparisons = [
        [output.point, vector.output.point_probability, "point"],
        [output.calibrated, vector.output.calibrated_probability, "calibrated"],
        [output.low, vector.output.interval_low, "low"],
        [output.high, vector.output.interval_high, "high"],
        [output.width, vector.output.interval_width, "width"],
      ] as const;

      comparisons.forEach(([actual, expected, label]) => {
        expect(Math.abs(actual - expected), `${vector.input.school_name} ${label}`).toBeLessThanOrEqual(
          TOLERANCE,
        );
      });
    });
  });

  it("keeps the chance response shape stable when the real artifact is selected", () => {
    const school = schools.get(166683)!;
    const request = chanceRequestSchema.parse({
      unitid: 166683,
      sat_score: 1540,
      act_score: 35,
      gpa: 3.95,
      application_round: "regular",
    });
    const payload = buildChancePayloadForArtifact(
      request,
      school,
      realOutcomeArtifact,
    );

    expect(payload.model.type).toBe("real_outcome_v1");
    expect(Object.keys(payload)).toEqual([
      "school",
      "probability",
      "band",
      "levers",
      "rubric",
      "disclaimers",
      "model",
    ]);
    expect(payload.probability.low).toBeLessThanOrEqual(
      payload.probability.calibrated,
    );
    expect(payload.probability.high).toBeGreaterThanOrEqual(
      payload.probability.calibrated,
    );
  });

  it("uses the public prior when the real-model flag is off", () => {
    process.env.ADMIRA_REAL_MODEL_ENABLED = "false";
    const school = schools.get(166683)!;
    const request = chanceRequestSchema.parse({
      unitid: 166683,
      sat_score: 1540,
      act_score: 35,
      gpa: 3.95,
      application_round: "regular",
    });

    const active = getActiveArtifact(validRealArtifact());
    const payload = buildChancePayload(request, school, active);

    expect(active).toBe(publicPriorArtifact);
    expect(payload.model.type).toBe(publicPriorArtifact.model_type);
  });

  it("uses a valid real artifact when the real-model flag is on", () => {
    process.env.ADMIRA_REAL_MODEL_ENABLED = "true";
    const school = schools.get(166683)!;
    const request = chanceRequestSchema.parse({
      unitid: 166683,
      sat_score: 1540,
      act_score: 35,
      gpa: 3.95,
      application_round: "regular",
    });
    const realArtifact = validRealArtifact();

    const active = getActiveArtifact(realArtifact);
    const payload = buildChancePayload(request, school, active);

    expect(isServeableRealModel(realArtifact)).toBe(true);
    expect(active).toBe(realArtifact);
    expect(payload.model.type).toBe(realArtifact.model_type);
    expect(payload.model.honesty_label).toBe(realArtifact.honesty_label);
  });

  it("falls back to the public prior when the checked-in real artifact is fixture-only", () => {
    process.env.ADMIRA_REAL_MODEL_ENABLED = "true";
    const school = schools.get(166683)!;
    const request = chanceRequestSchema.parse({
      unitid: 166683,
      sat_score: 1540,
      act_score: 35,
      gpa: 3.95,
      application_round: "regular",
    });

    const active = getActiveArtifact();
    const payload = buildChancePayload(request, school);

    expect(isServeableRealModel(realOutcomeArtifact)).toBe(false);
    expect(active).toBe(publicPriorArtifact);
    expect(payload.model.type).toBe(publicPriorArtifact.model_type);
  });

  it("keeps the response contract identical in prior and real modes", () => {
    const school = schools.get(166683)!;
    const request = chanceRequestSchema.parse({
      unitid: 166683,
      sat_score: 1540,
      act_score: 35,
      gpa: 3.95,
      application_round: "regular",
    });

    const priorPayload = buildChancePayloadForArtifact(
      request,
      school,
      publicPriorArtifact,
    );
    const realPayload = buildChancePayloadForArtifact(
      request,
      school,
      validRealArtifact(),
    );

    expect(shapeOf(realPayload)).toEqual(shapeOf(priorPayload));
  });
});

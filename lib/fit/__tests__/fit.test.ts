import { beforeEach, describe, expect, it, vi } from "vitest";

const transformerMock = vi.hoisted(() => ({
  pipeline: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@xenova/transformers", () => ({
  pipeline: transformerMock.pipeline,
}));

import { EMBEDDING_DIM, EMBEDDING_MODEL_ID } from "../embedding-model";
import {
  buildFitQueryDocument,
  embedFitDocuments,
  embedFitQuery,
  resetFitQueryEmbedderForTests,
} from "../embed-query";
import { computeFitScore } from "../fit-score";
import { buildClimbLevers } from "../levers";
import {
  buildBalancedFitResponse,
  schoolMatchesHardFilters,
  type FitSchoolCandidate,
} from "../matching";
import { fitRequestSchema } from "../schema";

function mockVectorForText(text: string) {
  const source = text || "fit";
  return Array.from({ length: EMBEDDING_DIM }, (_, index) => {
    const code = source.charCodeAt(index % source.length);
    return ((code + index) % 101) / 101;
  });
}

function cosineSimilarity(left: number[], right: number[]) {
  const dot = left.reduce((total, value, index) => total + value * right[index], 0);
  const leftNorm = Math.sqrt(left.reduce((total, value) => total + value * value, 0));
  const rightNorm = Math.sqrt(right.reduce((total, value) => total + value * value, 0));
  return dot / (leftNorm * rightNorm);
}

function candidate(
  overrides: Partial<FitSchoolCandidate> = {},
): FitSchoolCandidate {
  return {
    unitid: 166683,
    name: "Massachusetts Institute of Technology",
    state: "MA",
    province_state: "MA",
    country: "US",
    admission_system: "common_app",
    grading_basis: "gpa_4_0",
    broad_based_admission: false,
    setting: "city",
    size: 11500,
    admit_rate: 0.04,
    sat_25: 1520,
    sat_75: 1580,
    act_25: 34,
    act_75: 36,
    gpa_avg: null,
    test_policy: "required",
    c7_factors: {},
    selectivity_tier: "elite",
    region: "Northeast",
    size_band: "large",
    net_price_avg: 22000,
    sticker_cost: 82000,
    program_areas: ["Computer and information sciences", "Engineering"],
    programs: ["Computer Science", "Mechanical Engineering"],
    control: "private",
    median_earnings_10yr: 95000,
    completion_rate: 0.94,
    ...overrides,
  };
}

beforeEach(() => {
  resetFitQueryEmbedderForTests();
  transformerMock.pipeline.mockReset();
  transformerMock.pipeline.mockImplementation(async () => {
    return async (documents: string[]) => ({
      tolist: () => documents.map((document) => mockVectorForText(document)),
    });
  });
});

describe("Fit Finder schema", () => {
  it("rejects out-of-range profile values and empty query text", () => {
    expect(
      fitRequestSchema.safeParse({
        interests: "engineering",
        sat_score: 399,
      }).success,
    ).toBe(false);
    expect(
      fitRequestSchema.safeParse({
        gpa: 3.8,
        application_round: "regular",
      }).success,
    ).toBe(false);
  });

  it("strips demographic keys while accepting the rest of the body", () => {
    const parsed = fitRequestSchema.parse({
      interests: "engineering",
      gpa: 3.9,
      application_round: "regular",
      race: "ignored",
    });

    expect("race" in parsed).toBe(false);
    expect(JSON.stringify(parsed).toLowerCase()).not.toContain("ignored");
  });
});

describe("Fit Finder embeddings", () => {
  it("embeds with the pinned model and cached pipeline", async () => {
    const request = fitRequestSchema.parse({
      interests: "hands-on engineering",
      intended_major: "computer science",
      preferred_region: "Northeast",
      gpa: 3.9,
    });

    const first = await embedFitQuery(request);
    const second = await embedFitQuery(request);

    expect(first.vector).toHaveLength(EMBEDDING_DIM);
    expect(second.vector).toHaveLength(EMBEDDING_DIM);
    expect(first.model).toBe(EMBEDDING_MODEL_ID);
    expect(transformerMock.pipeline).toHaveBeenCalledTimes(1);
    expect(transformerMock.pipeline).toHaveBeenCalledWith(
      "feature-extraction",
      EMBEDDING_MODEL_ID,
    );
  });

  it("embeds query and school documents in the same finite vector space", async () => {
    const request = fitRequestSchema.parse({
      interests: "engineering and computing",
      intended_major: "computer science",
      preferred_size: "large",
      preferred_setting: "city",
      preferred_region: "Northeast",
      gpa: 3.9,
    });
    const queryDoc = buildFitQueryDocument(request);
    const schoolDoc =
      "Massachusetts Institute of Technology. large city school in the Northeast. Programs: Computer and information sciences, Engineering. Admissions: selectivity elite, test policy required. Outcomes: completion 94%, median earnings $95,000. Costs: published net price $22,000, published sticker cost $82,000.";

    const [queryVector, schoolVector] = await embedFitDocuments([
      queryDoc,
      schoolDoc,
    ]);
    const similarity = cosineSimilarity(queryVector, schoolVector);

    expect(queryVector).toHaveLength(EMBEDDING_DIM);
    expect(schoolVector).toHaveLength(EMBEDDING_DIM);
    expect(Number.isFinite(similarity)).toBe(true);
  });
});

describe("Fit Finder matching", () => {
  const request = fitRequestSchema.parse({
    interests: "computer science and engineering",
    intended_major: "computer science",
    preferred_region: "Northeast",
    preferred_size: "large",
    preferred_setting: "city",
    cost_ceiling: 30000,
    sat_score: 1540,
    act_score: 35,
    gpa: 3.95,
    application_round: "regular",
  });

  it("applies cost, fallback cost, unknown cost, and region filters", () => {
    expect(schoolMatchesHardFilters(candidate(), request)).toBe(true);
    expect(
      schoolMatchesHardFilters(
        candidate({ net_price_avg: 40000, sticker_cost: 82000 }),
        request,
      ),
    ).toBe(false);
    expect(
      schoolMatchesHardFilters(
        candidate({ net_price_avg: null, sticker_cost: 40000 }),
        request,
      ),
    ).toBe(false);
    expect(
      schoolMatchesHardFilters(
        candidate({ net_price_avg: null, sticker_cost: null }),
        request,
      ),
    ).toBe(true);
    expect(
      schoolMatchesHardFilters(candidate({ region: "Midwest" }), request),
    ).toBe(false);
  });

  it("applies selectivity, control, and graduation-rate filters", () => {
    const filtered = fitRequestSchema.parse({
      interests: "computer science",
      selectivity_tier: "elite",
      control: "private",
      min_grad_rate: 0.9,
      gpa: 3.9,
      application_round: "regular",
    });

    expect(schoolMatchesHardFilters(candidate(), filtered)).toBe(true);
    expect(
      schoolMatchesHardFilters(
        candidate({ selectivity_tier: "selective" }),
        filtered,
      ),
    ).toBe(false);
    expect(
      schoolMatchesHardFilters(candidate({ control: "public" }), filtered),
    ).toBe(false);
    expect(
      schoolMatchesHardFilters(candidate({ completion_rate: 0.8 }), filtered),
    ).toBe(false);
    // Missing graduation data never silently drops a school.
    expect(
      schoolMatchesHardFilters(candidate({ completion_rate: null }), filtered),
    ).toBe(true);
  });

  it("returns chance bands, honest balance counts, and no legacy combined score", () => {
    const response = buildBalancedFitResponse(
      [
        candidate({ unitid: 166683 }),
        candidate({
          unitid: 170976,
          name: "University of Michigan-Ann Arbor",
          state: "MI",
          region: "Northeast",
          sat_25: 1360,
          sat_75: 1530,
          act_25: 31,
          act_75: 34,
          selectivity_tier: "highly_selective",
        }),
      ],
      request,
    );

    expect(response.results.length).toBeGreaterThan(0);
    const forbiddenKey = ["match", "percentage"].join("_");
    for (const result of response.results) {
      expect(["reach", "target", "likely"]).toContain(result.band.label);
      expect(result.probability.coverage).toBeGreaterThan(0);
      expect(result).not.toHaveProperty(forbiddenKey);
      expect(JSON.stringify(result).toLowerCase()).not.toContain(forbiddenKey);
      expect(JSON.stringify(result).toLowerCase()).not.toContain("similarity");
    }

    const counts = response.results.reduce(
      (total, result) => ({
        ...total,
        [result.band.label]: total[result.band.label] + 1,
      }),
      { reach: 0, target: 0, likely: 0 },
    );
    expect(response.balance.reach).toBe(counts.reach);
    expect(response.balance.target).toBe(counts.target);
    expect(response.balance.likely).toBe(counts.likely);
  });
});

describe("Fit overlap score", () => {
  const request = fitRequestSchema.parse({
    interests: "computer science and engineering",
    intended_major: "computer science",
    preferred_region: "Northeast",
    preferred_size: "large",
    preferred_setting: "city",
    sat_score: 1540,
    act_score: 35,
    gpa: 3.95,
    application_round: "regular",
  });

  it("is deterministic, bounded, and uses the pinned embedding model", async () => {
    const school = candidate({
      similarity: 0.82,
      c7_factors: { rigor: "Very Important" },
    });

    const first = await computeFitScore(request, school);
    resetFitQueryEmbedderForTests();
    const second = await computeFitScore(request, school);

    expect(first).toEqual(second);
    expect(first.score).not.toBeNull();
    expect(first.score).toBeGreaterThanOrEqual(0);
    expect(first.score).toBeLessThanOrEqual(100);
    expect(first.axes).toHaveLength(5);
    for (const axis of first.axes) {
      if (axis.value !== null) {
        expect(axis.value).toBeGreaterThanOrEqual(0);
        expect(axis.value).toBeLessThanOrEqual(100);
      }
    }
    expect(first.model).toEqual({
      id: EMBEDDING_MODEL_ID,
      dim: EMBEDDING_DIM,
    });
    expect(transformerMock.pipeline).toHaveBeenCalledWith(
      "feature-extraction",
      EMBEDDING_MODEL_ID,
    );
  });

  it("excludes missing axes and reports reduced coverage", async () => {
    const sparseRequest = fitRequestSchema.parse({
      intended_major: "history",
      gpa: 3.5,
      application_round: "regular",
    });

    const score = await computeFitScore(
      sparseRequest,
      candidate({
        gpa_avg: 3.6,
        program_areas: null,
        similarity: null,
        c7_factors: {},
      }),
    );

    expect(score.score).not.toBeNull();
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(score.coverage.reduced).toBe(true);
    expect(score.axes.some((axis) => axis.status === "unknown")).toBe(true);
  });
});

describe("Climb levers", () => {
  it("uses real deltas for modeled test score and published early spread", () => {
    const request = fitRequestSchema.parse({
      interests: "engineering",
      sat_score: 1400,
      gpa: 3.8,
      application_round: "regular",
    });
    const levers = buildClimbLevers(
      request,
      candidate({
        ed_admit_rate: 0.32,
        rd_admit_rate: 0.22,
      }),
    );

    const testScore = levers.find((lever) => lever.id === "test_score");
    const round = levers.find((lever) => lever.id === "application_round");
    expect(testScore?.kind).toBe("modeled_delta");
    expect(testScore?.delta?.tick).toEqual(expect.any(Number));
    expect(round?.kind).toBe("published_delta");
    expect(round?.delta?.tick).toBeCloseTo(0.1);
  });

  it("keeps unseen levers and missing early data direction only", () => {
    const request = fitRequestSchema.parse({
      interests: "engineering",
      application_round: "regular",
    });
    const levers = buildClimbLevers(request, candidate());

    expect(
      levers.find((lever) => lever.id === "application_round")?.kind,
    ).toBe("direction_only");
    for (const id of ["essays", "recommendations", "demonstrated_interest"]) {
      const lever = levers.find((item) => item.id === id);
      expect(lever?.kind).toBe("direction_only");
      expect(lever?.delta).toBeUndefined();
    }
  });
});

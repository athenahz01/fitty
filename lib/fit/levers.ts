import {
  buildChancePayloadForArtifact,
  getActiveArtifact,
  type InferenceSchool,
  type RuntimeArtifact,
} from "../model/inference";
import type { ChanceRequest } from "../model/schema";

type LeverInput = Omit<ChanceRequest, "unitid"> & {
  unitid?: number;
};

export type ClimbLever = {
  id:
    | "test_score"
    | "application_round"
    | "essays"
    | "recommendations"
    | "demonstrated_interest";
  label: string;
  kind: "modeled_delta" | "published_delta" | "direction_only";
  note: string;
  direction: string;
  delta?: {
    low: number;
    high: number;
    tick: number;
  };
};

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampProbability(value: number) {
  return Math.max(0, Math.min(1, value));
}

function probabilityDelta(
  current: ReturnType<typeof buildChancePayloadForArtifact>["probability"],
  next: ReturnType<typeof buildChancePayloadForArtifact>["probability"],
) {
  return {
    low: next.low - current.low,
    high: next.high - current.high,
    tick: next.calibrated - current.calibrated,
  };
}

function testScoreScenario(input: LeverInput) {
  if (input.sat_score !== undefined && input.sat_score < 1600) {
    return {
      ...input,
      sat_score: Math.min(1600, input.sat_score + 50),
    };
  }

  if (input.act_score !== undefined && input.act_score < 36) {
    return {
      ...input,
      act_score: Math.min(36, input.act_score + 1),
    };
  }

  return null;
}

function buildTestScoreLever(
  input: LeverInput,
  school: InferenceSchool,
  runtimeArtifact: RuntimeArtifact,
): ClimbLever {
  const nextInput = testScoreScenario(input);
  if (!nextInput) {
    return {
      id: "test_score",
      label: "Test score",
      kind: "direction_only",
      direction: "Modeled when a higher submitted SAT or ACT can be compared.",
      note:
        "No higher submitted test-score scenario is available from the current inputs.",
    };
  }

  const current = buildChancePayloadForArtifact(
    { ...input, unitid: school.unitid },
    school,
    runtimeArtifact,
  ).probability;
  const next = buildChancePayloadForArtifact(
    { ...nextInput, unitid: school.unitid },
    school,
    runtimeArtifact,
  ).probability;

  return {
    id: "test_score",
    label: "Test score",
    kind: "modeled_delta",
    direction:
      "Reruns the existing chance model with a modest higher submitted score.",
    note:
      input.sat_score !== undefined
        ? "Scenario uses SAT plus 50 points, capped at 1600."
        : "Scenario uses ACT plus 1 point, capped at 36.",
    delta: probabilityDelta(current, next),
  };
}

function buildRoundLever(input: LeverInput, school: InferenceSchool): ClimbLever {
  if (input.application_round === "early") {
    return {
      id: "application_round",
      label: "Application round",
      kind: "direction_only",
      direction: "Already set to early in this scenario.",
      note: "No additional ED or EA delta is shown from a single early setting.",
    };
  }

  const edRate = finiteNumber(school.ed_admit_rate);
  const rdRate = finiteNumber(school.rd_admit_rate);

  if (edRate !== null && rdRate !== null && edRate > rdRate) {
    const spread = clampProbability(edRate) - clampProbability(rdRate);
    return {
      id: "application_round",
      label: "Application round",
      kind: "published_delta",
      direction: "Uses the school's published ED or EA spread when available.",
      note:
        "This is a school-level published rate spread, not a personalized guarantee.",
      delta: {
        low: spread,
        high: spread,
        tick: spread,
      },
    };
  }

  return {
    id: "application_round",
    label: "Application round",
    kind: "direction_only",
    direction:
      "Could matter at some schools, but no usable published ED/RD spread is loaded here.",
    note: "Admira does not invent an ED or EA number when the published rates are missing.",
  };
}

function unseenLever(
  id: "essays" | "recommendations" | "demonstrated_interest",
  label: string,
  note: string,
): ClimbLever {
  return {
    id,
    label,
    kind: "direction_only",
    direction: "Can narrow the real outcome range, but is not in this model yet.",
    note,
  };
}

export function buildClimbLevers(
  input: LeverInput,
  school: InferenceSchool,
  runtimeArtifact: RuntimeArtifact = getActiveArtifact(),
) {
  return [
    buildTestScoreLever(input, school, runtimeArtifact),
    buildRoundLever(input, school),
    unseenLever(
      "essays",
      "Essays",
      "Public data cannot evaluate writing quality, story, or school-specific application narrative.",
    ),
    unseenLever(
      "recommendations",
      "Recommendations",
      "Teacher and counselor letters are not visible in the public-data model.",
    ),
    unseenLever(
      "demonstrated_interest",
      "Demonstrated interest",
      "Some schools consider engagement, but this model does not receive student-specific interest evidence.",
    ),
  ] satisfies ClimbLever[];
}

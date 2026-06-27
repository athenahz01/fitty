import { featureLevers, type FeatureLever } from "../levers";
import {
  getActiveArtifact,
  type InferenceSchool,
  type RuntimeArtifact,
} from "../model/inference";
import type { AdmitTier } from "../score/tiers";
import { buildUsAdmitIntelligence } from "../score/us";

import type { ClimbProfileInput } from "./schema";

export type ClimbSchool = InferenceSchool & {
  country?: "US" | "CA" | string | null;
};

export type ClimbScoreSnapshot = {
  score: number;
  tier: AdmitTier;
  probability: number;
};

export type ClimbMove = {
  id: string;
  school: {
    unitid: number;
    name: string;
  };
  lever: {
    feature: string;
    label: string;
    kind: "controllable";
  };
  before: ClimbScoreSnapshot;
  after: ClimbScoreSnapshot;
  delta_score: number;
  crosses_tier: boolean;
  tier_claim: string | null;
  counterfactual: Partial<ClimbProfileInput>;
  direction: string;
  note: string;
};

export type ClimbContext = {
  feature: string;
  label: string;
  kind: "fixed" | "unseen" | "not_model_visible";
  note: string;
};

export type ClimbSchoolPlan = {
  school: {
    unitid: number;
    name: string;
  };
  current: ClimbScoreSnapshot;
  moves: ClimbMove[];
};

export type ClimbRoadmap = {
  snapshot_key: string;
  method: string;
  schools: ClimbSchoolPlan[];
  ranked_moves: ClimbMove[];
  context: ClimbContext[];
};

type Counterfactual = {
  feature: "test_score" | "application_round";
  label: string;
  nextProfile: ClimbProfileInput;
  counterfactual: Partial<ClimbProfileInput>;
  direction: string;
  note: string;
};

const leverByFeature = new Map(featureLevers.map((lever) => [lever.feature, lever]));

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function stableHash(value: unknown) {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function scoreProfile(
  profile: ClimbProfileInput,
  school: InferenceSchool,
  runtimeArtifact: RuntimeArtifact,
): ClimbScoreSnapshot {
  const result = buildUsAdmitIntelligence(
    {
      unitid: school.unitid,
      sat_score: profile.sat_score,
      act_score: profile.act_score,
      gpa: profile.gpa,
      application_round: profile.application_round,
      intended_major: profile.intended_major,
      activity_context: profile.activity_context,
    },
    school,
    runtimeArtifact,
  );

  return {
    score: result.score,
    tier: result.tier,
    probability: result.probability.calibrated,
  };
}

function testScoreCounterfactual(
  profile: ClimbProfileInput,
  school: InferenceSchool,
): Counterfactual | null {
  if (school.test_policy === "blind") {
    return null;
  }

  if (profile.sat_score !== undefined && profile.sat_score < 1600) {
    const sat_score = Math.min(1600, profile.sat_score + 50);
    return {
      feature: "test_score",
      label: "Test score",
      nextProfile: { ...profile, sat_score },
      counterfactual: { sat_score },
      direction: "Rerun the public-prior scorer with SAT 50 points higher.",
      note: "Computed by rescoring this exact school with the counterfactual SAT, capped at 1600.",
    };
  }

  if (profile.act_score !== undefined && profile.act_score < 36) {
    const act_score = Math.min(36, profile.act_score + 1);
    return {
      feature: "test_score",
      label: "Test score",
      nextProfile: { ...profile, act_score },
      counterfactual: { act_score },
      direction: "Rerun the public-prior scorer with ACT 1 point higher.",
      note: "Computed by rescoring this exact school with the counterfactual ACT, capped at 36.",
    };
  }

  return null;
}

function roundCounterfactual(profile: ClimbProfileInput): Counterfactual | null {
  if (profile.application_round === "early") {
    return null;
  }

  return {
    feature: "application_round",
    label: "Application round",
    nextProfile: { ...profile, application_round: "early" },
    counterfactual: { application_round: "early" },
    direction: "Rerun the public-prior scorer with application round set to early.",
    note: "Computed by the same Admit Intelligence scorer; no published spread is substituted.",
  };
}

function buildMove(
  counterfactual: Counterfactual,
  profile: ClimbProfileInput,
  school: InferenceSchool,
  runtimeArtifact: RuntimeArtifact,
): ClimbMove {
  const before = scoreProfile(profile, school, runtimeArtifact);
  const after = scoreProfile(counterfactual.nextProfile, school, runtimeArtifact);
  const deltaScore = after.score - before.score;

  return {
    id: `${school.unitid}:${counterfactual.feature}`,
    school: {
      unitid: school.unitid,
      name: school.name,
    },
    lever: {
      feature: counterfactual.feature,
      label: counterfactual.label,
      kind: "controllable",
    },
    before,
    after,
    delta_score: deltaScore,
    crosses_tier: before.tier !== after.tier,
    tier_claim: before.tier !== after.tier ? `${before.tier} -> ${after.tier}` : null,
    counterfactual: counterfactual.counterfactual,
    direction: counterfactual.direction,
    note: counterfactual.note,
  };
}

function moveSort(left: ClimbMove, right: ClimbMove) {
  return (
    right.delta_score - left.delta_score ||
    Number(right.crosses_tier) - Number(left.crosses_tier) ||
    left.school.unitid - right.school.unitid ||
    left.lever.feature.localeCompare(right.lever.feature)
  );
}

function contextLever(lever: FeatureLever): ClimbContext {
  return {
    feature: lever.feature,
    label: lever.label,
    kind: lever.lever === "controllable" ? "not_model_visible" : lever.lever,
    note:
      lever.feature === "remaining_course_rigor"
        ? "Important planning lever, but the current public-prior scorer does not accept course-rigor inputs, so no score delta is shown."
        : (lever.note ?? "Shown as planning context only."),
  };
}

export function buildClimbRoadmap(
  profile: ClimbProfileInput,
  schools: ClimbSchool[],
  runtimeArtifact: RuntimeArtifact = getActiveArtifact(),
): ClimbRoadmap {
  const usSchools = schools
    .filter((school) => school.country === undefined || school.country === null || school.country === "US")
    .sort((left, right) => left.unitid - right.unitid);

  const context = featureLevers
    .filter(
      (lever) =>
        lever.lever !== "controllable" || lever.feature === "remaining_course_rigor",
    )
    .map(contextLever)
    .sort((left, right) => left.feature.localeCompare(right.feature));

  const schoolPlans = usSchools.map((school) => {
    const current = scoreProfile(profile, school, runtimeArtifact);
    const moves = [
      testScoreCounterfactual(profile, school),
      roundCounterfactual(profile),
    ]
      .filter((item): item is Counterfactual => item !== null)
      .map((counterfactual) =>
        buildMove(counterfactual, profile, school, runtimeArtifact),
      )
      .sort(moveSort);

    return {
      school: {
        unitid: school.unitid,
        name: school.name,
      },
      current,
      moves,
    };
  });

  const rankedMoves = schoolPlans.flatMap((plan) => plan.moves).sort(moveSort);

  return {
    snapshot_key: `climb:${stableHash({
      profile,
      schools: usSchools.map((school) => school.unitid),
      model: runtimeArtifact.version,
    })}`,
    method:
      "For every model-visible controllable lever, Admira reruns the same Admit Intelligence scorer on the counterfactual profile and reports score(after) - score(before). Fixed and model-unseen factors are context only.",
    schools: schoolPlans,
    ranked_moves: rankedMoves,
    context,
  };
}

export function modelVisibleLeverFeatures() {
  return ["test_score", "application_round"] as const;
}

export function leverMetadata(feature: string) {
  return leverByFeature.get(feature);
}

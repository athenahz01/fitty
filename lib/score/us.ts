import {
  buildChancePayloadForArtifact,
  getActiveArtifact,
  type InferenceSchool,
  type RuntimeArtifact,
} from "../model/inference";
import type { ChanceRequest } from "../model/schema";
import { buildUsProfileStudio, type ProfileStudio } from "../profile";

import { buildUsDrivers, driversAreConsistent, type Driver } from "./drivers";
import { confidenceFromRange, toHeadlineScore } from "./headline";
import { tierFromProbability, type AdmitTier } from "./tiers";

export type UsAdmitIntelligenceInput = ChanceRequest & {
  intended_major?: string;
  activity_context?: string;
};

export type UsAdmitIntelligence = {
  score: number;
  tier: AdmitTier;
  drivers: Driver[];
  confidence: number;
  country: "US";
  profile: ProfileStudio;
  probability: ReturnType<typeof buildChancePayloadForArtifact>["probability"];
};

export function buildUsAdmitIntelligence(
  input: UsAdmitIntelligenceInput,
  school: InferenceSchool,
  runtimeArtifact: RuntimeArtifact = getActiveArtifact(),
): UsAdmitIntelligence {
  const chance = buildChancePayloadForArtifact(input, school, runtimeArtifact);
  const score = toHeadlineScore(chance.probability.calibrated);
  const tier = tierFromProbability(chance.probability.calibrated);
  const drivers = buildUsDrivers(input, school, runtimeArtifact);

  if (!driversAreConsistent(tier, drivers)) {
    throw new Error("headline score and drivers are inconsistent");
  }

  return {
    score,
    tier,
    drivers,
    confidence: confidenceFromRange(chance.probability.width),
    country: "US",
    profile: buildUsProfileStudio({ request: input, school }),
    probability: chance.probability,
  };
}

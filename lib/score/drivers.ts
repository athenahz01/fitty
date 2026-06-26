import {
  engineerFeatures,
  featureContributions,
  type InferenceSchool,
  type RuntimeArtifact,
} from "../model/inference";
import type { ChanceRequest } from "../model/schema";

import type { AdmitTier } from "./tiers";

export type Driver = {
  label: string;
  direction: "positive" | "negative" | "neutral";
  impact: number;
  detail: string;
};

function directionFromImpact(value: number): Driver["direction"] {
  if (value > 0.000001) {
    return "positive";
  }
  if (value < -0.000001) {
    return "negative";
  }
  return "neutral";
}

function driverDetail(label: string, contribution: number) {
  const direction = contribution >= 0 ? "supports" : "pulls against";
  return `${label} ${direction} the calibrated read.`;
}

export function buildUsDrivers(
  input: ChanceRequest,
  school: InferenceSchool,
  runtimeArtifact: RuntimeArtifact,
): Driver[] {
  const features = engineerFeatures(input, school);
  const grouped = new Map<string, { label: string; contribution: number }>();

  for (const row of featureContributions(features, runtimeArtifact)) {
    const current = grouped.get(row.group);
    grouped.set(row.group, {
      label: row.label,
      contribution: (current?.contribution ?? 0) + row.contribution,
    });
  }

  return [...grouped.values()]
    .map((row) => ({
      label: row.label,
      direction: directionFromImpact(row.contribution),
      impact: Math.round(Math.abs(row.contribution) * 1000) / 1000,
      detail: driverDetail(row.label, row.contribution),
    }))
    .sort((left, right) => right.impact - left.impact)
    .slice(0, 5);
}

export function driversAreConsistent(tier: AdmitTier, drivers: Driver[]) {
  if (drivers.length === 0) {
    return false;
  }

  if (tier === "Likely" || tier === "Safety") {
    return drivers.some((driver) => driver.direction === "positive");
  }

  if (tier === "Reach") {
    return drivers.some((driver) => driver.direction === "negative");
  }

  return drivers.some((driver) => driver.direction !== "neutral");
}

export type AdmitTier = "Reach" | "Target" | "Likely" | "Safety";

export const ADMIT_TIER_THRESHOLDS = [
  {
    tier: "Reach",
    minProbability: 0,
    maxExclusive: 0.3,
  },
  {
    tier: "Target",
    minProbability: 0.3,
    maxExclusive: 0.55,
  },
  {
    tier: "Likely",
    minProbability: 0.55,
    maxExclusive: 0.8,
  },
  {
    tier: "Safety",
    minProbability: 0.8,
    maxExclusive: 1.0000000001,
  },
] as const satisfies Array<{
  tier: AdmitTier;
  minProbability: number;
  maxExclusive: number;
}>;

export function clampProbability(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error("probability must be finite");
  }
  return Math.min(1, Math.max(0, value));
}

export function tierFromProbability(probability: number): AdmitTier {
  const clamped = clampProbability(probability);
  const threshold = ADMIT_TIER_THRESHOLDS.find(
    (entry) => clamped >= entry.minProbability && clamped < entry.maxExclusive,
  );
  return threshold?.tier ?? "Safety";
}

export function legacyBandFromTier(tier: AdmitTier) {
  switch (tier) {
    case "Reach":
      return "reach";
    case "Target":
      return "target";
    case "Likely":
    case "Safety":
      return "likely";
  }
}

import { clampProbability } from "./tiers";

export function toHeadlineScore(calibratedProbability: number) {
  return Math.round(clampProbability(calibratedProbability) * 100);
}

export function confidenceFromRange(width: number) {
  if (!Number.isFinite(width)) {
    throw new Error("range width must be finite");
  }
  return Math.round(Math.max(0.2, Math.min(0.95, 1 - width)) * 100) / 100;
}

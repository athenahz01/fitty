import publicArtifacts from "./artifacts.json";
import realArtifacts from "./artifacts.real.json";
import type { ChanceRequest } from "./schema";

type Artifact = typeof publicArtifacts;
export type FeatureName = keyof Artifact["feature_means"];
type LeverKind = "controllable" | "fixed" | "unseen";
type BandLabel = "reach" | "target" | "likely";

type HierarchicalOffsets = {
  method: string;
  tier?: Record<string, { events: number; offset: number; shrinkage: number }>;
  school?: Record<string, { events: number; offset: number; shrinkage: number }>;
};

type RuntimeArtifact = Artifact & {
  hierarchical_offsets?: HierarchicalOffsets;
};

export type { RuntimeArtifact };

export type InferenceSchool = {
  unitid: number;
  name: string;
  setting?: string | null;
  size?: number | null;
  admit_rate?: number | null;
  ed_admit_rate?: number | null;
  rd_admit_rate?: number | null;
  sat_25?: number | null;
  sat_75?: number | null;
  act_25?: number | null;
  act_75?: number | null;
  gpa_avg?: number | null;
  test_policy?: string | null;
  c7_factors?: Record<string, unknown> | null;
  selectivity_tier?: string | null;
};

export type FeatureVector = Record<FeatureName, number>;

export type Prediction = {
  point: number;
  calibrated: number;
  low: number;
  high: number;
  width: number;
};

type LeverMetadata = {
  feature: string;
  lever: LeverKind;
  label: string;
  note?: string;
};

type LeverContribution = {
  feature: string;
  label: string;
  note?: string;
  logit_contribution: number;
};

export type LeverDecomposition = {
  controllable: LeverContribution[];
  fixed: LeverContribution[];
  unseen: Omit<LeverContribution, "logit_contribution">[];
};

const artifact = publicArtifacts as RuntimeArtifact;
export const publicPriorArtifact = artifact;
export const realOutcomeArtifact = realArtifacts as RuntimeArtifact;
export const featureOrder = artifact.feature_order as FeatureName[];
let hasLoggedRealModelServe = false;

const TIERS = ["accessible", "selective", "highly_selective", "elite"] as const;
const TEST_POLICIES = ["required", "optional", "blind", "unknown"] as const;
const SETTINGS = ["city", "suburb", "town", "rural", "unknown"] as const;
const UNSERVEABLE_REAL_MARKERS = [
  "fixture",
  "placeholder",
  "contract",
  "no_real",
  "not production evidence",
  "synthetic public-data prior",
];

const FEATURE_TO_LEVER: Record<FeatureName, string> = {
  sat_gap: "test_score",
  sat_missing: "test_score",
  act_gap: "test_score",
  act_missing: "test_score",
  gpa_gap: "gpa_to_date",
  gpa_missing: "gpa_to_date",
  applying_early: "application_round",
  log_school_size: "school_context",
  tier_accessible: "school_context",
  tier_selective: "school_context",
  tier_highly_selective: "school_context",
  tier_elite: "school_context",
  test_policy_required: "school_context",
  test_policy_optional: "school_context",
  test_policy_blind: "school_context",
  test_policy_unknown: "school_context",
  setting_city: "school_context",
  setting_suburb: "school_context",
  setting_town: "school_context",
  setting_rural: "school_context",
  setting_unknown: "school_context",
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function finiteNumberValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function finiteNumberArray(value: unknown, expectedLength: number) {
  return (
    Array.isArray(value) &&
    value.length === expectedLength &&
    value.every(finiteNumberValue)
  );
}

function hasUnsafeRealMarker(artifactCandidate: Record<string, unknown>) {
  const text = [
    artifactCandidate.model_type,
    artifactCandidate.version,
    artifactCandidate.status,
    artifactCandidate.source,
    artifactCandidate.honesty_label,
  ]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return UNSERVEABLE_REAL_MARKERS.some((marker) => text.includes(marker));
}

function featureOrderMatches(value: unknown) {
  return (
    Array.isArray(value) &&
    value.length === featureOrder.length &&
    value.every((feature, index) => feature === featureOrder[index])
  );
}

function featureStatsAreValid(value: unknown, requirePositive: boolean) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const stats = value as Record<string, unknown>;
  return featureOrder.every((feature) => {
    const stat = stats[feature];
    if (!finiteNumberValue(stat)) {
      return false;
    }
    return !requirePositive || stat > 0;
  });
}

function isotonicCalibrationIsValid(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const calibration = value as Record<string, unknown>;
  if (
    !Array.isArray(calibration.x) ||
    !Array.isArray(calibration.y) ||
    calibration.x.length < 2 ||
    calibration.x.length !== calibration.y.length ||
    !calibration.x.every(finiteNumberValue) ||
    !calibration.y.every(finiteNumberValue)
  ) {
    return false;
  }

  return calibration.x.every(
    (value, index, values) => index === 0 || value >= values[index - 1],
  );
}

function conformalParametersAreValid(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const conformal = value as Record<string, unknown>;
  if (!finiteNumberValue(conformal.target_coverage)) {
    return false;
  }

  const byTier = conformal.by_tier;
  if (!byTier || typeof byTier !== "object") {
    return false;
  }

  const tiers = byTier as Record<string, unknown>;
  return TIERS.every((tier) => {
    const params = tiers[tier];
    if (!params || typeof params !== "object") {
      return false;
    }

    const tierParams = params as Record<string, unknown>;
    return (
      finiteNumberValue(tierParams.interval_half_width) &&
      finiteNumberValue(tierParams.minimum_public_prior_floor)
    );
  });
}

export function isServeableRealModel(
  artifactCandidate: unknown,
): artifactCandidate is RuntimeArtifact {
  if (!artifactCandidate || typeof artifactCandidate !== "object") {
    return false;
  }

  const candidate = artifactCandidate as Record<string, unknown>;
  const modelType = stringValue(candidate.model_type);
  const status = stringValue(candidate.status);

  return (
    modelType !== null &&
    modelType.startsWith("real_outcome") &&
    (status === null || status === "trained") &&
    !hasUnsafeRealMarker(candidate) &&
    featureOrderMatches(candidate.feature_order) &&
    finiteNumberArray(candidate.coefficients, featureOrder.length) &&
    finiteNumberValue(candidate.intercept) &&
    featureStatsAreValid(candidate.feature_means, false) &&
    featureStatsAreValid(candidate.feature_scales, true) &&
    isotonicCalibrationIsValid(candidate.isotonic_calibration) &&
    conformalParametersAreValid(candidate.conformal_parameters) &&
    Array.isArray(candidate.lever_metadata) &&
    candidate.lever_metadata.length > 0 &&
    stringValue(candidate.version) !== null &&
    stringValue(candidate.honesty_label) !== null
  );
}

export function getActiveArtifact(
  realCandidate: RuntimeArtifact = realOutcomeArtifact,
) {
  if (
    process.env.ADMIRA_REAL_MODEL_ENABLED === "true" &&
    isServeableRealModel(realCandidate)
  ) {
    if (realCandidate === realOutcomeArtifact && !hasLoggedRealModelServe) {
      console.info("Admira real-outcome model is active.");
      hasLoggedRealModelServe = true;
    }
    return realCandidate;
  }

  return publicPriorArtifact;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeTier(tier: unknown): (typeof TIERS)[number] {
  return TIERS.includes(tier as (typeof TIERS)[number])
    ? (tier as (typeof TIERS)[number])
    : "accessible";
}

function normalizeTestPolicy(
  policy: unknown,
): (typeof TEST_POLICIES)[number] {
  return TEST_POLICIES.includes(policy as (typeof TEST_POLICIES)[number])
    ? (policy as (typeof TEST_POLICIES)[number])
    : "unknown";
}

function normalizeSetting(setting: unknown): (typeof SETTINGS)[number] {
  return SETTINGS.includes(setting as (typeof SETTINGS)[number])
    ? (setting as (typeof SETTINGS)[number])
    : "unknown";
}

function gapFromBand(
  score: number | null | undefined,
  low: unknown,
  high: unknown,
) {
  const lowNumber = finiteNumber(low);
  const highNumber = finiteNumber(high);

  if (
    score === null ||
    score === undefined ||
    lowNumber === null ||
    highNumber === null ||
    highNumber <= lowNumber
  ) {
    return { gap: 0, missing: 1, mid: null };
  }

  const mid = (lowNumber + highNumber) / 2;
  const scale = Math.max((highNumber - lowNumber) / 1.349, 1);
  return { gap: (score - mid) / scale, missing: 0, mid };
}

function gpaGap(
  gpa: number | null | undefined,
  schoolGpaAverage: unknown,
) {
  const gpaAverage = finiteNumber(schoolGpaAverage);
  if (gpa === null || gpa === undefined || gpaAverage === null) {
    return { gap: 0, missing: 1, mid: gpaAverage };
  }

  return { gap: (gpa - gpaAverage) / 0.35, missing: 0, mid: gpaAverage };
}

export function hasAcademicSignal(input: Pick<ChanceRequest, "sat_score" | "act_score">) {
  return input.sat_score !== undefined || input.act_score !== undefined;
}

export function engineerFeatures(
  input: ChanceRequest,
  school: InferenceSchool,
): FeatureVector {
  const sat = gapFromBand(input.sat_score, school.sat_25, school.sat_75);
  const act = gapFromBand(input.act_score, school.act_25, school.act_75);
  const gpa = gpaGap(input.gpa, school.gpa_avg);
  const tier = normalizeTier(school.selectivity_tier);
  const testPolicy = normalizeTestPolicy(school.test_policy);
  const setting = normalizeSetting(school.setting);
  const schoolSize = finiteNumber(school.size);

  const features = {
    sat_gap: sat.gap,
    sat_missing: sat.missing,
    act_gap: act.gap,
    act_missing: act.missing,
    gpa_gap: gpa.gap,
    gpa_missing: gpa.missing,
    applying_early: input.application_round === "early" ? 1 : 0,
    log_school_size:
      schoolSize !== null && schoolSize > 0 ? Math.log1p(schoolSize) : 0,
    tier_accessible: tier === "accessible" ? 1 : 0,
    tier_selective: tier === "selective" ? 1 : 0,
    tier_highly_selective: tier === "highly_selective" ? 1 : 0,
    tier_elite: tier === "elite" ? 1 : 0,
    test_policy_required: testPolicy === "required" ? 1 : 0,
    test_policy_optional: testPolicy === "optional" ? 1 : 0,
    test_policy_blind: testPolicy === "blind" ? 1 : 0,
    test_policy_unknown: testPolicy === "unknown" ? 1 : 0,
    setting_city: setting === "city" ? 1 : 0,
    setting_suburb: setting === "suburb" ? 1 : 0,
    setting_town: setting === "town" ? 1 : 0,
    setting_rural: setting === "rural" ? 1 : 0,
    setting_unknown: setting === "unknown" ? 1 : 0,
  } satisfies FeatureVector;

  return features;
}

function standardizeFeature(
  runtimeArtifact: RuntimeArtifact,
  feature: FeatureName,
  value: number,
) {
  const featureMeans = runtimeArtifact.feature_means as Record<FeatureName, number>;
  const featureScales = runtimeArtifact.feature_scales as Record<FeatureName, number>;
  const mean = featureMeans[feature];
  const scale = featureScales[feature];
  return (value - mean) / scale;
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function isotonicCalibrate(runtimeArtifact: RuntimeArtifact, point: number) {
  const x = runtimeArtifact.isotonic_calibration.x;
  const y = runtimeArtifact.isotonic_calibration.y;

  if (point <= x[0]) {
    return y[0];
  }
  if (point >= x[x.length - 1]) {
    return y[y.length - 1];
  }

  for (let index = 1; index < x.length; index += 1) {
    if (point <= x[index]) {
      const x0 = x[index - 1];
      const x1 = x[index];
      const y0 = y[index - 1];
      const y1 = y[index];
      if (x1 === x0) {
        return y1;
      }
      const weight = (point - x0) / (x1 - x0);
      return y0 + weight * (y1 - y0);
    }
  }

  return y[y.length - 1];
}

function inferTierFromFeatures(features: FeatureVector) {
  if (features.tier_elite === 1) {
    return "elite";
  }
  if (features.tier_highly_selective === 1) {
    return "highly_selective";
  }
  if (features.tier_selective === 1) {
    return "selective";
  }
  return "accessible";
}

function clampProbability(value: number) {
  return Math.min(1, Math.max(0, value));
}

function hierarchicalLogitOffset(
  runtimeArtifact: RuntimeArtifact,
  school?: InferenceSchool,
) {
  const offsets = runtimeArtifact.hierarchical_offsets;
  if (!offsets || !school) {
    return 0;
  }

  const tier = normalizeTier(school.selectivity_tier);
  const tierOffset = offsets.tier?.[tier]?.offset ?? 0;
  const schoolOffset = offsets.school?.[String(school.unitid)]?.offset ?? 0;

  return tierOffset + schoolOffset;
}

function intervalHalfWidth(
  runtimeArtifact: RuntimeArtifact,
  tier: keyof typeof artifact.conformal_parameters.by_tier,
  lowInputConfidence: boolean,
) {
  const tierParams = runtimeArtifact.conformal_parameters.by_tier[tier];
  const baseWidth = Math.max(
    tierParams.interval_half_width,
    tierParams.minimum_public_prior_floor,
  );

  if (!lowInputConfidence) {
    return baseWidth;
  }

  return Math.min(0.49, Math.max(baseWidth + 0.08, 0.24));
}

export function predict(
  features: FeatureVector,
  options: { lowInputConfidence?: boolean } = {},
  runtimeArtifact = artifact,
  school?: InferenceSchool,
): Prediction {
  let logit = runtimeArtifact.intercept;

  featureOrder.forEach((feature, index) => {
    logit +=
      runtimeArtifact.coefficients[index] *
      standardizeFeature(runtimeArtifact, feature, features[feature]);
  });

  logit += hierarchicalLogitOffset(runtimeArtifact, school);

  const point = sigmoid(logit);
  const calibrated = clampProbability(isotonicCalibrate(runtimeArtifact, point));
  const tier = inferTierFromFeatures(features);
  const halfWidth = intervalHalfWidth(
    runtimeArtifact,
    tier,
    options.lowInputConfidence ?? false,
  );
  const low = clampProbability(calibrated - halfWidth);
  const high = clampProbability(calibrated + halfWidth);

  return {
    point,
    calibrated,
    low,
    high,
    width: high - low,
  };
}

function leverMetadataByFeature(runtimeArtifact: RuntimeArtifact) {
  return new Map(
    (runtimeArtifact.lever_metadata as LeverMetadata[]).map((metadata) => [
      metadata.feature,
      metadata,
    ]),
  );
}

export function leverDecomposition(
  features: FeatureVector,
  runtimeArtifact = artifact,
): LeverDecomposition {
  const metadata = leverMetadataByFeature(runtimeArtifact);
  const result: LeverDecomposition = {
    controllable: [],
    fixed: [],
    unseen: [],
  };

  featureOrder.forEach((feature, index) => {
    const leverFeature = FEATURE_TO_LEVER[feature];
    const lever = metadata.get(leverFeature);

    if (!lever || lever.lever === "unseen") {
      return;
    }

    const contribution =
      runtimeArtifact.coefficients[index] *
      standardizeFeature(runtimeArtifact, feature, features[feature]);
    result[lever.lever].push({
      feature,
      label: lever.label,
      note: lever.note,
      logit_contribution: contribution,
    });
  });

  result.unseen = (runtimeArtifact.lever_metadata as LeverMetadata[])
    .filter((lever) => lever.lever === "unseen")
    .map((lever) => ({
      feature: lever.feature,
      label: lever.label,
      note: lever.note,
    }));

  return result;
}

export function deriveBand(prediction: Prediction) {
  const wideBand = prediction.width >= 0.4;
  let label: BandLabel = "target";
  let note = "Interval-driven label; the point estimate is only a marker.";

  if (wideBand) {
    label = "reach";
    note =
      "Public data cannot narrow this interval enough for a target/likely label.";
  } else if (prediction.low >= 0.55) {
    label = "likely";
  } else if (prediction.high <= 0.3) {
    label = "reach";
  }

  return {
    label,
    wide_band: wideBand,
    note,
  };
}

export function rubricGaps(input: ChanceRequest, school: InferenceSchool) {
  const sat = gapFromBand(input.sat_score, school.sat_25, school.sat_75);
  const act = gapFromBand(input.act_score, school.act_25, school.act_75);
  const gpa = gpaGap(input.gpa, school.gpa_avg);

  return {
    sat: {
      score: input.sat_score ?? null,
      mid: sat.mid,
      gap: sat.missing === 1 ? null : sat.gap,
    },
    act: {
      score: input.act_score ?? null,
      mid: act.mid,
      gap: act.missing === 1 ? null : act.gap,
    },
    gpa: {
      score: input.gpa ?? null,
      mid: gpa.mid,
      gap: gpa.missing === 1 ? null : gpa.gap,
    },
  };
}

export function buildChancePayloadForArtifact(
  input: ChanceRequest,
  school: InferenceSchool,
  runtimeArtifact = artifact,
) {
  const lowInputConfidence = !hasAcademicSignal(input);
  const features = engineerFeatures(input, school);
  const prediction = predict(
    features,
    { lowInputConfidence },
    runtimeArtifact,
    school,
  );
  const band = deriveBand(prediction);
  const disclaimers =
    runtimeArtifact.model_type === "real_outcome_v1"
      ? [
          "Real-outcome model path - only as strong as consented outcome coverage.",
          "Essays, recommendations, and institutional priorities are not modeled.",
        ]
      : [
          "Synthetic public-data prior - not validated real-outcome accuracy.",
          "Essays, recommendations, and institutional priorities are not modeled.",
        ];

  if (lowInputConfidence) {
    disclaimers.push("SAT/ACT input missing; the probability band was widened.");
  }

  return {
    school: {
      unitid: school.unitid,
      name: school.name,
      selectivity_tier: school.selectivity_tier ?? null,
      sat_25: school.sat_25 ?? null,
      sat_75: school.sat_75 ?? null,
      act_25: school.act_25 ?? null,
      act_75: school.act_75 ?? null,
      gpa_avg: school.gpa_avg ?? null,
      test_policy: school.test_policy ?? "unknown",
    },
    probability: {
      point: prediction.point,
      calibrated: prediction.calibrated,
      low: prediction.low,
      high: prediction.high,
      width: prediction.width,
      coverage: runtimeArtifact.conformal_parameters.target_coverage,
    },
    band: {
      ...band,
      input_confidence: lowInputConfidence ? "low" : "standard",
    },
    levers: leverDecomposition(features, runtimeArtifact),
    rubric: {
      c7_factors: school.c7_factors ?? {},
      gaps: rubricGaps(input, school),
    },
    disclaimers,
    model: {
      type: runtimeArtifact.model_type,
      version: runtimeArtifact.version,
      honesty_label: runtimeArtifact.honesty_label,
    },
  };
}

export function buildChancePayload(
  input: ChanceRequest,
  school: InferenceSchool,
  runtimeArtifact = getActiveArtifact(),
) {
  return buildChancePayloadForArtifact(input, school, runtimeArtifact);
}

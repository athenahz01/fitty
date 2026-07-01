export const MONEY_METHOD = "admira_money_v1";

export const DEFAULT_MONEY_SOURCE_URL = "https://collegescorecard.ed.gov/data/";

export type MoneyBasis = "verified" | "estimate";
export type MoneyCurrency = "USD" | "CAD";
export type MoneyCountry = "US" | "CA";
export type MoneyMeritProvenance = "curated_public";
export type MoneyNetPriceProvenance = "college_scorecard_api" | "curated_public";
export type MoneyResidency =
  | "any"
  | "in_state"
  | "out_of_state"
  | "domestic"
  | "international";
export type MoneyIncomeBand =
  | "0-30000"
  | "30001-48000"
  | "48001-75000"
  | "75001-110000"
  | "110001-plus"
  | "overall";

export type MoneyFigure = {
  value: number | null;
  basis: MoneyBasis;
  source_url: string;
  currency?: MoneyCurrency;
  label?: string;
};

export type MoneyProfile = {
  gpa?: number;
  sat_score?: number;
  act_score?: number;
  canadian_average?: number;
};

export type MoneyMeritRule = {
  rule_id: string;
  unitid: number;
  school_name: string;
  country: MoneyCountry;
  scholarship_name: string;
  residency: MoneyResidency;
  currency: MoneyCurrency;
  basis?: MoneyBasis;
  amount_basis?: MoneyBasis;
  annual_amount: number;
  total_value?: number | null;
  renewable_years?: number | null;
  gpa_min?: number | null;
  gpa_max?: number | null;
  sat_min?: number | null;
  sat_max?: number | null;
  act_min?: number | null;
  act_max?: number | null;
  percentage_min?: number | null;
  percentage_max?: number | null;
  priority?: number | null;
  source_url: string;
  provenance?: MoneyMeritProvenance | null;
  notes?: string | null;
};

export type MoneyNetPriceRow = {
  unitid: number;
  school_name: string;
  country: MoneyCountry;
  residency: MoneyResidency;
  income_band: MoneyIncomeBand;
  currency: MoneyCurrency;
  sticker_price: number;
  net_price: number;
  median_earnings_10yr?: number | null;
  basis: MoneyBasis;
  earnings_basis?: MoneyBasis | null;
  source_url: string;
  earnings_source_url?: string | null;
  source_year?: string | null;
  provenance?: MoneyNetPriceProvenance | null;
  notes?: string | null;
};

export type MoneySchool = {
  unitid: number;
  name: string;
  country: MoneyCountry;
};

export type MoneyPlan = {
  method: typeof MONEY_METHOD;
  school: MoneySchool;
  income_band: MoneyIncomeBand;
  residency: MoneyResidency;
  currency: MoneyCurrency;
  figures: {
    sticker_price: MoneyFigure;
    baseline_net_price: MoneyFigure;
    need_aid: MoneyFigure;
    merit: MoneyFigure;
    true_net_price: MoneyFigure;
    four_year_net_cost: MoneyFigure;
    median_earnings_10yr: MoneyFigure;
    payback_years: MoneyFigure;
    earnings_to_cost_ratio: MoneyFigure;
  };
  merit: {
    matched: boolean;
    scholarship_name: string | null;
    rule_id: string | null;
    source_url: string;
    notes: string | null;
  };
  roi: {
    available: boolean;
    payback_years: MoneyFigure;
    earnings_to_cost_ratio: MoneyFigure;
    median_earnings_10yr: MoneyFigure;
  };
  sources: string[];
};

function amountBasis(rule: MoneyMeritRule): MoneyBasis {
  return rule.amount_basis ?? rule.basis ?? "estimate";
}

function isHttpsUrl(value: string | null | undefined) {
  return typeof value === "string" && /^https:\/\//i.test(value.trim());
}

function assertBasis(value: unknown, label: string) {
  if (value !== "verified" && value !== "estimate") {
    throw new Error(`${label} basis must be verified or estimate.`);
  }
}

function assertNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }
}

function hasRange(min?: number | null, max?: number | null) {
  return min !== null && min !== undefined || max !== null && max !== undefined;
}

function inRange(value: number | undefined, min?: number | null, max?: number | null) {
  if (value === undefined || !Number.isFinite(value)) {
    return false;
  }
  if (min !== null && min !== undefined && value < min) {
    return false;
  }
  if (max !== null && max !== undefined && value > max) {
    return false;
  }
  return true;
}

function residencyMatches(rowResidency: MoneyResidency, selected: MoneyResidency) {
  return rowResidency === "any" || selected === "any" || rowResidency === selected;
}

function ruleMatchesProfile(
  rule: MoneyMeritRule,
  profile: MoneyProfile,
  residency: MoneyResidency,
) {
  if (!residencyMatches(rule.residency, residency)) {
    return false;
  }

  if (hasRange(rule.gpa_min, rule.gpa_max) && !inRange(profile.gpa, rule.gpa_min, rule.gpa_max)) {
    return false;
  }

  if (
    hasRange(rule.percentage_min, rule.percentage_max) &&
    !inRange(profile.canadian_average, rule.percentage_min, rule.percentage_max)
  ) {
    return false;
  }

  const requiresTest = hasRange(rule.sat_min, rule.sat_max) || hasRange(rule.act_min, rule.act_max);
  if (!requiresTest) {
    return true;
  }

  return (
    inRange(profile.sat_score, rule.sat_min, rule.sat_max) ||
    inRange(profile.act_score, rule.act_min, rule.act_max)
  );
}

function figure(
  value: number | null,
  basis: MoneyBasis,
  source_url: string,
  currency?: MoneyCurrency,
  label?: string,
): MoneyFigure {
  assertBasis(basis, label ?? "money figure");
  if (!isHttpsUrl(source_url)) {
    throw new Error(`${label ?? "money figure"} is missing an https source_url.`);
  }
  return {
    value: value === null ? null : Number(value.toFixed(2)),
    basis,
    source_url,
    ...(currency ? { currency } : {}),
    ...(label ? { label } : {}),
  };
}

function roundCurrency(value: number) {
  return Math.round(value);
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function roundRatio(value: number) {
  return Math.round(value * 100) / 100;
}

export function predictMerit(
  profile: MoneyProfile,
  rules: MoneyMeritRule[],
  options: {
    residency?: MoneyResidency;
    currency?: MoneyCurrency;
    fallbackSourceUrl?: string;
  } = {},
) {
  const residency = options.residency ?? "any";
  const matches = rules
    .filter((rule) => ruleMatchesProfile(rule, profile, residency))
    .sort((left, right) => {
      if (right.annual_amount !== left.annual_amount) {
        return right.annual_amount - left.annual_amount;
      }
      if ((right.priority ?? 0) !== (left.priority ?? 0)) {
        return (right.priority ?? 0) - (left.priority ?? 0);
      }
      return left.rule_id.localeCompare(right.rule_id);
    });

  const match = matches[0] ?? null;
  if (!match) {
    return {
      amount: figure(
        0,
        "estimate",
        options.fallbackSourceUrl ?? DEFAULT_MONEY_SOURCE_URL,
        options.currency,
        "Conservative merit estimate",
      ),
      matched_rule: null,
    };
  }

  return {
    amount: figure(
      roundCurrency(match.annual_amount),
      amountBasis(match),
      match.source_url,
      match.currency,
      match.scholarship_name,
    ),
    matched_rule: match,
  };
}

export function selectNetPriceBand(
  rows: MoneyNetPriceRow[],
  incomeBand: MoneyIncomeBand,
  residency: MoneyResidency,
) {
  const matchingResidency = rows
    .filter((row) => residencyMatches(row.residency, residency))
    .sort((left, right) => left.income_band.localeCompare(right.income_band));

  return (
    matchingResidency.find((row) => row.income_band === incomeBand) ??
    matchingResidency.find((row) => row.income_band === "overall") ??
    matchingResidency[0] ??
    null
  );
}

export function buildMoneyPlan(input: {
  school: MoneySchool;
  profile: MoneyProfile;
  meritRules: MoneyMeritRule[];
  netPriceRows: MoneyNetPriceRow[];
  incomeBand?: MoneyIncomeBand;
  residency?: MoneyResidency;
}): MoneyPlan {
  const incomeBand = input.incomeBand ?? "overall";
  const residency =
    input.residency ?? (input.school.country === "CA" ? "domestic" : "out_of_state");
  const costRow = selectNetPriceBand(input.netPriceRows, incomeBand, residency);

  if (!costRow) {
    throw new Error(`No sourced money data is loaded for ${input.school.name}.`);
  }

  assertMoneyLineage({ merit_rules: input.meritRules, net_price_bands: [costRow] });

  const stickerValue = roundCurrency(costRow.sticker_price);
  const baselineNetValue = roundCurrency(costRow.net_price);
  const meritResult = predictMerit(input.profile, input.meritRules, {
    residency,
    currency: costRow.currency,
    fallbackSourceUrl: costRow.source_url,
  });
  const meritValue = meritResult.amount.value ?? 0;

  const impliedAid = Math.max(0, stickerValue - baselineNetValue);
  const needAidValue = roundCurrency(Math.max(0, impliedAid - meritValue));
  const trueNetValue = roundCurrency(
    Math.max(0, stickerValue - needAidValue - meritValue),
  );
  const fourYearNetCost = roundCurrency(trueNetValue * 4);

  const earningsSourceUrl = costRow.earnings_source_url ?? costRow.source_url;
  const earningsBasis = costRow.earnings_basis ?? costRow.basis;
  const earningsValue =
    costRow.median_earnings_10yr === null || costRow.median_earnings_10yr === undefined
      ? null
      : roundCurrency(costRow.median_earnings_10yr);

  const paybackValue =
    earningsValue === null || earningsValue <= 0
      ? null
      : fourYearNetCost === 0
        ? 0
        : roundOne(fourYearNetCost / earningsValue);
  const ratioValue =
    earningsValue === null || trueNetValue <= 0
      ? null
      : roundRatio(earningsValue / trueNetValue);

  const figures = {
    sticker_price: figure(
      stickerValue,
      costRow.basis,
      costRow.source_url,
      costRow.currency,
      "Sticker price",
    ),
    baseline_net_price: figure(
      baselineNetValue,
      costRow.basis,
      costRow.source_url,
      costRow.currency,
      "Baseline net price",
    ),
    need_aid: figure(
      needAidValue,
      "estimate",
      costRow.source_url,
      costRow.currency,
      "Need aid split",
    ),
    merit: meritResult.amount,
    true_net_price: figure(
      trueNetValue,
      "estimate",
      costRow.source_url,
      costRow.currency,
      "True net price estimate",
    ),
    four_year_net_cost: figure(
      fourYearNetCost,
      "estimate",
      costRow.source_url,
      costRow.currency,
      "Estimated four-year net cost",
    ),
    median_earnings_10yr: figure(
      earningsValue,
      earningsBasis,
      earningsSourceUrl,
      costRow.currency,
      "Median earnings 10 years after entry/graduation",
    ),
    payback_years: figure(
      paybackValue,
      "estimate",
      earningsSourceUrl,
      undefined,
      "Gross payback years",
    ),
    earnings_to_cost_ratio: figure(
      ratioValue,
      "estimate",
      earningsSourceUrl,
      undefined,
      "Earnings to annual net cost ratio",
    ),
  };

  const sourceSet = new Set<string>([
    costRow.source_url,
    earningsSourceUrl,
    meritResult.amount.source_url,
  ]);

  return {
    method: MONEY_METHOD,
    school: input.school,
    income_band: costRow.income_band,
    residency,
    currency: costRow.currency,
    figures,
    merit: {
      matched: Boolean(meritResult.matched_rule),
      scholarship_name: meritResult.matched_rule?.scholarship_name ?? null,
      rule_id: meritResult.matched_rule?.rule_id ?? null,
      source_url: meritResult.amount.source_url,
      notes: meritResult.matched_rule?.notes ?? null,
    },
    roi: {
      available: paybackValue !== null && ratioValue !== null,
      payback_years: figures.payback_years,
      earnings_to_cost_ratio: figures.earnings_to_cost_ratio,
      median_earnings_10yr: figures.median_earnings_10yr,
    },
    sources: [...sourceSet].sort((left, right) => left.localeCompare(right)),
  };
}

export function assertMoneyLineage(seed: {
  merit_rules?: MoneyMeritRule[];
  net_price_bands?: MoneyNetPriceRow[];
}) {
  for (const [index, rule] of (seed.merit_rules ?? []).entries()) {
    if (!isHttpsUrl(rule.source_url)) {
      throw new Error(`Merit rule ${index} is missing an https source_url.`);
    }
    assertBasis(amountBasis(rule), `Merit rule ${rule.rule_id}`);
    assertNonNegative(rule.annual_amount, `Merit rule ${rule.rule_id} annual_amount`);
    if (!hasRange(rule.gpa_min, rule.gpa_max) &&
        !hasRange(rule.sat_min, rule.sat_max) &&
        !hasRange(rule.act_min, rule.act_max) &&
        !hasRange(rule.percentage_min, rule.percentage_max)) {
      throw new Error(`Merit rule ${rule.rule_id} has no matching criteria.`);
    }
  }

  for (const [index, row] of (seed.net_price_bands ?? []).entries()) {
    if (!isHttpsUrl(row.source_url)) {
      throw new Error(`Net price row ${index} is missing an https source_url.`);
    }
    assertBasis(row.basis, `Net price row ${row.unitid}:${row.income_band}`);
    assertNonNegative(row.sticker_price, `Net price row ${row.unitid} sticker_price`);
    assertNonNegative(row.net_price, `Net price row ${row.unitid} net_price`);
    if (row.median_earnings_10yr !== null && row.median_earnings_10yr !== undefined) {
      assertNonNegative(
        row.median_earnings_10yr,
        `Net price row ${row.unitid} median_earnings_10yr`,
      );
      if (!isHttpsUrl(row.earnings_source_url ?? row.source_url)) {
        throw new Error(`Net price row ${index} is missing an https earnings source.`);
      }
      assertBasis(
        row.earnings_basis ?? row.basis,
        `Net price row ${row.unitid}:${row.income_band} earnings`,
      );
    }
  }
}

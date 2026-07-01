import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertMoneyLineage,
  buildMoneyPlan,
  predictMerit,
  selectNetPriceBand,
  type MoneyIncomeBand,
  type MoneyMeritRule,
  type MoneyNetPriceRow,
  type MoneyProfile,
  type MoneyResidency,
  type MoneySchool,
} from "../../lib/money";

type Seed = {
  merit_rules: MoneyMeritRule[];
  net_price_bands: MoneyNetPriceRow[];
};

type Holdout =
  | {
      type: "merit";
      label: string;
      unitid: number;
      residency: MoneyResidency;
      profile: MoneyProfile;
      expected_annual_amount: number;
      expected_basis: "verified" | "estimate";
    }
  | {
      type: "net_price";
      label: string;
      unitid: number;
      residency: MoneyResidency;
      income_band: MoneyIncomeBand;
      expected_net_price: number;
      expected_sticker_price: number;
      expected_basis: "verified" | "estimate";
    }
  | {
      type: "plan";
      label: string;
      unitid: number;
      residency: MoneyResidency;
      income_band: MoneyIncomeBand;
      profile: MoneyProfile;
      expected_true_net_price: number;
      expected_payback_years: number;
    };

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;
}

function expectEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function schoolFromRows(unitid: number, rows: MoneyNetPriceRow[]): MoneySchool {
  const row = rows.find((candidate) => candidate.unitid === unitid);
  if (!row) {
    throw new Error(`No net price row found for unitid ${unitid}.`);
  }
  return {
    unitid,
    name: row.school_name,
    country: row.country,
  };
}

function main() {
  const seed = readJson<Seed>("pipeline/data/merit/merit_seed.json");
  const holdout = readJson<Holdout[]>("pipeline/audit/merit_validation_holdout.json");

  if (holdout.length < 20) {
    throw new Error(`Money validation holdout must contain at least 20 rows; found ${holdout.length}.`);
  }

  assertMoneyLineage(seed);

  for (const caseRow of holdout) {
    const meritRules = seed.merit_rules.filter((rule) => rule.unitid === caseRow.unitid);
    const netRows = seed.net_price_bands.filter((row) => row.unitid === caseRow.unitid);

    if (caseRow.type === "merit") {
      const result = predictMerit(caseRow.profile, meritRules, {
        residency: caseRow.residency,
        fallbackSourceUrl: netRows[0]?.source_url,
      });
      expectEqual(result.amount.value, caseRow.expected_annual_amount, caseRow.label);
      expectEqual(result.amount.basis, caseRow.expected_basis, `${caseRow.label} basis`);
      continue;
    }

    if (caseRow.type === "net_price") {
      const row = selectNetPriceBand(netRows, caseRow.income_band, caseRow.residency);
      if (!row) {
        throw new Error(`${caseRow.label}: missing net price row`);
      }
      expectEqual(row.net_price, caseRow.expected_net_price, `${caseRow.label} net price`);
      expectEqual(row.sticker_price, caseRow.expected_sticker_price, `${caseRow.label} sticker`);
      expectEqual(row.basis, caseRow.expected_basis, `${caseRow.label} basis`);
      continue;
    }

    const plan = buildMoneyPlan({
      school: schoolFromRows(caseRow.unitid, seed.net_price_bands),
      profile: caseRow.profile,
      meritRules,
      netPriceRows: netRows,
      incomeBand: caseRow.income_band,
      residency: caseRow.residency,
    });
    expectEqual(
      plan.figures.true_net_price.value,
      caseRow.expected_true_net_price,
      `${caseRow.label} true net price`,
    );
    expectEqual(
      plan.figures.payback_years.value,
      caseRow.expected_payback_years,
      `${caseRow.label} payback`,
    );
    if ((plan.figures.true_net_price.value ?? 0) < 0) {
      throw new Error(`${caseRow.label}: true net price went negative`);
    }
  }

  console.log(`Money validation passed: ${holdout.length} holdout rows.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "money validation failed");
  process.exitCode = 1;
}

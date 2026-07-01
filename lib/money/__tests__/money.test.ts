import { describe, expect, it } from "vitest";

import seed from "../../../pipeline/data/merit/merit_seed.json";
import {
  assertMoneyLineage,
  buildMoneyPlan,
  predictMerit,
  type MoneyMeritRule,
  type MoneyNetPriceRow,
} from "../index";

const moneySeed = seed as {
  merit_rules: MoneyMeritRule[];
  net_price_bands: MoneyNetPriceRow[];
};

function rowsFor(unitid: number) {
  return {
    meritRules: moneySeed.merit_rules.filter((rule) => rule.unitid === unitid),
    netRows: moneySeed.net_price_bands.filter((row) => row.unitid === unitid),
  };
}

describe("Money engine", () => {
  it("requires sourced merit and net-price lineage", () => {
    expect(() => assertMoneyLineage(moneySeed)).not.toThrow();
    expect(() =>
      assertMoneyLineage({
        merit_rules: [
          {
            ...moneySeed.merit_rules[0],
            source_url: "",
          },
        ],
      }),
    ).toThrow(/source_url/);
  });

  it("matches published automatic merit tiers", () => {
    const ua = rowsFor(100751);
    const uaResult = predictMerit(
      { gpa: 3.95, sat_score: 1420 },
      ua.meritRules,
      { residency: "out_of_state" },
    );
    expect(uaResult.amount).toMatchObject({
      value: 28000,
      basis: "verified",
      source_url: "https://afford.ua.edu/scholarships/out-of-state-freshman/",
    });

    const carleton = rowsFor(-124011);
    const carletonResult = predictMerit(
      { canadian_average: 95 },
      carleton.meritRules,
      { residency: "domestic" },
    );
    expect(carletonResult.amount).toMatchObject({
      value: 4000,
      basis: "verified",
      source_url: "https://www.ouinfo.ca/universities/carleton/scholarships",
    });
  });

  it("splits baseline aid after merit so average aid is not double-counted", () => {
    const { meritRules, netRows } = rowsFor(100751);
    const plan = buildMoneyPlan({
      school: { unitid: 100751, name: "The University of Alabama", country: "US" },
      profile: { gpa: 3.95, sat_score: 1420 },
      meritRules,
      netPriceRows: netRows,
      incomeBand: "75001-110000",
      residency: "out_of_state",
    });

    expect(plan.figures.sticker_price.value).toBe(33382);
    expect(plan.figures.baseline_net_price.value).toBe(25658);
    expect(plan.figures.merit.value).toBe(28000);
    expect(plan.figures.need_aid.value).toBe(0);
    expect(plan.figures.true_net_price.value).toBe(5382);
    expect(plan.figures.true_net_price.basis).toBe("estimate");
    expect(plan.figures.payback_years.value).toBe(0.4);
  });

  it("keeps no-merit schools at the sourced baseline net price", () => {
    const { meritRules, netRows } = rowsFor(104151);
    const plan = buildMoneyPlan({
      school: {
        unitid: 104151,
        name: "Arizona State University Campus Immersion",
        country: "US",
      },
      profile: { gpa: 3.5, sat_score: 1200 },
      meritRules,
      netPriceRows: netRows,
      incomeBand: "48001-75000",
      residency: "out_of_state",
    });

    expect(plan.figures.merit).toMatchObject({
      value: 0,
      basis: "estimate",
    });
    expect(plan.figures.true_net_price.value).toBe(16801);
  });

  it("supports Canada with sourced tuition, merit, and field earnings", () => {
    const { meritRules, netRows } = rowsFor(-124011);
    const plan = buildMoneyPlan({
      school: { unitid: -124011, name: "Carleton University", country: "CA" },
      profile: { canadian_average: 95 },
      meritRules,
      netPriceRows: netRows,
      incomeBand: "overall",
      residency: "domestic",
    });

    expect(plan.currency).toBe("CAD");
    expect(plan.figures.merit.value).toBe(4000);
    expect(plan.figures.true_net_price.value).toBe(6549);
    expect(plan.figures.median_earnings_10yr).toMatchObject({
      value: 101800,
      basis: "verified",
      source_url: "https://www.jobbank.gc.ca/career-planning/school-work-transition/11.0701/LOS05",
    });
    expect(plan.roi.available).toBe(true);
  });

  it("is deterministic and never produces a negative net price", () => {
    const baseRow = rowsFor(100751).netRows.find(
      (row) => row.income_band === "overall",
    )!;
    const hugeMerit: MoneyMeritRule = {
      rule_id: "test-huge-merit",
      unitid: 100751,
      school_name: "The University of Alabama",
      country: "US",
      scholarship_name: "Huge test scholarship",
      residency: "any",
      currency: "USD",
      basis: "estimate",
      annual_amount: 999999,
      gpa_min: 0,
      source_url: "https://example.com/source",
    };

    const input = {
      school: { unitid: 100751, name: "The University of Alabama", country: "US" as const },
      profile: { gpa: 4 },
      meritRules: [hugeMerit],
      netPriceRows: [baseRow],
      incomeBand: "overall" as const,
      residency: "out_of_state" as const,
    };
    const first = buildMoneyPlan(input);
    const second = buildMoneyPlan(input);

    expect(first.figures.true_net_price.value).toBe(0);
    expect(second).toEqual(first);
  });
});

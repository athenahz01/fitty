// Loads the Phase 4 Money reference data from pipeline/data/merit/merit_seed.json
// into public.money_merit_rules / public.money_net_price_bands via the service
// role. Re-runnable and blocked by lineage validation.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { assertMoneyLineage, type MoneyMeritRule, type MoneyNetPriceRow } from "../../lib/money";
import { createSupabaseServiceRoleClient } from "../../lib/supabase-server";

type Seed = {
  merit_rules?: MoneyMeritRule[];
  net_price_bands?: MoneyNetPriceRow[];
};

function loadSeed(): Seed {
  const path = resolve(process.cwd(), "pipeline/data/merit/merit_seed.json");
  return JSON.parse(readFileSync(path, "utf8")) as Seed;
}

async function main() {
  const seed = loadSeed();
  const meritRules = seed.merit_rules ?? [];
  const netPriceBands = seed.net_price_bands ?? [];

  assertMoneyLineage({ merit_rules: meritRules, net_price_bands: netPriceBands });

  const supabase = createSupabaseServiceRoleClient();

  if (meritRules.length > 0) {
    const { error } = await supabase
      .from("money_merit_rules")
      .upsert(
        meritRules.map((rule) => ({
          rule_id: rule.rule_id,
          unitid: rule.unitid,
          school_name: rule.school_name,
          country: rule.country,
          scholarship_name: rule.scholarship_name,
          residency: rule.residency,
          currency: rule.currency,
          amount_basis: rule.amount_basis ?? rule.basis ?? "estimate",
          annual_amount: rule.annual_amount,
          total_value: rule.total_value ?? null,
          renewable_years: rule.renewable_years ?? null,
          gpa_min: rule.gpa_min ?? null,
          gpa_max: rule.gpa_max ?? null,
          sat_min: rule.sat_min ?? null,
          sat_max: rule.sat_max ?? null,
          act_min: rule.act_min ?? null,
          act_max: rule.act_max ?? null,
          percentage_min: rule.percentage_min ?? null,
          percentage_max: rule.percentage_max ?? null,
          priority: rule.priority ?? 0,
          source_url: rule.source_url,
          provenance: rule.provenance ?? "curated_public",
          notes: rule.notes ?? null,
        })),
        { onConflict: "rule_id" },
      );
    if (error) {
      throw new Error(`money_merit_rules upsert failed: ${error.message}`);
    }
    console.log(`Loaded ${meritRules.length} money_merit_rules rows.`);
  }

  if (netPriceBands.length > 0) {
    const { error } = await supabase
      .from("money_net_price_bands")
      .upsert(
        netPriceBands.map((row) => ({
          unitid: row.unitid,
          school_name: row.school_name,
          country: row.country,
          residency: row.residency,
          income_band: row.income_band,
          currency: row.currency,
          sticker_price: row.sticker_price,
          net_price: row.net_price,
          median_earnings_10yr: row.median_earnings_10yr ?? null,
          basis: row.basis,
          earnings_basis: row.earnings_basis ?? null,
          source_url: row.source_url,
          earnings_source_url: row.earnings_source_url ?? null,
          source_year: row.source_year ?? null,
          provenance: row.provenance ?? "curated_public",
          notes: row.notes ?? null,
        })),
        { onConflict: "unitid,residency,income_band" },
      );
    if (error) {
      throw new Error(`money_net_price_bands upsert failed: ${error.message}`);
    }
    console.log(`Loaded ${netPriceBands.length} money_net_price_bands rows.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "money ingest failed");
  process.exitCode = 1;
});

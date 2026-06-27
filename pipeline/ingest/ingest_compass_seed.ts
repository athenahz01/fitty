// Loads the Major/Career Compass reference data from pipeline/data/compass_seed.json
// into public.compass_majors / public.compass_careers via the service role.
//
// Honesty discipline (matches Phase 0/3 seeds): every row must carry an https
// source_url, and nothing is fabricated here — the operator supplies the real
// Scorecard field-of-study + O*NET/BLS rows. Re-runnable (upsert by natural key).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createSupabaseServiceRoleClient } from "../../lib/supabase-server";
import {
  assertCareerLineage,
  type CompassCareer,
  type CompassMajor,
} from "../../lib/compass";

type Seed = {
  majors?: CompassMajor[];
  careers?: CompassCareer[];
};

function loadSeed(): Seed {
  const path = resolve(process.cwd(), "pipeline/data/compass_seed.json");
  return JSON.parse(readFileSync(path, "utf8")) as Seed;
}

async function main() {
  const seed = loadSeed();
  const majors = seed.majors ?? [];
  const careers = seed.careers ?? [];

  // Lineage gate: refuse to load any row without a source_url.
  assertCareerLineage(majors);
  assertCareerLineage(careers);

  if (majors.length === 0 && careers.length === 0) {
    console.log(
      "compass_seed.json has no rows yet (awaiting operator dataset). Nothing to load.",
    );
    return;
  }

  const supabase = createSupabaseServiceRoleClient();

  if (majors.length > 0) {
    const { error } = await supabase
      .from("compass_majors")
      .upsert(
        majors.map((major) => ({
          major_name: major.major_name,
          scorecard_field: major.scorecard_field ?? null,
          median_earnings_10yr: major.median_earnings_10yr,
          source_url: major.source_url,
          provenance: major.provenance ?? "curated_public",
        })),
        { onConflict: "major_name" },
      );
    if (error) {
      throw new Error(`compass_majors upsert failed: ${error.message}`);
    }
    console.log(`Loaded ${majors.length} compass_majors rows.`);
  }

  if (careers.length > 0) {
    const { error } = await supabase.from("compass_careers").insert(
      careers.map((career) => ({
        major_name: career.major_name,
        career_title: career.career_title,
        onet_code: career.onet_code ?? null,
        median_wage_annual: career.median_wage_annual,
        source_url: career.source_url,
        provenance: career.provenance ?? "curated_public",
      })),
    );
    if (error) {
      throw new Error(`compass_careers insert failed: ${error.message}`);
    }
    console.log(`Loaded ${careers.length} compass_careers rows.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "compass ingest failed");
  process.exitCode = 1;
});

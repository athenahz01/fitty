import { readFileSync } from "node:fs";
import { join } from "node:path";

import { scoreCanadaProgram } from "../lib/score/canada";
import type { GradingBasis } from "../lib/types";

type HoldoutProgram = {
  school_name: string;
  program_name: string;
  cutoff_avg_low: number;
  cutoff_avg_high: number | null;
  cutoff_basis: GradingBasis;
  source_url: string;
};

type Holdout = {
  programs: HoldoutProgram[];
};

const fixturePath = join(process.cwd(), "pipeline", "audit", "canada_cutoffs_holdout.json");
const holdout = JSON.parse(readFileSync(fixturePath, "utf8")) as Holdout;

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const program of holdout.programs) {
  const baseProgram = {
    program_name: program.program_name,
    cutoff_avg_low: program.cutoff_avg_low,
    cutoff_avg_high: program.cutoff_avg_high,
    cutoff_basis: program.cutoff_basis,
    prerequisites: [],
    supplemental_app: false,
    broad_based_admission: false,
    source_url: program.source_url,
  };

  const below = scoreCanadaProgram({
    applicantAverage: program.cutoff_avg_low - 0.01,
    applicantBasis: program.cutoff_basis,
    program: baseProgram,
  });
  const atLow = scoreCanadaProgram({
    applicantAverage: program.cutoff_avg_low,
    applicantBasis: program.cutoff_basis,
    program: baseProgram,
  });

  assert(
    below.tier === "Reach",
    `${program.school_name} ${program.program_name} should be Reach below cutoff`,
  );
  assert(
    atLow.tier === "Target",
    `${program.school_name} ${program.program_name} should become Target at cutoff`,
  );

  if (program.cutoff_avg_high !== null) {
    const aboveHigh = scoreCanadaProgram({
      applicantAverage: program.cutoff_avg_high + 0.01,
      applicantBasis: program.cutoff_basis,
      program: baseProgram,
    });
    assert(
      aboveHigh.tier === "Likely" || aboveHigh.tier === "Safety",
      `${program.school_name} ${program.program_name} should clear Target above high cutoff`,
    );
  }
}

console.log(`Canada holdout passed for ${holdout.programs.length} programs.`);

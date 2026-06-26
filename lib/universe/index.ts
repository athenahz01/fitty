// School/Program Universe — pure assembler (Phase 2).
//
// Shapes one school's row + its program_requirements + its embedding neighbors
// into a single, lineage-tagged view for the Universe page. Pure and
// framework-free so the API route and tests share one source of truth. Every
// figure carries an internal `source` so the audit can trace it; nothing is
// invented. Where a figure is missing we omit it and add an honest note rather
// than fabricating a value. Merit / predicted aid is deliberately absent (that
// is Phase 4); deadlines are absent (Phase 5).

import type { ProgramRequirement, School } from "../types";

export const UNIVERSE_METHOD = "school_universe_v1";

// Internal lineage labels. These are the named sources every figure traces to.
export const LINEAGE = {
  admit_rate: "IPEDS / College Scorecard admit rate",
  test_bands: "College Scorecard / CDS middle-50 test bands",
  gpa_avg: "College Scorecard / CDS average GPA",
  net_price_avg: "College Scorecard average net price",
  sticker_cost: "College Scorecard published cost of attendance",
  median_earnings_10yr: "College Scorecard median earnings 10yr",
  completion_rate: "College Scorecard completion rate",
  selectivity_tier: "Admira selectivity tier (derived from admit rate + bands)",
  program_requirements: "program_requirements (OUInfo / university pages)",
  similar: "Fit Finder embedding similarity (Xenova/all-MiniLM-L6-v2)",
} as const;

type UniverseSchool = Pick<
  School,
  | "unitid"
  | "name"
  | "country"
  | "province_state"
  | "state"
  | "setting"
  | "size"
  | "selectivity_tier"
  | "admit_rate"
  | "sat_25"
  | "sat_75"
  | "act_25"
  | "act_75"
  | "gpa_avg"
  | "test_policy"
  | "net_price_avg"
  | "sticker_cost"
  | "median_earnings_10yr"
  | "completion_rate"
  | "program_areas"
  | "programs"
>;

export type UniverseProgram = Pick<
  ProgramRequirement,
  | "program_name"
  | "cutoff_avg_low"
  | "cutoff_avg_high"
  | "cutoff_basis"
  | "prerequisites"
  | "supplemental_app"
  | "broad_based_admission"
  | "source_url"
>;

export type SimilarProgram = {
  unitid: number;
  name: string;
  similarity: number | null;
  program_areas: string[] | null;
};

export type UniverseFigure = {
  value: number | null;
  source: string;
};

export type Universe = {
  method: typeof UNIVERSE_METHOD;
  school: {
    unitid: number;
    name: string;
    country: "US" | "CA";
    location: string | null;
    setting: string | null;
    size: number | null;
    selectivity_tier: string | null;
    test_policy: string | null;
    program_areas: string[];
    programs: string[];
  };
  headline: {
    tier: string | null;
    admit_rate: UniverseFigure;
  };
  admissions: {
    sat: { low: UniverseFigure; high: UniverseFigure };
    act: { low: UniverseFigure; high: UniverseFigure };
    gpa_avg: UniverseFigure;
  };
  cost: {
    net_price_avg: UniverseFigure;
    sticker_cost: UniverseFigure;
  };
  outcomes: {
    median_earnings_10yr: UniverseFigure;
    completion_rate: UniverseFigure;
  };
  programs: UniverseProgram[];
  similar: SimilarProgram[];
  notes: string[];
  lineage: typeof LINEAGE;
};

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function figure(value: unknown, source: string): UniverseFigure {
  return { value: num(value), source };
}

function cleanStrings(value: string[] | null | undefined): string[] {
  if (!value) {
    return [];
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
}

export function buildUniverse(input: {
  school: UniverseSchool;
  programs: UniverseProgram[];
  similar: SimilarProgram[];
}): Universe {
  const { school } = input;
  const notes: string[] = [];

  if (num(school.net_price_avg) === null) {
    notes.push(
      "Average net price is not published for this school, so cost is shown as missing rather than estimated. Merit and predicted aid are not modeled yet.",
    );
  }
  if (num(school.admit_rate) === null) {
    notes.push("No published admit rate is loaded for this school.");
  }
  if (input.programs.length === 0) {
    notes.push("No program_requirements rows are loaded for this school yet.");
  }
  if (input.similar.length === 0) {
    notes.push("Similar programs were unavailable for this view.");
  }

  const location =
    [school.state ?? school.province_state].filter(Boolean).join("") || null;

  return {
    method: UNIVERSE_METHOD,
    school: {
      unitid: school.unitid,
      name: school.name,
      country: school.country,
      location,
      setting: school.setting,
      size: num(school.size),
      selectivity_tier: school.selectivity_tier,
      test_policy: school.test_policy,
      program_areas: cleanStrings(school.program_areas),
      programs: cleanStrings(school.programs),
    },
    headline: {
      tier: school.selectivity_tier,
      admit_rate: figure(school.admit_rate, LINEAGE.admit_rate),
    },
    admissions: {
      sat: {
        low: figure(school.sat_25, LINEAGE.test_bands),
        high: figure(school.sat_75, LINEAGE.test_bands),
      },
      act: {
        low: figure(school.act_25, LINEAGE.test_bands),
        high: figure(school.act_75, LINEAGE.test_bands),
      },
      gpa_avg: figure(school.gpa_avg, LINEAGE.gpa_avg),
    },
    cost: {
      net_price_avg: figure(school.net_price_avg, LINEAGE.net_price_avg),
      sticker_cost: figure(school.sticker_cost, LINEAGE.sticker_cost),
    },
    outcomes: {
      median_earnings_10yr: figure(
        school.median_earnings_10yr,
        LINEAGE.median_earnings_10yr,
      ),
      completion_rate: figure(school.completion_rate, LINEAGE.completion_rate),
    },
    programs: input.programs,
    similar: input.similar,
    notes,
    lineage: LINEAGE,
  };
}

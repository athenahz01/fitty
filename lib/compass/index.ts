// Major/Career Compass — pure, deterministic assembler (Phase 6).
//
// Connects majors -> careers -> sourced earnings, recommends major fits, and ties
// each view back to the student's REAL admit odds from the Phase 1 engine (the
// same tier/score /api/admit-intelligence returns). Honesty rules:
//
// * Every earnings/career figure is passed through from a source_url-tagged row;
//   the assembler computes NO salary and invents nothing. A missing figure is
//   reported as null, never fabricated.
// * Admit odds come from the Phase 1 scorer, not from any major-level guess.
// * ROI / net-cost comes from the Money module only when a sourced Money plan is
//   supplied; otherwise Compass keeps the number-free stub.

import { buildUsAdmitIntelligence } from "../score/us";
import type { InferenceSchool } from "../model/inference";
import type { MoneyFigure, MoneyPlan } from "../money";

export const COMPASS_METHOD = "compass_major_career_v1";

// The fallback ROI stub. No number is shown unless Money supplies a plan.
export const ROI_STUB = {
  available: false as const,
  note: "Open Money to see sourced net price and payback. No return figure is shown here yet.",
};

export type CompassRoi =
  | typeof ROI_STUB
  | {
      available: true;
      net_price: MoneyFigure;
      four_year_net_cost: MoneyFigure;
      payback_years: MoneyFigure;
      earnings_to_cost_ratio: MoneyFigure;
      sources: string[];
    };

export type CompassMajor = {
  major_name: string;
  scorecard_field?: string | null;
  median_earnings_10yr: number | null;
  source_url: string;
  provenance?: string;
};

export type CompassCareer = {
  major_name: string;
  career_title: string;
  median_wage_annual: number | null;
  onet_code?: string | null;
  source_url: string;
  provenance?: string;
};

export type SourcedFigure = { value: number | null; source_url: string };

export type CompassCareerView = {
  career_title: string;
  median_wage_annual: SourcedFigure;
  onet_code: string | null;
};

export type CompassMajorView = {
  major_name: string;
  fit: number | null;
  // A grounded, NUMBER-FREE reason tying this major to the student's stated
  // interests and the sourced careers it opens. Pure text — invents no figure.
  reason: string;
  median_earnings_10yr: SourcedFigure;
  careers: CompassCareerView[];
  roi: CompassRoi;
};

export type CompassAdmit = {
  unitid: number;
  school_name: string;
  country: "US";
  tier: string;
  score: number;
};

export type CompassResult = {
  method: typeof COMPASS_METHOD;
  admit: CompassAdmit | null;
  majors: CompassMajorView[];
  roi: CompassRoi;
  sources: string[];
};

const STOPWORDS = new Set([
  "and",
  "the",
  "of",
  "in",
  "for",
  "science",
  "studies",
  "general",
  "other",
]);

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !STOPWORDS.has(token)),
  );
}

// Keyword fallback fit when no embedding similarity is supplied: Jaccard-style
// token overlap between the student's interests and the major name, 0..100.
function keywordFit(interests: string | undefined, majorName: string): number | null {
  if (!interests || interests.trim().length === 0) {
    return null;
  }
  const interestTokens = tokens(interests);
  const majorTokens = tokens(majorName);
  if (interestTokens.size === 0 || majorTokens.size === 0) {
    return null;
  }
  let shared = 0;
  for (const token of majorTokens) {
    if (interestTokens.has(token)) {
      shared += 1;
    }
  }
  const union = new Set([...interestTokens, ...majorTokens]).size;
  return Math.round((shared / union) * 100);
}

// Deterministic, grounded reason text. Describes fit qualitatively (no number,
// which is shown separately) and names a real career the major opens, so each
// recommendation reads as specific rather than a generic list entry.
function buildMajorReason(
  fit: number | null,
  careerTitles: string[],
  hasInterests: boolean,
): string {
  let fitPhrase: string;
  if (fit === null) {
    fitPhrase = hasInterests
      ? "Fit isn't scored for this major yet"
      : "Add your interests to see how this major fits you";
  } else if (fit >= 60) {
    fitPhrase = "A strong match for the interests you listed";
  } else if (fit >= 30) {
    fitPhrase = "A moderate match for the interests you listed";
  } else if (fit >= 1) {
    fitPhrase = "A lighter match for the interests you listed";
  } else {
    fitPhrase = "Little overlap with the interests you listed";
  }

  if (careerTitles.length === 0) {
    return `${fitPhrase}.`;
  }
  if (careerTitles.length === 1) {
    return `${fitPhrase}; it opens into roles like ${careerTitles[0]}.`;
  }
  return `${fitPhrase}; it opens into roles like ${careerTitles[0]} and ${careerTitles[1]}.`;
}

function admitFor(
  school: InferenceSchool | undefined,
  profile:
    | {
        sat_score?: number;
        act_score?: number;
        gpa?: number;
        application_round?: "regular" | "early";
      }
    | undefined,
): CompassAdmit | null {
  if (!school || !profile) {
    return null;
  }
  const result = buildUsAdmitIntelligence(
    {
      unitid: school.unitid,
      sat_score: profile.sat_score,
      act_score: profile.act_score,
      gpa: profile.gpa,
      application_round: profile.application_round ?? "regular",
    },
    school,
  );
  return {
    unitid: school.unitid,
    school_name: school.name,
    country: "US",
    tier: result.tier,
    score: result.score,
  };
}

function roiFromMoney(money: MoneyPlan | undefined): CompassRoi {
  if (!money || !money.roi.available) {
    return ROI_STUB;
  }
  return {
    available: true,
    net_price: money.figures.true_net_price,
    four_year_net_cost: money.figures.four_year_net_cost,
    payback_years: money.figures.payback_years,
    earnings_to_cost_ratio: money.figures.earnings_to_cost_ratio,
    sources: money.sources,
  };
}

export function generateCompass(input: {
  majors: CompassMajor[];
  careers: CompassCareer[];
  studentInterests?: string;
  // Optional per-major embedding similarity (0..1) supplied by the server; when
  // present it drives fit, otherwise keyword overlap is used.
  majorSimilarity?: Record<string, number>;
  school?: InferenceSchool;
  profile?: {
    sat_score?: number;
    act_score?: number;
    gpa?: number;
    application_round?: "regular" | "early";
  };
  money?: MoneyPlan;
}): CompassResult {
  const careersByMajor = new Map<string, CompassCareer[]>();
  for (const career of input.careers) {
    const list = careersByMajor.get(career.major_name) ?? [];
    list.push(career);
    careersByMajor.set(career.major_name, list);
  }

  const sources = new Set<string>();
  const roi = roiFromMoney(input.money);
  if (roi.available) {
    for (const source of roi.sources) {
      sources.add(source);
    }
  }

  const majors: CompassMajorView[] = input.majors
    .map((major) => {
      const similarity = input.majorSimilarity?.[major.major_name];
      const fit =
        similarity !== undefined
          ? Math.round(Math.max(0, Math.min(1, similarity)) * 100)
          : keywordFit(input.studentInterests, major.major_name);

      sources.add(major.source_url);

      const careers = (careersByMajor.get(major.major_name) ?? [])
        .slice()
        .sort((left, right) => left.career_title.localeCompare(right.career_title))
        .map((career) => {
          sources.add(career.source_url);
          return {
            career_title: career.career_title,
            median_wage_annual: {
              value: career.median_wage_annual,
              source_url: career.source_url,
            },
            onet_code: career.onet_code ?? null,
          };
        });

      return {
        major_name: major.major_name,
        fit,
        reason: buildMajorReason(
          fit,
          careers.map((career) => career.career_title),
          Boolean(input.studentInterests && input.studentInterests.trim().length > 0),
        ),
        median_earnings_10yr: {
          value: major.median_earnings_10yr,
          source_url: major.source_url,
        },
        careers,
        roi,
      };
    })
    .sort((left, right) => {
      const leftFit = left.fit ?? -1;
      const rightFit = right.fit ?? -1;
      if (rightFit !== leftFit) {
        return rightFit - leftFit;
      }
      return left.major_name.localeCompare(right.major_name);
    });

  return {
    method: COMPASS_METHOD,
    admit: admitFor(input.school, input.profile),
    majors,
    roi,
    sources: [...sources].sort((left, right) => left.localeCompare(right)),
  };
}

// Lineage guard reused by the loader/tests: every row must carry a source_url.
export function assertCareerLineage(
  rows: Array<Pick<CompassMajor | CompassCareer, "source_url">>,
): void {
  for (const [index, row] of rows.entries()) {
    if (!row.source_url || row.source_url.trim().length === 0) {
      throw new Error(`Compass row ${index} is missing a source_url.`);
    }
  }
}

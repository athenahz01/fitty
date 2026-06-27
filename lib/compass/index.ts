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
// * ROI / net-cost is a clearly-labeled DEFERRED STUB (Money is Phase 4). There
//   is no placeholder ROI number anywhere.

import { buildUsAdmitIntelligence } from "../score/us";
import type { InferenceSchool } from "../model/inference";

export const COMPASS_METHOD = "compass_major_career_v1";

// The deferred ROI stub. No number — ever — until the Money module lands.
export const ROI_STUB = {
  available: false as const,
  note: "ROI arrives with the Money module (Phase 4). No net-price or return figure is shown yet.",
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
  median_earnings_10yr: SourcedFigure;
  careers: CompassCareerView[];
  roi: typeof ROI_STUB;
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
  roi: typeof ROI_STUB;
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
}): CompassResult {
  const careersByMajor = new Map<string, CompassCareer[]>();
  for (const career of input.careers) {
    const list = careersByMajor.get(career.major_name) ?? [];
    list.push(career);
    careersByMajor.set(career.major_name, list);
  }

  const sources = new Set<string>();

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
        median_earnings_10yr: {
          value: major.median_earnings_10yr,
          source_url: major.source_url,
        },
        careers,
        roi: ROI_STUB,
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
    roi: ROI_STUB,
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

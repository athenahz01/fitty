"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  ClipboardList,
  FileText,
  GraduationCap,
  Loader2,
  MapPin,
  Menu,
  MessageCircle,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  Trash2,
  Upload,
} from "lucide-react";
import type {
  Dispatch,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  SetStateAction,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { trackEvent } from "@/lib/analytics";
import type { MoneyIncomeBand, MoneyPlan, MoneyResidency } from "@/lib/money";
import { searchLocalSchoolFixtures } from "@/lib/school-fixtures";
import { searchSchools, type SchoolSearchResult } from "@/lib/school-search";

import type { ApplicationRound, Profile } from "./admira-profile";
import { useAdmiraProfile } from "./admira-profile";
import { OutcomeDataControlsPanel } from "./outcome-data-controls";
import { OutcomeCapturePanel } from "./outcome-capture-panel";
import { OutcomeSessionProvider } from "./outcome-session";
import {
  FitRadar as SignatureRadar,
  RangeBar,
  VerdictBlock,
  mapDriverDirection,
  type RadarAxis,
  type VerdictDriver,
} from "./signature";
import { useToast } from "./toast";

type BandLabel = "reach" | "target" | "likely";
type AdmitTier = "Reach" | "Target" | "Likely" | "Safety";

type SchoolSearchRow = SchoolSearchResult;

type ChanceResponse = {
  school: {
    unitid: number;
    name: string;
    selectivity_tier: string | null;
    sat_25: number | null;
    sat_75: number | null;
    act_25: number | null;
    act_75: number | null;
    gpa_avg: number | null;
    test_policy: string | null;
  };
  probability: {
    point: number;
    calibrated: number;
    low: number;
    high: number;
    width: number;
    coverage: number;
  };
  band: {
    label: BandLabel;
    wide_band: boolean;
    note: string;
    input_confidence?: "low" | "standard";
  };
  levers: {
    controllable: LeverContribution[];
    fixed: LeverContribution[];
    unseen: UnseenLever[];
  };
  climb_levers?: ClimbLever[];
  rubric: {
    c7_factors: Record<string, string | undefined>;
    gaps: {
      sat: GapValue;
      act: GapValue;
      gpa: GapValue;
    };
  };
  disclaimers: string[];
  model: {
    type: string;
    version: string;
    honesty_label: string;
  };
};

type LeverContribution = {
  feature: string;
  label: string;
  note?: string;
  logit_contribution: number;
};

type UnseenLever = {
  feature: string;
  label: string;
  note?: string;
};

type ClimbLever = {
  id:
    | "test_score"
    | "application_round"
    | "essays"
    | "recommendations"
    | "demonstrated_interest";
  label: string;
  kind: "modeled_delta" | "published_delta" | "direction_only";
  note: string;
  direction: string;
  delta?: {
    low: number;
    high: number;
    tick: number;
  };
};

type GapValue = {
  score: number | null;
  mid: number | null;
  gap: number | null;
};

type ChanceRequestBody = {
  unitid: number;
  sat_score?: number;
  act_score?: number;
  gpa?: number;
  application_round: ApplicationRound;
};

type AdmitIntelligenceRequestBody = ChanceRequestBody & {
  intended_major?: string;
  activity_context?: string;
  applicant_average?: number;
  applicant_basis?: "percentage";
  completed_prerequisites?: string[];
  program_name?: string;
};

type AdmitDriver = {
  label: string;
  direction: "positive" | "negative" | "neutral";
  impact: number;
  detail: string;
};

type AdmitProfileAxis = {
  key: "academics" | "rigor" | "test" | "extracurricular" | "fit";
  label: string;
  value: number;
  admitted: number;
  status: "strong" | "steady" | "stretch";
  note: string;
};

type AdmitIntelligenceResponse = {
  score: number;
  tier: AdmitTier;
  drivers: AdmitDriver[];
  confidence: number;
  country: "US" | "CA";
  profile: {
    axes: AdmitProfileAxis[];
    method: string;
  };
  probability: {
    calibrated: number;
    low?: number;
    high?: number;
    width?: number;
    coverage?: number;
  };
  program?: {
    name: string;
    source_url: string;
    cutoff: {
      low: number | null;
      high: number | null;
      basis: string;
    };
  };
};

type AddedSchool = {
  school: SchoolSearchRow;
  status: "loading" | "ready" | "error";
  result?: ChanceResponse;
  intelligence?: AdmitIntelligenceResponse;
  error?: string;
};

type FitPreferences = {
  interests: string;
  preferredSize: "" | "small" | "medium" | "large";
  preferredSetting: "" | "city" | "suburb" | "town" | "rural";
  preferredRegion: "" | "Northeast" | "Midwest" | "South" | "West";
  selectivityTier: "" | "accessible" | "selective" | "highly_selective" | "elite";
  control: "" | "public" | "private";
  minGradRate: "" | "0.5" | "0.7" | "0.85";
  costCeiling: string;
  learningStyleNotes: string;
};

type FitResponse = {
  query: {
    embedded: true;
    dim: number;
    model: string;
  };
  results: FitResult[];
  balance: Record<BandLabel, number> & {
    note: string;
  };
  weak_program_match?: boolean;
  top_program_fit?: number | null;
  disclaimers: string[];
};

type FitResult = {
  school: {
    unitid: number;
    name: string;
    country: "US" | "CA";
    province_state: string | null;
    region: string | null;
    size_band: string | null;
    setting: string | null;
    selectivity_tier: string | null;
    net_price_avg: number | null;
    sticker_cost: number | null;
    program_areas: string[] | null;
  };
  match_reasons: {
    matched: string[];
    notable: string[];
    cost_status: "within_ceiling" | "over_ceiling" | "unknown";
  };
  probability: ChanceResponse["probability"];
  band: {
    label: BandLabel;
    wide_band: boolean;
  };
  fit_score?: FitScore | null;
  climb_levers?: ClimbLever[];
};

type FitScoreAxis = {
  key: "academics" | "major" | "selectivity" | "interest" | "rigor";
  label: string;
  value: number | null;
  typical: number;
  status: "good" | "caution" | "unknown";
  note: string;
};

type FitProgramMatch = {
  matched_concepts: number;
  total_concepts: number;
  matched_terms: string[];
  strong: boolean;
};

type FitScore = {
  score: number | null;
  program_fit?: number | null;
  academic_fit?: number | null;
  program_match?: FitProgramMatch;
  axes: FitScoreAxis[];
  coverage: {
    known: number;
    total: number;
    label: string;
    reduced: boolean;
  };
  method: string;
  model: {
    id: string;
    dim: number;
  };
  note: string;
};

type FitExplanationState = {
  status: "loading" | "ready" | "fallback";
  text?: string;
  reason?: string;
};

type SimilarCohort = {
  unitid: number;
  school_name: string;
  cohort_size: number;
  outcomes: {
    admitted: number;
    denied: number;
    waitlisted: number;
    deferred: number;
  };
  rates: {
    admitted: number;
    denied: number;
    waitlisted: number;
    deferred: number;
  };
  attribute_cards: Array<{
    kind: string;
    label: string;
    value: string;
    count: number;
  }>;
  admit_insights: Array<{
    label: string;
    value: string;
    count: number;
  }>;
  provenance: {
    curated_public: number;
    consented_user: number;
    source_urls: string[];
  };
};

type StudentsLikeYouResponse = {
  status: "ready" | "empty";
  k: number;
  message?: string;
  cohorts: SimilarCohort[];
  feedback: {
    enabled: false;
    reason: string;
  };
};

type ClimbScoreSnapshot = {
  score: number;
  tier: AdmitTier;
  probability: number;
};

type ClimbRoadmapMove = {
  id: string;
  school: {
    unitid: number;
    name: string;
  };
  lever: {
    feature: string;
    label: string;
    kind: "controllable";
  };
  before: ClimbScoreSnapshot;
  after: ClimbScoreSnapshot;
  delta_score: number;
  crosses_tier: boolean;
  tier_claim: string | null;
  counterfactual: Partial<{
    sat_score: number;
    act_score: number;
    application_round: ApplicationRound;
  }>;
  direction: string;
  note: string;
};

type ClimbRoadmapResponse = {
  snapshot_key: string;
  method: string;
  schools: Array<{
    school: {
      unitid: number;
      name: string;
    };
    current: ClimbScoreSnapshot;
    moves: ClimbRoadmapMove[];
  }>;
  ranked_moves: ClimbRoadmapMove[];
  context: Array<{
    feature: string;
    label: string;
    kind: "fixed" | "unseen" | "not_model_visible";
    note: string;
  }>;
};

type CommandCenterTask = {
  id: string;
  unitid: number;
  program_requirement_id: string | null;
  requirement_key: string;
  title: string;
  detail: string;
  category: "academic" | "testing" | "form" | "review" | "deadline" | "document";
  status: "todo" | "in_progress" | "done";
  due_date: string | null;
  source_url: string;
};

type CommandCenterResponse = {
  progress: {
    total: number;
    done: number;
    percent: number;
  };
  schools: Array<{
    school: {
      unitid: number;
      name: string;
      country: string | null;
      admission_system: string | null;
    };
    tasks: CommandCenterTask[];
    deadline:
      | {
          status: "loaded";
          label: string;
          date: string;
          source_url: string;
        }
      | {
          status: "not_loaded";
          label: "Deadline not loaded";
        };
  }>;
  documents: Array<{
    id: string;
    unitid: number | null;
    requirement_key: string | null;
    file_name: string;
    content_type: string;
    size_bytes: number;
    status: "uploaded" | "deleted";
    created_at: string;
  }>;
};

type FitFinderStatus = "checking" | "enabled" | "disabled";
type AdmitIntelligenceStatus = "checking" | "enabled" | "disabled";
type StudentsLikeYouStatus = "checking" | "enabled" | "disabled";
type ClimbStatus = "checking" | "enabled" | "disabled";
type CommandCenterStatus = "checking" | "enabled" | "disabled";
type CopilotStatus = "checking" | "enabled" | "disabled";
type ReportsStatus = "checking" | "enabled" | "disabled";
type NarrativeStatus = "checking" | "enabled" | "disabled";
type CompassStatus = "checking" | "enabled" | "disabled";
type MoneyStatus = "checking" | "enabled" | "disabled";
export type AdmiraView =
  | "dashboard"
  | "start"
  | "schools"
  | "fit"
  | "list"
  | "students-like-you"
  | "climb"
  | "command-center"
  | "reports"
  | "money"
  | "settings";

const viewMeta: Record<AdmiraView, { label: string; kicker: string; title: string; intro: string }> = {
  dashboard: {
    label: "Dashboard",
    kicker: "Home",
    title: "Your application at a glance.",
    intro:
      "Your top school read, list balance, and next steps — all built from the profile you set once.",
  },
  start: {
    label: "Profile Studio",
    kicker: "Your profile",
    title: "Build your profile.",
    intro:
      "Enter your grades and scores once. Every school read, list, and plan uses them, so you never have to re-type them.",
  },
  schools: {
    label: "School Universe",
    kicker: "Find schools",
    title: "Search schools and see your chances.",
    intro:
      "Look up any school to see your chance range and how well you fit.",
  },
  fit: {
    label: "Fit Finder",
    kicker: "Find your fit",
    title: "Find schools that fit you.",
    intro:
      "Tell us what you're looking for and we'll surface schools that match what you want in a college.",
  },
  list: {
    label: "Smart List",
    kicker: "Build your list",
    title: "Build a balanced college list.",
    intro:
      "Keep a healthy mix of reach, target, and likely schools, all tied to your profile.",
  },
  "students-like-you": {
    label: "Students Like You",
    kicker: "Outcomes",
    title: "Where similar students got in.",
    intro:
      "See outcomes from students with profiles like yours — shown only when the group is large enough to stay anonymous.",
  },
  climb: {
    label: "Climb Roadmap",
    kicker: "Improve",
    title: "Improve your chances.",
    intro:
      "See which moves raise your odds the most, based on real data — never a made-up number.",
  },
  "command-center": {
    label: "Command Center",
    kicker: "Plan",
    title: "Plan your applications.",
    intro:
      "Turn your school list into requirements, tasks, and deadlines you can stay on top of.",
  },
  reports: {
    label: "Reports",
    kicker: "Share",
    title: "Build your report.",
    intro:
      "Package your school reads and plan into a report you can share.",
  },
  money: {
    label: "Money",
    kicker: "Costs",
    title: "Know the price before you decide.",
    intro:
      "Compare sticker price, predicted automatic merit, net cost, and payback from sourced inputs.",
  },
  settings: {
    label: "Account",
    kicker: "Account",
    title: "Your account and data.",
    intro:
      "Sign in, optionally share your application outcomes, and manage your data. Only you can see your information.",
  },
};

const initialFitPreferences: FitPreferences = {
  interests: "",
  preferredSize: "",
  preferredSetting: "",
  preferredRegion: "",
  selectivityTier: "",
  control: "",
  minGradRate: "",
  costCeiling: "",
  learningStyleNotes: "",
};

const labelOrder: BandLabel[] = ["reach", "target", "likely"];
const moneyIncomeBands: Array<{ value: MoneyIncomeBand; label: string }> = [
  { value: "overall", label: "Overall" },
  { value: "0-30000", label: "< $30k" },
  { value: "30001-48000", label: "$30-48k" },
  { value: "48001-75000", label: "$48-75k" },
  { value: "75001-110000", label: "$75-110k" },
  { value: "110001-plus", label: "$110k+" },
];
const useLocalSchoolFixture =
  process.env.NEXT_PUBLIC_ADMIRA_USE_LOCAL_SCHOOL_FIXTURE === "true";
const addedSchoolsStorageKey = "admira-added-schools";

function numberOrUndefined(value: string) {
  if (value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatChanceRange(low: number, high: number) {
  return `${Math.round(low * 100)}-${Math.round(high * 100)}%`;
}

function formatBandLabel(label: BandLabel) {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDeltaPoints(value: number) {
  const rounded = Math.round(value * 100);
  if (rounded === 0) {
    return "0 pts";
  }
  return `${rounded > 0 ? "+" : ""}${rounded} pts`;
}

function formatSignedPoints(value: number) {
  const rounded = Math.round(value * 100);
  if (rounded === 0) {
    return "0 pts";
  }
  return `${rounded > 0 ? "+" : ""}${rounded} pts`;
}

function formatRoundLabel(round: ApplicationRound) {
  return round === "early" ? "Early" : "Regular";
}

function formatAdmitTier(tier: AdmitTier) {
  return tier.toUpperCase();
}

function bandFromAdmitTier(tier: AdmitTier): BandLabel {
  if (tier === "Reach") {
    return "reach";
  }
  if (tier === "Target") {
    return "target";
  }
  return "likely";
}

function intendedMajorForRequest(profile: Profile) {
  const major = profile.intendedMajor.trim();
  return major && major.toLowerCase() !== "undecided" ? major : undefined;
}

function parsePrerequisites(value: string) {
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function schoolLocationLabel(
  school: Pick<SchoolSearchRow, "country" | "province_state" | "state">,
) {
  return (
    school.province_state ??
    school.state ??
    (school.country === "CA" ? "Province unknown" : "State unknown")
  );
}

function bandPhrase(label: BandLabel) {
  switch (label) {
    case "reach":
      return "a genuine reach";
    case "target":
      return "a possible target";
    case "likely":
      return "a safer range";
  }
}

function academicGapSummary(result: ChanceResponse) {
  const sat = scoreRangeSummary(
    "SAT",
    result.rubric.gaps.sat.score,
    result.school.sat_25,
    result.school.sat_75,
  );
  if (sat) {
    return sat;
  }

  const act = scoreRangeSummary(
    "ACT",
    result.rubric.gaps.act.score,
    result.school.act_25,
    result.school.act_75,
  );
  if (act) {
    return act;
  }

  const gpa = result.rubric.gaps.gpa.score;
  if (gpa !== null && result.school.gpa_avg !== null) {
    return {
      tone:
        gpa >= result.school.gpa_avg
          ? "Strong academic read"
          : "Academic stretch",
      sentence: `Your GPA is ${gpa >= result.school.gpa_avg ? "at or above" : "below"} the published average of ${result.school.gpa_avg}.`,
    };
  }

  return {
    tone: "Public-data read",
    sentence: "The public academic data is thin, so the band stays wide.",
  };
}

function scoreRangeSummary(
  label: "SAT" | "ACT",
  score: number | null,
  low: number | null,
  high: number | null,
) {
  if (score === null || low === null || high === null) {
    return null;
  }

  if (score < low) {
    return {
      tone: "Academic stretch",
      sentence: `Your ${label} is below this school's middle 50 (${low}-${high}).`,
    };
  }

  if (score > high) {
    return {
      tone: "Strong academic read",
      sentence: `Your ${label} is above this school's middle 50 (${low}-${high}).`,
    };
  }

  return {
    tone: "Strong academic read",
    sentence: `Your ${label} sits inside this school's middle 50 (${low}-${high}).`,
  };
}

function buildChanceVerdict(result: ChanceResponse) {
  const gap = academicGapSummary(result);
  const band = bandPhrase(result.band.label);
  const connector = result.band.label === "reach" ? "but" : "and";

  return `${gap.tone}, ${connector} ${band}. ${gap.sentence}`;
}

function buildFitVerdict(result: FitResult) {
  const score = result.fit_score?.score;
  const fitTone =
    score === null || score === undefined
      ? "Fit read"
      : score >= 80
        ? "Great fit"
        : score >= 65
          ? "Solid fit"
          : "Mixed fit";
  const band = bandPhrase(result.band.label);
  const scoreCopy =
    score === null || score === undefined
      ? "FIT needs more known axes to say more."
      : `FIT ${score} is profile overlap, not chance.`;

  return `${fitTone}, ${band}. ${scoreCopy}`;
}

function visibleLevers(levers: ClimbLever[]) {
  const visible = levers.filter(
    (lever) =>
      !["essays", "recommendations", "demonstrated_interest"].includes(
        lever.id,
      ),
  );
  const actionable = visible.filter(
    (lever) =>
      lever.delta ||
      lever.id === "test_score" ||
      lever.id === "application_round",
  );
  const source = actionable.length > 0 ? actionable : visible;
  return source.slice(0, 3);
}

function leverImpactPts(lever: ClimbLever) {
  if (!lever.delta) {
    return null;
  }
  return Math.round(
    Math.max(
      Math.abs(lever.delta.low),
      Math.abs(lever.delta.high),
      Math.abs(lever.delta.tick),
    ) * 100,
  );
}

function formatLeverDelta(lever: ClimbLever) {
  if (!lever.delta) {
    return "not in the model yet";
  }

  if (leverImpactPts(lever) === 0) {
    return "no measurable move here";
  }

  if (lever.kind === "published_delta") {
    return `${formatDeltaPoints(lever.delta.tick)} published spread`;
  }

  return `${formatDeltaPoints(lever.delta.low)} to ${formatDeltaPoints(
    lever.delta.high,
  )}`;
}

function leverImpactWidth(lever: ClimbLever) {
  if (!lever.delta) {
    return 18;
  }

  if (leverImpactPts(lever) === 0) {
    return 0;
  }

  const impact = Math.max(
    Math.abs(lever.delta.low),
    Math.abs(lever.delta.high),
    Math.abs(lever.delta.tick),
  );
  return Math.max(18, Math.min(100, Math.round(impact * 500)));
}

function leverKindLabel(lever: ClimbLever) {
  if (!lever.delta) {
    return "Not in model";
  }

  if (leverImpactPts(lever) === 0) {
    return "No effect";
  }

  return lever.kind === "published_delta" ? "School data" : "Modeled move";
}

function filteredDisclaimers(disclaimers: string[]) {
  return disclaimers.filter(
    (disclaimer) =>
      !/essay|recommendation|institutional priorit|demonstrated interest/i.test(
        disclaimer,
      ),
  );
}

function testPolicyControlReason(policy: string | null, hasTestScore: boolean) {
  const normalized = (policy ?? "").toLowerCase();

  if (normalized.includes("blind")) {
    return "test-blind: scores not used";
  }

  if (normalized.includes("optional")) {
    return "test-optional: scores not used here";
  }

  if (!hasTestScore) {
    return "No submitted test score to adjust";
  }

  return "";
}

function validateProfile(profile: Profile) {
  const errors: string[] = [];
  const gpa = numberOrUndefined(profile.gpa);
  const canadianAverage = numberOrUndefined(profile.canadianAverage);
  const sat = numberOrUndefined(profile.sat);
  const act = numberOrUndefined(profile.act);

  if (gpa !== undefined && (gpa < 0 || gpa > 5)) {
    errors.push("GPA must be between 0 and 5.");
  }

  if (
    profile.canadianAverage.trim() &&
    (canadianAverage === undefined || canadianAverage < 0 || canadianAverage > 100)
  ) {
    errors.push("Canadian average must be between 0 and 100.");
  }

  if (!profile.notSubmittingTests) {
    if (sat !== undefined && (!Number.isInteger(sat) || sat < 400 || sat > 1600)) {
      errors.push("SAT must be an integer from 400 to 1600.");
    }
    if (act !== undefined && (!Number.isInteger(act) || act < 1 || act > 36)) {
      errors.push("ACT must be an integer from 1 to 36.");
    }
  }

  return errors;
}

function profileFieldErrors(profile: Profile) {
  const gpa = numberOrUndefined(profile.gpa);
  const canadianAverage = numberOrUndefined(profile.canadianAverage);
  const sat = numberOrUndefined(profile.sat);
  const act = numberOrUndefined(profile.act);
  const out: { gpa?: string; canadianAverage?: string; sat?: string; act?: string } = {};

  if (gpa !== undefined && (gpa < 0 || gpa > 5)) {
    out.gpa = "GPA is out of range. Use 0 to 5.";
  }
  if (
    profile.canadianAverage.trim() &&
    (canadianAverage === undefined || canadianAverage < 0 || canadianAverage > 100)
  ) {
    out.canadianAverage = "Average is out of range. Use 0 to 100.";
  }
  if (!profile.notSubmittingTests) {
    if (sat !== undefined && (!Number.isInteger(sat) || sat < 400 || sat > 1600)) {
      out.sat = "SAT is out of range. Max is 1600.";
    }
    if (act !== undefined && (!Number.isInteger(act) || act < 1 || act > 36)) {
      out.act = "ACT is out of range. Max is 36.";
    }
  }
  return out;
}

function buildChanceBody(profile: Profile, unitid: number): ChanceRequestBody {
  const gpa = numberOrUndefined(profile.gpa);
  const sat = profile.notSubmittingTests ? undefined : numberOrUndefined(profile.sat);
  const act = profile.notSubmittingTests ? undefined : numberOrUndefined(profile.act);

  return {
    unitid,
    ...(sat !== undefined ? { sat_score: sat } : {}),
    ...(act !== undefined ? { act_score: act } : {}),
    ...(gpa !== undefined ? { gpa } : {}),
    application_round: profile.applicationRound,
  };
}

function buildAdmitIntelligenceBody(
  profile: Profile,
  school: SchoolSearchRow,
): AdmitIntelligenceRequestBody {
  const chanceBody = buildChanceBody(profile, school.unitid);
  const intendedMajor = intendedMajorForRequest(profile);
  const activityContext = profile.activityNote.trim();
  const canadianAverage = numberOrUndefined(profile.canadianAverage);
  const prerequisites = parsePrerequisites(profile.completedPrerequisites);

  return {
    ...chanceBody,
    ...(intendedMajor ? { intended_major: intendedMajor } : {}),
    ...(activityContext ? { activity_context: activityContext } : {}),
    ...(school.country === "CA" && canadianAverage !== undefined
      ? {
          applicant_average: canadianAverage,
          applicant_basis: "percentage" as const,
          ...(prerequisites.length > 0
            ? { completed_prerequisites: prerequisites }
            : {}),
          ...(intendedMajor ? { program_name: intendedMajor } : {}),
        }
      : {}),
  };
}

function hasProfileForFit(profile: Profile) {
  return (
    numberOrUndefined(profile.gpa) !== undefined ||
    profile.notSubmittingTests ||
    numberOrUndefined(profile.sat) !== undefined ||
    numberOrUndefined(profile.act) !== undefined
  );
}

function buildFitBody(profile: Profile, preferences: FitPreferences) {
  const chanceBody = buildChanceBody(profile, 0);
  const costCeiling = numberOrUndefined(preferences.costCeiling);
  const intendedMajor = profile.intendedMajor.trim();

  return {
    ...(preferences.interests.trim()
      ? { interests: preferences.interests.trim() }
      : {}),
    ...(intendedMajor ? { intended_major: intendedMajor } : {}),
    ...(preferences.preferredSize
      ? { preferred_size: preferences.preferredSize }
      : {}),
    ...(preferences.preferredSetting
      ? { preferred_setting: preferences.preferredSetting }
      : {}),
    ...(preferences.preferredRegion
      ? { preferred_region: preferences.preferredRegion }
      : {}),
    ...(preferences.selectivityTier
      ? { selectivity_tier: preferences.selectivityTier }
      : {}),
    ...(preferences.control ? { control: preferences.control } : {}),
    ...(preferences.minGradRate
      ? { min_grad_rate: Number(preferences.minGradRate) }
      : {}),
    ...(costCeiling !== undefined ? { cost_ceiling: costCeiling } : {}),
    ...(preferences.learningStyleNotes.trim()
      ? { learning_style_notes: preferences.learningStyleNotes.trim() }
      : {}),
    ...(chanceBody.sat_score !== undefined
      ? { sat_score: chanceBody.sat_score }
      : {}),
    ...(chanceBody.act_score !== undefined
      ? { act_score: chanceBody.act_score }
      : {}),
    ...(chanceBody.gpa !== undefined ? { gpa: chanceBody.gpa } : {}),
    application_round: chanceBody.application_round,
  };
}

function activityTierForSimilarity(profile: Profile) {
  const length = profile.activityNote.trim().length;
  if (length >= 160) {
    return "national";
  }
  if (length >= 90) {
    return "state";
  }
  if (length >= 35) {
    return "regional";
  }
  return "unknown";
}

function buildStudentsLikeYouBody(profile: Profile, unitid?: number) {
  const chanceBody = buildChanceBody(profile, unitid ?? 0);
  const intendedMajor = intendedMajorForRequest(profile);

  return {
    ...(unitid !== undefined ? { unitid } : {}),
    profile: {
      cycle_year: 2026,
      ...(chanceBody.gpa !== undefined ? { gpa: chanceBody.gpa } : {}),
      ...(chanceBody.sat_score !== undefined
        ? { sat_score: chanceBody.sat_score }
        : {}),
      ...(chanceBody.act_score !== undefined
        ? { act_score: chanceBody.act_score }
        : {}),
      test_submitted: !profile.notSubmittingTests,
      course_rigor: "unknown",
      activities_tier: activityTierForSimilarity(profile),
      ...(intendedMajor ? { intended_major: intendedMajor } : {}),
      application_round: profile.applicationRound,
      demonstrated_interest: "unknown",
    },
  };
}

function buildClimbBody(profile: Profile, schools: AddedSchool[]) {
  const chanceBody = buildChanceBody(profile, 0);

  return {
    profile: {
      ...(chanceBody.gpa !== undefined ? { gpa: chanceBody.gpa } : {}),
      ...(chanceBody.sat_score !== undefined
        ? { sat_score: chanceBody.sat_score }
        : {}),
      ...(chanceBody.act_score !== undefined
        ? { act_score: chanceBody.act_score }
        : {}),
      application_round: profile.applicationRound,
    },
    schools: schools.map((entry) => ({
      unitid: entry.school.unitid,
    })),
  };
}

function buildCommandCenterBody(schools: AddedSchool[]) {
  return {
    schools: schools.map((entry) => ({
      unitid: entry.school.unitid,
    })),
  };
}

function buildCopilotProfile(profile: Profile) {
  const chanceBody = buildChanceBody(profile, 0);
  const intendedMajor = intendedMajorForRequest(profile);
  const activityContext = profile.activityNote.trim();

  return {
    ...(chanceBody.sat_score !== undefined
      ? { sat_score: chanceBody.sat_score }
      : {}),
    ...(chanceBody.act_score !== undefined
      ? { act_score: chanceBody.act_score }
      : {}),
    ...(chanceBody.gpa !== undefined ? { gpa: chanceBody.gpa } : {}),
    application_round: chanceBody.application_round,
    ...(intendedMajor ? { intended_major: intendedMajor } : {}),
    ...(activityContext ? { activity_context: activityContext } : {}),
  };
}

function buildCopilotSchools(schools: AddedSchool[]) {
  return schools.map((entry) => ({
    unitid: entry.school.unitid,
    name: entry.school.name,
    country: entry.school.country,
    sat_25: entry.result?.school.sat_25 ?? entry.school.sat_25,
    sat_75: entry.result?.school.sat_75 ?? entry.school.sat_75,
    act_25: entry.result?.school.act_25 ?? entry.school.act_25,
    act_75: entry.result?.school.act_75 ?? entry.school.act_75,
    gpa_avg: entry.result?.school.gpa_avg ?? null,
    test_policy: entry.result?.school.test_policy ?? entry.school.test_policy,
    selectivity_tier:
      entry.result?.school.selectivity_tier ?? entry.school.selectivity_tier,
  }));
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value * 100));
}

function isHighUncertaintyTier(tier: string | null) {
  return tier === "elite" || tier === "highly_selective";
}

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored =
      window.localStorage.getItem("admira-theme") ??
      window.localStorage.getItem("fitty-theme");
    const nextTheme = stored === "dark" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      window.localStorage.setItem("admira-theme", next);
      return next;
    });
  }

  return { theme, toggleTheme };
}

export function AdmiraApp({ view = "dashboard" }: { view?: AdmiraView }) {
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const { profile, setProfile } = useAdmiraProfile();
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolResults, setSchoolResults] = useState<SchoolSearchRow[]>([]);
  const [schoolSearchStatus, setSchoolSearchStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [schoolSearchError, setSchoolSearchError] = useState("");
  const [addedSchools, setAddedSchools] = useState<AddedSchool[]>([]);
  const [formNotice, setFormNotice] = useState("");
  const [fitFinderStatus, setFitFinderStatus] =
    useState<FitFinderStatus>("checking");
  const [admitIntelligenceStatus, setAdmitIntelligenceStatus] =
    useState<AdmitIntelligenceStatus>("checking");
  const [studentsLikeYouStatus, setStudentsLikeYouStatus] =
    useState<StudentsLikeYouStatus>("checking");
  const [climbStatus, setClimbStatus] = useState<ClimbStatus>("checking");
  const [commandCenterStatus, setCommandCenterStatus] =
    useState<CommandCenterStatus>("checking");
  const [copilotStatus, setCopilotStatus] =
    useState<CopilotStatus>("checking");
  const [reportsStatus, setReportsStatus] =
    useState<ReportsStatus>("checking");
  const [narrativeStatus, setNarrativeStatus] =
    useState<NarrativeStatus>("checking");
  const [compassStatus, setCompassStatus] =
    useState<CompassStatus>("checking");
  const [moneyStatus, setMoneyStatus] =
    useState<MoneyStatus>("checking");
  const [listBuilderStatus, setListBuilderStatus] = useState<
    "checking" | "enabled" | "disabled"
  >("checking");
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const searchRequest = useRef(0);

  const profileErrors = useMemo(() => validateProfile(profile), [profile]);
  const noAcademicInput =
    profile.notSubmittingTests ||
    (!numberOrUndefined(profile.sat) && !numberOrUndefined(profile.act));

  useEffect(() => {
    trackEvent("page_view", { path: pathname ?? `/${view}` });
  }, [pathname, view]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(addedSchoolsStorageKey);
      if (!stored) {
        return;
      }
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setAddedSchools(parsed as AddedSchool[]);
      }
    } catch {
      window.localStorage.removeItem(addedSchoolsStorageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      addedSchoolsStorageKey,
      JSON.stringify(addedSchools),
    );
  }, [addedSchools]);

  useEffect(() => {
    let active = true;

    async function loadAdmitIntelligenceStatus() {
      try {
        const response = await fetch("/api/admit-intelligence/status");
        const payload = await response.json();
        if (!active) {
          return;
        }
        setAdmitIntelligenceStatus(
          payload?.enabled === true ? "enabled" : "disabled",
        );
      } catch {
        if (active) {
          setAdmitIntelligenceStatus("disabled");
        }
      }
    }

    async function loadFitFinderStatus() {
      try {
        const response = await fetch("/api/fit/status");
        const payload = await response.json();
        if (!active) {
          return;
        }
        setFitFinderStatus(payload?.enabled === true ? "enabled" : "disabled");
      } catch {
        if (active) {
          setFitFinderStatus("disabled");
        }
      }
    }

    async function loadStudentsLikeYouStatus() {
      try {
        const response = await fetch("/api/students-like-you/status");
        const payload = await response.json();
        if (!active) {
          return;
        }
        setStudentsLikeYouStatus(
          payload?.enabled === true ? "enabled" : "disabled",
        );
      } catch {
        if (active) {
          setStudentsLikeYouStatus("disabled");
        }
      }
    }

    async function loadClimbStatus() {
      try {
        const response = await fetch("/api/climb/status");
        const payload = await response.json();
        if (!active) {
          return;
        }
        setClimbStatus(payload?.enabled === true ? "enabled" : "disabled");
      } catch {
        if (active) {
          setClimbStatus("disabled");
        }
      }
    }

    async function loadCommandCenterStatus() {
      try {
        const response = await fetch("/api/command-center/status");
        const payload = await response.json();
        if (!active) {
          return;
        }
        setCommandCenterStatus(
          payload?.enabled === true ? "enabled" : "disabled",
        );
      } catch {
        if (active) {
          setCommandCenterStatus("disabled");
        }
      }
    }

    async function loadCopilotStatus() {
      try {
        const response = await fetch("/api/copilot/status");
        const payload = await response.json();
        if (!active) {
          return;
        }
        setCopilotStatus(payload?.enabled === true ? "enabled" : "disabled");
      } catch {
        if (active) {
          setCopilotStatus("disabled");
        }
      }
    }

    async function loadReportsStatus() {
      try {
        const response = await fetch("/api/reports/status");
        const payload = await response.json();
        if (!active) {
          return;
        }
        setReportsStatus(payload?.enabled === true ? "enabled" : "disabled");
      } catch {
        if (active) {
          setReportsStatus("disabled");
        }
      }
    }

    async function loadNarrativeStatus() {
      try {
        const response = await fetch("/api/narrative/status");
        const payload = await response.json();
        if (!active) {
          return;
        }
        setNarrativeStatus(payload?.enabled === true ? "enabled" : "disabled");
      } catch {
        if (active) {
          setNarrativeStatus("disabled");
        }
      }
    }

    async function loadCompassStatus() {
      try {
        const response = await fetch("/api/compass/status");
        const payload = await response.json();
        if (!active) {
          return;
        }
        setCompassStatus(payload?.enabled === true ? "enabled" : "disabled");
      } catch {
        if (active) {
          setCompassStatus("disabled");
        }
      }
    }

    async function loadMoneyStatus() {
      try {
        const response = await fetch("/api/money/status");
        const payload = await response.json();
        if (!active) {
          return;
        }
        setMoneyStatus(payload?.enabled === true ? "enabled" : "disabled");
      } catch {
        if (active) {
          setMoneyStatus("disabled");
        }
      }
    }

    async function loadListBuilderStatus() {
      try {
        const response = await fetch("/api/list/status");
        const payload = await response.json();
        if (!active) {
          return;
        }
        setListBuilderStatus(
          payload?.enabled === true ? "enabled" : "disabled",
        );
      } catch {
        if (active) {
          setListBuilderStatus("disabled");
        }
      }
    }

    void loadAdmitIntelligenceStatus();
    void loadFitFinderStatus();
    void loadStudentsLikeYouStatus();
    void loadClimbStatus();
    void loadCommandCenterStatus();
    void loadCopilotStatus();
    void loadReportsStatus();
    void loadNarrativeStatus();
    void loadCompassStatus();
    void loadMoneyStatus();
    void loadListBuilderStatus();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (fitFinderStatus === "enabled") {
      trackEvent("fit_finder_viewed", { surface: "home" });
    }
  }, [fitFinderStatus]);

  useEffect(() => {
    const query = schoolQuery.trim();

    if (query.length < 2) {
      setSchoolResults([]);
      setSchoolSearchStatus("idle");
      setSchoolSearchError("");
      return;
    }

    const requestId = searchRequest.current + 1;
    searchRequest.current = requestId;
    setSchoolSearchStatus("loading");

    const timeout = window.setTimeout(async () => {
      try {
        if (useLocalSchoolFixture) {
          setSchoolResults(searchLocalSchoolFixtures(query));
          setSchoolSearchStatus("ready");
          setSchoolSearchError("");
          return;
        }

        const results = await searchSchools(query);
        if (requestId !== searchRequest.current) {
          return;
        }

        setSchoolResults(results);
        setSchoolSearchStatus("ready");
        setSchoolSearchError("");
      } catch (error) {
        if (requestId !== searchRequest.current) {
          return;
        }
        setSchoolSearchStatus("error");
        setSchoolResults([]);
        setSchoolSearchError(
          error instanceof Error
            ? error.message
            : "School search is unavailable.",
        );
      }
    }, 240);

    return () => window.clearTimeout(timeout);
  }, [schoolQuery]);

  async function addSchool(school: SchoolSearchRow) {
    if (addedSchools.some((entry) => entry.school.unitid === school.unitid)) {
      setSchoolQuery("");
      setSchoolResults([]);
      return;
    }

    if (profileErrors.length > 0) {
      setFormNotice(profileErrors.join(" "));
      return;
    }

    setFormNotice("");
    setSchoolQuery("");
    setSchoolResults([]);
    trackEvent("profile_completed", {
      application_round: profile.applicationRound,
      has_test_signal: !noAcademicInput,
    });
    trackEvent("school_added", {
      result_count: addedSchools.length + 1,
      surface: "school_search",
    });
    setAddedSchools((current) => [
      { school, status: "loading" },
      ...current,
    ]);

    await fetchChance(school);
  }

  async function fetchChance(school: SchoolSearchRow) {
    const useAdmitIntelligence = admitIntelligenceStatus === "enabled";

    try {
      const response = await fetch(
        useAdmitIntelligence ? "/api/admit-intelligence" : "/api/chance",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            useAdmitIntelligence
              ? buildAdmitIntelligenceBody(profile, school)
              : buildChanceBody(profile, school.unitid),
          ),
        },
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error ??
            (useAdmitIntelligence
              ? "Admit Intelligence request failed."
              : "Chance request failed."),
        );
      }

      setAddedSchools((current) =>
        current.map((entry) =>
          entry.school.unitid === school.unitid
            ? useAdmitIntelligence
              ? {
                  school,
                  status: "ready",
                  intelligence: payload as AdmitIntelligenceResponse,
                }
              : { school, status: "ready", result: payload as ChanceResponse }
            : entry,
        ),
      );
    } catch (error) {
      setAddedSchools((current) =>
        current.map((entry) =>
          entry.school.unitid === school.unitid
            ? {
                school,
                status: "error",
                error:
                  error instanceof Error
                    ? error.message
                    : useAdmitIntelligence
                      ? "Admit Intelligence request failed."
                      : "Chance request failed.",
              }
            : entry,
        ),
      );
    }
  }

  async function recalculateAll() {
    if (profileErrors.length > 0) {
      setFormNotice(profileErrors.join(" "));
      return;
    }

    setFormNotice("");
    const schools = addedSchools.map((entry) => entry.school);
    setAddedSchools((current) =>
      current.map((entry) => ({
        ...entry,
        status: "loading",
        result: undefined,
        intelligence: undefined,
        error: undefined,
      })),
    );

    for (const school of schools) {
      await fetchChance(school);
    }
  }

  function removeSchool(unitid: number) {
    const removed = addedSchools.find((entry) => entry.school.unitid === unitid);
    setAddedSchools((current) =>
      current.filter((entry) => entry.school.unitid !== unitid),
    );
    if (removed) {
      toast.show(`Removed ${removed.school.name}`, {
        label: "Undo",
        onClick: () => {
          // Undo restores through the existing add path — re-inserts the loading
          // row and re-scores via the same fetchChance the add uses. It never
          // introduces a new mutation/persistence path.
          setAddedSchools((current) =>
            current.some((entry) => entry.school.unitid === removed.school.unitid)
              ? current
              : [{ school: removed.school, status: "loading" }, ...current],
          );
          void fetchChance(removed.school);
        },
      });
    }
  }

  const readyBalanceLabels = addedSchools
    .map((entry) =>
      entry.result
        ? entry.result.band.label
        : entry.intelligence
          ? bandFromAdmitTier(entry.intelligence.tier)
          : null,
    )
    .filter((label): label is BandLabel => Boolean(label));
  const meta = viewMeta[view];
  const readySchools = addedSchools.filter((entry) => entry.status === "ready");
  const appStatuses = {
    listBuilder: listBuilderStatus,
    studentsLikeYou: studentsLikeYouStatus,
    climb: climbStatus,
    commandCenter: commandCenterStatus,
    copilot: copilotStatus,
    reports: reportsStatus,
    narrative: narrativeStatus,
    compass: compassStatus,
    money: moneyStatus,
    fitFinder: fitFinderStatus,
  };

  return (
    <main className="admira-shell admira-app-shell" data-view={view}>
      <div className="admira-frame">
        <div className="product-shell">
          <AppSidebar
            view={view}
            profile={profile}
            readiness={profileReadiness(profile)}
            statuses={appStatuses}
          />
          <section className="appmain">
            <header className="app-topbar">
              <div className="crumb">
                <Link href="/dashboard">Admira</Link>
                <span aria-hidden="true">/</span>
                <strong>{meta.label}</strong>
              </div>
              <div className="topbar-actions">
                <Link className="method-link" href="/methodology">
                  Methodology
                </Link>
                <Link className="method-link" href="/privacy">
                  Privacy
                </Link>
                {copilotStatus === "enabled" ? (
                  <button
                    className="theme-switch"
                    type="button"
                    onClick={() => setIsCopilotOpen(true)}
                  >
                    <Sparkles size={16} />
                    <span className="theme-switch-label">Copilot</span>
                  </button>
                ) : null}
                <button
                  className="theme-switch"
                  type="button"
                  onClick={toggleTheme}
                  aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
                >
                  {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
                  <span className="theme-switch-label">
                    {theme === "light" ? "Dark" : "Light"}
                  </span>
                </button>
              </div>
            </header>

            <div className="route-content">
              <RouteHero meta={meta} view={view} readySchools={readySchools.length} />
              <RouteBody
                view={view}
                profile={profile}
                setProfile={setProfile}
                profileErrors={profileErrors}
                formNotice={formNotice}
                noAcademicInput={noAcademicInput}
                admitIntelligenceEnabled={admitIntelligenceStatus === "enabled"}
                fitFinderStatus={fitFinderStatus}
                listBuilderStatus={listBuilderStatus}
                studentsLikeYouStatus={studentsLikeYouStatus}
                climbStatus={climbStatus}
                commandCenterStatus={commandCenterStatus}
                reportsStatus={reportsStatus}
                moneyStatus={moneyStatus}
                schoolQuery={schoolQuery}
                setSchoolQuery={setSchoolQuery}
                schoolResults={schoolResults}
                schoolSearchStatus={schoolSearchStatus}
                schoolSearchError={schoolSearchError}
                addedSchools={addedSchools}
                readyBalanceLabels={readyBalanceLabels}
                onAddSchool={addSchool}
                onRemoveSchool={removeSchool}
                onRecalculate={recalculateAll}
                onStartSaved={() => router.push("/dashboard")}
              />
            </div>
          </section>
        </div>

        <BottomTabBar
          view={view}
          profile={profile}
          readiness={profileReadiness(profile)}
          statuses={appStatuses}
        />

        {copilotStatus === "enabled" ? (
          <CopilotDrawer
            open={isCopilotOpen}
            profile={profile}
            schools={addedSchools}
            onClose={() => setIsCopilotOpen(false)}
          />
        ) : null}

        <footer className="app-footer">
          <p>
            Admira gives you a clear chance read for every school, with the
            range and methodology always a click away.
          </p>
          <nav className="footer-links" aria-label="Admira policy links">
            <Link className="footer-link" href="/methodology">
              Methodology
            </Link>
            <Link className="footer-link" href="/privacy">
              Privacy
            </Link>
            <Link className="footer-link" href="/privacy#terms">
              Terms
            </Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}

function AppSidebar({
  view,
  profile,
  readiness,
  statuses,
}: {
  view: AdmiraView;
  profile: Profile;
  readiness: number;
  statuses: {
    listBuilder: "checking" | "enabled" | "disabled";
    studentsLikeYou: StudentsLikeYouStatus;
    climb: ClimbStatus;
    commandCenter: CommandCenterStatus;
    copilot: CopilotStatus;
    reports: ReportsStatus;
    narrative: NarrativeStatus;
    compass: CompassStatus;
    money: MoneyStatus;
    fitFinder: FitFinderStatus;
  };
}) {
  return (
    <aside className="sidebar" aria-label="Admira modules">
      <Link className="brand-mark sidebar-brand" href="/">
        <div className="brand-sigil" aria-hidden="true">
          A
        </div>
        <div className="brand-copy">
          <h1>Admira</h1>
          <p>your college chances</p>
        </div>
      </Link>

      <div className="nav-grp">Overview</div>
      <NavItem href="/dashboard" active={view === "dashboard"} icon={<BookOpen size={17} />}>
        Dashboard
      </NavItem>

      <div className="nav-grp">Build</div>
      <NavItem href="/start" active={view === "start"} icon={<GraduationCap size={17} />}>
        Profile Studio
      </NavItem>
      <NavItem href="/schools" active={view === "schools"} icon={<Search size={17} />}>
        School Universe
      </NavItem>
      {statuses.fitFinder === "enabled" ? (
        <NavItem href="/fit" active={view === "fit"} icon={<Compass size={17} />}>
          Fit Finder
        </NavItem>
      ) : null}
      {statuses.listBuilder === "enabled" ? (
        <NavItem href="/list" active={view === "list"} icon={<SlidersHorizontal size={17} />}>
          Smart List
        </NavItem>
      ) : null}

      <div className="nav-grp">Decide</div>
      {statuses.studentsLikeYou === "enabled" ? (
        <NavItem
          href="/students-like-you"
          active={view === "students-like-you"}
          icon={<CircleHelp size={17} />}
        >
          Students Like You
        </NavItem>
      ) : null}
      {statuses.climb === "enabled" ? (
        <NavItem href="/climb" active={view === "climb"} icon={<Target size={17} />}>
          Climb Roadmap
        </NavItem>
      ) : null}
      {statuses.commandCenter === "enabled" ? (
        <NavItem
          href="/command-center"
          active={view === "command-center"}
          icon={<ClipboardList size={17} />}
        >
          Command Center
        </NavItem>
      ) : null}

      <div className="nav-grp">Tell the story</div>
      {statuses.narrative === "enabled" ? (
        <NavItem href="/studio" active={false} icon={<FileText size={17} />}>
          Narrative Studio
        </NavItem>
      ) : null}
      {statuses.compass === "enabled" ? (
        <NavItem href="/compass" active={false} icon={<Compass size={17} />}>
          Major Compass
        </NavItem>
      ) : null}
      {statuses.reports === "enabled" ? (
        <NavItem href="/reports" active={view === "reports"} icon={<Share2 size={17} />}>
          Reports
        </NavItem>
      ) : null}
      <NavItem
        href="/money"
        active={view === "money"}
        icon={<FileText size={17} />}
        badge={statuses.money === "enabled" ? undefined : "Soon"}
      >
        Money
      </NavItem>

      <div className="nav-grp">Account</div>
      <NavItem href="/settings" active={view === "settings"} icon={<ShieldCheck size={17} />}>
        Account
      </NavItem>

      <Link className="profile-chip" href="/start">
        <div className="profile-avatar-mini" aria-hidden="true">
          {profile.intendedMajor.trim().charAt(0).toUpperCase() || "A"}
        </div>
        <div>
          <strong>Your profile</strong>
          <span className="mono">{readiness}% ready</span>
        </div>
      </Link>
    </aside>
  );
}

function NavItem({
  href,
  active,
  icon,
  badge,
  children,
  onNavigate,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  badge?: string;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      className="nav-item"
      data-active={active ? "true" : undefined}
      href={href}
      onClick={onNavigate}
    >
      {icon}
      <span>{children}</span>
      {badge ? <span className="nav-soon">{badge}</span> : null}
    </Link>
  );
}

// Mobile-only bottom tab bar (thumb-reachable) replacing the stacked sidebar.
// Tabs are the four IA groups plus a "More" sheet that lists every module.
function BottomTabBar({
  view,
  profile,
  readiness,
  statuses,
}: {
  view: AdmiraView;
  profile: Profile;
  readiness: number;
  statuses: {
    listBuilder: "checking" | "enabled" | "disabled";
    studentsLikeYou: StudentsLikeYouStatus;
    climb: ClimbStatus;
    commandCenter: CommandCenterStatus;
    copilot: CopilotStatus;
    reports: ReportsStatus;
    narrative: NarrativeStatus;
    compass: CompassStatus;
    money: MoneyStatus;
    fitFinder: FitFinderStatus;
  };
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!moreOpen) {
      return;
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setMoreOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const tabs: Array<{
    href: string;
    label: string;
    icon: ReactNode;
    active: boolean;
  }> = [
    {
      href: "/dashboard",
      label: "Overview",
      icon: <BookOpen size={20} />,
      active: view === "dashboard",
    },
    {
      href: "/schools",
      label: "Schools",
      icon: <Search size={20} />,
      active: view === "schools" || view === "start" || view === "fit",
    },
    {
      href: "/list",
      label: "List",
      icon: <SlidersHorizontal size={20} />,
      active:
        view === "list" || view === "students-like-you" || view === "climb" ||
        view === "command-center",
    },
    {
      href: "/studio",
      label: "Story",
      icon: <FileText size={20} />,
      active: view === "reports",
    },
  ];

  return (
    <>
      <nav className="bottom-tabs" aria-label="Primary">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            className="bottom-tab"
            href={tab.href}
            data-active={tab.active ? "true" : undefined}
            aria-current={tab.active ? "page" : undefined}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </Link>
        ))}
        <button
          type="button"
          className="bottom-tab"
          data-active={moreOpen ? "true" : undefined}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
        >
          <Menu size={20} />
          <span>More</span>
        </button>
      </nav>

      {moreOpen ? (
        <div className="more-sheet-layer" role="presentation">
          <button
            type="button"
            className="more-sheet-scrim"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
          />
          <div className="more-sheet" role="dialog" aria-label="All modules" aria-modal="true">
            <div className="more-sheet-handle" aria-hidden="true" />
            <Link
              className="profile-chip more-sheet-profile"
              href="/start"
              onClick={() => setMoreOpen(false)}
            >
              <div className="profile-avatar-mini" aria-hidden="true">
                {profile.intendedMajor.trim().charAt(0).toUpperCase() || "A"}
              </div>
              <div>
                <strong>Your profile</strong>
                <span className="mono">{readiness}% ready</span>
              </div>
            </Link>
            <div className="more-sheet-nav">
              <div className="nav-grp">Overview</div>
              <NavItem
                href="/dashboard"
                active={view === "dashboard"}
                icon={<BookOpen size={17} />}
                onNavigate={() => setMoreOpen(false)}
              >
                Dashboard
              </NavItem>
              <div className="nav-grp">Build</div>
              <NavItem href="/start" active={view === "start"} icon={<GraduationCap size={17} />} onNavigate={() => setMoreOpen(false)}>
                Profile Studio
              </NavItem>
              <NavItem href="/schools" active={view === "schools"} icon={<Search size={17} />} onNavigate={() => setMoreOpen(false)}>
                School Universe
              </NavItem>
              {statuses.fitFinder === "enabled" ? (
                <NavItem href="/fit" active={view === "fit"} icon={<Compass size={17} />} onNavigate={() => setMoreOpen(false)}>
                  Fit Finder
                </NavItem>
              ) : null}
              {statuses.listBuilder === "enabled" ? (
                <NavItem href="/list" active={view === "list"} icon={<SlidersHorizontal size={17} />} onNavigate={() => setMoreOpen(false)}>
                  Smart List
                </NavItem>
              ) : null}
              <div className="nav-grp">Decide</div>
              {statuses.studentsLikeYou === "enabled" ? (
                <NavItem href="/students-like-you" active={view === "students-like-you"} icon={<CircleHelp size={17} />} onNavigate={() => setMoreOpen(false)}>
                  Students Like You
                </NavItem>
              ) : null}
              {statuses.climb === "enabled" ? (
                <NavItem href="/climb" active={view === "climb"} icon={<Target size={17} />} onNavigate={() => setMoreOpen(false)}>
                  Climb Roadmap
                </NavItem>
              ) : null}
              {statuses.commandCenter === "enabled" ? (
                <NavItem href="/command-center" active={view === "command-center"} icon={<ClipboardList size={17} />} onNavigate={() => setMoreOpen(false)}>
                  Command Center
                </NavItem>
              ) : null}
              <div className="nav-grp">Tell the story</div>
              {statuses.narrative === "enabled" ? (
                <NavItem href="/studio" active={false} icon={<FileText size={17} />} onNavigate={() => setMoreOpen(false)}>
                  Narrative Studio
                </NavItem>
              ) : null}
              {statuses.compass === "enabled" ? (
                <NavItem href="/compass" active={false} icon={<Compass size={17} />} onNavigate={() => setMoreOpen(false)}>
                  Major Compass
                </NavItem>
              ) : null}
              {statuses.reports === "enabled" ? (
                <NavItem href="/reports" active={view === "reports"} icon={<Share2 size={17} />} onNavigate={() => setMoreOpen(false)}>
                  Reports
                </NavItem>
              ) : null}
              <NavItem
                href="/money"
                active={view === "money"}
                icon={<FileText size={17} />}
                badge={statuses.money === "enabled" ? undefined : "Soon"}
                onNavigate={() => setMoreOpen(false)}
              >
                Money
              </NavItem>
              <div className="nav-grp">Account</div>
              <NavItem href="/settings" active={view === "settings"} icon={<ShieldCheck size={17} />} onNavigate={() => setMoreOpen(false)}>
                Account
              </NavItem>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function RouteHero({
  meta,
  view,
  readySchools,
}: {
  meta: (typeof viewMeta)[AdmiraView];
  view: AdmiraView;
  readySchools: number;
}) {
  return (
    <section className="route-hero" data-view={view}>
      <div>
        <div className="section-kicker">{meta.kicker}</div>
        <h2 className="route-title">{meta.title}</h2>
        <p className="helper route-intro">{meta.intro}</p>
      </div>
      <div className="route-profile-chip">
        <span className="micro-label">Schools scored</span>
        <strong className="mono">{readySchools}</strong>
      </div>
    </section>
  );
}

function RouteBody({
  view,
  profile,
  setProfile,
  profileErrors,
  formNotice,
  noAcademicInput,
  admitIntelligenceEnabled,
  fitFinderStatus,
  listBuilderStatus,
  studentsLikeYouStatus,
  climbStatus,
  commandCenterStatus,
  reportsStatus,
  moneyStatus,
  schoolQuery,
  setSchoolQuery,
  schoolResults,
  schoolSearchStatus,
  schoolSearchError,
  addedSchools,
  readyBalanceLabels,
  onAddSchool,
  onRemoveSchool,
  onRecalculate,
  onStartSaved,
}: {
  view: AdmiraView;
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
  profileErrors: string[];
  formNotice: string;
  noAcademicInput: boolean;
  admitIntelligenceEnabled: boolean;
  fitFinderStatus: FitFinderStatus;
  listBuilderStatus: "checking" | "enabled" | "disabled";
  studentsLikeYouStatus: StudentsLikeYouStatus;
  climbStatus: ClimbStatus;
  commandCenterStatus: CommandCenterStatus;
  reportsStatus: ReportsStatus;
  moneyStatus: MoneyStatus;
  schoolQuery: string;
  setSchoolQuery: Dispatch<SetStateAction<string>>;
  schoolResults: SchoolSearchRow[];
  schoolSearchStatus: "idle" | "loading" | "ready" | "error";
  schoolSearchError: string;
  addedSchools: AddedSchool[];
  readyBalanceLabels: BandLabel[];
  onAddSchool: (school: SchoolSearchRow) => void;
  onRemoveSchool: (unitid: number) => void;
  onRecalculate: () => void;
  onStartSaved: () => void;
}) {
  if (view === "start") {
    return (
      <div className="route-grid">
        <ProfilePanel
          profile={profile}
          setProfile={setProfile}
          errors={profileErrors}
          notice={formNotice}
          noAcademicInput={noAcademicInput}
          admitIntelligenceEnabled={admitIntelligenceEnabled}
          onSave={onRecalculate}
          onSaved={onStartSaved}
        />
        <ProfileGateCard />
      </div>
    );
  }

  if (view === "dashboard") {
    return (
      <DashboardHome
        profile={profile}
        addedSchools={addedSchools}
        balanceLabels={readyBalanceLabels}
        statuses={{
          listBuilder: listBuilderStatus,
          studentsLikeYou: studentsLikeYouStatus,
          climb: climbStatus,
          commandCenter: commandCenterStatus,
          reports: reportsStatus,
        }}
      />
    );
  }

  if (view === "schools") {
    return (
      <div className="route-stack">
        <ProfileSpine profile={profile} setProfile={setProfile} />
        <SchoolSearchPanel
          query={schoolQuery}
          setQuery={setSchoolQuery}
          results={schoolResults}
          status={schoolSearchStatus}
          error={schoolSearchError}
          onAdd={onAddSchool}
          addedUnitids={addedSchools.map((entry) => entry.school.unitid)}
        />
        <SchoolReadsSection
          addedSchools={addedSchools}
          profile={profile}
          onRemoveSchool={onRemoveSchool}
          onRecalculate={onRecalculate}
          onPick={setSchoolQuery}
        />
        {readyBalanceLabels.length > 0 ? (
          <BalancePanel labels={readyBalanceLabels} />
        ) : null}
      </div>
    );
  }

  if (view === "fit") {
    return fitFinderStatus === "enabled" ? (
      <div className="route-stack">
        <ProfileSpine profile={profile} setProfile={setProfile} />
        <FitFinderPanel
          profile={profile}
          setProfile={setProfile}
          profileErrors={profileErrors}
          profileReady={hasProfileForFit(profile)}
          onAddSchool={onAddSchool}
          addedUnitids={addedSchools.map((entry) => entry.school.unitid)}
        />
      </div>
    ) : (
      <FeatureUnavailable label="Fit Finder" />
    );
  }

  if (view === "settings") {
    return (
      <OutcomeSessionProvider>
        <div className="route-stack">
          <OutcomeCapturePanel />
          <OutcomeDataControlsPanel />
        </div>
      </OutcomeSessionProvider>
    );
  }

  if (view === "list") {
    return listBuilderStatus === "enabled" ? (
      <ListBuilderPanel profile={profile} setProfile={setProfile} />
    ) : (
      <FeatureUnavailable label="Smart List Builder" />
    );
  }

  if (view === "students-like-you") {
    return studentsLikeYouStatus === "enabled" ? (
      <StudentsLikeYouPanel profile={profile} />
    ) : (
      <FeatureUnavailable label="Students-Like-You" />
    );
  }

  if (view === "climb") {
    return climbStatus === "enabled" ? (
      <ClimbRoadmapPanel profile={profile} schools={addedSchools} />
    ) : (
      <FeatureUnavailable label="Climb Roadmap" />
    );
  }

  if (view === "command-center") {
    return commandCenterStatus === "enabled" ? (
      <CommandCenterPanel schools={addedSchools} />
    ) : (
      <FeatureUnavailable label="Command Center" />
    );
  }

  if (view === "reports") {
    return reportsStatus === "enabled" ? (
      <ReportsPanel profile={profile} schools={addedSchools} />
    ) : (
      <FeatureUnavailable label="Reports" />
    );
  }

  if (view === "money") {
    return moneyStatus === "enabled" ? (
      <MoneyPanel profile={profile} schools={addedSchools} />
    ) : (
      <FeatureUnavailable label="Money" />
    );
  }

  return <FeatureUnavailable label="Module" />;
}

function ProfileGateCard() {
  return (
    <section className="route-card profile-gate-card">
      <div className="section-kicker">Set it once</div>
      <h3 className="section-title">One profile, every page.</h3>
      <p className="helper">
        Enter your grades and scores here once. Your school chances, college
        list, improvement plan, and reports all use the same profile, so you
        never have to type it again.
      </p>
      <div className="phase5-empty">
        <Check size={18} aria-hidden="true" />
        <span>Only you can see your profile. Your inputs never train our model.</span>
      </div>
    </section>
  );
}

type SpineField = "gpa" | "test" | "round" | "major";

function ProfileSpine({
  profile,
  setProfile,
}: {
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
}) {
  const ready = profileReadiness(profile);
  const [editing, setEditing] = useState<SpineField | null>(null);

  // Inline edits write straight to the shared profile context; the context's
  // own effect persists them (the same save path /start uses). No new endpoint.
  function update(key: keyof Profile, value: string | boolean) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  const testLabel = profile.notSubmittingTests
    ? "Test-optional"
    : [
        profile.sat.trim() ? `SAT ${profile.sat.trim()}` : "",
        profile.act.trim() ? `ACT ${profile.act.trim()}` : "",
      ]
        .filter(Boolean)
        .join(" / ") || "No score";

  return (
    <section className="route-card profile-spine" data-testid="profile-spine">
      <div className="profile-avatar-mini" aria-hidden="true">
        {profile.intendedMajor.trim().charAt(0).toUpperCase() || "A"}
      </div>
      <div className="profile-spine-copy">
        <span className="micro-label">Your profile</span>
        <div className="profile-spine-chips" aria-label="Your profile">
          <SpineChip
            field="gpa"
            display={`GPA ${profile.gpa || "not set"}`}
            open={editing === "gpa"}
            onOpen={() => setEditing("gpa")}
            onClose={() => setEditing(null)}
          >
            <input
              className="spine-input mono"
              aria-label="GPA"
              inputMode="decimal"
              autoFocus
              value={profile.gpa}
              onChange={(event) => update("gpa", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Escape") setEditing(null);
              }}
              onBlur={() => setEditing(null)}
            />
          </SpineChip>
          <SpineChip
            field="test"
            display={testLabel}
            open={editing === "test"}
            onOpen={() => setEditing("test")}
            onClose={() => setEditing(null)}
          >
            <input
              className="spine-input mono"
              aria-label="SAT"
              inputMode="numeric"
              autoFocus
              disabled={profile.notSubmittingTests}
              value={profile.sat}
              onChange={(event) => update("sat", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Escape") setEditing(null);
              }}
              onBlur={() => setEditing(null)}
            />
          </SpineChip>
          <SpineChip
            field="round"
            display={profile.applicationRound === "early" ? "Early round" : "Regular round"}
            open={editing === "round"}
            onOpen={() => setEditing("round")}
            onClose={() => setEditing(null)}
          >
            <div className="segmented spine-segmented" role="group" aria-label="Application round">
              <button
                type="button"
                data-active={profile.applicationRound === "regular"}
                onClick={() => {
                  update("applicationRound", "regular");
                  setEditing(null);
                }}
              >
                Regular
              </button>
              <button
                type="button"
                data-active={profile.applicationRound === "early"}
                onClick={() => {
                  update("applicationRound", "early");
                  setEditing(null);
                }}
              >
                Early
              </button>
            </div>
          </SpineChip>
          <SpineChip
            field="major"
            display={profile.intendedMajor.trim() || "Major undecided"}
            open={editing === "major"}
            onOpen={() => setEditing("major")}
            onClose={() => setEditing(null)}
          >
            <input
              className="spine-input"
              aria-label="Intended major"
              autoFocus
              value={profile.intendedMajor}
              onChange={(event) => update("intendedMajor", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Escape") setEditing(null);
              }}
              onBlur={() => setEditing(null)}
            />
          </SpineChip>
        </div>
      </div>
      <div className="profile-spine-actions">
        <span className="mono profile-spine-ready">{ready}% ready</span>
        <Link className="profile-edit" href="/start">
          Full editor
        </Link>
      </div>
    </section>
  );
}

function SpineChip({
  field,
  display,
  open,
  onOpen,
  onClose,
  children,
}: {
  field: SpineField;
  display: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  if (open) {
    return (
      <div className="spine-chip-editor" data-field={field}>
        {children}
        <button
          type="button"
          className="spine-chip-done"
          aria-label="Done"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClose}
        >
          <Check size={13} />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="spine-chip"
      data-field={field}
      data-testid={`spine-chip-${field}`}
      onClick={onOpen}
    >
      {display}
    </button>
  );
}

function DashboardHome({
  profile,
  addedSchools,
  balanceLabels,
  statuses,
}: {
  profile: Profile;
  addedSchools: AddedSchool[];
  balanceLabels: BandLabel[];
  statuses: {
    listBuilder: "checking" | "enabled" | "disabled";
    studentsLikeYou: StudentsLikeYouStatus;
    climb: ClimbStatus;
    commandCenter: CommandCenterStatus;
    reports: ReportsStatus;
  };
}) {
  const primary = addedSchools.find((entry) => entry.status === "ready") ?? null;
  const [firstReadStatus, setFirstReadStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [firstRead, setFirstRead] = useState<ListBuilderResponse | null>(null);
  const [firstReadError, setFirstReadError] = useState("");
  const canFirstRead =
    !primary &&
    statuses.listBuilder === "enabled" &&
    profileReadiness(profile) >= 50;

  // One-click first read: reuse the EXISTING Smart List endpoint for the saved
  // profile. Every school + number rendered comes from this output — nothing is
  // hardcoded. An empty result shows the honest empty state.
  async function loadFirstRead() {
    setFirstReadStatus("loading");
    setFirstReadError("");
    try {
      const response = await fetch("/api/list/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            sat_score: profile.notSubmittingTests
              ? undefined
              : numberOrUndefined(profile.sat),
            act_score: profile.notSubmittingTests
              ? undefined
              : numberOrUndefined(profile.act),
            gpa: numberOrUndefined(profile.gpa),
            application_round: profile.applicationRound,
          },
          preferences: {
            intended_major: profile.intendedMajor || undefined,
            shape: initialShape,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not build your first read.");
      }
      setFirstRead(payload as ListBuilderResponse);
      setFirstReadStatus("ready");
    } catch (error) {
      setFirstReadError(
        error instanceof Error ? error.message : "Could not build your first read.",
      );
      setFirstReadStatus("error");
    }
  }

  const firstReadPicks = firstRead ? pickFirstReadTriplet(firstRead.list) : [];

  return (
    <div className="dashboard-grid">
      <section className="split-verdict-card">
        <div className="verdict-rail">
          <span className="section-kicker">Top read</span>
          {primary ? (
            <>
              <p className="dashboard-topread-school">{primary.school.name}</p>
              <VerdictBlock
                tone={dashboardVerdictTone(primary)}
                chipLabel={dashboardVerdictChip(primary)}
                headline={schoolVerdictLine(primary)}
                metric={schoolVerdictMetric(primary)}
              />
              {dashboardRange(primary) ? (
                <RangeBar
                  low={dashboardRange(primary)!.low}
                  high={dashboardRange(primary)!.high}
                  point={dashboardRange(primary)!.point}
                  label={`${primary.school.name} chance range`}
                />
              ) : null}
              <Link className="add-button split-cta" href="/schools">
                View full read
              </Link>
            </>
          ) : canFirstRead ? (
            <>
              <h3>Ready for your first read?</h3>
              <p>
                We&apos;ll build a starter reach / target / safety spread from your
                profile in one tap.
              </p>
              <button
                type="button"
                className="add-button split-cta"
                onClick={loadFirstRead}
                disabled={firstReadStatus === "loading"}
                data-testid="first-read-run"
              >
                {firstReadStatus === "loading" ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                See your first read
              </button>
              {firstReadStatus === "error" ? (
                <p className="error-copy" role="alert">
                  {firstReadError}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <h3>Add a school to see your chances.</h3>
              <p>Search any school and we&apos;ll show your chance range from your profile.</p>
              <Link className="add-button split-cta" href="/schools">
                Find schools
              </Link>
            </>
          )}
        </div>
        <div className="verdict-data-surface">
          {firstReadStatus === "ready" ? (
            firstReadPicks.length > 0 ? (
              <div data-testid="first-read">
                <div className="section-kicker">Your first read</div>
                <h3 className="section-title">A starter spread.</h3>
                <ul className="first-read-list">
                  {firstReadPicks.map((pick) => (
                    <FirstReadRow key={pick.unitid} pick={pick} />
                  ))}
                </ul>
                <Link className="method-link" href="/list">
                  Open Smart List →
                </Link>
              </div>
            ) : (
              <div className="empty" data-testid="first-read-empty">
                <div className="section-kicker">Your first read</div>
                <p className="helper">
                  No schools matched this profile yet. Add a school by name to get
                  your first chance read.
                </p>
                <Link className="add-button route-card-action" href="/schools">
                  Find schools
                </Link>
              </div>
            )
          ) : (
            <>
              <div className="section-kicker">Your profile</div>
              <h3 className="section-title">{profile.intendedMajor || "Major undecided"}</h3>
              <ul className="profile-chip-row" aria-label="Your profile">
                {profileSummaryItems(profile).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {balanceLabels.length > 0 ? (
                <BalancePanel labels={balanceLabels} />
              ) : (
                <p className="helper">
                  Your list balance appears once at least one school has a chance read.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <DashboardLinkCard
        href="/list"
        eyebrow="Build"
        title="Smart List"
        enabled={statuses.listBuilder === "enabled"}
      />
      <DashboardLinkCard
        href="/students-like-you"
        eyebrow="Decide"
        title="Students Like You"
        enabled={statuses.studentsLikeYou === "enabled"}
      />
      <DashboardLinkCard
        href="/climb"
        eyebrow="Improve"
        title="Climb Roadmap"
        enabled={statuses.climb === "enabled"}
      />
      <DashboardLinkCard
        href="/command-center"
        eyebrow="Execute"
        title="Command Center"
        enabled={statuses.commandCenter === "enabled"}
      />
      <DashboardLinkCard
        href="/reports"
        eyebrow="Package"
        title="Reports"
        enabled={statuses.reports === "enabled"}
      />
    </div>
  );
}

// Pick up to one school per bucket (reach → target → safety) from the Smart List
// output for the first-read spread. Falls back to the first rows if the buckets
// are lopsided. Never invents a school — only reorders the real list.
function pickFirstReadTriplet(list: ListSchoolView[]): ListSchoolView[] {
  const order: ListBucket[] = ["reach", "target", "safety"];
  const picks: ListSchoolView[] = [];
  for (const bucket of order) {
    const match = list.find((school) => school.bucket === bucket);
    if (match) {
      picks.push(match);
    }
  }
  if (picks.length === 0) {
    return list.slice(0, 3);
  }
  return picks;
}

function FirstReadRow({ pick }: { pick: ListSchoolView }) {
  return (
    <li className="first-read-row">
      <span className="label-pill tier-pill" data-tier={pick.bucket}>
        {pick.bucket.charAt(0).toUpperCase() + pick.bucket.slice(1)}
      </span>
      <div className="first-read-row-copy">
        <strong>{pick.name}</strong>
        <span className="helper">{pick.rationale}</span>
      </div>
      {pick.fit !== null ? (
        <span className="mono first-read-fit">FIT {pick.fit}</span>
      ) : null}
    </li>
  );
}

function DashboardLinkCard({
  href,
  eyebrow,
  title,
  enabled,
}: {
  href: string;
  eyebrow: string;
  title: string;
  enabled: boolean;
}) {
  return (
    <Link
      className="route-card dashboard-link-card"
      href={enabled ? href : "/dashboard"}
      aria-disabled={!enabled}
    >
      <span className="section-kicker">{eyebrow}</span>
      <strong>{title}</strong>
      <span className="helper">
        {enabled ? "Open" : "Coming soon"}
      </span>
    </Link>
  );
}

function SchoolReadsSection({
  addedSchools,
  profile,
  onRemoveSchool,
  onRecalculate,
  onPick,
}: {
  addedSchools: AddedSchool[];
  profile: Profile;
  onRemoveSchool: (unitid: number) => void;
  onRecalculate: () => void;
  onPick: Dispatch<SetStateAction<string>>;
}) {
  if (addedSchools.length === 0) {
    return <EmptyState onPick={onPick} />;
  }

  return (
    <>
      <div className="results-head">
        <div>
          <div className="section-kicker">Your schools</div>
          <h2 className="section-title">Your chances, school by school.</h2>
        </div>
        <span className="results-count mono">
          {addedSchools.length} added &middot; sorted by odds
        </span>
      </div>
      {addedSchools.map((entry) => (
        <ResultState
          key={entry.school.unitid}
          entry={entry}
          profile={profile}
          onRemove={() => onRemoveSchool(entry.school.unitid)}
        />
      ))}
      <button
        className="recalc-button"
        type="button"
        onClick={onRecalculate}
        disabled={addedSchools.some((entry) => entry.status === "loading")}
      >
        <RefreshCw size={16} />
        Recalculate list
      </button>
    </>
  );
}

function FeatureUnavailable({ label }: { label: string }) {
  return (
    <section className="route-card" data-testid="route-disabled">
      <div className="section-kicker">Coming soon</div>
      <h3 className="section-title">{label} isn&apos;t available yet.</h3>
      <p className="helper">
        We&apos;re still polishing this one. Check back soon — your profile and
        schools will be ready when it opens.
      </p>
      <Link className="add-button route-card-action" href="/dashboard">
        Back to dashboard
      </Link>
    </section>
  );
}

function defaultMoneyResidency(school: SchoolSearchRow): MoneyResidency {
  return school.country === "CA" ? "domestic" : "out_of_state";
}

function formatMoneyFigure(
  figure: MoneyPlan["figures"]["true_net_price"],
  fallbackCurrency: "USD" | "CAD",
) {
  if (figure.value === null) {
    return "N/A";
  }
  const currency = figure.currency ?? fallbackCurrency;
  const prefix = currency === "CAD" ? "C$" : "$";
  return `${prefix}${Math.round(figure.value).toLocaleString("en-US")}`;
}

function formatBasis(basis: "verified" | "estimate") {
  return basis === "verified" ? "verified" : "estimate";
}

function MoneyBasisBadge({
  figure,
}: {
  figure: MoneyPlan["figures"]["true_net_price"];
}) {
  return (
    <a
      className="money-basis"
      data-basis={figure.basis}
      href={figure.source_url}
      target="_blank"
      rel="noreferrer"
    >
      {formatBasis(figure.basis)}
    </a>
  );
}

function MoneyPanel({ profile, schools }: { profile: Profile; schools: AddedSchool[] }) {
  const readySchools = useMemo(
    () => schools.filter((entry) => entry.status === "ready"),
    [schools],
  );
  const [selectedUnitid, setSelectedUnitid] = useState<number | null>(null);
  const [incomeBand, setIncomeBand] = useState<MoneyIncomeBand>("overall");
  const [residency, setResidency] = useState<MoneyResidency>("out_of_state");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [plan, setPlan] = useState<MoneyPlan | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (readySchools.length === 0) {
      setSelectedUnitid(null);
      setPlan(null);
      setStatus("idle");
      return;
    }
    if (!readySchools.some((entry) => entry.school.unitid === selectedUnitid)) {
      setSelectedUnitid(readySchools[0].school.unitid);
    }
  }, [readySchools, selectedUnitid]);

  const selectedSchool = readySchools.find(
    (entry) => entry.school.unitid === selectedUnitid,
  )?.school;
  const moneyProfile = useMemo(
    () => ({
      gpa: numberOrUndefined(profile.gpa),
      sat_score: profile.notSubmittingTests
        ? undefined
        : numberOrUndefined(profile.sat),
      act_score: profile.notSubmittingTests
        ? undefined
        : numberOrUndefined(profile.act),
      canadian_average: numberOrUndefined(profile.canadianAverage),
    }),
    [
      profile.gpa,
      profile.sat,
      profile.act,
      profile.notSubmittingTests,
      profile.canadianAverage,
    ],
  );

  useEffect(() => {
    if (!selectedSchool) {
      return;
    }
    setResidency(defaultMoneyResidency(selectedSchool));
    if (selectedSchool.country === "CA") {
      setIncomeBand("overall");
    }
  }, [selectedSchool]);

  useEffect(() => {
    if (!selectedSchool) {
      return;
    }

    let active = true;

    async function loadMoney() {
      setStatus("loading");
      setError("");
      try {
        const response = await fetch("/api/money", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unitid: selectedSchool!.unitid,
            income_band: selectedSchool!.country === "CA" ? "overall" : incomeBand,
            residency,
            profile: moneyProfile,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error ?? "Money request failed.");
        }
        if (active) {
          setPlan(payload as MoneyPlan);
          setStatus("ready");
        }
      } catch (caught) {
        if (active) {
          setPlan(null);
          setStatus("error");
          setError(caught instanceof Error ? caught.message : "Money request failed.");
        }
      }
    }

    void loadMoney();
    return () => {
      active = false;
    };
  }, [
    selectedSchool,
    incomeBand,
    residency,
    moneyProfile,
  ]);

  if (readySchools.length === 0) {
    return (
      <section className="route-card money-panel" data-testid="money-panel">
        <div className="section-kicker">Money</div>
        <h3 className="section-title">Add a school to price it out.</h3>
        <p className="helper">
          Money uses the schools you have already scored, then reloads sourced
          cost and scholarship rows on the server.
        </p>
        <Link className="add-button route-card-action" href="/schools">
          Find schools
        </Link>
      </section>
    );
  }

  return (
    <section className="route-card money-panel" data-testid="money-panel">
      <div className="money-panel-head">
        <div>
          <div className="section-kicker">Money</div>
          <h3 className="section-title">Net price and payoff.</h3>
        </div>
        {status === "loading" ? <Loader2 className="spin" size={18} /> : null}
      </div>

      <div className="money-controls" aria-label="Money controls">
        <div className="money-control-group">
          <span className="micro-label">School</span>
          <div className="money-button-row">
            {readySchools.map((entry) => (
              <button
                key={entry.school.unitid}
                type="button"
                className="money-choice"
                data-active={entry.school.unitid === selectedUnitid}
                onClick={() => {
                  setSelectedUnitid(entry.school.unitid);
                  setResidency(defaultMoneyResidency(entry.school));
                  if (entry.school.country === "CA") {
                    setIncomeBand("overall");
                  }
                }}
                data-testid="money-school"
              >
                {entry.school.name}
              </button>
            ))}
          </div>
        </div>

        {selectedSchool?.country === "US" ? (
          <div className="money-control-group">
            <span className="micro-label">Income band</span>
            <div className="money-band-grid">
              {moneyIncomeBands.map((band) => (
                <button
                  key={band.value}
                  type="button"
                  className="money-choice"
                  data-active={incomeBand === band.value}
                  onClick={() => setIncomeBand(band.value)}
                  data-testid="money-income-band"
                >
                  {band.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="money-control-group">
          <span className="micro-label">Residency</span>
          <div className="money-button-row">
            {(selectedSchool?.country === "CA"
              ? [{ value: "domestic" as const, label: "Domestic" }]
              : [
                  { value: "out_of_state" as const, label: "Out of state" },
                  { value: "in_state" as const, label: "In state" },
                ]
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                className="money-choice"
                data-active={residency === option.value}
                onClick={() => setResidency(option.value)}
                data-testid="money-residency"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {status === "error" ? (
        <div className="phase5-empty money-error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {plan ? <MoneyPlanView plan={plan} /> : null}
    </section>
  );
}

function MoneyPlanView({ plan }: { plan: MoneyPlan }) {
  const figures = plan.figures;
  return (
    <div className="money-result" data-testid="money-result">
      <div className="money-hero-price">
        <span className="micro-label">Net price</span>
        <strong className="mono" data-testid="money-net-price">
          {formatMoneyFigure(figures.true_net_price, plan.currency)}
        </strong>
        <MoneyBasisBadge figure={figures.true_net_price} />
      </div>

      <div className="money-formula" aria-label="Net price formula">
        <MoneyFormulaRow label="Sticker" figure={figures.sticker_price} currency={plan.currency} />
        <MoneyFormulaRow label="Need aid" figure={figures.need_aid} currency={plan.currency} />
        <MoneyFormulaRow label="Merit" figure={figures.merit} currency={plan.currency} testId="money-merit" />
        <MoneyFormulaRow label="Net" figure={figures.true_net_price} currency={plan.currency} />
      </div>

      <div className="money-roi-grid" data-testid="money-roi">
        <div className="money-metric">
          <span>4-year net cost</span>
          <strong className="mono">
            {formatMoneyFigure(figures.four_year_net_cost, plan.currency)}
          </strong>
          <MoneyBasisBadge figure={figures.four_year_net_cost} />
        </div>
        <div className="money-metric">
          <span>Gross payback</span>
          <strong className="mono">
            {figures.payback_years.value === null
              ? "N/A"
              : `${figures.payback_years.value} yrs`}
          </strong>
          <MoneyBasisBadge figure={figures.payback_years} />
        </div>
        <div className="money-metric">
          <span>10-year earnings</span>
          <strong className="mono">
            {formatMoneyFigure(figures.median_earnings_10yr, plan.currency)}
          </strong>
          <MoneyBasisBadge figure={figures.median_earnings_10yr} />
        </div>
      </div>

      <div className="money-merit-note">
        {plan.merit.matched ? (
          <>
            <Check size={16} aria-hidden="true" />
            <span>
              {plan.merit.scholarship_name} matched from the published merit table.
            </span>
          </>
        ) : (
          <>
            <CircleHelp size={16} aria-hidden="true" />
            <span>No published automatic merit rule matched this profile.</span>
          </>
        )}
      </div>

      <div className="money-sources">
        <span className="micro-label">Sources</span>
        <div>
          {plan.sources.map((source) => (
            <a key={source} href={source} target="_blank" rel="noreferrer">
              Source
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function MoneyFormulaRow({
  label,
  figure,
  currency,
  testId,
}: {
  label: string;
  figure: MoneyPlan["figures"]["true_net_price"];
  currency: "USD" | "CAD";
  testId?: string;
}) {
  return (
    <div className="money-formula-row" data-testid={testId}>
      <span>{label}</span>
      <strong className="mono">{formatMoneyFigure(figure, currency)}</strong>
      <MoneyBasisBadge figure={figure} />
    </div>
  );
}

function CopilotDrawer({
  open,
  profile,
  schools,
  onClose,
}: {
  open: boolean;
  profile: Profile;
  schools: AddedSchool[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className="copilot-layer" data-open={open ? "true" : undefined}>
      <button
        className="copilot-scrim"
        type="button"
        aria-label="Close Copilot"
        onClick={onClose}
      />
      <aside className="copilot-drawer" aria-hidden={!open}>
        <div className="copilot-drawer-head">
          <div>
            <div className="section-kicker">Copilot</div>
            <h3 className="section-title">Ask about your plan.</h3>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <CopilotPanel profile={profile} schools={schools} />
      </aside>
    </div>
  );
}

function schoolVerdictLine(entry: AddedSchool) {
  if (entry.intelligence) {
    return `${entry.intelligence.tier} school for you.`;
  }
  if (entry.result) {
    return `${formatBandLabel(entry.result.band.label)} school for you.`;
  }
  return "Working on your read.";
}

function schoolVerdictMetric(entry: AddedSchool) {
  if (entry.intelligence) {
    return `${entry.intelligence.score}/100`;
  }
  if (entry.result) {
    return formatChanceRange(entry.result.probability.low, entry.result.probability.high);
  }
  return "Pending";
}

function dashboardVerdictTone(entry: AddedSchool) {
  if (entry.intelligence) {
    return entry.intelligence.tier.toLowerCase();
  }
  if (entry.result) {
    return entry.result.band.label;
  }
  return "target";
}

function dashboardVerdictChip(entry: AddedSchool) {
  if (entry.intelligence) {
    return formatAdmitTier(entry.intelligence.tier);
  }
  if (entry.result) {
    return formatBandLabel(entry.result.band.label);
  }
  return "Pending";
}

function dashboardRange(
  entry: AddedSchool,
): { low: number; high: number; point: number } | null {
  if (
    entry.intelligence &&
    typeof entry.intelligence.probability.low === "number" &&
    typeof entry.intelligence.probability.high === "number"
  ) {
    return {
      low: entry.intelligence.probability.low,
      high: entry.intelligence.probability.high,
      point: entry.intelligence.probability.calibrated,
    };
  }
  if (entry.result) {
    return {
      low: entry.result.probability.low,
      high: entry.result.probability.high,
      point: entry.result.probability.calibrated,
    };
  }
  return null;
}

function profileReadiness(profile: Profile) {
  const signals = [
    Boolean(numberOrUndefined(profile.gpa)),
    profile.notSubmittingTests ||
      Boolean(numberOrUndefined(profile.sat)) ||
      Boolean(numberOrUndefined(profile.act)),
    profile.homeState.trim().length > 0,
    profile.intendedMajor.trim().length > 0 &&
      profile.intendedMajor.trim().toLowerCase() !== "undecided",
  ];
  const filled = signals.filter(Boolean).length;
  return Math.round((filled / signals.length) * 100);
}

function profileSummaryItems(profile: Profile) {
  const test =
    profile.notSubmittingTests
      ? "Test optional"
      : [
          profile.sat.trim() ? `SAT ${profile.sat.trim()}` : "",
          profile.act.trim() ? `ACT ${profile.act.trim()}` : "",
        ]
          .filter(Boolean)
          .join(" / ") || "No test score";

  return [
    `GPA ${profile.gpa || "not set"}`,
    test,
    profile.applicationRound === "early" ? "Early round" : "Regular round",
    profile.intendedMajor.trim() || "Major undecided",
  ];
}

function ProfilePanel({
  profile,
  setProfile,
  errors,
  notice,
  noAcademicInput,
  admitIntelligenceEnabled,
  onSave,
  onSaved,
}: {
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
  errors: string[];
  notice: string;
  noAcademicInput: boolean;
  admitIntelligenceEnabled: boolean;
  onSave: () => void;
  onSaved?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attemptedSave, setAttemptedSave] = useState(false);
  // Canada fields stay hidden until the student opts in, so US-only applicants
  // are not puzzled. (The profile keeps any Canadian values behind the toggle.)
  const [applyingCanada, setApplyingCanada] = useState(false);

  function update(key: keyof Profile, value: string | boolean) {
    setIsEditing(true);
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function markTouched(field: string) {
    setTouched((current) => {
      if (current.has(field)) {
        return current;
      }
      const next = new Set(current);
      next.add(field);
      return next;
    });
  }

  const readiness = profileReadiness(profile);
  const fieldErrors = profileFieldErrors(profile);
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  const isComplete = readiness === 100 && errors.length === 0 && !hasFieldErrors;
  const showSummary = isComplete && !isEditing;

  // Validation surfaces on blur (or after a save attempt), never on every
  // keystroke; the entered value is always preserved.
  function fieldErrorFor(field: string): string | undefined {
    const message = (fieldErrors as Record<string, string>)[field];
    if (!message) {
      return undefined;
    }
    return touched.has(field) || attemptedSave ? message : undefined;
  }

  function handleSave() {
    setAttemptedSave(true);
    onSave();
    if (errors.length === 0 && !hasFieldErrors) {
      setIsEditing(false);
      onSaved?.();
    }
  }

  return (
    <section className="profile-card" id="student-profile">
      <div className="panel-inner">
        <div className="profile-rail-head">
          <div className="profile-avatar" aria-hidden="true">
            <GraduationCap size={20} />
          </div>
          <div className="profile-rail-copy">
            <div className="section-kicker">Your profile</div>
            <h2 className="section-title">Academic evidence</h2>
          </div>
        </div>
        <div className="profile-meter" aria-hidden="true">
          <div className="profile-meter-head">
            <span className="micro-label">Profile</span>
            <span className="profile-ready">{readiness}% ready</span>
          </div>
          <div className="profile-meter-track">
            <span style={{ width: `${readiness}%` }} />
          </div>
        </div>
        <p className="helper profile-rail-hint">
          The more you add, the tighter your chance ranges.
        </p>
        {showSummary ? (
          <div className="profile-summary-card" data-testid="profile-summary">
            <div className="profile-summary-head">
              <div>
                <div className="micro-label">Ready to read schools</div>
                <h3 className="profile-summary-title">Profile saved.</h3>
              </div>
              <button
                type="button"
                className="profile-edit"
                onClick={() => setIsEditing(true)}
              >
                Edit
              </button>
            </div>
            <ul className="profile-chip-row" aria-label="Profile summary">
              {profileSummaryItems(profile).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="profile-scope-note">
              <CircleHelp size={14} aria-hidden="true" />
              Your grades and scores drive the chance range. Major, home state,
              and activities help with planning and finding schools that fit.
            </p>
          </div>
        ) : (
          <>
        <div className="profile-grid">
          <p className="helper profile-progressive-hint">
            Four quick fields get you a read. Add more below for a tighter one.
          </p>

          <label className="control">
            <span className="field-label">GPA</span>
            <input
              className="text-control mono"
              aria-label="GPA"
              inputMode="decimal"
              placeholder="3.85"
              value={profile.gpa}
              data-invalid={fieldErrorFor("gpa") ? "true" : undefined}
              data-shake={fieldErrorFor("gpa") ? "true" : undefined}
              aria-invalid={fieldErrorFor("gpa") ? true : undefined}
              onChange={(event) => update("gpa", event.target.value)}
              onBlur={() => markTouched("gpa")}
            />
            {fieldErrorFor("gpa") ? (
              <FieldError text={fieldErrorFor("gpa")!} />
            ) : (
              <span className="helper">On a 0 to 5 scale.</span>
            )}
          </label>

          <div className="control">
            <span className="field-label">Are you submitting test scores?</span>
            <div className="segmented" role="group" aria-label="Test scores">
              <button
                type="button"
                data-active={!profile.notSubmittingTests}
                onClick={() => update("notSubmittingTests", false)}
              >
                Submitting
              </button>
              <button
                type="button"
                data-active={profile.notSubmittingTests}
                onClick={() => update("notSubmittingTests", true)}
              >
                Test-optional
              </button>
            </div>
            <span className="helper">Test-optional may widen the band.</span>
          </div>

          <div className="field-pair">
            <label className="control">
              <span className="field-label">SAT</span>
              <input
                className="text-control mono"
                aria-label="SAT"
                disabled={profile.notSubmittingTests}
                inputMode="numeric"
                placeholder="1480"
                value={profile.sat}
                data-invalid={fieldErrorFor("sat") ? "true" : undefined}
                data-shake={fieldErrorFor("sat") ? "true" : undefined}
                aria-invalid={fieldErrorFor("sat") ? true : undefined}
                onChange={(event) => update("sat", event.target.value)}
                onBlur={() => markTouched("sat")}
              />
              {fieldErrorFor("sat") ? (
                <FieldError text={fieldErrorFor("sat")!} />
              ) : (
                <span className="helper">Out of 1600.</span>
              )}
            </label>
            <label className="control">
              <span className="field-label">ACT</span>
              <input
                className="text-control mono"
                aria-label="ACT"
                disabled={profile.notSubmittingTests}
                inputMode="numeric"
                placeholder="33"
                value={profile.act}
                data-invalid={fieldErrorFor("act") ? "true" : undefined}
                data-shake={fieldErrorFor("act") ? "true" : undefined}
                aria-invalid={fieldErrorFor("act") ? true : undefined}
                onChange={(event) => update("act", event.target.value)}
                onBlur={() => markTouched("act")}
              />
              {fieldErrorFor("act") ? (
                <FieldError text={fieldErrorFor("act")!} />
              ) : (
                <span className="helper">Composite. Optional.</span>
              )}
            </label>
          </div>

          <div className="control">
            <span className="field-label">Application round</span>
            <div className="segmented" role="group" aria-label="Application round">
              <button
                type="button"
                data-active={profile.applicationRound === "regular"}
                onClick={() => update("applicationRound", "regular")}
              >
                Regular
              </button>
              <button
                type="button"
                data-active={profile.applicationRound === "early"}
                onClick={() => update("applicationRound", "early")}
              >
                Early
              </button>
            </div>
            <span className="helper">Early is used where a real spread exists.</span>
          </div>

          <label className="control">
            <span className="field-label">Intended major</span>
            <input
              className="text-control"
              placeholder="Undecided"
              value={profile.intendedMajor}
              onChange={(event) => update("intendedMajor", event.target.value)}
            />
            <span className="helper">Used for Fit Finder context.</span>
          </label>

          <div className="control">
            <label className="canada-toggle">
              <input
                type="checkbox"
                checked={applyingCanada}
                onChange={(event) => setApplyingCanada(event.target.checked)}
              />
              <span>I&apos;m applying to Canadian schools</span>
            </label>
          </div>

          {applyingCanada ? (
            <div className="field-pair canada-fields">
              <label className="control">
                <span className="field-label">Canadian average</span>
                <input
                  className="text-control mono"
                  aria-label="Canadian average"
                  inputMode="decimal"
                  placeholder="92"
                  value={profile.canadianAverage}
                  data-invalid={fieldErrorFor("canadianAverage") ? "true" : undefined}
                  data-shake={fieldErrorFor("canadianAverage") ? "true" : undefined}
                  aria-invalid={fieldErrorFor("canadianAverage") ? true : undefined}
                  onChange={(event) => update("canadianAverage", event.target.value)}
                  onBlur={() => markTouched("canadianAverage")}
                />
                {fieldErrorFor("canadianAverage") ? (
                  <FieldError text={fieldErrorFor("canadianAverage")!} />
                ) : (
                  <span className="helper">Percentage basis for CA cutoffs.</span>
                )}
              </label>
              <label className="control">
                <span className="field-label">Completed prerequisites</span>
                <input
                  className="text-control"
                  aria-label="Completed prerequisites"
                  placeholder="ENG4U, MHF4U, MCV4U"
                  value={profile.completedPrerequisites}
                  onChange={(event) =>
                    update("completedPrerequisites", event.target.value)
                  }
                />
                <span className="helper">Comma-separated course codes.</span>
              </label>
            </div>
          ) : null}

          <details className="profile-more">
            <summary>Add more for a tighter read (optional)</summary>
            <div className="profile-more-body">
              <label className="control">
                <span className="field-label">Home state</span>
                <input
                  className="text-control"
                  aria-label="Home state"
                  placeholder="NY"
                  value={profile.homeState}
                  onChange={(event) => update("homeState", event.target.value)}
                />
                <span className="helper">Planning context.</span>
              </label>
              <label className="control">
                <span className="field-label field-label-row">
                  Activities and context
                  <span className="not-scored-tag">
                    {admitIntelligenceEnabled ? "Helps your fit" : "Not scored yet"}
                  </span>
                </span>
                <textarea
                  className="activity-control"
                  aria-label="Activities and context"
                  placeholder="Robotics captain, published research, part-time job..."
                  value={profile.activityNote}
                  onChange={(event) => update("activityNote", event.target.value)}
                />
                <span className="helper">
                  {admitIntelligenceEnabled
                    ? "Helps shape your fit. It doesn't change your chance number."
                    : "Helps with planning. It isn't part of your chance number."}
                </span>
              </label>
            </div>
          </details>
        </div>

        <div className="sr-only" role="status" aria-live="polite">
          {errors.join(" ")}
        </div>
        {notice ? (
          <p className="error-copy" role="alert">
            {notice}
          </p>
        ) : null}
        {noAcademicInput ? (
          <p className="helper profile-low-input">
            Without an SAT or ACT score, we&apos;ll still give you a read, but
            the range will be wider because we have less to go on.
          </p>
        ) : null}

        <div className="profile-footer">
          <span className="profile-assurance">
            <Check size={15} aria-hidden="true" />
            Your inputs never train the model.
          </span>
          <button type="button" className="profile-save" onClick={handleSave}>
            Save profile
          </button>
        </div>
          </>
        )}
      </div>
    </section>
  );
}

function FieldError({ text }: { text: string }) {
  return (
    <span className="field-error" role="alert">
      <AlertTriangle size={13} aria-hidden="true" />
      {text}
    </span>
  );
}

type ListBucket = "reach" | "target" | "safety";

type ListShape = { reach: number; target: number; safety: number };

type ListSchoolView = {
  unitid: number;
  name: string;
  tier: string;
  bucket: ListBucket;
  fit: number | null;
  net_cost: number | null;
  affordable: boolean | null;
  rationale: string;
};

type ListBuilderResponse = {
  list: ListSchoolView[];
  overlooking: ListSchoolView[];
  objective: {
    weights: { fit: number; cost: number };
    shape: ListShape;
    description: string;
    method: string;
  };
  balance: { reach: number; target: number; safety: number; note: string };
  excluded: { canada: number };
};

function ListSchoolCard({ school }: { school: ListSchoolView }) {
  return (
    <li
      className="list-school flex flex-col gap-1 rounded-xl border border-black/10 p-4 dark:border-white/10"
      data-testid="list-school"
    >
      <div className="flex items-baseline justify-between gap-3">
        <Link
          href={`/schools/${school.unitid}`}
          className="text-base font-semibold hover:underline"
        >
          {school.name}
        </Link>
        <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-medium dark:bg-white/10">
          {school.tier}
        </span>
      </div>
      <p className="text-sm opacity-75">{school.rationale}</p>
      <div className="mt-1 flex flex-wrap gap-3 text-xs opacity-60">
        <span>FIT {school.fit ?? "—"}</span>
        <span>
          Net price{" "}
          {school.net_cost === null
            ? "not published"
            : `$${school.net_cost.toLocaleString("en-US")}`}
        </span>
      </div>
    </li>
  );
}

function ShapeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-16 shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={8}
        step={1}
        value={value}
        aria-label={`${label} count`}
        onChange={(event) => onChange(Number(event.target.value))}
        className="flex-1"
      />
      <span className="w-5 text-right tabular-nums">{value}</span>
    </label>
  );
}

const initialShape: ListShape = { reach: 3, target: 4, safety: 3 };

function ListBuilderPanel({
  profile,
  setProfile,
}: {
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
}) {
  const [interests, setInterests] = useState("");
  const [budget, setBudget] = useState("");
  const [shape, setShape] = useState<ListShape>(initialShape);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const [response, setResponse] = useState<ListBuilderResponse | null>(null);
  const generated = useRef(false);

  async function generate(nextShape: ListShape = shape, nextBudget = budget) {
    setStatus("loading");
    setError("");
    try {
      const httpResponse = await fetch("/api/list/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            sat_score: profile.notSubmittingTests
              ? undefined
              : numberOrUndefined(profile.sat),
            act_score: profile.notSubmittingTests
              ? undefined
              : numberOrUndefined(profile.act),
            gpa: numberOrUndefined(profile.gpa),
            application_round: profile.applicationRound,
          },
          preferences: {
            intended_major: profile.intendedMajor || undefined,
            interests: interests || undefined,
            budget: numberOrUndefined(nextBudget),
            shape: nextShape,
          },
        }),
      });
      const payload = await httpResponse.json();
      if (!httpResponse.ok) {
        throw new Error(payload?.error ?? "List request failed.");
      }
      setResponse(payload as ListBuilderResponse);
      setStatus("ready");
      generated.current = true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "List request failed.");
      setStatus("error");
    }
  }

  // Live re-balance: once a list exists, dragging a shape slider or changing the
  // budget regenerates against the same deterministic engine.
  function adjustShape(bucket: ListBucket, value: number) {
    const next = { ...shape, [bucket]: value };
    setShape(next);
    if (generated.current) {
      void generate(next, budget);
    }
  }

  function adjustBudget(value: string) {
    setBudget(value);
    if (generated.current) {
      void generate(shape, value);
    }
  }

  return (
    <section
      className="list-builder-panel rounded-2xl border border-black/10 p-5 dark:border-white/10"
      data-testid="list-builder-panel"
    >
      <header className="mb-4">
        <div className="text-xs uppercase tracking-wide opacity-60">
          Smart List Builder
        </div>
        <h3 className="text-2xl font-bold tracking-tight">
          One tap to a balanced list
        </h3>
        <p className="mt-1 text-sm opacity-70">
          A balanced reach / target / safety list with a one-line reason for
          each school. Tiers come straight from your school reads.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="opacity-70">Intended major</span>
          <input
            className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15"
            value={profile.intendedMajor}
            onChange={(event) =>
              setProfile((current) => ({
                ...current,
                intendedMajor: event.target.value,
              }))
            }
            placeholder="Computer Science"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="opacity-70">Interests</span>
          <input
            className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15"
            value={interests}
            onChange={(event) => setInterests(event.target.value)}
            placeholder="machine learning, robotics"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="opacity-70">Net price budget (USD)</span>
          <input
            className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15"
            value={budget}
            inputMode="numeric"
            onChange={(event) => adjustBudget(event.target.value)}
            placeholder="30000"
            aria-label="Net price budget"
          />
        </label>
        <div className="flex flex-col justify-end gap-1.5">
          <ShapeSlider
            label="Reach"
            value={shape.reach}
            onChange={(value) => adjustShape("reach", value)}
          />
          <ShapeSlider
            label="Target"
            value={shape.target}
            onChange={(value) => adjustShape("target", value)}
          />
          <ShapeSlider
            label="Safety"
            value={shape.safety}
            onChange={(value) => adjustShape("safety", value)}
          />
        </div>
      </div>

      <button
        type="button"
        className="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black"
        onClick={() => generate()}
        disabled={status === "loading"}
        data-testid="list-builder-generate"
      >
        {status === "loading"
          ? "Balancing…"
          : generated.current
            ? "Rebuild list"
            : "Build my list"}
      </button>

      {status === "error" ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {response ? (
        <div className="mt-6" data-testid="list-builder-results">
          <p className="text-sm opacity-70" data-testid="list-balance">
            {response.balance.reach} reach · {response.balance.target} target ·{" "}
            {response.balance.safety} safety
          </p>

          <ul className="mt-3 space-y-2">
            {response.list.map((school) => (
              <ListSchoolCard key={school.unitid} school={school} />
            ))}
          </ul>

          {response.overlooking.length > 0 ? (
            <div className="mt-6" data-testid="list-overlooking">
              <h4 className="text-sm font-semibold uppercase tracking-wide opacity-60">
                Schools you&apos;re overlooking
              </h4>
              <ul className="mt-2 space-y-2">
                {response.overlooking.map((school) => (
                  <ListSchoolCard key={school.unitid} school={school} />
                ))}
              </ul>
            </div>
          ) : null}

          <details className="mt-6 text-xs opacity-70">
            <summary className="cursor-pointer">How this list is ordered</summary>
            <p className="mt-2">{response.objective.description}</p>
            <p className="mt-1">
              Weights — fit {response.objective.weights.fit}, cost{" "}
              {response.objective.weights.cost}.
            </p>
          </details>
        </div>
      ) : null}
    </section>
  );
}

function StudentsLikeYouPanel({ profile }: { profile: Profile }) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [response, setResponse] = useState<StudentsLikeYouResponse | null>(null);
  const [error, setError] = useState("");

  async function runCohort() {
    setStatus("loading");
    setError("");
    setResponse(null);

    try {
      const httpResponse = await fetch("/api/students-like-you", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildStudentsLikeYouBody(profile)),
      });
      const payload = await httpResponse.json();

      if (!httpResponse.ok) {
        throw new Error(payload?.error ?? "Students-Like-You request failed.");
      }

      setResponse(payload as StudentsLikeYouResponse);
      setStatus("ready");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Students-Like-You request failed.",
      );
      setStatus("error");
    }
  }

  const firstCohort = response?.cohorts[0];

  return (
    <section className="sly-panel" data-testid="sly-panel">
      <div className="sly-head">
        <div>
          <div className="section-kicker">Students Like You</div>
          <h3 className="section-title">See where similar profiles landed.</h3>
        </div>
        <button
          type="button"
          className="add-button sly-run"
          onClick={runCohort}
          disabled={status === "loading"}
          data-testid="sly-run"
        >
          {status === "loading" ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <Sparkles size={16} />
          )}
          Match cohort
        </button>
      </div>

      {status === "idle" ? (
        <p className="helper">
          Cohorts open only after at least five consented records survive the
          database privacy gate.
        </p>
      ) : null}

      {status === "error" ? (
        <p className="error-copy" role="alert">
          {error}
        </p>
      ) : null}

      {response?.status === "empty" ? (
        <div className="sly-empty" data-testid="sly-empty">
          <AlertTriangle size={17} aria-hidden="true" />
          <strong>{response.message ?? "Not enough similar students yet."}</strong>
          <span>Minimum cohort size: {response.k}</span>
        </div>
      ) : null}

      {firstCohort ? (
        <div className="sly-results" data-testid="sly-results">
          <div className="sly-hero">
            <span className="micro-label">Closest k-safe cohort</span>
            <strong>{firstCohort.school_name}</strong>
            <span>{firstCohort.cohort_size} similar records</span>
          </div>
          <OutcomeDistribution cohort={firstCohort} />
          <SimilarAttributeCards cards={firstCohort.attribute_cards} />
          <AdmitInsightStrip insights={firstCohort.admit_insights} />
          <p className="helper">
            Provenance: {firstCohort.provenance.consented_user} consented user
            records, {firstCohort.provenance.curated_public} curated public
            launch records.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function ClimbRoadmapPanel({
  profile,
  schools,
}: {
  profile: Profile;
  schools: AddedSchool[];
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [response, setResponse] = useState<ClimbRoadmapResponse | null>(null);
  const [error, setError] = useState("");
  const readySchools = schools.filter((entry) => entry.status === "ready");
  const topMove = response?.ranked_moves[0];

  async function runRoadmap() {
    if (readySchools.length === 0) {
      setStatus("idle");
      return;
    }

    setStatus("loading");
    setError("");

    try {
      const httpResponse = await fetch("/api/climb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildClimbBody(profile, readySchools)),
      });
      const payload = await httpResponse.json();

      if (!httpResponse.ok) {
        throw new Error(payload?.error ?? "Climb Roadmap request failed.");
      }

      setResponse(payload as ClimbRoadmapResponse);
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Climb Roadmap request failed.");
      setStatus("error");
    }
  }

  return (
    <section className="climb-panel" data-testid="climb-panel">
      <div className="phase5-head">
        <div>
          <div className="section-kicker">Climb Roadmap</div>
          <h3 className="section-title">Make the next score move.</h3>
        </div>
        <button
          type="button"
          className="add-button"
          onClick={runRoadmap}
          disabled={status === "loading" || readySchools.length === 0}
          data-testid="climb-run"
        >
          {status === "loading" ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <Target size={16} />
          )}
          Build roadmap
        </button>
      </div>

      {readySchools.length === 0 ? (
        <div className="phase5-empty">
          <ClipboardList size={18} aria-hidden="true" />
          <span>Add at least one scored school to generate moves.</span>
        </div>
      ) : null}

      {status === "error" ? (
        <p className="error-copy" role="alert">
          {error}
        </p>
      ) : null}

      {topMove ? (
        <div className="climb-results" data-testid="climb-results">
          <div className="climb-hero">
            <span className="micro-label">Highest computed move</span>
            <VerdictBlock
              tone={topMove.after.tier.toLowerCase()}
              chipLabel={`${formatAdmitTier(topMove.before.tier)} → ${formatAdmitTier(topMove.after.tier)}`}
              headline={topMove.lever.label}
              metric={`${topMove.delta_score >= 0 ? "+" : ""}${topMove.delta_score}`}
              drivers={[
                {
                  label: topMove.school.name,
                  direction: topMove.delta_score > 0 ? "up" : "neutral",
                },
              ]}
            />
            <RangeBar
              low={Math.min(topMove.before.score, topMove.after.score) / 100}
              high={Math.max(topMove.before.score, topMove.after.score) / 100}
              point={topMove.after.score / 100}
              label={`${topMove.school.name} score move`}
              scale="score"
              testId="climb-range-band"
            />
          </div>
          <ul className="climb-move-list">
            {response.ranked_moves.slice(0, 5).map((move) => (
              <li key={move.id} className="climb-move">
                <div>
                  <span className="micro-label">{move.school.name}</span>
                  <strong>{move.lever.label}</strong>
                  <p>{move.direction}</p>
                </div>
                <div className="climb-scorebox">
                  <span className="mono">
                    {move.before.score} &rarr; {move.after.score}
                  </span>
                  <em>{move.tier_claim ?? move.after.tier}</em>
                </div>
              </li>
            ))}
          </ul>
          <div className="climb-context">
            {response.context.slice(0, 4).map((item) => (
              <span key={item.feature}>{item.label}: context only</span>
            ))}
          </div>
        </div>
      ) : status === "ready" ? (
        <div className="phase5-empty" data-testid="climb-empty">
          <CircleHelp size={18} aria-hidden="true" />
          <span>No model-visible score move is available for this list.</span>
        </div>
      ) : null}
    </section>
  );
}

function CommandCenterPanel({ schools }: { schools: AddedSchool[] }) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [response, setResponse] = useState<CommandCenterResponse | null>(null);
  const [error, setError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const readySchools = schools.filter((entry) => entry.status === "ready");
  const allTasks = response?.schools.flatMap((school) => school.tasks) ?? [];
  const byStatus = {
    todo: allTasks.filter((task) => task.status === "todo"),
    in_progress: allTasks.filter((task) => task.status === "in_progress"),
    done: allTasks.filter((task) => task.status === "done"),
  };

  async function loadCommandCenter() {
    if (readySchools.length === 0) {
      setStatus("idle");
      return;
    }

    setStatus("loading");
    setError("");

    try {
      const httpResponse = await fetch("/api/command-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCommandCenterBody(readySchools)),
      });
      const payload = await httpResponse.json();

      if (!httpResponse.ok) {
        throw new Error(payload?.error ?? "Command Center request failed.");
      }

      setResponse(payload as CommandCenterResponse);
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Command Center request failed.");
      setStatus("error");
    }
  }

  async function uploadDocument() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setUploadNotice("Choose a document first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    if (readySchools[0]) {
      formData.append("unitid", String(readySchools[0].school.unitid));
    }

    try {
      const httpResponse = await fetch("/api/command-center/documents", {
        method: "POST",
        body: formData,
      });
      const payload = await httpResponse.json();
      if (!httpResponse.ok) {
        throw new Error(payload?.error ?? "Document upload failed.");
      }
      setUploadNotice("Document added to vault.");
      await loadCommandCenter();
    } catch (caught) {
      setUploadNotice(
        caught instanceof Error ? caught.message : "Document upload failed.",
      );
    }
  }

  return (
    <section className="command-panel" data-testid="command-center-panel">
      <div className="phase5-head">
        <div>
          <div className="section-kicker">Application Command Center</div>
          <h3 className="section-title">Run every requirement.</h3>
        </div>
        <button
          type="button"
          className="add-button"
          onClick={loadCommandCenter}
          disabled={status === "loading" || readySchools.length === 0}
          data-testid="command-center-run"
        >
          {status === "loading" ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <ClipboardList size={16} />
          )}
          Build center
        </button>
      </div>

      {readySchools.length === 0 ? (
        <div className="phase5-empty">
          <FileText size={18} aria-hidden="true" />
          <span>Add schools first; requirements are generated from the list.</span>
        </div>
      ) : null}

      {status === "error" ? (
        <p className="error-copy" role="alert">
          {error}
        </p>
      ) : null}

      {response ? (
        <div className="command-results" data-testid="command-center-results">
          <div className="command-progress">
            <span className="micro-label">Progress</span>
            <strong>
              {response.progress.done}/{response.progress.total} complete
            </strong>
            <div className="command-meter" aria-hidden="true">
              <span style={{ width: `${response.progress.percent}%` }} />
            </div>
          </div>

          <div className="deadline-strip">
            {response.schools.map((schoolPlan) => (
              <div key={schoolPlan.school.unitid}>
                <span>{schoolPlan.school.name}</span>
                <strong>
                  {schoolPlan.deadline.status === "loaded"
                    ? schoolPlan.deadline.date
                    : schoolPlan.deadline.label}
                </strong>
              </div>
            ))}
          </div>

          <div className="kanban-grid">
            <TaskColumn title="To do" tasks={byStatus.todo} />
            <TaskColumn title="In progress" tasks={byStatus.in_progress} />
            <TaskColumn title="Done" tasks={byStatus.done} />
          </div>

          <div className="vault-panel">
            <div>
              <span className="micro-label">Document vault</span>
              <strong>{response.documents.length} uploaded</strong>
            </div>
            <div className="vault-upload">
              <input
                ref={fileInputRef}
                type="file"
                aria-label="Upload application document"
                accept=".pdf,.png,.jpg,.jpeg,.docx"
              />
              <button type="button" className="icon-button" onClick={uploadDocument}>
                <Upload size={15} />
              </button>
            </div>
            {uploadNotice ? <p className="helper">{uploadNotice}</p> : null}
            {response.documents.length > 0 ? (
              <ul>
                {response.documents.map((document) => (
                  <li key={document.id}>{document.file_name}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TaskColumn({
  title,
  tasks,
}: {
  title: string;
  tasks: CommandCenterTask[];
}) {
  return (
    <section className="task-column">
      <h4>{title}</h4>
      {tasks.length === 0 ? <p className="helper">No tasks here.</p> : null}
      {tasks.map((task) => (
        <article key={task.id} className="task-card">
          <span className="micro-label">{task.category}</span>
          <strong>{task.title}</strong>
          <p>{task.detail}</p>
          <div>
            <span>{task.due_date ?? "Deadline not loaded"}</span>
            <a href={task.source_url} target="_blank" rel="noreferrer">
              Source
            </a>
          </div>
        </article>
      ))}
    </section>
  );
}

type CopilotReceipt = {
  name: string;
  output: Record<string, unknown>;
};

function toolLabel(name: string) {
  return name
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

const COPILOT_PROMPTS = [
  "What are my safeties?",
  "What should I do next?",
  "Where do I have the best odds?",
];

function CopilotPanel({
  profile,
  schools,
}: {
  profile: Profile;
  schools: AddedSchool[];
}) {
  const [message, setMessage] = useState("What should I focus on next?");
  const [answer, setAnswer] = useState("");
  const [modelText, setModelText] = useState("");
  const [receipts, setReceipts] = useState<CopilotReceipt[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const readySchools = schools.filter((entry) => entry.status === "ready");

  function applyFrame(eventName: string, payload: Record<string, unknown>) {
    if (eventName === "tool_result") {
      setReceipts((current) => [
        ...current,
        payload as unknown as CopilotReceipt,
      ]);
    }
    if (eventName === "answer" && typeof payload.text === "string") {
      setAnswer(payload.text);
    }
    if (eventName === "delta" && typeof payload.text === "string") {
      setModelText((current) => `${current}${payload.text}`);
    }
    if (eventName === "model_notice" && typeof payload.message === "string") {
      setModelText((current) =>
        current ? current : String(payload.message),
      );
    }
  }

  async function runCopilot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanMessage = message.trim();
    if (!cleanMessage) {
      return;
    }

    setStatus("loading");
    setError("");
    setAnswer("");
    setModelText("");
    setReceipts([]);

    try {
      const httpResponse = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: cleanMessage,
          profile: buildCopilotProfile(profile),
          schools: buildCopilotSchools(readySchools),
          interests: profile.intendedMajor,
        }),
      });

      if (!httpResponse.ok) {
        const payload = await httpResponse.json();
        throw new Error(payload?.error ?? "Copilot request failed.");
      }

      if (!httpResponse.body) {
        const payload = await httpResponse.json();
        if (typeof payload?.answer?.text === "string") {
          setAnswer(payload.answer.text);
        }
        setStatus("ready");
        return;
      }

      const reader = httpResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventName = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventName = line.slice("event:".length).trim();
          }
          if (line.startsWith("data:")) {
            const raw = line.slice("data:".length).trim();
            if (raw) {
              applyFrame(eventName, JSON.parse(raw) as Record<string, unknown>);
            }
            eventName = "";
          }
        }
      }

      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Copilot request failed.");
      setStatus("error");
    }
  }

  return (
    <section className="copilot-panel" data-testid="copilot-panel">
      <div className="phase5-head">
        <div>
          <div className="section-kicker">Admira Copilot</div>
          <h3 className="section-title">Ask with receipts.</h3>
        </div>
        <MessageCircle size={22} aria-hidden="true" />
      </div>

      <form className="copilot-form" onSubmit={runCopilot}>
        <label className="control">
          <span className="field-label">Message</span>
          <textarea
            className="activity-control"
            data-testid="copilot-input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="add-button"
          disabled={status === "loading"}
          data-testid="copilot-send"
        >
          {status === "loading" ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <Sparkles size={16} />
          )}
          Ask Copilot
        </button>
      </form>

      <div className="copilot-prompts" aria-label="Suggested prompts">
        {COPILOT_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="copilot-prompt-chip"
            data-testid="copilot-prompt"
            onClick={() => setMessage(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      {readySchools.length === 0 ? (
        <div className="phase5-empty">
          <CircleHelp size={18} aria-hidden="true" />
          <span>Add a scored school for grounded planning receipts.</span>
        </div>
      ) : null}

      {status === "error" ? (
        <p className="error-copy" role="alert">
          {error}
        </p>
      ) : null}

      {answer ? (
        <div className="copilot-answer" data-testid="copilot-answer">
          <span className="micro-label">Grounded answer</span>
          <p>{answer}</p>
          {modelText ? <p className="helper">{modelText}</p> : null}
          {receipts.length > 0 ? (
            <div className="receipt-row" aria-label="Copilot sources">
              <span className="receipt-lead">Sources</span>
              {receipts.map((receipt, index) => (
                <span
                  key={`${receipt.name}-${index}`}
                  className="receipt-chip"
                  data-testid="copilot-receipt"
                >
                  from: {toolLabel(receipt.name)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type ReportPayload = {
  title?: string;
  summary?: string;
  sections?: {
    admit?: Array<{ tier: string; score: number; confidence: number }>;
    list?: Array<{ name: string; tier: string; bucket: string; fit: number | null }>;
    climb?: Array<{
      school_name: string;
      lever: string;
      before: number;
      after: number;
      delta: number;
    }>;
    command?: {
      progress: { total: number; done: number; percent: number } | null;
      tasks: Array<{ title: string; status: string; due_date: string | null }>;
    };
    compass?: Array<{ major_name: string; fit: number | null }>;
    similar?: Array<{ school_name: string; cohort_size: number }>;
  };
};

function ReportsPanel({
  profile,
  schools,
}: {
  profile: Profile;
  schools: AddedSchool[];
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [error, setError] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const readySchools = schools.filter((entry) => entry.status === "ready");

  async function generateReport() {
    setStatus("loading");
    setError("");
    setExportNotice("");

    try {
      const httpResponse = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Admira school plan",
          profile: buildCopilotProfile(profile),
          schools: buildCopilotSchools(readySchools),
          interests: profile.intendedMajor,
          share: false,
        }),
      });
      const payload = await httpResponse.json();

      if (!httpResponse.ok) {
        throw new Error(payload?.error ?? "Report request failed.");
      }

      setReport(payload.report as ReportPayload);
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Report request failed.");
      setStatus("error");
    }
  }

  async function exportReport() {
    if (!report) {
      return;
    }

    try {
      const httpResponse = await fetch("/api/reports/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report }),
      });

      if (!httpResponse.ok) {
        throw new Error("PDF export failed.");
      }

      const blob = await httpResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "admira-report.pdf";
      link.click();
      window.URL.revokeObjectURL(url);
      setExportNotice("PDF ready.");
    } catch (caught) {
      setExportNotice(caught instanceof Error ? caught.message : "PDF export failed.");
    }
  }

  const admit = report?.sections?.admit?.[0];
  const list = report?.sections?.list ?? [];
  const climb = report?.sections?.climb ?? [];
  const commandProgress = report?.sections?.command?.progress;
  const compass = report?.sections?.compass ?? [];

  return (
    <section className="reports-panel" data-testid="reports-panel">
      <div className="phase5-head">
        <div>
          <div className="section-kicker">Stunning Reports</div>
          <h3 className="section-title">Package the plan.</h3>
        </div>
        <button
          type="button"
          className="add-button"
          onClick={generateReport}
          disabled={status === "loading" || readySchools.length === 0}
          data-testid="reports-generate"
        >
          {status === "loading" ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <FileText size={16} />
          )}
          Generate
        </button>
      </div>

      {readySchools.length === 0 ? (
        <div className="phase5-empty">
          <FileText size={18} aria-hidden="true" />
          <span>Add a scored school before generating a report.</span>
        </div>
      ) : null}

      {status === "error" ? (
        <p className="error-copy" role="alert">
          {error}
        </p>
      ) : null}

      {report ? (
        <div className="report-output" data-testid="reports-output">
          <div className="report-summary">
            <span className="micro-label">{report.title ?? "Admira report"}</span>
            <p>{report.summary}</p>
          </div>
          <div className="report-grid">
            {admit ? (
              <div>
                <span className="micro-label">Admit</span>
                <strong>{admit.tier}</strong>
                <span className="mono">Score {admit.score}</span>
              </div>
            ) : null}
            {commandProgress ? (
              <div>
                <span className="micro-label">Tasks</span>
                <strong>{commandProgress.done} done</strong>
                <span className="mono">{commandProgress.percent} progress</span>
              </div>
            ) : null}
            {list[0] ? (
              <div>
                <span className="micro-label">List</span>
                <strong>{list[0].name}</strong>
                <span>{list[0].tier}</span>
              </div>
            ) : null}
            {climb[0] ? (
              <div>
                <span className="micro-label">Climb</span>
                <strong>{climb[0].lever}</strong>
                <span className="mono">
                  {climb[0].before} to {climb[0].after}
                </span>
              </div>
            ) : null}
            {compass[0] ? (
              <div>
                <span className="micro-label">Compass</span>
                <strong>{compass[0].major_name}</strong>
                <span>
                  {compass[0].fit === null ? "Fit unscored" : `Fit ${compass[0].fit}`}
                </span>
              </div>
            ) : null}
          </div>
          <button type="button" className="add-button" onClick={exportReport}>
            <Share2 size={16} />
            Export PDF
          </button>
          {exportNotice ? <p className="helper">{exportNotice}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function OutcomeDistribution({ cohort }: { cohort: SimilarCohort }) {
  const segments = [
    { key: "admitted", label: "Admit", count: cohort.outcomes.admitted },
    { key: "denied", label: "Deny", count: cohort.outcomes.denied },
    { key: "waitlisted", label: "Waitlist", count: cohort.outcomes.waitlisted },
    { key: "deferred", label: "Defer", count: cohort.outcomes.deferred },
  ] as const;

  return (
    <section
      className="sly-distribution"
      aria-label={`${cohort.school_name} outcome distribution`}
    >
      <div className="sly-bars" aria-hidden="true">
        {segments.map((segment) =>
          segment.count > 0 ? (
            <span
              key={segment.key}
              data-outcome={segment.key}
              style={{ flexGrow: segment.count }}
            />
          ) : null,
        )}
      </div>
      <div className="sly-outcome-grid">
        {segments.map((segment) => (
          <span key={segment.key} data-outcome={segment.key}>
            <strong>{segment.count}</strong>
            {segment.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function SimilarAttributeCards({ cards }: { cards: SimilarCohort["attribute_cards"] }) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <ul className="sly-card-grid" aria-label="k-safe similar student attributes">
      {cards.slice(0, 4).map((card) => (
        <li key={`${card.kind}-${card.value}`}>
          <span className="micro-label">{card.label}</span>
          <strong>{card.value}</strong>
          <span>{card.count} records</span>
        </li>
      ))}
    </ul>
  );
}

function AdmitInsightStrip({
  insights,
}: {
  insights: SimilarCohort["admit_insights"];
}) {
  if (insights.length === 0) {
    return (
      <div className="sly-insights" data-testid="sly-insights">
        <span className="micro-label">What admits had in common</span>
        <strong>Suppressed until the admit subgroup reaches k.</strong>
      </div>
    );
  }

  return (
    <div className="sly-insights" data-testid="sly-insights">
      <span className="micro-label">What admits had in common</span>
      <strong>
        {insights
          .slice(0, 2)
          .map((insight) => `${insight.value} (${insight.count})`)
          .join(" + ")}
      </strong>
    </div>
  );
}

function FitFinderPanel({
  profile,
  setProfile,
  profileErrors,
  profileReady,
  onAddSchool,
  addedUnitids,
}: {
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
  profileErrors: string[];
  profileReady: boolean;
  onAddSchool: (school: SchoolSearchRow) => void;
  addedUnitids: number[];
}) {
  const [preferences, setPreferences] = useState<FitPreferences>(
    initialFitPreferences,
  );
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const [fitResponse, setFitResponse] = useState<FitResponse | null>(null);
  const [explanations, setExplanations] = useState<
    Record<number, FitExplanationState>
  >({});
  const explanationRequest = useRef(0);

  function updatePreference(key: keyof FitPreferences, value: string) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  function updateIntendedMajor(value: string) {
    setProfile((current) => ({ ...current, intendedMajor: value }));
  }

  async function loadExplanations(results: FitResult[], requestId: number) {
    setExplanations(
      Object.fromEntries(
        results.map((result) => [
          result.school.unitid,
          { status: "loading" as const },
        ]),
      ),
    );

    await Promise.all(
      results.map(async (result) => {
        try {
          const response = await fetch("/api/fit/explain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              school: result.school,
              match_reasons: result.match_reasons,
              band: {
                label: result.band.label,
                low: result.probability.low,
                high: result.probability.high,
                wide_band: result.band.wide_band,
              },
            }),
          });
          const payload = await response.json();

          if (requestId !== explanationRequest.current) {
            return;
          }

          setExplanations((current) => ({
            ...current,
            [result.school.unitid]:
              response.ok && payload?.available && payload?.explanation
                ? {
                    status: "ready",
                    text: String(payload.explanation),
                  }
                : {
                    status: "fallback",
                    reason:
                      payload?.reason ??
                      "Structured reasons remain available without a prose note.",
                  },
          }));
        } catch {
          if (requestId !== explanationRequest.current) {
            return;
          }
          setExplanations((current) => ({
            ...current,
            [result.school.unitid]: {
              status: "fallback",
              reason: "Structured reasons remain available without a prose note.",
            },
          }));
        }
      }),
    );
  }

  async function submitFit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (profileErrors.length > 0) {
      setStatus("error");
      setError(profileErrors.join(" "));
      return;
    }

    if (!profileReady) {
      setStatus("error");
      setError("Add academic evidence in the student profile before matching.");
      return;
    }

    if (
      !preferences.interests.trim() &&
      !profile.intendedMajor.trim() &&
      !preferences.learningStyleNotes.trim()
    ) {
      setStatus("error");
      setError("Add your interests, an intended major, or a few preferences first.");
      return;
    }

    setStatus("loading");
    setError("");
    setFitResponse(null);
    setExplanations({});
    const requestId = explanationRequest.current + 1;
    explanationRequest.current = requestId;

    try {
      const response = await fetch("/api/fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildFitBody(profile, preferences)),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? "Fit Finder could not run.");
      }

      const nextResponse = payload as FitResponse;
      setFitResponse(nextResponse);
      setStatus("ready");
      trackEvent("fit_search_run", {
        result_count: nextResponse.results.length,
        has_region_filter: Boolean(preferences.preferredRegion),
        has_size_filter: Boolean(preferences.preferredSize),
        has_setting_filter: Boolean(preferences.preferredSetting),
        has_affordability_filter: Boolean(preferences.costCeiling.trim()),
      });
      void loadExplanations(nextResponse.results, requestId);
    } catch (fitError) {
      setStatus("error");
      setError(
        fitError instanceof Error
          ? fitError.message
          : "Fit Finder could not run.",
      );
    }
  }

  return (
    <section
      className="fit-finder-panel"
      aria-labelledby="fit-finder-title"
      data-testid="fit-finder-panel"
    >
      <div className="panel-inner">
        <div className="section-kicker">Fit Finder</div>
        <h2 className="section-title" id="fit-finder-title">
          Find schools by fit evidence.
        </h2>
        <p className="helper mt-2">
          Uses the academic profile above. Fit is shown through matched
          attributes, radar overlap, and the chancing interval. FIT is never an
          admit probability.
        </p>

        <form className="fit-form" onSubmit={submitFit}>
          <label className="control wide-field">
            <span className="field-label">Interests</span>
            <textarea
              className="activity-control"
              placeholder="Robotics, public policy, studio art, applied math..."
              value={preferences.interests}
              onChange={(event) => updatePreference("interests", event.target.value)}
            />
          </label>

          <label className="control">
            <span className="field-label">Intended major</span>
            <input
              className="text-control"
              placeholder="Computer science"
              value={profile.intendedMajor}
              onChange={(event) => updateIntendedMajor(event.target.value)}
            />
          </label>

          <FitOptionGroup
            label="Preferred size"
            value={preferences.preferredSize}
            options={["small", "medium", "large"]}
            onChange={(value) => updatePreference("preferredSize", value)}
          />

          <FitOptionGroup
            label="Preferred setting"
            value={preferences.preferredSetting}
            options={["city", "suburb", "town", "rural"]}
            onChange={(value) => updatePreference("preferredSetting", value)}
          />

          <FitOptionGroup
            label="Preferred region"
            value={preferences.preferredRegion}
            options={["Northeast", "Midwest", "South", "West"]}
            onChange={(value) => updatePreference("preferredRegion", value)}
          />

          <FitChoiceGroup
            label="Selectivity tier"
            value={preferences.selectivityTier}
            options={[
              { value: "accessible", label: "Accessible" },
              { value: "selective", label: "Selective" },
              { value: "highly_selective", label: "Highly selective" },
              { value: "elite", label: "Elite" },
            ]}
            onChange={(value) => updatePreference("selectivityTier", value)}
          />

          <FitChoiceGroup
            label="Public or private"
            value={preferences.control}
            options={[
              { value: "public", label: "Public" },
              { value: "private", label: "Private" },
            ]}
            onChange={(value) => updatePreference("control", value)}
          />

          <FitChoiceGroup
            label="Minimum graduation rate"
            value={preferences.minGradRate}
            options={[
              { value: "0.5", label: "50%+" },
              { value: "0.7", label: "70%+" },
              { value: "0.85", label: "85%+" },
            ]}
            onChange={(value) => updatePreference("minGradRate", value)}
          />

          <label className="control">
            <span className="field-label">Published cost ceiling</span>
            <input
              className="text-control mono"
              inputMode="numeric"
              placeholder="30000"
              value={preferences.costCeiling}
              onChange={(event) =>
                updatePreference("costCeiling", event.target.value)
              }
            />
            <span className="helper">
              Uses published net price or sticker cost. Merit aid is not predicted.
            </span>
          </label>

          <label className="control wide-field">
            <span className="field-label">How you like to learn</span>
            <textarea
              className="activity-control"
              placeholder="Collaborative labs, discussion seminars, structured advising..."
              value={preferences.learningStyleNotes}
              onChange={(event) =>
                updatePreference("learningStyleNotes", event.target.value)
              }
            />
          </label>

          {!profileReady || profileErrors.length > 0 ? (
            <p className="error-copy wide-field" role="alert">
              Use the{" "}
              <a className="inline-link" href="#student-profile">
                student profile
              </a>{" "}
              before running Fit Finder.
            </p>
          ) : null}

          {error ? (
            <p className="error-copy wide-field" role="alert">
              {error}
            </p>
          ) : null}

          <button
            className="add-button wide-action"
            type="submit"
            disabled={status === "loading"}
          >
            {status === "loading" ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <Compass size={16} />
            )}
            Find schools
          </button>
        </form>

        <FitFinderResults
          response={fitResponse}
          status={status}
          explanations={explanations}
          onAddSchool={onAddSchool}
          addedUnitids={addedUnitids}
        />
      </div>
    </section>
  );
}

function FitOptionGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="control">
      <span className="field-label">{label}</span>
      <div className="option-grid" role="group" aria-label={label}>
        <button
          className="option-button"
          type="button"
          data-active={value === ""}
          onClick={() => onChange("")}
        >
          Any
        </button>
        {options.map((option) => (
          <button
            className="option-button"
            type="button"
            key={option}
            data-active={value === option}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function FitChoiceGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="control">
      <span className="field-label">{label}</span>
      <div className="option-grid" role="group" aria-label={label}>
        <button
          className="option-button"
          type="button"
          data-active={value === ""}
          onClick={() => onChange("")}
        >
          Any
        </button>
        {options.map((option) => (
          <button
            className="option-button"
            type="button"
            key={option.value}
            data-active={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FitFinderResults({
  response,
  status,
  explanations,
  onAddSchool,
  addedUnitids,
}: {
  response: FitResponse | null;
  status: "idle" | "loading" | "ready" | "error";
  explanations: Record<number, FitExplanationState>;
  onAddSchool: (school: SchoolSearchRow) => void;
  addedUnitids: number[];
}) {
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());

  function toggle(unitid: number) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(unitid)) {
        next.delete(unitid);
      } else {
        next.add(unitid);
      }
      return next;
    });
  }

  if (status === "idle") {
    return (
      <div className="fit-empty">
        <Sparkles size={18} aria-hidden="true" />
        <p className="helper">
          Add a few preferences and we&apos;ll find schools that match.
        </p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="fit-empty" aria-busy="true">
        <div className="skeleton-band" />
        <p className="helper">
          Searching by embedded fit signals. No temporary FIT score is shown.
        </p>
      </div>
    );
  }

  if (!response) {
    return null;
  }

  if (response.results.length === 0) {
    return (
      <div className="fit-empty">
        <p className="helper">
          No schools matched those filters. Try loosening region, size, setting,
          selectivity, graduation rate, or published cost.
        </p>
        <FitDisclaimers disclaimers={response.disclaimers} />
      </div>
    );
  }

  return (
    <div className="fit-results" data-testid="fit-results">
      <FitBalanceSummary response={response} />
      {response.weak_program_match ? (
        <p className="fit-weak-banner" role="status" data-testid="fit-weak-banner">
          <AlertTriangle size={15} aria-hidden="true" />
          We do not have strong program matches for this search in the current
          set. These are the closest schools on other factors. Open a row to see
          where each one actually fits.
        </p>
      ) : null}
      <ol className="fit-rank-list">
        {response.results.map((result, index) => (
          <FitRankRow
            key={result.school.unitid}
            result={result}
            rank={index + 1}
            open={openIds.has(result.school.unitid)}
            onToggle={() => toggle(result.school.unitid)}
            explanation={explanations[result.school.unitid]}
            onAddSchool={onAddSchool}
            alreadyAdded={addedUnitids.includes(result.school.unitid)}
            resultCount={response.results.length}
          />
        ))}
      </ol>
      <FitDisclaimers disclaimers={response.disclaimers} />
    </div>
  );
}

function fitRowTone(result: FitResult) {
  const score = result.fit_score?.program_fit ?? result.fit_score?.score ?? null;
  if (score === null) {
    return "Fit read";
  }
  if (score >= 80) {
    return "Strong program fit";
  }
  if (score >= 60) {
    return "Partial program fit";
  }
  return "Weak program fit";
}

function FitRankRow({
  result,
  rank,
  open,
  onToggle,
  explanation,
  onAddSchool,
  alreadyAdded,
  resultCount,
}: {
  result: FitResult;
  rank: number;
  open: boolean;
  onToggle: () => void;
  explanation?: FitExplanationState;
  onAddSchool: (school: SchoolSearchRow) => void;
  alreadyAdded: boolean;
  resultCount: number;
}) {
  const meta = [result.school.region, result.school.size_band]
    .filter(Boolean)
    .join(" · ");
  const weak = result.fit_score?.program_match
    ? !result.fit_score.program_match.strong
    : false;

  return (
    <li className="fit-rank-item" data-open={open ? "true" : undefined}>
      <button
        type="button"
        className="fit-rank-row"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="fit-rank-index mono">{rank}</span>
        <span className="result-sigil" aria-hidden="true">
          {schoolInitial(result.school.name)}
        </span>
        <span className="fit-rank-copy">
          <strong>{result.school.name}</strong>
          <span className="helper">
            {[meta, fitRowTone(result)].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="fit-rank-pills">
          <FitPill fitScore={result.fit_score} />
          <BandPill label={result.band.label} />
        </span>
        <ChevronDown
          className={open ? "fit-rank-chevron open" : "fit-rank-chevron"}
          size={18}
          aria-hidden="true"
        />
      </button>
      {weak && !open ? (
        <p className="fit-rank-weak">Weak program match. Open to see the radar.</p>
      ) : null}
      {open ? (
        <FitResultCard
          result={result}
          explanation={explanation}
          onAddSchool={onAddSchool}
          alreadyAdded={alreadyAdded}
          resultCount={resultCount}
        />
      ) : null}
    </li>
  );
}

function FitBalanceSummary({ response }: { response: FitResponse }) {
  return (
    <section
      className="fit-balance"
      aria-label="Fit Finder balance"
      data-testid="fit-balance"
    >
      <div className="balance-grid">
        {labelOrder.map((label) => (
          <div key={label} className="balance-cell">
            <div className="balance-count">{response.balance[label]}</div>
            <div className="field-label">{label}</div>
          </div>
        ))}
      </div>
      <p className="helper">{response.balance.note}</p>
    </section>
  );
}

function FitResultCard({
  result,
  explanation,
  onAddSchool,
  alreadyAdded,
  resultCount,
}: {
  result: FitResult;
  explanation?: FitExplanationState;
  onAddSchool: (school: SchoolSearchRow) => void;
  alreadyAdded: boolean;
  resultCount: number;
}) {
  const schoolForList: SchoolSearchRow = {
    unitid: result.school.unitid,
    name: result.school.name,
    state: result.school.province_state,
    province_state: result.school.province_state,
    country: result.school.country,
    selectivity_tier: result.school.selectivity_tier,
    sat_25: null,
    sat_75: null,
    act_25: null,
    act_75: null,
    test_policy: null,
  };
  const verdict = buildFitVerdict(result);
  const displayLevers = visibleLevers(result.climb_levers ?? []);
  const detailsDisclaimers = filteredDisclaimers([
    "Fit uses published attributes only; social fit and campus culture need your own visit or research.",
  ]);

  function handleAddSchool() {
    trackEvent("fit_school_added", {
      result_count: resultCount,
      surface: "fit_finder",
    });
    onAddSchool(schoolForList);
  }

  return (
    <article className="fit-result-card" data-testid="fit-result-card">
      <div className="fit-result-head">
        <div>
          <div className="section-kicker">Fit match</div>
          <h3 className="result-title">{result.school.name}</h3>
          <p className="helper">
            {result.school.region ?? "region unknown"} -{" "}
            {result.school.size_band ?? "size unknown"} - {result.band.label}
          </p>
        </div>
        <div className="result-pill-stack">
          <FitPill fitScore={result.fit_score} />
          <BandPill label={result.band.label} />
        </div>
        <button
          className="add-button fit-add-button"
          type="button"
          disabled={alreadyAdded}
          onClick={handleAddSchool}
        >
          <Plus size={16} />
          {alreadyAdded ? "Added" : "Add to my Admira list"}
        </button>
      </div>

      <p className="result-verdict">{verdict}</p>

      {result.fit_score ? <FitScoreSplit fitScore={result.fit_score} /> : null}

      <div className="fit-card-flow">
        {result.fit_score ? <FitScorePanel fitScore={result.fit_score} /> : null}
        <section className="fit-range-block">
          <div className="range-readout">
            <span className="range-title">
              Where {result.school.name} lands for you
            </span>
            <span className="range-value">
              {formatChanceRange(result.probability.low, result.probability.high)}
            </span>
          </div>
          <RangeBar
            low={result.probability.low}
            high={result.probability.high}
            point={result.probability.calibrated}
            label={`${result.school.name} chance range`}
            tierLegend
          />
        </section>
        {displayLevers.length > 0 ? (
          <ClimbLeversPanel levers={displayLevers} />
        ) : null}
        <CannotSeePanel />
        <details className="result-details">
          <summary>
            <span>Why this range / details</span>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <div className="result-details-body">
            <FitExplanation explanation={explanation} />
            <div className="fit-reason-grid">
              <FitReasonList title="Matched" items={result.match_reasons.matched} />
              <FitReasonList title="Notable" items={result.match_reasons.notable} />
            </div>
            <ShareableRangeCard
              schoolName={result.school.name}
              verdict={verdict}
              low={result.probability.low}
              high={result.probability.high}
              band={result.band.label}
            />
            <div className="cost-note" data-status={result.match_reasons.cost_status}>
              <strong>Cost status: {formatCostStatus(result.match_reasons.cost_status)}</strong>
              <span>Published cost only. Merit aid is not predicted.</span>
            </div>
            <DisclaimerPanel disclaimers={detailsDisclaimers} />
          </div>
        </details>
      </div>
    </article>
  );
}

function FitReasonList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="fit-reason-panel">
      <div className="micro-label">{title}</div>
      {items.length === 0 ? (
        <p className="helper">No structured reason returned for this group.</p>
      ) : (
        <ul className="fit-chip-list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FitExplanation({
  explanation,
}: {
  explanation?: FitExplanationState;
}) {
  if (!explanation || explanation.status === "loading") {
    return (
      <section className="why-fit" aria-busy="true">
        <div className="micro-label">Why it fits</div>
        <p className="helper">Loading a grounded explanation. The structured reasons above are ready now.</p>
      </section>
    );
  }

  if (explanation.status === "fallback") {
    return (
      <section className="why-fit">
        <div className="micro-label">Why it fits</div>
        <p className="helper">
          {explanation.reason ??
            "Structured reasons are shown because the prose note is unavailable."}
        </p>
      </section>
    );
  }

  return (
    <section className="why-fit">
      <div className="micro-label">Why it fits</div>
      <p>{explanation.text}</p>
    </section>
  );
}

function FitDisclaimers({ disclaimers }: { disclaimers: string[] }) {
  return (
    <section className="fit-disclaimers">
      <div className="section-kicker">Fit Finder disclosures</div>
      <ul className="disclaimer-list">
        {disclaimers.map((disclaimer) => (
          <li key={disclaimer} className="disclaimer-line">
            {disclaimer}
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatCostStatus(status: FitResult["match_reasons"]["cost_status"]) {
  switch (status) {
    case "within_ceiling":
      return "within ceiling";
    case "over_ceiling":
      return "over ceiling";
    case "unknown":
      return "unknown";
  }
}

function formatCutoff(
  cutoff: NonNullable<AdmitIntelligenceResponse["program"]>["cutoff"],
) {
  const low = cutoff.low ?? "n/a";
  const high = cutoff.high !== null && cutoff.high !== undefined ? cutoff.high : low;
  return `${low}-${high} ${cutoff.basis}`;
}

function shortAxisLabel(label: string) {
  return label === "Extracurricular Impact" ? "Extracurricular" : label;
}

function formatAxisStatus(status: AdmitProfileAxis["status"]) {
  switch (status) {
    case "strong":
      return "Strong";
    case "steady":
      return "Steady";
    case "stretch":
      return "Stretch";
  }
}

function BandPill({ label }: { label: BandLabel }) {
  return (
    <span className="label-pill band-pill" data-band={label}>
      {label.toUpperCase()}
    </span>
  );
}

function FitPill({ fitScore }: { fitScore?: FitScore | null }) {
  if (!fitScore || fitScore.score === null) {
    return null;
  }

  return (
    <span
      className="label-pill fit-pill"
      aria-label={`FIT ${fitScore.score}, profile overlap score, not an admit probability`}
    >
      FIT {fitScore.score}
    </span>
  );
}

function FitScoreSplit({ fitScore }: { fitScore: FitScore }) {
  const programFit = fitScore.program_fit ?? fitScore.score;
  const academicFit = fitScore.academic_fit ?? null;
  if (programFit === null && academicFit === null) {
    return null;
  }
  const weak =
    fitScore.program_match && !fitScore.program_match.strong && programFit !== null;

  return (
    <div className="fit-score-split">
      <div className="fit-score-cell fit-score-cell-program" data-weak={weak ? "true" : undefined}>
        <span className="micro-label">Program fit</span>
        <strong className="mono">{programFit ?? "n/a"}</strong>
        <span className="helper">
          {weak
            ? "Weak match to the programs you asked for."
            : "How well the programs match what you asked for."}
        </span>
      </div>
      <div className="fit-score-cell">
        <span className="micro-label">Academic fit</span>
        <strong className="mono">{academicFit ?? "n/a"}</strong>
        <span className="helper">Your stats against this school&rsquo;s band.</span>
      </div>
      <p className="fit-score-split-note">
        Both are profile overlap, not admit chances. The chance range is below.
      </p>
    </div>
  );
}

function FitScorePanel({ fitScore }: { fitScore: FitScore }) {
  if (fitScore.score === null) {
    return null;
  }

  return (
    <section className="fit-score-panel" data-testid="fit-score-panel">
      <div className="fit-score-intro">
        <div className="section-kicker">Fit overlap</div>
        <h4 className="section-title text-[22px]">
          You fit the shape, except where it is hardest.
        </h4>
        <p className="helper">
          FIT is not an admit probability. The headline is program and interest
          fit; the radar breaks every axis out so academics never hide a weak
          program match.
        </p>
      </div>
      <div className="fit-score-layout">
        <FitRadar fitScore={fitScore} />
        <div className="fit-score-readout">
          <FitOverlapVenn fitScore={fitScore} />
          <span className="coverage-label">{fitScore.coverage.label}</span>
          {fitScore.coverage.reduced ? (
            <p className="helper">
              Reduced coverage: unknown axes are excluded instead of guessed.
            </p>
          ) : null}
        </div>
      </div>
      <FitDimensionRows axes={fitScore.axes} />
    </section>
  );
}

function FitOverlapVenn({ fitScore }: { fitScore: FitScore }) {
  if (fitScore.score === null) {
    return null;
  }

  return (
    <figure
      className="fit-overlap-venn"
      role="img"
      aria-label={`FIT ${fitScore.score}, profile overlap score, not an admit probability`}
    >
      <div className="venn-circles" aria-hidden="true">
        <span className="venn-circle profile" />
        <span className="venn-circle typical" />
        <strong>{fitScore.score}</strong>
      </div>
      <figcaption>
        Your profile in green over the admitted class in indigo. The overlap is
        the score.
      </figcaption>
    </figure>
  );
}

function FitRadar({ fitScore }: { fitScore: FitScore }) {
  const center = 110;
  const radius = 78;
  const axes = fitScore.axes;
  const axisPoints = axes.map((_, index) =>
    radarPoint(center, radius, 1, index, axes.length),
  );
  const studentPoints = axes
    .map((axis, index) =>
      radarPoint(center, radius, (axis.value ?? 0) / 100, index, axes.length),
    )
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
  const typicalPoints = axes
    .map((axis, index) =>
      radarPoint(center, radius, axis.typical / 100, index, axes.length),
    )
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
  const aria = `FIT ${fitScore.score}. ${axes
    .map((axis) =>
      axis.value === null
        ? `${axis.label} unknown`
        : `${axis.label} ${axis.value}`,
    )
    .join(", ")}.`;

  return (
    <figure className="fit-radar" role="img" aria-label={aria}>
      <svg viewBox="0 0 220 220" aria-hidden="true">
        <polygon className="radar-grid" points={axisPoints.map((point) => `${point.x},${point.y}`).join(" ")} />
        {axisPoints.map((point, index) => (
          <line
            key={axes[index].key}
            className="radar-axis"
            x1={center}
            y1={center}
            x2={point.x}
            y2={point.y}
          />
        ))}
        <polygon className="radar-typical" points={typicalPoints} />
        <polygon className="radar-student" points={studentPoints} />
        {axes.map((axis, index) => {
          const labelPoint = radarPoint(center, radius + 18, 1, index, axes.length);
          return (
            <text
              key={axis.key}
              className="radar-label"
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {axis.label}
            </text>
          );
        })}
      </svg>
      <figcaption className="radar-legend">
        <span><i className="legend-dot student" />Your overlap</span>
        <span><i className="legend-dot typical" />Typical admit reference</span>
      </figcaption>
    </figure>
  );
}

function radarPoint(
  center: number,
  radius: number,
  scale: number,
  index: number,
  total: number,
) {
  const angle = (-90 + (360 / total) * index) * (Math.PI / 180);
  return {
    x: center + Math.cos(angle) * radius * scale,
    y: center + Math.sin(angle) * radius * scale,
  };
}

function FitDimensionRows({ axes }: { axes: FitScoreAxis[] }) {
  return (
    <ul className="fit-dimension-list">
      {axes.map((axis) => (
        <li key={axis.key} data-status={axis.status}>
          <span className="dimension-status">
            {axis.status === "good" ? <Check size={14} /> : null}
            {axis.status === "caution" ? <AlertTriangle size={14} /> : null}
            {axis.status === "unknown" ? <CircleHelp size={14} /> : null}
            {axis.status === "good"
              ? "Good"
              : axis.status === "caution"
                ? "Watch"
                : "Unknown"}
          </span>
          <span>
            <strong>{axis.label}</strong>
            <span className="helper">{axis.note}</span>
          </span>
          <span className="mono">
            {axis.value === null ? "n/a" : `${axis.value}/100`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ClimbLeversPanel({
  levers,
  profile,
  result,
}: {
  levers: ClimbLever[];
  profile?: Profile;
  result?: ChanceResponse;
}) {
  return (
    <section className="climb-panel" data-testid="climb-levers">
      <div className="climb-panel-head">
        <span className="climb-head-icon" aria-hidden="true">
          <SlidersHorizontal size={17} />
        </span>
        <div>
          <div className="section-kicker">Next step</div>
          <h4 className="section-title text-[22px]">
            See how to move this range
          </h4>
        </div>
      </div>
      <div className="climb-list">
        {levers.map((lever) => (
          <div key={lever.id} className="climb-row" data-kind={lever.kind}>
            <div className="climb-copy">
              <strong>{lever.label}</strong>
              <span>{leverKindLabel(lever)}</span>
            </div>
            <span
              className="climb-meter"
              aria-label={`${lever.label}: ${formatLeverDelta(lever)}`}
            >
              <span
                className="climb-meter-fill"
                style={{ width: `${leverImpactWidth(lever)}%` }}
              />
            </span>
            <span className="climb-value">
              {formatLeverDelta(lever)}
            </span>
          </div>
        ))}
      </div>
      {profile && result ? (
        <WhatIfRangeMover
          levers={levers}
          profile={profile}
          result={result}
        />
      ) : null}
    </section>
  );
}

function WhatIfRangeMover({
  levers,
  profile,
  result,
}: {
  levers: ClimbLever[];
  profile: Profile;
  result: ChanceResponse;
}) {
  const baselineSat = profile.notSubmittingTests
    ? undefined
    : numberOrUndefined(profile.sat);
  const baselineAct = profile.notSubmittingTests
    ? undefined
    : numberOrUndefined(profile.act);
  const baselineRound = profile.applicationRound;
  const hasTestScore = baselineSat !== undefined || baselineAct !== undefined;
  const testLever = levers.find((lever) => lever.id === "test_score");
  const roundLever = levers.find((lever) => lever.id === "application_round");
  const policyReason = testPolicyControlReason(
    result.school.test_policy,
    hasTestScore,
  );
  const testReason =
    policyReason || (!testLever ? "No modeled test lever returned" : "");
  const testDisabled = Boolean(testReason);
  const roundDisabled =
    !roundLever ||
    !roundLever.delta ||
    leverImpactPts(roundLever) === 0;
  const roundReason = roundDisabled
    ? "No modeled effect: no published round spread"
    : "";
  const [sat, setSat] = useState(baselineSat ?? 400);
  const [act, setAct] = useState(baselineAct ?? 1);
  const [round, setRound] = useState<ApplicationRound>(baselineRound);
  const [scenario, setScenario] = useState<ChanceResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const [retryTick, setRetryTick] = useState(0);
  const requestRef = useRef(0);

  const satChanged =
    !testDisabled && baselineSat !== undefined && sat !== baselineSat;
  const actChanged =
    !testDisabled && baselineAct !== undefined && act !== baselineAct;
  const roundChanged = !roundDisabled && round !== baselineRound;
  const hasScenarioChange = satChanged || actChanged || roundChanged;
  const scenarioParts = [
    satChanged ? `SAT ${baselineSat} -> ${sat}` : "",
    actChanged ? `ACT ${baselineAct} -> ${act}` : "",
    roundChanged
      ? `${formatRoundLabel(baselineRound)} -> ${formatRoundLabel(round)}`
      : "",
  ].filter(Boolean);
  const scenarioLabel =
    scenarioParts.length > 0
      ? `What-if: ${scenarioParts.join(", ")}`
      : "What-if";
  const liveSummary = scenario
    ? `${scenarioLabel}. Current ${formatChanceRange(
        result.probability.low,
        result.probability.high,
      )}. What-if ${formatChanceRange(
        scenario.probability.low,
        scenario.probability.high,
      )}.`
    : "Current range unchanged.";

  useEffect(() => {
    setSat(baselineSat ?? 400);
    setAct(baselineAct ?? 1);
    setRound(baselineRound);
    setScenario(null);
    setStatus("idle");
    setError("");
    requestRef.current += 1;
  }, [baselineSat, baselineAct, baselineRound, result.school.unitid]);

  useEffect(() => {
    if (!hasScenarioChange) {
      requestRef.current += 1;
      setScenario(null);
      setStatus("idle");
      setError("");
      return;
    }

    const requestId = requestRef.current + 1;
    const controller = new AbortController();
    requestRef.current = requestId;
    setStatus("loading");
    setError("");

    const timeout = window.setTimeout(async () => {
      try {
        const body = buildChanceBody(profile, result.school.unitid);

        if (!testDisabled && baselineSat !== undefined) {
          body.sat_score = sat;
        }
        if (!testDisabled && baselineAct !== undefined) {
          body.act_score = act;
        }
        if (!roundDisabled) {
          body.application_round = round;
        }

        const response = await fetch("/api/chance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error ?? "What-if request failed.");
        }
        if (requestId !== requestRef.current) {
          return;
        }

        setScenario(payload as ChanceResponse);
        setStatus("ready");
      } catch (caught) {
        if (requestId !== requestRef.current || controller.signal.aborted) {
          return;
        }
        setScenario(null);
        setStatus("error");
        setError(
          caught instanceof Error ? caught.message : "What-if request failed.",
        );
      }
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    act,
    baselineAct,
    baselineRound,
    baselineSat,
    hasScenarioChange,
    profile,
    result.school.unitid,
    retryTick,
    round,
    roundDisabled,
    sat,
    testDisabled,
  ]);

  function resetScenario() {
    setSat(baselineSat ?? 400);
    setAct(baselineAct ?? 1);
    setRound(baselineRound);
    setScenario(null);
    setStatus("idle");
    setError("");
    requestRef.current += 1;
  }

  return (
    <section className="what-if-panel" data-testid="what-if-panel">
      <div className="what-if-head">
        <div>
          <div className="section-kicker">Modeled scenario</div>
          <h5>Try the levers you can still control</h5>
        </div>
        <button
          type="button"
          className="what-if-reset"
          onClick={resetScenario}
          disabled={!hasScenarioChange && status !== "ready"}
        >
          Reset to current
        </button>
      </div>
      <p className="what-if-copy">
        This is a what-if of modeled levers only. Essays, recs, and interest
        still are not in the model.
      </p>

      <div className="what-if-controls">
        {baselineSat !== undefined ? (
          <label className="what-if-control">
            <span className="what-if-control-head">
              <span>What-if SAT score</span>
              <strong className="what-if-value">{sat}</strong>
            </span>
            <input
              type="range"
              min="400"
              max="1600"
              step="10"
              value={sat}
              disabled={testDisabled}
              onChange={(event) => setSat(Number(event.target.value))}
            />
            {testReason ? <span className="what-if-note">{testReason}</span> : null}
          </label>
        ) : null}

        {baselineAct !== undefined ? (
          <label className="what-if-control">
            <span className="what-if-control-head">
              <span>What-if ACT score</span>
              <strong className="what-if-value">{act}</strong>
            </span>
            <input
              type="range"
              min="1"
              max="36"
              step="1"
              value={act}
              disabled={testDisabled}
              onChange={(event) => setAct(Number(event.target.value))}
            />
            {testReason ? <span className="what-if-note">{testReason}</span> : null}
          </label>
        ) : null}

        {!hasTestScore ? (
          <div className="what-if-control is-muted">
            <span className="what-if-control-head">
              <span>What-if test score</span>
            </span>
            <span className="what-if-note">{testReason}</span>
          </div>
        ) : null}

        <div className="what-if-control">
          <span className="what-if-control-head">
            <span>What-if application round</span>
            <strong className="what-if-value">{formatRoundLabel(round)}</strong>
          </span>
          <div
            className="round-toggle"
            role="group"
            aria-label="What-if application round"
          >
            {(["regular", "early"] as ApplicationRound[]).map((option) => (
              <button
                key={option}
                type="button"
                data-active={round === option}
                disabled={roundDisabled}
                onClick={() => setRound(option)}
              >
                {formatRoundLabel(option)}
              </button>
            ))}
          </div>
          {roundReason ? <span className="what-if-note">{roundReason}</span> : null}
        </div>
      </div>

      <ScenarioRangeBand
        baseline={result.probability}
        scenario={scenario?.probability ?? null}
        label={scenarioLabel}
      />

      <div className="what-if-summary" aria-live="polite">
        <span>
          Current{" "}
          <strong>
            {formatChanceRange(result.probability.low, result.probability.high)}
          </strong>
        </span>
        {scenario ? (
          <>
            <span aria-hidden="true">-&gt;</span>
            <span>
              What-if{" "}
              <strong>
                {formatChanceRange(
                  scenario.probability.low,
                  scenario.probability.high,
                )}
              </strong>
            </span>
            <span className="what-if-delta">
              marker {formatSignedPoints(
                scenario.probability.calibrated -
                  result.probability.calibrated,
              )}
            </span>
          </>
        ) : null}
      </div>

      <div className="what-if-actions">
        {status === "loading" ? (
          <span className="what-if-status">
            <Loader2 size={14} aria-hidden="true" />
            Recomputing modeled range...
          </span>
        ) : null}
        {status === "error" ? (
          <span className="what-if-error">
            Could not recompute. Showing current range.
            {error ? ` ${error}` : ""}
            <button
              type="button"
              className="what-if-retry"
              onClick={() => setRetryTick((current) => current + 1)}
            >
              Retry
            </button>
          </span>
        ) : null}
      </div>
      <span className="sr-only" aria-live="polite">
        {liveSummary}
      </span>
    </section>
  );
}

function ScenarioRangeBand({
  baseline,
  scenario,
  label,
}: {
  baseline: ChanceResponse["probability"];
  scenario: ChanceResponse["probability"] | null;
  label: string;
}) {
  const currentLeft = clampPercent(baseline.low);
  const currentRight = clampPercent(baseline.high);
  const currentWidth = Math.max(1, currentRight - currentLeft);
  const currentPoint = clampPercent(baseline.calibrated);
  const scenarioLeft = scenario ? clampPercent(scenario.low) : currentLeft;
  const scenarioRight = scenario ? clampPercent(scenario.high) : currentRight;
  const scenarioWidth = Math.max(1, scenarioRight - scenarioLeft);
  const scenarioPoint = scenario ? clampPercent(scenario.calibrated) : currentPoint;
  const aria = scenario
    ? `${label}: current ${formatChanceRange(
        baseline.low,
        baseline.high,
      )}, what-if ${formatChanceRange(scenario.low, scenario.high)}.`
    : `Current ${formatChanceRange(baseline.low, baseline.high)}.`;

  return (
    <div
      className="what-if-range-card"
      data-testid="scenario-range"
      role="img"
      tabIndex={0}
      aria-label={aria}
    >
      <div className="what-if-range-head">
        <span>Current</span>
        <strong>{scenario ? label : "What-if waits for a change"}</strong>
      </div>
      <div className="what-if-range-scale" aria-hidden="true">
        <div className="what-if-range-rail">
          <span
            className="what-if-band current"
            style={{ left: `${currentLeft}%`, width: `${currentWidth}%` }}
          />
          <span
            className="what-if-tick current"
            style={{ left: `${currentPoint}%` }}
          />
          {scenario ? (
            <>
              <span
                className="what-if-band scenario"
                style={{ left: `${scenarioLeft}%`, width: `${scenarioWidth}%` }}
              />
              <span
                className="what-if-tick scenario"
                style={{ left: `${scenarioPoint}%` }}
              />
            </>
          ) : null}
        </div>
        <div className="what-if-range-labels">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}

function CannotSeePanel() {
  const items = [
    { label: "Essays", icon: BookOpen },
    { label: "Recs", icon: FileText },
    { label: "Interest", icon: MessageCircle },
  ];

  return (
    <section className="cannot-see-panel" data-testid="cannot-see-panel">
      <div className="section-kicker">What Admira can&apos;t see</div>
      <ul className="blind-spot-list" aria-label="Unmodeled application factors">
        {items.map(({ label, icon: Icon }) => (
          <li key={label}>
            <span className="blind-spot-icon" aria-hidden="true">
              <Icon size={15} />
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ul>
      <p className="blind-spot-caption">That is why the band stays wide.</p>
    </section>
  );
}

function fallbackClimbLevers(): ClimbLever[] {
  return [
    {
      id: "test_score",
      label: "Test score",
      kind: "direction_only",
      direction: "Modeled when the server returns a higher submitted-score rerun.",
      note: "No numeric delta is displayed without a real model rerun.",
    },
    {
      id: "application_round",
      label: "Application round",
      kind: "direction_only",
      direction: "Could matter at some schools when published ED/RD rates exist.",
      note: "No published spread is loaded in this response.",
    },
    {
      id: "essays",
      label: "Essays",
      kind: "direction_only",
      direction: "Can narrow the real outcome range, but is not in this model yet.",
      note: "Public data cannot evaluate writing quality or application narrative.",
    },
    {
      id: "recommendations",
      label: "Recommendations",
      kind: "direction_only",
      direction: "Can narrow the real outcome range, but is not in this model yet.",
      note: "Teacher and counselor letters are not visible to the public-data model.",
    },
    {
      id: "demonstrated_interest",
      label: "Demonstrated interest",
      kind: "direction_only",
      direction: "Can narrow the real outcome range, but is not in this model yet.",
      note: "Student-specific engagement evidence is not sent to this model.",
    },
  ];
}

function formatTier(tier: string | null) {
  if (!tier) {
    return "Tier unknown";
  }
  return tier
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function schoolInitial(name: string) {
  const cleaned = name.replace(/^The\s+/i, "").trim();
  return (cleaned[0] ?? "?").toUpperCase();
}

function SchoolSearchPanel({
  query,
  setQuery,
  results,
  status,
  error,
  onAdd,
  addedUnitids,
}: {
  query: string;
  setQuery: (value: string) => void;
  results: SchoolSearchRow[];
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  onAdd: (school: SchoolSearchRow) => void;
  addedUnitids: number[];
}) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const selectableResults = status === "ready" ? results : [];

  // Reset the keyboard cursor whenever the result set changes.
  useEffect(() => {
    setActiveIndex(-1);
  }, [query, status]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (selectableResults.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        Math.min(current + 1, selectableResults.length - 1),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const school = selectableResults[activeIndex];
      if (school && !addedUnitids.includes(school.unitid)) {
        onAdd(school);
      }
    }
  }

  return (
    <section className="search-panel">
      <div className="panel-inner">
        <div className="section-kicker">School search</div>
        <h2 className="section-title">Add a school.</h2>
        <p className="panel-subline">
          Search top U.S. colleges with published admit data. Admira reads each
          one against your profile.
        </p>
        <div className="school-search">
          <label className="control">
            <span className="field-label">Search by school name</span>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--faint)]"
                size={17}
              />
              <input
                id="school-search-input"
                className="text-control pl-10"
                placeholder="MIT, Michigan, Alabama..."
                value={query}
                role="combobox"
                aria-expanded={status === "ready" && results.length > 0}
                aria-controls="school-search-results"
                aria-activedescendant={
                  activeIndex >= 0 ? `school-option-${activeIndex}` : undefined
                }
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
          </label>

          {status !== "idle" ? (
            <div className="search-results" id="school-search-results" role="listbox">
              {status === "loading" ? (
                <div className="search-loading">
                  <div className="search-results-head">Searching_</div>
                  {[0, 1, 2].map((row) => (
                    <div className="search-skeleton-row" key={row} aria-hidden="true">
                      <span className="search-skeleton-sigil" />
                      <span className="search-skeleton-lines">
                        <span />
                        <span />
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              {status === "error" ? (
                <div className="search-empty">
                  <div className="search-empty-icon" aria-hidden="true">
                    <AlertTriangle size={18} />
                  </div>
                  <strong>Search could not run</strong>
                  <span className="muted">{error}</span>
                </div>
              ) : null}
              {status === "ready" && results.length === 0 ? (
                <div className="search-empty">
                  <div className="search-empty-icon" aria-hidden="true">
                    <Search size={18} />
                  </div>
                  <strong>No match for &ldquo;{query}&rdquo;</strong>
                  <span className="muted">
                    Admira covers schools with loaded public admit data. Try a
                    different name.
                  </span>
                  <button
                    type="button"
                    className="search-request"
                    onClick={() => setQuery("")}
                  >
                    Request a school
                  </button>
                </div>
              ) : null}
              {status === "ready" && results.length > 0 ? (
                <>
                  <div className="search-results-head">
                    {results.length} {results.length === 1 ? "school" : "schools"}
                  </div>
                  {results.map((school, index) => {
                    const alreadyAdded = addedUnitids.includes(school.unitid);
                    return (
                      <button
                        key={school.unitid}
                        id={`school-option-${index}`}
                        className="search-result"
                        type="button"
                        data-active={index === activeIndex ? "true" : undefined}
                        disabled={alreadyAdded}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => onAdd(school)}
                      >
                        <span className="search-sigil" aria-hidden="true">
                          {schoolInitial(school.name)}
                        </span>
                        <span className="search-result-copy">
                          <strong>{school.name}</strong>
                          <span className="helper">
                            {schoolLocationLabel(school)} &middot;{" "}
                            {formatTier(school.selectivity_tier)}
                          </span>
                        </span>
                        <span
                          className="search-add"
                          data-added={alreadyAdded ? "true" : undefined}
                          aria-hidden="true"
                        >
                          {alreadyAdded ? <Check size={15} /> : <Plus size={15} />}
                        </span>
                      </button>
                    );
                  })}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function BalancePanel({ labels }: { labels: BandLabel[] }) {
  const counts = labelOrder.reduce<Record<BandLabel, number>>(
    (acc, label) => ({ ...acc, [label]: 0 }),
    { reach: 0, target: 0, likely: 0 },
  );

  labels.forEach((label) => {
    counts[label] += 1;
  });

  const total = labels.length;
  const warning =
    total === 0
      ? ""
      : counts.reach === total
        ? "Every school on your list is a reach. Consider adding schools where the band sits higher."
        : counts.likely === 0
          ? "No likely bands yet. Add at least one school whose interval clears the upper half of the scale."
          : "";

  const segments: { key: BandLabel; label: string }[] = [
    { key: "reach", label: "Reach" },
    { key: "target", label: "Target" },
    { key: "likely", label: "Likely" },
  ];

  function focusSearch() {
    const el = document.getElementById("school-search-input");
    el?.scrollIntoView({ block: "center" });
    (el as HTMLInputElement | null)?.focus();
  }

  return (
    <>
      <section className="balance-panel">
        <div className="panel-inner">
          <div className="section-kicker">List balance</div>
          <h2 className="section-title">Your balance.</h2>
          <p className="panel-subline">
            Across {total} {total === 1 ? "school" : "schools"}.
          </p>
          <div
            className="balance-bar"
            aria-label="Interval-derived list balance"
            role="img"
          >
            {segments.map((segment) =>
              counts[segment.key] > 0 ? (
                <span
                  key={segment.key}
                  className="balance-seg"
                  data-band={segment.key}
                  style={{ flexGrow: counts[segment.key] }}
                />
              ) : null,
            )}
          </div>
          <ul className="balance-rows">
            {segments.map((segment) => (
              <li key={segment.key} data-band={segment.key}>
                <span className="balance-swatch" aria-hidden="true" />
                <span className="balance-row-label">{segment.label}</span>
                <span className="balance-row-count mono">{counts[segment.key]}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      {warning ? (
        <section className="lopsided-block">
          <div className="section-kicker chance-kicker lopsided-kicker">
            <AlertTriangle size={13} aria-hidden="true" />
            Lopsided list
          </div>
          <p data-testid="balance-warning" role="status">
            {warning}
          </p>
          <button
            type="button"
            className="profile-save balance-cta"
            onClick={focusSearch}
          >
            Balance my list
          </button>
        </section>
      ) : null}
    </>
  );
}

function ResultState({
  entry,
  profile,
  onRemove,
}: {
  entry: AddedSchool;
  profile: Profile;
  onRemove: () => void;
}) {
  if (entry.status === "loading") {
    return <LoadingCard school={entry.school} onRemove={onRemove} />;
  }

  if (entry.status === "error") {
    return (
      <article className="result-card">
        <div className="result-head">
          <div>
            <div className="section-kicker">Request failed</div>
            <h3 className="result-title">{entry.school.name}</h3>
            <p className="error-copy">{entry.error}</p>
          </div>
          <button className="icon-button" type="button" onClick={onRemove}>
            <Trash2 size={18} />
          </button>
        </div>
      </article>
    );
  }

  if (entry.intelligence) {
    return (
      <AdmitIntelligenceCard
        result={entry.intelligence}
        school={entry.school}
        onRemove={onRemove}
      />
    );
  }

  return entry.result ? (
    <ResultCard result={entry.result} profile={profile} onRemove={onRemove} />
  ) : null;
}

function LoadingCard({
  school,
  onRemove,
}: {
  school: SchoolSearchRow;
  onRemove: () => void;
}) {
  return (
    <article className="loading-card" aria-busy="true">
      <div className="result-head px-0 pt-0">
        <div>
          <div className="section-kicker">Measuring range</div>
          <h3 className="result-title">{school.name}</h3>
        </div>
        <button className="icon-button" type="button" onClick={onRemove}>
          <Trash2 size={18} />
        </button>
      </div>
      <div className="skeleton-band mt-4" />
      <p className="helper">
        Admira is waiting for the interval. No temporary number is shown.
      </p>
    </article>
  );
}

function AdmitIntelligenceCard({
  result,
  school,
  onRemove,
}: {
  result: AdmitIntelligenceResponse;
  school: SchoolSearchRow;
  onRemove: () => void;
}) {
  const countryLabel = result.country === "CA" ? "Canada" : "United States";
  const programCopy = result.program
    ? `${result.program.name} - cutoff ${formatCutoff(result.program.cutoff)}`
    : formatTier(school.selectivity_tier);
  const verdictDrivers: VerdictDriver[] = result.drivers.slice(0, 4).map((driver) => ({
    label: driver.label,
    direction: mapDriverDirection(driver.direction),
  }));
  const hasRange =
    typeof result.probability.low === "number" &&
    typeof result.probability.high === "number";

  return (
    <article className="result-card admit-card" data-testid="admit-card">
      <div className="result-head admit-head">
        <div className="result-head-main">
          <span className="result-sigil admit-sigil" aria-hidden="true">
            {schoolInitial(school.name)}
          </span>
          <div>
            <div className="section-kicker">Admit Intelligence</div>
            <h3 className="result-title">{school.name}</h3>
            <p className="helper">
              {countryLabel} &middot; {programCopy}
            </p>
          </div>
        </div>
        <div className="result-head-actions">
          <button
            className="icon-button"
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${school.name}`}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <VerdictBlock
        tone={result.tier.toLowerCase()}
        chipLabel={formatAdmitTier(result.tier)}
        headline={`${result.tier} at ${result.score}/100.`}
        countUp={{ value: result.score, suffix: "/100" }}
        drivers={verdictDrivers}
      />

      {hasRange ? (
        <section className="range-section" aria-labelledby={`admit-range-${school.unitid}`}>
          <div className="band-label" id={`admit-range-${school.unitid}`}>
            Modeled chance range
          </div>
          <RangeBar
            low={result.probability.low as number}
            high={result.probability.high as number}
            point={result.probability.calibrated}
            label={`${school.name} chance range`}
          />
        </section>
      ) : null}

      <div className="confidence-texture admit-confidence">
        <span className="micro-label">Model certainty</span>
        <span className="confidence-bars" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, index) => (
            <i
              key={index}
              data-active={
                index < Math.round(result.confidence * 8) ? "true" : undefined
              }
            />
          ))}
        </span>
        <strong className="mono">{Math.round(result.confidence * 100)}%</strong>
      </div>

      <ProfileStudioPanel profile={result.profile} />
    </article>
  );
}

function ProfileStudioPanel({
  profile,
}: {
  profile: AdmitIntelligenceResponse["profile"];
}) {
  const radarAxes: RadarAxis[] = profile.axes.map((axis) => ({
    key: axis.key,
    label: shortAxisLabel(axis.label),
    value: axis.value,
    reference: axis.admitted,
  }));

  return (
    <section className="profile-studio" data-testid="profile-studio">
      <div className="profile-studio-head">
        <div>
          <div className="section-kicker">Profile Studio</div>
          <h4 className="section-title text-[22px]">Five-axis profile read</h4>
        </div>
        <span className="label-pill">You vs. typical admit</span>
      </div>
      <div className="profile-studio-grid">
        <SignatureRadar axes={radarAxes} label="Five-axis profile read" />
        <ProfileStudioRows axes={profile.axes} />
      </div>
      <p className="helper profile-method">{profile.method}</p>
    </section>
  );
}

function ProfileStudioRows({ axes }: { axes: AdmitProfileAxis[] }) {
  return (
    <ul className="profile-axis-list">
      {axes.map((axis) => (
        <li key={axis.key} data-status={axis.status}>
          <span className="dimension-status">{formatAxisStatus(axis.status)}</span>
          <span>
            <strong>{axis.label}</strong>
            <span className="helper">{axis.note}</span>
          </span>
          <span className="mono">{axis.value}/100</span>
        </li>
      ))}
    </ul>
  );
}

function ResultCard({
  result,
  profile,
  onRemove,
}: {
  result: ChanceResponse;
  profile: Profile;
  onRemove: () => void;
}) {
  const profileConfidence =
    result.band.input_confidence === "low" ? "Limited inputs" : "Standard inputs";
  const verdict = buildChanceVerdict(result);
  const displayLevers = visibleLevers(result.climb_levers ?? fallbackClimbLevers());
  const detailsDisclaimers = filteredDisclaimers(result.disclaimers);

  return (
    <article className="result-card" data-testid="result-card">
      <div className="result-head">
        <div className="result-head-main">
          <span className="result-sigil" aria-hidden="true">
            {schoolInitial(result.school.name)}
          </span>
          <div>
            <div className="section-kicker">School record</div>
            <h3 className="result-title">{result.school.name}</h3>
            <p className="helper">
              {formatTier(result.school.selectivity_tier)} &middot;{" "}
              {result.school.test_policy ?? "unknown"} testing
            </p>
          </div>
        </div>
        <div className="result-head-actions">
          <button
            className="icon-button"
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${result.school.name}`}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <VerdictBlock
        tone={result.band.label}
        chipLabel={formatBandLabel(result.band.label)}
        headline={verdict}
      />

      <section className="range-section" aria-labelledby={`range-${result.school.unitid}`}>
        <div>
          <div className="band-label" id={`range-${result.school.unitid}`}>
            Your chance range
          </div>
          <div className="range-readout">
            <span className="range-value">
              {formatChanceRange(result.probability.low, result.probability.high)}
            </span>
            <span className="label-pill">{profileConfidence}</span>
          </div>
        </div>
          <RangeBar
            low={result.probability.low}
            high={result.probability.high}
            point={result.probability.calibrated}
            label={`${result.school.name} chance range`}
            tierLegend
          />
        {isHighUncertaintyTier(result.school.selectivity_tier) ? (
          <p className="limitation-note" data-testid="sub20-note">
            <strong>Sub-20 limit:</strong> for very selective schools, public
            data cannot see enough of one application to make this narrow.{" "}
            <Link href="/methodology">Read the methodology.</Link>
          </p>
        ) : null}
      </section>

      <ClimbLeversPanel
        levers={displayLevers}
        profile={profile}
        result={result}
      />
      <CannotSeePanel />

      <details className="result-details">
        <summary>
          <span>Why this range / details</span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <div className="result-details-body">
          <p className="detail-note">{result.band.note}</p>
          <RubricPanel result={result} />
          <ShareableRangeCard
            schoolName={result.school.name}
            verdict={verdict}
            low={result.probability.low}
            high={result.probability.high}
            band={result.band.label}
          />
          {detailsDisclaimers.length > 0 ? (
            <DisclaimerPanel disclaimers={detailsDisclaimers} />
          ) : null}
        </div>
      </details>
    </article>
  );
}

function ShareableRangeCard({
  schoolName,
  verdict,
  low,
  high,
  band,
}: {
  schoolName: string;
  verdict: string;
  low: number;
  high: number;
  band: BandLabel;
}) {
  return (
    <section
      className="share-card"
      aria-label={`${schoolName} shareable range card`}
    >
      <div className="share-card-head">
        <span>
          <Share2 size={15} aria-hidden="true" />
          Shareable view
        </span>
        <BandPill label={band} />
      </div>
      <div className="share-card-main">
        <span className="micro-label">My chance range</span>
        <h4>{schoolName}</h4>
        <strong className="share-range">{formatChanceRange(low, high)}</strong>
        <p>{verdict}</p>
      </div>
      <p className="share-card-note">
        Admira shows a range, not a guarantee.
      </p>
    </section>
  );
}

function RubricPanel({ result }: { result: ChanceResponse }) {
  const source =
    typeof result.rubric.c7_factors?._source === "string"
      ? result.rubric.c7_factors._source
      : "";
  const factors = Object.entries(result.rubric.c7_factors ?? {})
    .filter(([key]) => key !== "_source")
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .sort(([, a], [, b]) => ratingWeight(b) - ratingWeight(a))
    .slice(0, 6);

  return (
    <section className="rubric-panel">
      <div className="section-kicker">What this school values</div>
      {factors.length === 0 ? (
        <p className="helper">
          No C7 data for this school yet. Admira keeps the band wide rather
          than guessing.
        </p>
      ) : (
        <ul className="rubric-list">
          {factors.map(([key, rating]) => (
            <li key={key}>
              <strong>{formatFactor(key)}</strong>{" "}
              <span className="rubric-rating">{rating}</span>
            </li>
          ))}
        </ul>
      )}
      {source ? <p className="source-citation">Source: {source}</p> : null}
      <div className="gap-table">
        <GapRow
          label="SAT"
          gap={result.rubric.gaps.sat}
          low={result.school.sat_25}
          high={result.school.sat_75}
        />
        <GapRow
          label="ACT"
          gap={result.rubric.gaps.act}
          low={result.school.act_25}
          high={result.school.act_75}
        />
        <GapRow
          label="GPA"
          gap={result.rubric.gaps.gpa}
          low={null}
          high={result.school.gpa_avg}
        />
      </div>
    </section>
  );
}

function GapRow({
  label,
  gap,
  low,
  high,
}: {
  label: string;
  gap: GapValue;
  low: number | null;
  high: number | null;
}) {
  const hasScore = gap.score !== null;
  const hasRange = hasScore && low !== null && high !== null && high > low;
  const hasAverage = hasScore && !hasRange && high !== null;
  const text =
    hasRange && gap.score !== null
      ? `${label} ${gap.score} vs ${low}-${high}`
      : hasAverage && gap.score !== null
        ? `${label} ${gap.score} vs avg ${high}`
        : hasScore && gap.score !== null
          ? `${label} ${gap.score}. No public band yet.`
          : `${label}: no comparable public data yet.`;

  const lowValue = low ?? 0;
  const highValue = high ?? lowValue + 1;
  const padding = Math.max(1, (highValue - lowValue) * 0.4);
  const visualMin = lowValue - padding;
  const visualMax = highValue + padding;
  const visualSpan = Math.max(1, visualMax - visualMin);
  const bandLeft = ((lowValue - visualMin) / visualSpan) * 100;
  const bandWidth = ((highValue - lowValue) / visualSpan) * 100;
  const markerLeft =
    gap.score === null
      ? 50
      : Math.max(0, Math.min(100, ((gap.score - visualMin) / visualSpan) * 100));

  return (
    <div className="gap-row">
      <strong className="mono">{label}</strong>
      <div className="gap-main">
        <span className="gap-copy">{text}</span>
        {hasRange ? (
          <span className="gap-line" aria-hidden="true">
            <span
              className="gap-band"
              style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
            />
            <span
              className="gap-marker"
              style={{ left: `${markerLeft}%` }}
            />
          </span>
        ) : (
          <span className="helper">Public range not available.</span>
        )}
      </div>
    </div>
  );
}

function DisclaimerPanel({ disclaimers }: { disclaimers: string[] }) {
  return (
    <section className="disclaimer-panel">
      <div className="section-kicker">Data notes</div>
      <ul className="disclaimer-list">
        {disclaimers.map((disclaimer) => (
          <li key={disclaimer} className="disclaimer-line">
            {disclaimer}
          </li>
        ))}
      </ul>
    </section>
  );
}

const POPULAR_SCHOOLS = [
  { label: "Northwestern", query: "Northwestern" },
  { label: "UCLA", query: "California-Los Angeles" },
  { label: "Georgia Tech", query: "Georgia Institute" },
  { label: "Michigan", query: "Michigan-Ann Arbor" },
];

function EmptyState({ onPick }: { onPick: (query: string) => void }) {
  return (
    <section className="empty-state-card">
      <div className="empty-state-inner">
        <div className="empty-pin" aria-hidden="true">
          <MapPin size={20} />
        </div>
        <h2 className="empty-title">Your first read appears here.</h2>
        <p className="empty-sub">
          Add a school and we&apos;ll show your chance as a range, plus what
          goes into it.
        </p>
        <div className="popular-block">
          <div className="micro-label">Popular right now</div>
          <div className="popular-chips">
            {POPULAR_SCHOOLS.map((school) => (
              <button
                key={school.label}
                type="button"
                className="popular-chip"
                onClick={() => onPick(school.query)}
              >
                <Plus size={13} aria-hidden="true" />
                {school.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="empty-footnote">
        <span className="footnote-dot" aria-hidden="true" />
        Calibrated on real CDS admit data. Ranges, not points.
      </p>
    </section>
  );
}

function ratingWeight(rating: string) {
  switch (rating) {
    case "Very Important":
      return 4;
    case "Important":
      return 3;
    case "Considered":
      return 2;
    case "Not Considered":
      return 1;
    default:
      return 0;
  }
}

function formatFactor(factor: string) {
  return factor
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

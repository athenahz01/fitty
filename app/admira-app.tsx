"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  FileText,
  GraduationCap,
  Loader2,
  MapPin,
  MessageCircle,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
} from "lucide-react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { trackEvent } from "@/lib/analytics";
import { searchLocalSchoolFixtures } from "@/lib/school-fixtures";
import { createSupabaseBrowserClient } from "@/lib/supabase";

import { OutcomeDataControlsPanel } from "./outcome-data-controls";
import { OutcomeCapturePanel } from "./outcome-capture-panel";
import { OutcomeSessionProvider } from "./outcome-session";

type ApplicationRound = "regular" | "early";
type BandLabel = "reach" | "target" | "likely";

type Profile = {
  gpa: string;
  sat: string;
  act: string;
  notSubmittingTests: boolean;
  intendedMajor: string;
  applicationRound: ApplicationRound;
  homeState: string;
  activityNote: string;
};

type SchoolSearchRow = {
  unitid: number;
  name: string;
  state: string | null;
  selectivity_tier: string | null;
  sat_25: number | null;
  sat_75: number | null;
  act_25: number | null;
  act_75: number | null;
  test_policy: string | null;
};

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

type AddedSchool = {
  school: SchoolSearchRow;
  status: "loading" | "ready" | "error";
  result?: ChanceResponse;
  error?: string;
};

type FitPreferences = {
  interests: string;
  preferredSize: "" | "small" | "medium" | "large";
  preferredSetting: "" | "city" | "suburb" | "town" | "rural";
  preferredRegion: "" | "Northeast" | "Midwest" | "South" | "West";
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
  disclaimers: string[];
};

type FitResult = {
  school: {
    unitid: number;
    name: string;
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

type FitScore = {
  score: number | null;
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

type FitFinderStatus = "checking" | "enabled" | "disabled";

const initialProfile: Profile = {
  gpa: "3.85",
  sat: "1480",
  act: "",
  notSubmittingTests: false,
  intendedMajor: "Undecided",
  applicationRound: "regular",
  homeState: "NY",
  activityNote: "",
};

const initialFitPreferences: FitPreferences = {
  interests: "",
  preferredSize: "",
  preferredSetting: "",
  preferredRegion: "",
  costCeiling: "",
  learningStyleNotes: "",
};

const labelOrder: BandLabel[] = ["reach", "target", "likely"];
const useLocalSchoolFixture =
  process.env.NEXT_PUBLIC_ADMIRA_USE_LOCAL_SCHOOL_FIXTURE === "true";

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

function formatPercentPrecise(value: number) {
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
}

function formatDeltaPoints(value: number) {
  const rounded = Math.round(value * 100);
  if (rounded === 0) {
    return "0 pts";
  }
  return `${rounded > 0 ? "+" : ""}${rounded} pts`;
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

function formatLeverDelta(lever: ClimbLever) {
  if (!lever.delta) {
    return "not in the model yet";
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

function validateProfile(profile: Profile) {
  const errors: string[] = [];
  const gpa = numberOrUndefined(profile.gpa);
  const sat = numberOrUndefined(profile.sat);
  const act = numberOrUndefined(profile.act);

  if (gpa !== undefined && (gpa < 0 || gpa > 5)) {
    errors.push("GPA must be between 0 and 5.");
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
  const sat = numberOrUndefined(profile.sat);
  const act = numberOrUndefined(profile.act);
  const out: { gpa?: string; sat?: string; act?: string } = {};

  if (gpa !== undefined && (gpa < 0 || gpa > 5)) {
    out.gpa = "GPA is out of range. Use 0 to 5.";
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

function buildChanceBody(profile: Profile, unitid: number) {
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

export function AdmiraApp() {
  const { theme, toggleTheme } = useTheme();
  const [profile, setProfile] = useState<Profile>(initialProfile);
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
  const searchRequest = useRef(0);

  const profileErrors = useMemo(() => validateProfile(profile), [profile]);
  const noAcademicInput =
    profile.notSubmittingTests ||
    (!numberOrUndefined(profile.sat) && !numberOrUndefined(profile.act));

  useEffect(() => {
    trackEvent("page_view", { path: "/" });
  }, []);

  useEffect(() => {
    let active = true;

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

    void loadFitFinderStatus();

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

        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("schools")
          .select(
            "unitid,name,state,selectivity_tier,sat_25,sat_75,act_25,act_75,test_policy",
          )
          .ilike("name", `%${query}%`)
          .order("name", { ascending: true })
          .limit(8);

        if (requestId !== searchRequest.current) {
          return;
        }

        if (error) {
          throw error;
        }

        setSchoolResults(data ?? []);
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
    try {
      const response = await fetch("/api/chance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildChanceBody(profile, school.unitid)),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? "Chance request failed.");
      }

      setAddedSchools((current) =>
        current.map((entry) =>
          entry.school.unitid === school.unitid
            ? { school, status: "ready", result: payload as ChanceResponse }
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
      current.map((entry) => ({ ...entry, status: "loading", error: undefined })),
    );

    for (const school of schools) {
      await fetchChance(school);
    }
  }

  function removeSchool(unitid: number) {
    setAddedSchools((current) =>
      current.filter((entry) => entry.school.unitid !== unitid),
    );
  }

  const readyResults = addedSchools
    .map((entry) => entry.result)
    .filter((result): result is ChanceResponse => Boolean(result));

  return (
    <main className="admira-shell">
      <div className="admira-frame">
        <header className="app-topbar">
          <div className="brand-mark">
            <div className="brand-sigil" aria-hidden="true">
              A
            </div>
            <div className="brand-copy">
              <h1>Admira</h1>
              <p>honest college chances</p>
            </div>
          </div>
          <div className="topbar-actions">
            <Link className="method-link" href="/methodology">
              Methodology
            </Link>
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

        <div className="workspace-grid">
          <aside className="planning-column" aria-label="Student profile and school list">
            <ProfilePanel
              profile={profile}
              setProfile={setProfile}
              errors={profileErrors}
              notice={formNotice}
              noAcademicInput={noAcademicInput}
              onSave={recalculateAll}
            />
            {readyResults.length > 0 ? <BalancePanel results={readyResults} /> : null}
          </aside>

          <section className="results-column" aria-label="School chance results">
            {fitFinderStatus === "enabled" ? (
              <FitFinderPanel
                profile={profile}
                setProfile={setProfile}
                profileErrors={profileErrors}
                profileReady={hasProfileForFit(profile)}
                onAddSchool={addSchool}
                addedUnitids={addedSchools.map((entry) => entry.school.unitid)}
              />
            ) : null}
            <SchoolSearchPanel
              query={schoolQuery}
              setQuery={setSchoolQuery}
              results={schoolResults}
              status={schoolSearchStatus}
              error={schoolSearchError}
              onAdd={addSchool}
              addedUnitids={addedSchools.map((entry) => entry.school.unitid)}
            />
            {addedSchools.length === 0 ? (
              <EmptyState onPick={setSchoolQuery} />
            ) : (
              <>
                <div className="results-head">
                  <div>
                    <div className="section-kicker">Your schools</div>
                    <h2 className="section-title">Read the range first.</h2>
                  </div>
                  <span className="results-count mono">
                    {addedSchools.length} added &middot; sorted by odds
                  </span>
                </div>
                {addedSchools.map((entry) => (
                  <ResultState
                    key={entry.school.unitid}
                    entry={entry}
                    onRemove={() => removeSchool(entry.school.unitid)}
                  />
                ))}
                <button
                  className="recalc-button"
                  type="button"
                  onClick={recalculateAll}
                  disabled={addedSchools.some((entry) => entry.status === "loading")}
                >
                  <RefreshCw size={16} />
                  Recalculate list
                </button>
              </>
            )}
          </section>
        </div>

        <OutcomeSessionProvider>
          <OutcomeCapturePanel />
          <OutcomeDataControlsPanel />
        </OutcomeSessionProvider>
      </div>
    </main>
  );
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
  onSave,
}: {
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
  errors: string[];
  notice: string;
  noAcademicInput: boolean;
  onSave: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  function update(key: keyof Profile, value: string | boolean) {
    setIsEditing(true);
    setProfile((current) => ({ ...current, [key]: value }));
  }

  const readiness = profileReadiness(profile);
  const fieldErrors = profileFieldErrors(profile);
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  const isComplete = readiness === 100 && errors.length === 0 && !hasFieldErrors;
  const showSummary = isComplete && !isEditing;

  function handleSave() {
    onSave();
    if (isComplete) {
      setIsEditing(false);
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
          The more Admira knows, the tighter every range.
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
              Academic inputs drive the range. Major, home state, and activities
              help planning and Fit Finder context.
            </p>
          </div>
        ) : (
          <>
        <div className="profile-grid">
          <div className="field-pair">
            <label className="control">
              <span className="field-label">GPA</span>
              <input
                className="text-control mono"
                aria-label="GPA"
                inputMode="decimal"
                placeholder="3.85"
                value={profile.gpa}
                data-invalid={fieldErrors.gpa ? "true" : undefined}
                aria-invalid={fieldErrors.gpa ? true : undefined}
                onChange={(event) => update("gpa", event.target.value)}
              />
              {fieldErrors.gpa ? (
                <FieldError text={fieldErrors.gpa} />
              ) : (
                <span className="helper">On a 0 to 5 scale.</span>
              )}
            </label>
            <label className="control">
              <span className="field-label">Home state</span>
              <input
                className="text-control"
                placeholder="NY"
                value={profile.homeState}
                onChange={(event) => update("homeState", event.target.value)}
              />
              <span className="helper">Planning context.</span>
            </label>
          </div>

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
                data-invalid={fieldErrors.sat ? "true" : undefined}
                aria-invalid={fieldErrors.sat ? true : undefined}
                onChange={(event) => update("sat", event.target.value)}
              />
              {fieldErrors.sat ? (
                <FieldError text={fieldErrors.sat} />
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
                data-invalid={fieldErrors.act ? "true" : undefined}
                aria-invalid={fieldErrors.act ? true : undefined}
                onChange={(event) => update("act", event.target.value)}
              />
              {fieldErrors.act ? (
                <FieldError text={fieldErrors.act} />
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

          <label className="control">
            <span className="field-label field-label-row">
              Activities and context
              <span className="not-scored-tag">Not scored yet</span>
            </span>
            <textarea
              className="activity-control"
              placeholder="Robotics captain, published research, part-time job..."
              value={profile.activityNote}
              onChange={(event) => update("activityNote", event.target.value)}
            />
            <span className="helper">
              Context for planning, not scoring.
            </span>
          </label>
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
            No submitted SAT or ACT is being sent. Admira will still respond, but
            the band is widened and marked low input confidence.
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
      setError("Add interests, an intended major, or learning notes first.");
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
            <span className="field-label">Learning notes</span>
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
  if (status === "idle") {
    return (
      <div className="fit-empty">
        <Sparkles size={18} aria-hidden="true" />
        <p className="helper">
          Add a few preferences to search the embedded school profile set.
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
          or published cost.
        </p>
        <FitDisclaimers disclaimers={response.disclaimers} />
      </div>
    );
  }

  return (
    <div className="fit-results" data-testid="fit-results">
      <FitBalanceSummary response={response} />
      {response.results.map((result) => (
        <FitResultCard
          key={result.school.unitid}
          result={result}
          explanation={explanations[result.school.unitid]}
          onAddSchool={onAddSchool}
          alreadyAdded={addedUnitids.includes(result.school.unitid)}
          resultCount={response.results.length}
        />
      ))}
      <FitDisclaimers disclaimers={response.disclaimers} />
    </div>
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
    state: null,
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
          <RangeBand
            low={result.probability.low}
            high={result.probability.high}
            point={result.probability.calibrated}
            label={`${result.school.name} honest range`}
            coverage={result.probability.coverage}
            showMarkerValue={false}
          />
          <ReachLadder
            low={result.probability.low}
            high={result.probability.high}
            point={result.probability.calibrated}
            label={result.band.label}
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
          FIT is not an admit probability. It is an equal-weight overlap across
          known radar axes.
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

function ReachLadder({
  low,
  high,
  point,
  label,
}: {
  low: number;
  high: number;
  point: number;
  label: BandLabel;
}) {
  const left = clampPercent(low);
  const right = clampPercent(high);
  const width = Math.max(1, right - left);
  const pointLeft = clampPercent(point);

  return (
    <section
      className="reach-ladder"
      data-testid="reach-ladder"
      aria-label={`Reach ladder: range ${formatChanceRange(low, high)}, marker ${formatPercentPrecise(point)}, label ${label}.`}
    >
      <div className="micro-label">Reach ladder</div>
      <div className="ladder-track" aria-hidden="true">
        <span className="ladder-zone reach" />
        <span className="ladder-zone target" />
        <span className="ladder-zone likely" />
        <span
          className="ladder-band"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        <span className="ladder-tick" style={{ left: `${pointLeft}%` }} />
      </div>
      <div className="ladder-labels" aria-hidden="true">
        <span className="reach">Reach</span>
        <span className="target">Target</span>
        <span className="likely">Likely</span>
      </div>
      <p className="scale-caption">
        The ladder follows the range.
      </p>
    </section>
  );
}

function ClimbLeversPanel({ levers }: { levers: ClimbLever[] }) {
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
    </section>
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
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </label>

          {status !== "idle" ? (
            <div className="search-results" role="listbox">
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
                    Admira only covers accredited U.S. colleges with published
                    admit data. Try a different name.
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
                  {results.map((school) => {
                    const alreadyAdded = addedUnitids.includes(school.unitid);
                    return (
                      <button
                        key={school.unitid}
                        className="search-result"
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => onAdd(school)}
                      >
                        <span className="search-sigil" aria-hidden="true">
                          {schoolInitial(school.name)}
                        </span>
                        <span className="search-result-copy">
                          <strong>{school.name}</strong>
                          <span className="helper">
                            {school.state ?? "State unknown"} &middot;{" "}
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

function BalancePanel({ results }: { results: ChanceResponse[] }) {
  const counts = labelOrder.reduce<Record<BandLabel, number>>(
    (acc, label) => ({ ...acc, [label]: 0 }),
    { reach: 0, target: 0, likely: 0 },
  );

  results.forEach((result) => {
    counts[result.band.label] += 1;
  });

  const total = results.length;
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
  onRemove,
}: {
  entry: AddedSchool;
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

  return entry.result ? (
    <ResultCard result={entry.result} onRemove={onRemove} />
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

function ResultCard({
  result,
  onRemove,
}: {
  result: ChanceResponse;
  onRemove: () => void;
}) {
  const profileConfidence =
    result.band.input_confidence === "low" ? "Low input confidence" : "Standard input";
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
          <BandPill label={result.band.label} />
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

      <p className="result-verdict">{verdict}</p>

      <section className="range-section" aria-labelledby={`range-${result.school.unitid}`}>
        <div>
          <div className="band-label" id={`range-${result.school.unitid}`}>
            Our honest range
          </div>
          <div className="range-readout">
            <span className="range-value">
              {formatChanceRange(result.probability.low, result.probability.high)}
            </span>
            <span className="label-pill">{profileConfidence}</span>
          </div>
        </div>
          <RangeBand
            low={result.probability.low}
            high={result.probability.high}
            point={result.probability.calibrated}
          label={`${result.school.name} honest range`}
          coverage={result.probability.coverage}
        />
        <ReachLadder
          low={result.probability.low}
          high={result.probability.high}
          point={result.probability.calibrated}
            label={result.band.label}
          />
        {isHighUncertaintyTier(result.school.selectivity_tier) ? (
          <p className="limitation-note" data-testid="sub20-note">
            <strong>Sub-20 limit:</strong> for very selective schools, public
            data cannot see enough of one application to make this narrow.{" "}
            <Link href="/methodology">Read the methodology.</Link>
          </p>
        ) : null}
      </section>

      <ClimbLeversPanel levers={displayLevers} />
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

function RangeBand({
  low,
  high,
  point,
  label,
  coverage,
  showMarkerValue = true,
}: {
  low: number;
  high: number;
  point: number;
  label: string;
  coverage: number;
  showMarkerValue?: boolean;
}) {
  const left = clampPercent(low);
  const right = clampPercent(high);
  const width = Math.max(1, right - left);
  const pointLeft = clampPercent(point);
  const aria = showMarkerValue
    ? `${label}: ${Math.round(coverage * 100)} percent honest range from ${formatPercentPrecise(low)} to ${formatPercentPrecise(high)}; marker at ${formatPercentPrecise(point)}.`
    : `${label}: ${Math.round(coverage * 100)} percent honest range from ${formatPercentPrecise(low)} to ${formatPercentPrecise(high)} with an interior marker.`;

  return (
    <div
      className="range-scale"
      data-testid="range-band"
      role="img"
      aria-label={aria}
      tabIndex={0}
    >
      <div className="scale-rail" aria-hidden="true">
        <div
          className="scale-band"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        <div className="scale-point" style={{ left: `${pointLeft}%` }} />
      </div>
      <span className="scale-end left">0%</span>
      <span className="scale-end right">100%</span>
    </div>
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
        <span className="micro-label">My honest range</span>
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
          Add a school and Admira shows an honest range, never a single number,
          plus what it cannot see.
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

"use client";

import Link from "next/link";
import {
  BookOpen,
  Check,
  Compass,
  FileSearch,
  Loader2,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Trash2,
} from "lucide-react";
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
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
  process.env.NEXT_PUBLIC_FITTY_USE_LOCAL_SCHOOL_FIXTURE === "true";

function numberOrUndefined(value: string) {
  if (value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatPercentPrecise(value: number) {
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
}

function formatFeatureName(feature: string) {
  return feature
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
    const stored = window.localStorage.getItem("fitty-theme");
    const nextTheme = stored === "dark" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      window.localStorage.setItem("fitty-theme", next);
      return next;
    });
  }

  return { theme, toggleTheme };
}

export function FittyApp() {
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
    <main className="fitty-shell">
      <div className="almanac-frame">
        <header className="ledger-topbar">
          <div className="brand-mark">
            <div className="brand-sigil" aria-hidden="true">
              F
            </div>
            <div className="brand-copy">
              <h1>Fitty</h1>
              <p>
                Honest admissions odds, rendered as ranges you can reason with.
              </p>
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
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
              <span>{theme === "light" ? "Dark ledger" : "Light ledger"}</span>
            </button>
          </div>
        </header>

        <div className="workspace-grid">
          <aside className="ledger-column" aria-label="Student profile and school list">
            <ProfilePanel
              profile={profile}
              setProfile={setProfile}
              errors={profileErrors}
              notice={formNotice}
              noAcademicInput={noAcademicInput}
            />
            <SchoolSearchPanel
              query={schoolQuery}
              setQuery={setSchoolQuery}
              results={schoolResults}
              status={schoolSearchStatus}
              error={schoolSearchError}
              onAdd={addSchool}
              addedUnitids={addedSchools.map((entry) => entry.school.unitid)}
            />
            <BalancePanel results={readyResults} />
            {addedSchools.length > 0 ? (
              <button
                className="add-button"
                type="button"
                onClick={recalculateAll}
                disabled={addedSchools.some((entry) => entry.status === "loading")}
              >
                <RefreshCw size={16} />
                Recalculate list
              </button>
            ) : null}
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
            {addedSchools.length === 0 ? (
              <EmptyState />
            ) : (
              addedSchools.map((entry) => (
                <ResultState
                  key={entry.school.unitid}
                  entry={entry}
                  onRemove={() => removeSchool(entry.school.unitid)}
                />
              ))
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

function ProfilePanel({
  profile,
  setProfile,
  errors,
  notice,
  noAcademicInput,
}: {
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
  errors: string[];
  notice: string;
  noAcademicInput: boolean;
}) {
  function update(key: keyof Profile, value: string | boolean) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="ledger-panel" id="student-profile">
      <div className="panel-inner">
        <div className="section-kicker">Student profile</div>
        <h2 className="section-title">Academic evidence entered here.</h2>
        <div className="profile-grid">
          <div className="field-pair">
            <label className="control">
              <span className="field-label">GPA</span>
              <input
                className="text-control mono"
                inputMode="decimal"
                placeholder="3.85"
                value={profile.gpa}
                onChange={(event) => update("gpa", event.target.value)}
              />
            </label>
            <label className="control">
              <span className="field-label">Home state</span>
              <input
                className="text-control"
                placeholder="NY"
                value={profile.homeState}
                onChange={(event) => update("homeState", event.target.value)}
              />
              <span className="helper">Not yet used by the model.</span>
            </label>
          </div>

          <div className="toggle-row">
            <div>
              <div className="field-label">Test submission</div>
              <div className="helper">Leave off to show the widened band.</div>
            </div>
            <button
              type="button"
              data-active={profile.notSubmittingTests}
              onClick={() => update("notSubmittingTests", !profile.notSubmittingTests)}
            >
              {profile.notSubmittingTests ? "Not submitting" : "Submitting"}
            </button>
          </div>

          <div className="field-pair">
            <label className="control">
              <span className="field-label">SAT</span>
              <input
                className="text-control mono"
                disabled={profile.notSubmittingTests}
                inputMode="numeric"
                placeholder="1480"
                value={profile.sat}
                onChange={(event) => update("sat", event.target.value)}
              />
            </label>
            <label className="control">
              <span className="field-label">ACT</span>
              <input
                className="text-control mono"
                disabled={profile.notSubmittingTests}
                inputMode="numeric"
                placeholder="33"
                value={profile.act}
                onChange={(event) => update("act", event.target.value)}
              />
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
          </div>

          <label className="control">
            <span className="field-label">Intended major</span>
            <input
              className="text-control"
              placeholder="Undecided"
              value={profile.intendedMajor}
              onChange={(event) => update("intendedMajor", event.target.value)}
            />
            <span className="helper">Collected for planning; not yet used by the model.</span>
          </label>

          <label className="control">
            <span className="field-label">Activity-tier note</span>
            <textarea
              className="activity-control"
              placeholder="Optional context. Not yet used by the model."
              value={profile.activityNote}
              onChange={(event) => update("activityNote", event.target.value)}
            />
            <span className="helper">Planned context field; not sent to inference yet.</span>
          </label>
        </div>

        {errors.length > 0 ? (
          <p className="error-copy" role="alert">
            {errors.join(" ")}
          </p>
        ) : null}
        {notice ? (
          <p className="error-copy" role="alert">
            {notice}
          </p>
        ) : null}
        {noAcademicInput ? (
          <p className="helper">
            No submitted SAT or ACT is being sent. Fitty will still respond, but
            the band is widened and marked low input confidence.
          </p>
        ) : null}
      </div>
    </section>
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
          attributes and the chancing interval, not a single score.
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
          Add a few preferences to search the embedded school ledger.
        </p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="fit-empty" aria-busy="true">
        <div className="skeleton-band" />
        <p className="helper">
          Searching by embedded fit signals. No temporary score is shown.
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
        <button
          className="capture-secondary"
          type="button"
          disabled={alreadyAdded}
          onClick={handleAddSchool}
        >
          <Plus size={16} />
          {alreadyAdded ? "Added" : "Add to my Fitty list"}
        </button>
      </div>

      <div className="fit-range-block">
        <div className="range-readout">
          <span className="range-value">
            {formatPercent(result.probability.low)}-
            {formatPercent(result.probability.high)}
          </span>
          <span className="label-pill">{result.band.label}</span>
        </div>
        <RangeBand
          low={result.probability.low}
          high={result.probability.high}
          point={result.probability.calibrated}
          label={`${result.school.name} fit result admission prior interval`}
          coverage={result.probability.coverage}
          showMarkerValue={false}
        />
      </div>

      <div className="fit-reason-grid">
        <FitReasonList title="Matched" items={result.match_reasons.matched} />
        <FitReasonList title="Notable" items={result.match_reasons.notable} />
      </div>

      <div className="cost-note" data-status={result.match_reasons.cost_status}>
        <strong>Cost status: {formatCostStatus(result.match_reasons.cost_status)}</strong>
        <span>
          Published cost only. Merit aid is not predicted.
        </span>
      </div>

      <FitExplanation explanation={explanation} />
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
        <div className="section-kicker">School list</div>
        <h2 className="section-title">Add schools to measure.</h2>
        <div className="school-search">
          <label className="control">
            <span className="field-label">Search by school name</span>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ledger-faint)]"
                size={17}
              />
              <input
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
                <div className="search-result">
                  <span className="muted">Searching public school table...</span>
                </div>
              ) : null}
              {status === "error" ? (
                <div className="search-result">
                  <span className="muted">{error}</span>
                </div>
              ) : null}
              {status === "ready" && results.length === 0 ? (
                <div className="search-result">
                  <span className="muted">No matching schools found.</span>
                </div>
              ) : null}
              {status === "ready"
                ? results.map((school) => {
                    const alreadyAdded = addedUnitids.includes(school.unitid);
                    return (
                      <button
                        key={school.unitid}
                        className="search-result"
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => onAdd(school)}
                      >
                        <strong>{school.name}</strong>
                        <span className="helper">
                          {school.state ?? "State unknown"} -{" "}
                          {school.selectivity_tier ?? "tier unknown"}
                          {alreadyAdded ? " - already added" : ""}
                        </span>
                      </button>
                    );
                  })
                : null}
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

  const warning =
    results.length === 0
      ? ""
      : counts.reach === results.length
        ? "Every school on your list is a reach. Consider adding schools where the band sits higher."
        : counts.likely === 0
          ? "No likely bands yet. Add at least one school whose interval clears the upper half of the scale."
          : "";

  return (
    <section className="balance-panel">
      <div className="panel-inner">
        <div className="section-kicker">List balance</div>
        <h2 className="section-title">The labels follow the intervals.</h2>
        <div className="balance-grid" aria-label="Interval-derived list balance">
          {labelOrder.map((label) => (
            <div key={label} className="balance-cell">
              <div className="balance-count">{counts[label]}</div>
              <div className="field-label">{label}</div>
            </div>
          ))}
        </div>
        {results.length > 0 ? (
          <div className="balance-stack">
            {results.map((result) => (
              <MiniRangeBand
                key={result.school.unitid}
                low={result.probability.low}
                high={result.probability.high}
                point={result.probability.calibrated}
                label={result.school.name}
              />
            ))}
          </div>
        ) : (
          <p className="helper">
            Add a school to see whether the list is all reach, balanced, or
            missing likely options.
          </p>
        )}
        {warning ? (
          <p className="error-copy" role="status" data-testid="balance-warning">
            {warning}
          </p>
        ) : null}
      </div>
    </section>
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
        Fitty is waiting for the interval. No temporary number is shown.
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

  return (
    <article className="result-card" data-testid="result-card">
      <div className="result-head">
        <div>
          <div className="section-kicker">School record</div>
          <h3 className="result-title">{result.school.name}</h3>
          <p className="helper">
            {result.school.selectivity_tier ?? "Tier unknown"} -{" "}
            {result.school.test_policy ?? "unknown"} testing policy
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="label-pill">{result.band.label}</span>
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

      <section className="range-section" aria-labelledby={`range-${result.school.unitid}`}>
        <div>
          <div className="band-label" id={`range-${result.school.unitid}`}>
            80% prior interval
          </div>
          <div className="range-readout">
            <span className="range-value">
              {formatPercent(result.probability.low)}-
              {formatPercent(result.probability.high)}
            </span>
            <span className="point-note">
              marker within band {formatPercentPrecise(result.probability.calibrated)}
            </span>
            <span className="label-pill">{profileConfidence}</span>
          </div>
        </div>
        <RangeBand
          low={result.probability.low}
          high={result.probability.high}
          point={result.probability.calibrated}
          label={`${result.school.name} admission prior interval`}
          coverage={result.probability.coverage}
        />
        <p className="scale-caption">{result.band.note}</p>
        {isHighUncertaintyTier(result.school.selectivity_tier) ? (
          <p className="limitation-note" data-testid="sub20-note">
            <strong>Sub-20 selectivity limit:</strong> at elite and highly
            selective schools, public data cannot see enough individual
            application evidence to make a narrow prediction.{" "}
            <Link href="/methodology">Read the methodology.</Link>
          </p>
        ) : null}
      </section>

      <div className="evidence-grid">
        <section className="evidence-panel" aria-label="Lever map">
          <div>
            <div className="section-kicker">Lever map</div>
            <h4 className="section-title text-[22px]">What can still move?</h4>
          </div>
          <LeverSection
            title="Controllable"
            items={result.levers.controllable}
            emptyText="No modeled controllable lever moved the logit in this run."
          />
          <LeverSection
            title="Fixed"
            items={result.levers.fixed}
            emptyText="No fixed feature contribution was returned."
          />
        </section>

        <div className="rubric-grid">
          <UnseenPanel items={result.levers.unseen} />
          <RubricPanel result={result} />
          <DisclaimerPanel disclaimers={result.disclaimers} />
        </div>
      </div>
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
    ? `${label}: ${Math.round(coverage * 100)} percent prior interval from ${formatPercentPrecise(low)} to ${formatPercentPrecise(high)}; marker at ${formatPercentPrecise(point)}.`
    : `${label}: ${Math.round(coverage * 100)} percent prior interval from ${formatPercentPrecise(low)} to ${formatPercentPrecise(high)} with an interior marker.`;

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

function MiniRangeBand({
  low,
  high,
  point,
  label,
}: {
  low: number;
  high: number;
  point: number;
  label: string;
}) {
  const left = clampPercent(low);
  const right = clampPercent(high);
  const width = Math.max(1, right - left);
  const pointLeft = clampPercent(point);

  return (
    <div className="mini-range">
      <div
        className="mini-range-track"
        role="img"
        aria-label={`${label}: interval ${formatPercentPrecise(low)} to ${formatPercentPrecise(high)}, marker at ${formatPercentPrecise(point)}`}
      >
        <span
          className="mini-range-band"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        <span className="mini-range-point" style={{ left: `${pointLeft}%` }} />
      </div>
      <span className="mini-band-caption">{label}</span>
    </div>
  );
}

function LeverSection({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: LeverContribution[];
  emptyText: string;
}) {
  const largest = Math.max(
    0.01,
    ...items.map((item) => Math.abs(item.logit_contribution)),
  );

  return (
    <div className="lever-section">
      <div className="micro-label">{title}</div>
      {items.length === 0 ? <p className="helper">{emptyText}</p> : null}
      {items.map((item) => {
        const contribution = item.logit_contribution;
        const magnitude = Math.min(50, (Math.abs(contribution) / largest) * 50);
        const positive = contribution >= 0;
        return (
          <div key={item.feature} className="lever-row">
            <div>
              <strong>{formatFeatureName(item.feature)}</strong>
              <div className="helper">{item.label}</div>
            </div>
            <div
              className="lever-bar"
              aria-label={`${formatFeatureName(item.feature)} contribution ${contribution.toFixed(3)} logit`}
            >
              <span
                className={`lever-fill ${positive ? "positive" : "negative"}`}
                style={{ width: `${magnitude}%` }}
              />
            </div>
            <span className="mono">{contribution.toFixed(3)}</span>
          </div>
        );
      })}
    </div>
  );
}

function UnseenPanel({ items }: { items: UnseenLever[] }) {
  return (
    <section className="unseen-panel">
      <div className="section-kicker">What we cannot see</div>
      <ul className="unseen-list">
        {items.map((item) => (
          <li key={item.feature}>
            <strong>{item.label}</strong>
            <p className="helper">{item.note}</p>
          </li>
        ))}
      </ul>
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
      <div className="section-kicker">C7 rubric grounding</div>
      {factors.length === 0 ? (
        <p className="helper">
          C7 seed data is not available for this school yet. The band stays
          wide rather than pretending those factors are known.
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
  let copy = "Not enough public band data to compare.";

  if (gap.score !== null && gap.gap !== null) {
    const position =
      gap.gap > 0.2 ? "above" : gap.gap < -0.2 ? "below" : "near";
    if (low !== null && high !== null) {
      copy = `${gap.score} - ${position} this school's middle 50% of ${low}-${high}.`;
    } else if (high !== null) {
      copy = `${gap.score} - ${position} the published average of ${high}.`;
    }
  } else if (gap.score !== null) {
    copy = `${gap.score} entered, but this school has no usable public band.`;
  }

  return (
    <div className="gap-row">
      <strong className="mono">{label}</strong>
      <span className="helper">{copy}</span>
    </div>
  );
}

function DisclaimerPanel({ disclaimers }: { disclaimers: string[] }) {
  return (
    <section className="disclaimer-panel">
      <div className="section-kicker">Disclosures</div>
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

function EmptyState() {
  return (
    <section className="empty-ledger">
      <FileSearch size={28} aria-hidden="true" />
      <h2 className="empty-title mt-4">Start with one school record.</h2>
      <p className="muted mt-3 max-w-2xl">
        Search the public schools table, add a target, and Fitty will render the
        interval first. The point estimate will only appear as a marker inside
        the band.
      </p>
      <div className="empty-measure" aria-hidden="true">
        <div className="skeleton-band" />
      </div>
      <p className="scale-caption">
        No placeholder odds. The scale waits for a school record.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <EmptyRule icon={<BookOpen size={17} />} text="Read the range first." />
        <EmptyRule icon={<Check size={17} />} text="Use levers as next moves." />
        <EmptyRule icon={<Plus size={17} />} text="Balance the whole list." />
      </div>
    </section>
  );
}

function EmptyRule({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="balance-cell">
      <div className="flex items-center gap-2 text-[var(--ledger-muted)]">
        {icon}
        <span>{text}</span>
      </div>
    </div>
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

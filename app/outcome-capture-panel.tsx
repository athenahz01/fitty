"use client";

import Link from "next/link";
import { CheckCircle2, LockKeyhole, LogOut, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { searchLocalSchoolFixtures } from "@/lib/school-fixtures";
import { searchSchools } from "@/lib/school-search";

import {
  fetchOutcomeJson,
  OutcomeSignInGate,
  type SubmitStatus,
  useOutcomeSession,
} from "./outcome-session";

type ApplicationRound = "regular" | "early";
type CourseRigor = "standard" | "honors" | "ap_ib_dual" | "most_rigorous" | "unknown";
type ActivitiesTier = "none" | "school" | "regional" | "state" | "national" | "unknown";
type DemonstratedInterest = "none" | "light" | "moderate" | "strong" | "unknown";
type OutcomeValue = "admitted" | "denied" | "waitlisted" | "deferred";

type CaptureSchoolRow = {
  unitid: number;
  name: string;
  state: string | null;
  province_state: string | null;
  country: "US" | "CA";
  selectivity_tier: string | null;
};

type CaptureProfileForm = {
  cycleYear: string;
  gpa: string;
  courseRigor: CourseRigor;
  satScore: string;
  actScore: string;
  testSubmitted: boolean;
  activitiesTier: ActivitiesTier;
  intendedMajor: string;
  applicationRound: ApplicationRound;
  demonstratedInterest: DemonstratedInterest;
};

type CaptureOutcomeForm = {
  schoolQuery: string;
  selectedSchool: CaptureSchoolRow | null;
  outcome: OutcomeValue;
  applicationRound: ApplicationRound;
  cycleYear: string;
};

type SavedOutcome = {
  id: string;
  schoolName: string;
  outcome: OutcomeValue;
};

type ConsentResponse = {
  consent_record?: {
    id?: string;
  };
};

type ProfileResponse = {
  applicant_profile?: {
    id?: string;
  };
};

type OutcomeResponse = {
  application_outcome?: {
    id?: string;
  };
};

const useLocalSchoolFixture =
  process.env.NEXT_PUBLIC_ADMIRA_USE_LOCAL_SCHOOL_FIXTURE === "true";

const privacyPolicyEffectiveDate = "June 22, 2026";
const privacyPolicyVersion = "privacy-consent-2026-06-22";
const consentVersion = "phase-7-capture-ui-v2-privacy-consent-2026-06-22";
const outcomeConsentText =
  `Privacy & Consent Policy version ${privacyPolicyVersion}, effective ${privacyPolicyEffectiveDate}. I agree to let Admira store the applicant profile fields I enter here: cycle year, GPA, course rigor, SAT, ACT, test submission status, activities tier, intended major, application round, and demonstrated interest. I also agree to let Admira store the school application outcomes I enter here: school, outcome, application round, and cycle year. Admira uses this optional data to improve admission-chance calibration. I can use Admira without sharing it, and I can export or delete this data later.`;

const currentCycleYear = String(new Date().getFullYear());

const initialProfileForm: CaptureProfileForm = {
  cycleYear: currentCycleYear,
  gpa: "",
  courseRigor: "unknown",
  satScore: "",
  actScore: "",
  testSubmitted: true,
  activitiesTier: "unknown",
  intendedMajor: "",
  applicationRound: "regular",
  demonstratedInterest: "unknown",
};

const initialOutcomeForm: CaptureOutcomeForm = {
  schoolQuery: "",
  selectedSchool: null,
  outcome: "admitted",
  applicationRound: "regular",
  cycleYear: currentCycleYear,
};

function schoolLocationLabel(school: CaptureSchoolRow) {
  return (
    school.province_state ??
    school.state ??
    (school.country === "CA" ? "Province unknown" : "State unknown")
  );
}

const courseRigorOptions = [
  { value: "standard", label: "Standard" },
  { value: "honors", label: "Honors" },
  { value: "ap_ib_dual", label: "AP, IB, or dual enrollment" },
  { value: "most_rigorous", label: "Most rigorous" },
  { value: "unknown", label: "Not sure" },
] satisfies Array<{ value: CourseRigor; label: string }>;

const activitiesTierOptions = [
  { value: "none", label: "None" },
  { value: "school", label: "School level" },
  { value: "regional", label: "Regional" },
  { value: "state", label: "State" },
  { value: "national", label: "National" },
  { value: "unknown", label: "Not sure" },
] satisfies Array<{ value: ActivitiesTier; label: string }>;

const demonstratedInterestOptions = [
  { value: "none", label: "None" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "strong", label: "Strong" },
  { value: "unknown", label: "Not sure" },
] satisfies Array<{ value: DemonstratedInterest; label: string }>;

const applicationRoundOptions = [
  { value: "regular", label: "Regular" },
  { value: "early", label: "Early" },
] satisfies Array<{ value: ApplicationRound; label: string }>;

const outcomeOptions = [
  { value: "admitted", label: "Admitted" },
  { value: "denied", label: "Denied" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "deferred", label: "Deferred" },
] satisfies Array<{ value: OutcomeValue; label: string }>;

function parseRequiredInteger(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be a whole number.`);
  }
  return parsed;
}

function parseOptionalNumber(value: string, label: string) {
  if (value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number.`);
  }
  return parsed;
}

function parseOptionalInteger(value: string, label: string) {
  if (value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be a whole number.`);
  }
  return parsed;
}

function validateCycleYear(year: number) {
  if (year < 2020 || year > 2100) {
    throw new Error("Cycle year must be between 2020 and 2100.");
  }
}

function buildProfileBody(form: CaptureProfileForm, consentRecordId: string) {
  const cycleYear = parseRequiredInteger(form.cycleYear, "Cycle year");
  validateCycleYear(cycleYear);

  const gpa = parseOptionalNumber(form.gpa, "GPA");
  if (gpa !== undefined && (gpa < 0 || gpa > 5)) {
    throw new Error("GPA must be between 0 and 5.");
  }

  const satScore = form.testSubmitted
    ? parseOptionalInteger(form.satScore, "SAT")
    : undefined;
  if (satScore !== undefined && (satScore < 400 || satScore > 1600)) {
    throw new Error("SAT must be between 400 and 1600.");
  }

  const actScore = form.testSubmitted
    ? parseOptionalInteger(form.actScore, "ACT")
    : undefined;
  if (actScore !== undefined && (actScore < 1 || actScore > 36)) {
    throw new Error("ACT must be between 1 and 36.");
  }

  const intendedMajor = form.intendedMajor.trim();

  return {
    consent_record_id: consentRecordId,
    cycle_year: cycleYear,
    ...(gpa !== undefined ? { gpa } : {}),
    course_rigor: form.courseRigor,
    ...(satScore !== undefined ? { sat_score: satScore } : {}),
    ...(actScore !== undefined ? { act_score: actScore } : {}),
    test_submitted: form.testSubmitted,
    activities_tier: form.activitiesTier,
    intended_major: intendedMajor === "" ? null : intendedMajor,
    application_round: form.applicationRound,
    demonstrated_interest: form.demonstratedInterest,
  };
}

function buildOutcomeBody(
  form: CaptureOutcomeForm,
  consentRecordId: string,
  profileId: string,
) {
  if (!form.selectedSchool) {
    throw new Error("Choose a school before saving an outcome.");
  }

  const cycleYear = parseRequiredInteger(form.cycleYear, "Outcome cycle year");
  validateCycleYear(cycleYear);

  return {
    profile_id: profileId,
    consent_record_id: consentRecordId,
    unitid: form.selectedSchool.unitid,
    outcome: form.outcome,
    application_round: form.applicationRound,
    cycle_year: cycleYear,
  };
}

function formatOutcome(value: OutcomeValue) {
  return outcomeOptions.find((option) => option.value === value)?.label ?? value;
}

export function OutcomeCapturePanel() {
  const {
    captureStatus,
    captureError,
    accessToken,
    signedIn,
    handleSignOut,
    resetVersion,
  } = useOutcomeSession();
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentId, setConsentId] = useState("");
  const [consentStatus, setConsentStatus] = useState<SubmitStatus>("idle");
  const [consentError, setConsentError] = useState("");
  const [profileForm, setProfileForm] = useState<CaptureProfileForm>(initialProfileForm);
  const [profileId, setProfileId] = useState("");
  const [profileStatus, setProfileStatus] = useState<SubmitStatus>("idle");
  const [profileError, setProfileError] = useState("");
  const [outcomeForm, setOutcomeForm] = useState<CaptureOutcomeForm>(initialOutcomeForm);
  const [outcomeStatus, setOutcomeStatus] = useState<SubmitStatus>("idle");
  const [outcomeError, setOutcomeError] = useState("");
  const [schoolSearchStatus, setSchoolSearchStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [schoolSearchError, setSchoolSearchError] = useState("");
  const [schoolResults, setSchoolResults] = useState<CaptureSchoolRow[]>([]);
  const [savedOutcomes, setSavedOutcomes] = useState<SavedOutcome[]>([]);
  const schoolSearchRequest = useRef(0);

  const consentReady = signedIn && Boolean(consentId);
  const profileReady = consentReady && Boolean(profileId);

  useEffect(() => {
    setConsentChecked(false);
    setConsentId("");
    setConsentStatus("idle");
    setConsentError("");
    setProfileForm(initialProfileForm);
    setProfileId("");
    setProfileStatus("idle");
    setProfileError("");
    setOutcomeForm(initialOutcomeForm);
    setOutcomeStatus("idle");
    setOutcomeError("");
    setSavedOutcomes([]);
  }, [resetVersion]);

  useEffect(() => {
    if (!profileReady) {
      return;
    }

    const query = outcomeForm.schoolQuery.trim();

    if (query.length < 2 || outcomeForm.selectedSchool) {
      setSchoolResults([]);
      setSchoolSearchStatus("idle");
      setSchoolSearchError("");
      return;
    }

    const requestId = schoolSearchRequest.current + 1;
    schoolSearchRequest.current = requestId;
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

        if (requestId !== schoolSearchRequest.current) {
          return;
        }

        setSchoolResults(results);
        setSchoolSearchStatus("ready");
        setSchoolSearchError("");
      } catch (error) {
        if (requestId !== schoolSearchRequest.current) {
          return;
        }
        setSchoolResults([]);
        setSchoolSearchStatus("error");
        setSchoolSearchError(
          error instanceof Error ? error.message : "School search is unavailable.",
        );
      }
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [outcomeForm.schoolQuery, outcomeForm.selectedSchool, profileReady]);

  const stepCopy = useMemo(() => {
    if (!signedIn) {
      return "Sign in, then choose whether to share optional outcome records.";
    }
    if (!consentId) {
      return "Review the consent record before entering any profile or outcome data.";
    }
    if (!profileId) {
      return "Consent is recorded. Add one applicant profile next.";
    }
    return "Profile is saved. Add one or more school outcomes.";
  }, [consentId, profileId, signedIn]);

  async function handleConsent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) {
      setConsentError("Please sign in before recording consent.");
      return;
    }
    if (!consentChecked) {
      setConsentError("Check the consent box if you want to share these records.");
      return;
    }

    setConsentStatus("saving");
    setConsentError("");

    try {
      const payload = await fetchOutcomeJson<ConsentResponse>(
        "/api/outcomes/consent",
        accessToken,
        {
          method: "POST",
          body: {
            consent_version: consentVersion,
            consent_text: outcomeConsentText,
            purpose: "real_outcome_modeling",
          },
        },
      );
      const id = payload.consent_record?.id;
      if (!id) {
        throw new Error("Consent was saved, but no consent record id was returned.");
      }
      setConsentId(id);
      setConsentStatus("success");
    } catch (error) {
      setConsentStatus("error");
      setConsentError(error instanceof Error ? error.message : "Consent could not be saved.");
    }
  }

  async function handleProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !consentId) {
      setProfileError("Sign in and record consent before saving a profile.");
      return;
    }

    setProfileStatus("saving");
    setProfileError("");

    try {
      const payload = await fetchOutcomeJson<ProfileResponse>(
        "/api/outcomes/profile",
        accessToken,
        { method: "POST", body: buildProfileBody(profileForm, consentId) },
      );
      const id = payload.applicant_profile?.id;
      if (!id) {
        throw new Error("Profile was saved, but no profile id was returned.");
      }
      setProfileId(id);
      setProfileStatus("success");
      setOutcomeForm((current) => ({
        ...current,
        applicationRound: profileForm.applicationRound,
        cycleYear: profileForm.cycleYear,
      }));
    } catch (error) {
      setProfileStatus("error");
      setProfileError(error instanceof Error ? error.message : "Profile could not be saved.");
    }
  }

  async function handleOutcome(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !consentId || !profileId) {
      setOutcomeError("Save consent and profile before saving an outcome.");
      return;
    }

    setOutcomeStatus("saving");
    setOutcomeError("");

    try {
      const selectedSchool = outcomeForm.selectedSchool;
      const payload = await fetchOutcomeJson<OutcomeResponse>(
        "/api/outcomes/application",
        accessToken,
        { method: "POST", body: buildOutcomeBody(outcomeForm, consentId, profileId) },
      );
      const id = payload.application_outcome?.id;
      if (!id || !selectedSchool) {
        throw new Error("Outcome was saved, but no outcome id was returned.");
      }
      setSavedOutcomes((current) => [
        ...current,
        { id, schoolName: selectedSchool.name, outcome: outcomeForm.outcome },
      ]);
      setOutcomeStatus("success");
      setOutcomeForm((current) => ({
        ...initialOutcomeForm,
        applicationRound: current.applicationRound,
        cycleYear: current.cycleYear,
      }));
    } catch (error) {
      setOutcomeStatus("error");
      setOutcomeError(error instanceof Error ? error.message : "Outcome could not be saved.");
    }
  }

  if (captureStatus === "loading") {
    return (
      <section
        className="capture-panel"
        id="outcome-capture"
        aria-label="Outcome capture status"
      >
        <div className="panel-inner">
          <div className="section-kicker">Outcome capture</div>
          <p className="helper mt-2">Checking whether outcome capture is open.</p>
        </div>
      </section>
    );
  }

  if (captureStatus === "disabled") {
    return (
      <section
        className="capture-panel"
        id="outcome-capture"
        aria-label="Outcome capture status"
        data-testid="outcome-capture-closed"
      >
        <div className="panel-inner capture-closed">
          <LockKeyhole size={20} aria-hidden="true" />
          <div>
            <div className="section-kicker">Outcome capture</div>
            <p className="helper mt-1">
              Outcome capture is not currently open. Admira is waiting for the
              privacy verification gate before collecting real results.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (captureStatus === "error") {
    return (
      <section
        className="capture-panel"
        id="outcome-capture"
        aria-label="Outcome capture status"
      >
        <div className="panel-inner">
          <div className="section-kicker">Outcome capture</div>
          <p className="error-copy mt-2" role="alert">
            {captureError}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="capture-panel"
      id="outcome-capture"
      aria-label="Outcome capture"
      data-testid="outcome-capture-flow"
    >
      <div className="capture-head">
        <div>
          <div className="section-kicker">Outcome capture</div>
          <h2 className="capture-title">Share real results only if you choose.</h2>
          <p className="helper mt-2">{stepCopy}</p>
        </div>
        <ShieldCheck size={24} aria-hidden="true" />
      </div>

      {!signedIn ? (
        <OutcomeSignInGate />
      ) : (
        <div className="capture-body">
          <div className="signed-in-row">
            <span className="label-pill">Signed in</span>
            <button className="capture-secondary" type="button" onClick={handleSignOut}>
              <LogOut size={16} />
              Sign out
            </button>
          </div>

          <div className="capture-steps" aria-label="Capture progress">
            <StepBadge label="Consent" done={Boolean(consentId)} />
            <StepBadge label="Profile" done={Boolean(profileId)} />
            <StepBadge label="Outcomes" done={savedOutcomes.length > 0} />
          </div>

          {!consentId ? (
            <ConsentStep
              checked={consentChecked}
              status={consentStatus}
              error={consentError}
              onCheckedChange={setConsentChecked}
              onSubmit={handleConsent}
            />
          ) : null}

          {consentReady && !profileId ? (
            <ProfileStep
              form={profileForm}
              status={profileStatus}
              error={profileError}
              onFormChange={setProfileForm}
              onSubmit={handleProfile}
            />
          ) : null}

          {profileReady ? (
            <OutcomeStep
              form={outcomeForm}
              status={outcomeStatus}
              error={outcomeError}
              searchStatus={schoolSearchStatus}
              searchError={schoolSearchError}
              schoolResults={schoolResults}
              savedOutcomes={savedOutcomes}
              onFormChange={setOutcomeForm}
              onSubmit={handleOutcome}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

function ConsentStep({
  checked,
  status,
  error,
  onCheckedChange,
  onSubmit,
}: {
  checked: boolean;
  status: SubmitStatus;
  error: string;
  onCheckedChange: (checked: boolean) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="capture-step consent-step" onSubmit={onSubmit}>
      <div>
        <div className="section-kicker">Consent record</div>
        <h3 className="section-title">Read this before sharing anything.</h3>
      </div>
      <p className="consent-copy" data-testid="outcome-consent-text">
        {outcomeConsentText}
      </p>
      <p className="helper">
        See our{" "}
        <Link className="inline-link" href="/privacy">
          privacy & consent policy
        </Link>
        .
      </p>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
        />
        <span>I agree to share these optional records with Admira.</span>
      </label>
      {error ? (
        <p className="error-copy" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="capture-primary"
        type="submit"
        disabled={!checked || status === "saving"}
      >
        {status === "saving" ? "Recording consent" : "Record consent"}
      </button>
    </form>
  );
}

function ProfileStep({
  form,
  status,
  error,
  onFormChange,
  onSubmit,
}: {
  form: CaptureProfileForm;
  status: SubmitStatus;
  error: string;
  onFormChange: React.Dispatch<React.SetStateAction<CaptureProfileForm>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  function update<K extends keyof CaptureProfileForm>(
    key: K,
    value: CaptureProfileForm[K],
  ) {
    onFormChange((current) => ({ ...current, [key]: value }));
  }

  return (
    <form className="capture-step" onSubmit={onSubmit}>
      <div>
        <div className="section-kicker">Applicant profile</div>
        <h3 className="section-title">Save one profile for this cycle.</h3>
      </div>

      <div className="capture-form-grid three">
        <label className="control">
          <span className="field-label">Cycle year</span>
          <input
            className="text-control mono"
            inputMode="numeric"
            value={form.cycleYear}
            onChange={(event) => update("cycleYear", event.target.value)}
          />
        </label>
        <label className="control">
          <span className="field-label">GPA</span>
          <input
            className="text-control mono"
            inputMode="decimal"
            placeholder="3.85"
            value={form.gpa}
            onChange={(event) => update("gpa", event.target.value)}
          />
        </label>
        <label className="control">
          <span className="field-label">Intended major</span>
          <input
            className="text-control"
            placeholder="Undecided"
            value={form.intendedMajor}
            onChange={(event) => update("intendedMajor", event.target.value)}
          />
        </label>
      </div>

      <OptionGroup
        label="Course rigor"
        options={courseRigorOptions}
        value={form.courseRigor}
        onChange={(value) => update("courseRigor", value)}
      />

      <div className="capture-form-grid three">
        <OptionGroup
          label="Test submitted"
          options={[
            { value: "true", label: "Submitted" },
            { value: "false", label: "Not submitted" },
          ]}
          value={String(form.testSubmitted)}
          onChange={(value) => update("testSubmitted", value === "true")}
        />
        <label className="control">
          <span className="field-label">SAT</span>
          <input
            className="text-control mono"
            disabled={!form.testSubmitted}
            inputMode="numeric"
            placeholder="1480"
            value={form.satScore}
            onChange={(event) => update("satScore", event.target.value)}
          />
        </label>
        <label className="control">
          <span className="field-label">ACT</span>
          <input
            className="text-control mono"
            disabled={!form.testSubmitted}
            inputMode="numeric"
            placeholder="33"
            value={form.actScore}
            onChange={(event) => update("actScore", event.target.value)}
          />
        </label>
      </div>

      <OptionGroup
        label="Activities tier"
        options={activitiesTierOptions}
        value={form.activitiesTier}
        onChange={(value) => update("activitiesTier", value)}
      />

      <div className="capture-form-grid two">
        <OptionGroup
          label="Application round"
          options={applicationRoundOptions}
          value={form.applicationRound}
          onChange={(value) => update("applicationRound", value)}
        />
        <OptionGroup
          label="Demonstrated interest"
          options={demonstratedInterestOptions}
          value={form.demonstratedInterest}
          onChange={(value) => update("demonstratedInterest", value)}
        />
      </div>

      {error ? (
        <p className="error-copy" role="alert">
          {error}
        </p>
      ) : null}
      {status === "success" ? (
        <p className="success-copy" role="status">
          Profile saved.
        </p>
      ) : null}
      <button className="capture-primary" type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Saving profile" : "Save profile"}
      </button>
    </form>
  );
}

function OutcomeStep({
  form,
  status,
  error,
  searchStatus,
  searchError,
  schoolResults,
  savedOutcomes,
  onFormChange,
  onSubmit,
}: {
  form: CaptureOutcomeForm;
  status: SubmitStatus;
  error: string;
  searchStatus: "idle" | "loading" | "ready" | "error";
  searchError: string;
  schoolResults: CaptureSchoolRow[];
  savedOutcomes: SavedOutcome[];
  onFormChange: React.Dispatch<React.SetStateAction<CaptureOutcomeForm>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  function update<K extends keyof CaptureOutcomeForm>(
    key: K,
    value: CaptureOutcomeForm[K],
  ) {
    onFormChange((current) => ({ ...current, [key]: value }));
  }

  return (
    <form className="capture-step" onSubmit={onSubmit}>
      <div>
        <div className="section-kicker">Application outcome</div>
        <h3 className="section-title">Add one school decision at a time.</h3>
      </div>

      <div className="capture-form-grid two">
        <div className="control school-capture-search">
          <span className="field-label">School</span>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--faint)]"
              size={17}
            />
            <input
              aria-label="Outcome school"
              className="text-control pl-10"
              value={form.schoolQuery}
              onChange={(event) =>
                onFormChange((current) => ({
                  ...current,
                  schoolQuery: event.target.value,
                  selectedSchool: null,
                }))
              }
              placeholder="Search for a school"
            />
          </div>
          {form.selectedSchool ? (
            <p className="success-copy">Selected {form.selectedSchool.name}.</p>
          ) : null}
          {searchStatus !== "idle" ? (
            <div className="search-results capture-search-results" role="listbox">
              {searchStatus === "loading" ? (
                <div className="search-result">
                  <span className="muted">Searching schools...</span>
                </div>
              ) : null}
              {searchStatus === "error" ? (
                <div className="search-result">
                  <span className="muted">{searchError}</span>
                </div>
              ) : null}
              {searchStatus === "ready" && schoolResults.length === 0 ? (
                <div className="search-result">
                  <span className="muted">No matching schools found.</span>
                </div>
              ) : null}
              {searchStatus === "ready"
                ? schoolResults.map((school) => (
                    <button
                      key={school.unitid}
                      className="search-result"
                      type="button"
                      onClick={() =>
                        onFormChange((current) => ({
                          ...current,
                          schoolQuery: school.name,
                          selectedSchool: school,
                        }))
                      }
                    >
                      <strong>{school.name}</strong>
                      <span className="helper">
                        {schoolLocationLabel(school)} -{" "}
                        {school.selectivity_tier ?? "tier unknown"}
                      </span>
                    </button>
                  ))
                : null}
            </div>
          ) : null}
        </div>
        <label className="control">
          <span className="field-label">Outcome cycle year</span>
          <input
            className="text-control mono"
            inputMode="numeric"
            value={form.cycleYear}
            onChange={(event) => update("cycleYear", event.target.value)}
          />
        </label>
      </div>

      <div className="capture-form-grid two">
        <OptionGroup
          label="Outcome"
          options={outcomeOptions}
          value={form.outcome}
          onChange={(value) => update("outcome", value)}
        />
        <OptionGroup
          label="Application round"
          options={applicationRoundOptions}
          value={form.applicationRound}
          onChange={(value) => update("applicationRound", value)}
        />
      </div>

      {error ? (
        <p className="error-copy" role="alert">
          {error}
        </p>
      ) : null}
      {status === "success" ? (
        <p className="success-copy" role="status">
          Outcome saved. You can add another school decision.
        </p>
      ) : null}
      <button className="capture-primary" type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Saving outcome" : "Save outcome"}
      </button>

      {savedOutcomes.length > 0 ? (
        <div className="saved-outcomes" data-testid="saved-outcomes">
          <div className="micro-label">Saved outcomes</div>
          <ul>
            {savedOutcomes.map((outcome) => (
              <li key={outcome.id}>
                <CheckCircle2 size={16} aria-hidden="true" />
                <span>
                  {outcome.schoolName}: {formatOutcome(outcome.outcome)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="control">
      <span className="field-label">{label}</span>
      <div className="option-grid" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            className="option-button"
            type="button"
            data-active={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepBadge({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="step-badge" data-done={done}>
      {done ? <CheckCircle2 size={15} aria-hidden="true" /> : <span />}
      <strong>{label}</strong>
    </div>
  );
}

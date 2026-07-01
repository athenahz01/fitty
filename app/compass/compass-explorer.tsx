"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SourcedFigure = { value: number | null; source_url: string };

type CompassMajorView = {
  major_name: string;
  fit: number | null;
  reason: string;
  median_earnings_10yr: SourcedFigure;
  careers: {
    career_title: string;
    median_wage_annual: SourcedFigure;
    onet_code: string | null;
  }[];
  roi: { available: boolean; note: string };
};

type CompassResult = {
  admit: { school_name: string; tier: string; score: number } | null;
  majors: CompassMajorView[];
  roi: { available: boolean; note: string };
  sources: string[];
};

type Status = "checking" | "disabled" | "ready";

function money(value: number | null) {
  return value === null ? null : `$${Math.round(value).toLocaleString("en-US")}`;
}

export function CompassExplorer() {
  const [status, setStatus] = useState<Status>("checking");
  const [interests, setInterests] = useState("");
  const [unitid, setUnitid] = useState("");
  const [sat, setSat] = useState("");
  const [gpa, setGpa] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CompassResult | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/compass/status")
      .then((response) => response.json())
      .then((payload) => {
        if (active) {
          setStatus(payload?.enabled === true ? "ready" : "disabled");
        }
      })
      .catch(() => active && setStatus("disabled"));
    return () => {
      active = false;
    };
  }, []);

  async function run() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/compass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interests: interests.trim() || undefined,
          unitid: unitid.trim() ? Number(unitid) : undefined,
          profile: {
            sat_score: sat.trim() ? Number(sat) : undefined,
            gpa: gpa.trim() ? Number(gpa) : undefined,
            application_round: "regular",
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Compass request failed.");
      }
      setResult(payload as CompassResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Compass request failed.");
    } finally {
      setRunning(false);
    }
  }

  if (status === "checking") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-24">
        <div className="h-8 w-56 animate-pulse rounded bg-black/10 dark:bg-white/10" />
      </main>
    );
  }

  if (status === "disabled") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-24" data-testid="compass-disabled">
        <Link href="/dashboard" className="text-sm opacity-60 hover:opacity-100">
          ← Back to dashboard
        </Link>
        <p className="mt-8 text-lg">Majors &amp; careers isn&apos;t available yet. Check back soon.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16" data-testid="compass-explorer">
      <Link href="/dashboard" className="text-sm opacity-60 hover:opacity-100">
        ← Back to dashboard
      </Link>
      <header className="mt-6">
        <div className="text-xs uppercase tracking-wide opacity-60">
          Major / Career Compass
        </div>
        <h1 className="mt-1 text-4xl font-bold tracking-tight">
          Majors, careers, and where they lead
        </h1>
        <p className="mt-2 max-w-2xl opacity-70">
          Explore majors by fit, the careers they open, and sourced earnings —
          tied to your real admit odds.
        </p>
      </header>

      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="opacity-70">Your interests</span>
          <input
            className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15"
            value={interests}
            onChange={(event) => setInterests(event.target.value)}
            placeholder="machine learning, building things, statistics"
            data-testid="compass-interests"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="opacity-70">School unitid (optional, for admit odds)</span>
          <input
            className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15"
            value={unitid}
            inputMode="numeric"
            onChange={(event) => setUnitid(event.target.value)}
            placeholder="166683"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="opacity-70">SAT</span>
            <input
              className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15"
              value={sat}
              inputMode="numeric"
              onChange={(event) => setSat(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="opacity-70">GPA</span>
            <input
              className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15"
              value={gpa}
              inputMode="decimal"
              onChange={(event) => setGpa(event.target.value)}
            />
          </label>
        </div>
      </section>

      <button
        type="button"
        onClick={run}
        disabled={running}
        className="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black"
        data-testid="compass-run"
      >
        {running ? "Charting…" : "Explore majors"}
      </button>

      {error ? (
        <p className="mt-4 text-sm opacity-70" data-testid="compass-error">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-8" data-testid="compass-results">
          {result.admit ? (
            <div
              className="rounded-xl border border-black/10 p-4 dark:border-white/10"
              data-testid="compass-admit"
            >
              <div className="text-xs uppercase tracking-wide opacity-60">
                Your admit odds at {result.admit.school_name}
              </div>
              <div className="mt-1 text-2xl font-bold">
                {result.admit.tier} · {result.admit.score}/100
              </div>
              <div className="mt-1 text-xs opacity-50">
                Same engine as Admit Intelligence. Numbers come from the model, not the text.
              </div>
            </div>
          ) : null}

          <div
            className="mt-4 rounded-xl border border-dashed border-black/20 p-4 text-sm opacity-80 dark:border-white/20"
            data-testid="compass-roi-stub"
          >
            ROI &amp; net price are coming with the Money module. {result.roi.note}
          </div>

          {result.majors.length === 0 ? (
            <p className="mt-6 text-sm opacity-70" data-testid="compass-empty">
              No majors are loaded yet. The Compass earnings dataset is pending.
            </p>
          ) : (
            <ul className="mt-6 space-y-3">
              {result.majors.map((major) => (
                <li
                  key={major.major_name}
                  className="rounded-xl border border-black/10 p-4 dark:border-white/10"
                  data-testid="compass-major"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-lg font-semibold">{major.major_name}</h3>
                    <span className="text-sm opacity-70">
                      {major.fit === null ? "fit —" : `fit ${major.fit}`}
                    </span>
                  </div>
                  <p className="mt-1 text-sm opacity-80" data-testid="compass-reason">
                    {major.reason}
                  </p>
                  <p className="mt-2 text-sm">
                    Median earnings 10yr:{" "}
                    {money(major.median_earnings_10yr.value) ? (
                      <a
                        className="font-medium underline"
                        href={major.median_earnings_10yr.source_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {money(major.median_earnings_10yr.value)}
                      </a>
                    ) : (
                      <span className="opacity-50">pending dataset</span>
                    )}
                  </p>
                  {major.careers.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm opacity-80">
                      {major.careers.map((career) => (
                        <li key={career.career_title}>
                          {career.career_title}
                          {" — "}
                          {money(career.median_wage_annual.value) ? (
                            <a
                              className="underline"
                              href={career.median_wage_annual.source_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {money(career.median_wage_annual.value)}/yr
                            </a>
                          ) : (
                            <span className="opacity-50">wage pending</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {result.sources.length > 0 ? (
            <section className="mt-8 border-t border-black/10 pt-4 dark:border-white/10">
              <h2 className="text-xs font-semibold uppercase tracking-wide opacity-60">
                Sources
              </h2>
              <ul className="mt-2 space-y-1 text-xs opacity-60">
                {result.sources.map((source) => (
                  <li key={source}>{source}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

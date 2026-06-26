"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Figure = { value: number | null; source: string };

type UniverseProgram = {
  program_name: string;
  cutoff_avg_low: number | null;
  cutoff_avg_high: number | null;
  cutoff_basis: string | null;
  prerequisites: unknown;
  supplemental_app: boolean;
  broad_based_admission: boolean;
  source_url: string;
};

type SimilarProgram = {
  unitid: number;
  name: string;
  similarity: number | null;
  program_areas: string[] | null;
};

type Universe = {
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
  headline: { tier: string | null; admit_rate: Figure };
  admissions: {
    sat: { low: Figure; high: Figure };
    act: { low: Figure; high: Figure };
    gpa_avg: Figure;
  };
  cost: { net_price_avg: Figure; sticker_cost: Figure };
  outcomes: { median_earnings_10yr: Figure; completion_rate: Figure };
  programs: UniverseProgram[];
  similar: SimilarProgram[];
  notes: string[];
};

type Status = "loading" | "ready" | "error" | "disabled";

function titleCase(value: string | null) {
  if (!value) {
    return null;
  }
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function pct(value: number | null) {
  return value === null ? null : `${Math.round(value * 100)}%`;
}

function money(value: number | null) {
  return value === null ? null : `$${Math.round(value).toLocaleString("en-US")}`;
}

function band(low: Figure, high: Figure) {
  if (low.value === null || high.value === null) {
    return null;
  }
  return `${low.value}–${high.value}`;
}

function prereqList(prerequisites: unknown): string[] {
  if (!Array.isArray(prerequisites)) {
    return [];
  }
  return prerequisites.filter((item): item is string => typeof item === "string");
}

function Stat({
  label,
  value,
  source,
}: {
  label: string;
  value: string | null;
  source: string;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="text-xs uppercase tracking-wide opacity-60">{label}</div>
      <div className="mt-1 text-2xl font-semibold">
        {value ?? <span className="text-base font-normal opacity-50">Not published</span>}
      </div>
      <div className="mt-1 text-[11px] opacity-40" title={source}>
        {source}
      </div>
    </div>
  );
}

export function SchoolUniverse({ unitid }: { unitid: number }) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<Universe | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/schools/universe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unitid }),
        });
        const payload = await response.json();
        if (!active) {
          return;
        }
        if (response.status === 404 && /not enabled/i.test(payload?.error ?? "")) {
          setStatus("disabled");
          return;
        }
        if (!response.ok) {
          setError(payload?.error ?? "Unable to load this school.");
          setStatus("error");
          return;
        }
        setData(payload as Universe);
        setStatus("ready");
      } catch {
        if (active) {
          setError("Unable to load this school.");
          setStatus("error");
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [unitid]);

  if (status === "disabled") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-24" data-testid="universe-disabled">
        <Link href="/" className="text-sm opacity-60 hover:opacity-100">
          ← Admira
        </Link>
        <p className="mt-8 text-lg">School Universe is not currently open.</p>
      </main>
    );
  }

  if (status === "loading") {
    return (
      <main className="mx-auto max-w-5xl px-6 py-24" data-testid="universe-loading">
        <div className="h-8 w-64 animate-pulse rounded bg-black/10 dark:bg-white/10" />
      </main>
    );
  }

  if (status === "error" || !data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-24" data-testid="universe-error">
        <Link href="/" className="text-sm opacity-60 hover:opacity-100">
          ← Admira
        </Link>
        <p className="mt-8 text-lg">{error || "Unable to load this school."}</p>
      </main>
    );
  }

  const admitRate = pct(data.headline.admit_rate.value);
  const sat = band(data.admissions.sat.low, data.admissions.sat.high);
  const act = band(data.admissions.act.low, data.admissions.act.high);

  return (
    <main
      className="mx-auto max-w-5xl px-6 py-12 sm:py-16"
      data-testid="school-universe"
    >
      <Link href="/" className="text-sm opacity-60 hover:opacity-100">
        ← Admira
      </Link>

      {/* Bold headline first, detail below the fold. */}
      <header className="mt-6 border-b border-black/10 pb-8 dark:border-white/10">
        <div className="flex flex-wrap items-center gap-2 text-sm opacity-70">
          {titleCase(data.school.selectivity_tier) ? (
            <span className="rounded-full bg-black/5 px-3 py-1 dark:bg-white/10">
              {titleCase(data.school.selectivity_tier)}
            </span>
          ) : null}
          {data.school.location ? <span>{data.school.location}</span> : null}
          {data.school.setting ? <span>· {titleCase(data.school.setting)}</span> : null}
          <span>· {data.school.country}</span>
        </div>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          {data.school.name}
        </h1>
        <p className="mt-3 text-xl">
          {admitRate ? (
            <span data-testid="universe-admit-rate">
              <span className="font-semibold">{admitRate}</span> admit rate
            </span>
          ) : (
            <span className="opacity-60">Admit rate not published</span>
          )}
          {sat ? <span className="opacity-70"> · SAT {sat}</span> : null}
        </p>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Admit rate" value={admitRate} source={data.headline.admit_rate.source} />
        <Stat label="SAT middle 50" value={sat} source={data.admissions.sat.low.source} />
        <Stat label="ACT middle 50" value={act} source={data.admissions.act.low.source} />
        <Stat
          label="Avg GPA"
          value={data.admissions.gpa_avg.value === null ? null : data.admissions.gpa_avg.value.toFixed(2)}
          source={data.admissions.gpa_avg.source}
        />
      </section>

      <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Avg net price" value={money(data.cost.net_price_avg.value)} source={data.cost.net_price_avg.source} />
        <Stat label="Sticker cost" value={money(data.cost.sticker_cost.value)} source={data.cost.sticker_cost.source} />
        <Stat label="Median earnings 10yr" value={money(data.outcomes.median_earnings_10yr.value)} source={data.outcomes.median_earnings_10yr.source} />
        <Stat label="Completion rate" value={pct(data.outcomes.completion_rate.value)} source={data.outcomes.completion_rate.source} />
      </section>

      {data.programs.length > 0 ? (
        <section className="mt-12" data-testid="universe-programs">
          <h2 className="text-2xl font-semibold">Programs &amp; requirements</h2>
          <div className="mt-4 space-y-4">
            {data.programs.map((program) => {
              const cutoff =
                program.cutoff_avg_low === null
                  ? null
                  : program.cutoff_avg_high && program.cutoff_avg_high !== program.cutoff_avg_low
                    ? `${program.cutoff_avg_low}–${program.cutoff_avg_high} ${program.cutoff_basis ?? ""}`
                    : `${program.cutoff_avg_low} ${program.cutoff_basis ?? ""}`;
              const prereqs = prereqList(program.prerequisites);
              return (
                <article
                  key={program.program_name}
                  className="rounded-xl border border-black/10 p-5 dark:border-white/10"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-lg font-semibold">{program.program_name}</h3>
                    {cutoff ? (
                      <span className="text-sm font-medium opacity-80">
                        Cutoff {cutoff.trim()}
                      </span>
                    ) : (
                      <span className="text-sm opacity-50">No cutoff loaded</span>
                    )}
                  </div>
                  {prereqs.length > 0 ? (
                    <p className="mt-2 text-sm opacity-70">
                      Prerequisites: {prereqs.join(", ")}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs opacity-70">
                    {program.broad_based_admission ? (
                      <span className="rounded bg-black/5 px-2 py-0.5 dark:bg-white/10">
                        Broad-based review
                      </span>
                    ) : null}
                    {program.supplemental_app ? (
                      <span className="rounded bg-black/5 px-2 py-0.5 dark:bg-white/10">
                        Supplemental application
                      </span>
                    ) : null}
                    {program.source_url ? (
                      <a
                        className="underline opacity-80 hover:opacity-100"
                        href={program.source_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Source
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {data.school.program_areas.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-2xl font-semibold">Fields of study</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.school.program_areas.map((area) => (
              <span
                key={area}
                className="rounded-full border border-black/10 px-3 py-1 text-sm dark:border-white/10"
              >
                {area}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {data.similar.length > 0 ? (
        <section className="mt-12" data-testid="universe-similar">
          <h2 className="text-2xl font-semibold">Similar programs</h2>
          <p className="mt-1 text-sm opacity-60">
            By Fit Finder program embeddings.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.similar.map((peer) => (
              <Link
                key={peer.unitid}
                href={`/schools/${peer.unitid}`}
                className="rounded-xl border border-black/10 p-4 transition hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
              >
                <div className="font-medium">{peer.name}</div>
                {peer.program_areas && peer.program_areas.length > 0 ? (
                  <div className="mt-1 text-sm opacity-60">
                    {peer.program_areas.slice(0, 3).join(", ")}
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {data.notes.length > 0 ? (
        <section className="mt-12 border-t border-black/10 pt-6 dark:border-white/10">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Data notes
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm opacity-70">
            {data.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

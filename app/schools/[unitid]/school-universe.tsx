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
    <div className="uni-stat">
      <div className="micro-label">{label}</div>
      <div className="uni-stat-value mono">
        {value ?? <span className="uni-stat-empty">Not published</span>}
      </div>
      <div className="uni-stat-source" title={source}>
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
      <main className="uni-page uni-page-narrow" data-testid="universe-disabled">
        <Link href="/schools" className="uni-back">
          ← Back to schools
        </Link>
        <div className="uni-state-card">
          <div className="section-kicker">Coming soon</div>
          <p>School details aren&apos;t available yet.</p>
        </div>
      </main>
    );
  }

  if (status === "loading") {
    return (
      <main className="uni-page uni-page-narrow" data-testid="universe-loading">
        <Link href="/schools" className="uni-back">
          ← Back to schools
        </Link>
        <div className="uni-skeleton" aria-hidden="true">
          <span className="band-scan" style={{ width: "60%", height: 30 }} />
          <span className="band-scan" style={{ width: "85%" }} />
          <span className="band-scan" style={{ width: "70%" }} />
        </div>
        <span className="sr-only" role="status">
          Loading school details
        </span>
      </main>
    );
  }

  if (status === "error" || !data) {
    return (
      <main className="uni-page uni-page-narrow" data-testid="universe-error">
        <Link href="/schools" className="uni-back">
          ← Back to schools
        </Link>
        <div className="uni-state-card uni-state-error" role="alert">
          {error || "Unable to load this school."}
        </div>
      </main>
    );
  }

  const admitRate = pct(data.headline.admit_rate.value);
  const sat = band(data.admissions.sat.low, data.admissions.sat.high);
  const act = band(data.admissions.act.low, data.admissions.act.high);

  return (
    <main className="uni-page" data-testid="school-universe">
      <Link href="/schools" className="uni-back">
        ← Back to schools
      </Link>

      {/* Split-verdict anchor: ink rail states the school identity + published
          headline; the warm data surface holds the sourced stat grid. */}
      <section className="uni-anchor">
        <div className="uni-rail">
          <div className="uni-tags">
            {titleCase(data.school.selectivity_tier) ? (
              <span className="uni-tag">{titleCase(data.school.selectivity_tier)}</span>
            ) : null}
            {data.school.location ? <span>{data.school.location}</span> : null}
            {data.school.setting ? <span>· {titleCase(data.school.setting)}</span> : null}
            <span>· {data.school.country}</span>
          </div>
          <h1 className="uni-name">{data.school.name}</h1>
          <p className="uni-sub">
            {admitRate ? (
              <span data-testid="universe-admit-rate">
                <span className="uni-sub-strong mono">{admitRate}</span> admit rate
              </span>
            ) : (
              <span className="uni-sub-muted">Admit rate not published</span>
            )}
            {sat ? <span className="uni-sub-muted"> · SAT {sat}</span> : null}
          </p>
        </div>
        <div className="uni-rail-data">
          <div className="uni-stat-grid">
            <Stat label="Admit rate" value={admitRate} source={data.headline.admit_rate.source} />
            <Stat label="SAT middle 50" value={sat} source={data.admissions.sat.low.source} />
            <Stat label="ACT middle 50" value={act} source={data.admissions.act.low.source} />
            <Stat
              label="Avg GPA"
              value={data.admissions.gpa_avg.value === null ? null : data.admissions.gpa_avg.value.toFixed(2)}
              source={data.admissions.gpa_avg.source}
            />
          </div>
        </div>
      </section>

      <section className="uni-section">
        <div className="section-kicker">Cost &amp; outcomes</div>
        <div className="uni-stat-grid uni-stat-grid-4">
          <Stat label="Avg net price" value={money(data.cost.net_price_avg.value)} source={data.cost.net_price_avg.source} />
          <Stat label="Sticker cost" value={money(data.cost.sticker_cost.value)} source={data.cost.sticker_cost.source} />
          <Stat label="Median earnings 10yr" value={money(data.outcomes.median_earnings_10yr.value)} source={data.outcomes.median_earnings_10yr.source} />
          <Stat label="Completion rate" value={pct(data.outcomes.completion_rate.value)} source={data.outcomes.completion_rate.source} />
        </div>
      </section>

      {data.programs.length > 0 ? (
        <section className="uni-section" data-testid="universe-programs">
          <h2 className="uni-h2">Programs &amp; requirements</h2>
          <div className="uni-card-stack">
            {data.programs.map((program) => {
              const cutoff =
                program.cutoff_avg_low === null
                  ? null
                  : program.cutoff_avg_high && program.cutoff_avg_high !== program.cutoff_avg_low
                    ? `${program.cutoff_avg_low}–${program.cutoff_avg_high} ${program.cutoff_basis ?? ""}`
                    : `${program.cutoff_avg_low} ${program.cutoff_basis ?? ""}`;
              const prereqs = prereqList(program.prerequisites);
              return (
                <article key={program.program_name} className="uni-card">
                  <div className="uni-card-head">
                    <h3 className="uni-card-title">{program.program_name}</h3>
                    {cutoff ? (
                      <span className="uni-cutoff mono">Cutoff {cutoff.trim()}</span>
                    ) : (
                      <span className="uni-cutoff-empty">No cutoff loaded</span>
                    )}
                  </div>
                  {prereqs.length > 0 ? (
                    <p className="uni-card-note">Prerequisites: {prereqs.join(", ")}</p>
                  ) : null}
                  <div className="uni-card-tags">
                    {program.broad_based_admission ? (
                      <span className="uni-pill">Broad-based review</span>
                    ) : null}
                    {program.supplemental_app ? (
                      <span className="uni-pill">Supplemental application</span>
                    ) : null}
                    {program.source_url ? (
                      <a
                        className="uni-source-link"
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
        <section className="uni-section">
          <h2 className="uni-h2">Fields of study</h2>
          <div className="uni-tag-row">
            {data.school.program_areas.map((area) => (
              <span key={area} className="uni-field-tag">
                {area}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {data.similar.length > 0 ? (
        <section className="uni-section" data-testid="universe-similar">
          <h2 className="uni-h2">Similar programs</h2>
          <p className="helper uni-section-sub">Found by program similarity.</p>
          <div className="uni-similar-grid">
            {data.similar.map((peer) => (
              <Link key={peer.unitid} href={`/schools/${peer.unitid}`} className="uni-similar-card">
                <div className="uni-similar-name">{peer.name}</div>
                {peer.program_areas && peer.program_areas.length > 0 ? (
                  <div className="uni-similar-areas">
                    {peer.program_areas.slice(0, 3).join(", ")}
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {data.notes.length > 0 ? (
        <section className="uni-section uni-notes">
          <h2 className="section-kicker">Data notes</h2>
          <ul className="uni-notes-list">
            {data.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

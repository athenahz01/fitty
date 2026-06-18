import type { Metadata } from "next";
import Link from "next/link";

import artifacts from "@/lib/model/artifacts.json";
import realCalibration from "@/pipeline/reports/real_calibration.json";

import { MethodologyAnalytics } from "./methodology-analytics";

export const metadata: Metadata = {
  title: {
    absolute: "Methodology | Fitty",
  },
  description:
    "How Fitty builds admissions ranges, where the model is weakest, and what applicant context it never uses.",
};

const unmodeledFactors = [
  "Essays and application narrative",
  "Teacher and counselor recommendations",
  "Institutional priorities and class-shaping needs",
  "Demonstrated interest or student-specific engagement",
];

const tierLabels: Record<string, string> = {
  accessible: "Accessible",
  selective: "Selective",
  highly_selective: "Highly selective",
  elite: "Elite",
};

function formatPredictionRange(value: string) {
  const [low, high] = value.split("-").map((part) => Number(part));
  return `${Math.max(0, Math.round(low * 100))}-${Math.round(high * 100)} on the 0-100 scale`;
}

function formatMarker(value: number | null) {
  if (value === null) {
    return "Not enough held-out outcomes";
  }

  return `${Math.round(value * 100)} on the 0-100 scale`;
}

function formatSpan(value: number | null) {
  if (value === null) {
    return "Not enough held-out outcomes";
  }

  return `${Math.round(value * 100)}-point span`;
}

export default function MethodologyPage() {
  return (
    <main className="fitty-shell">
      <MethodologyAnalytics />
      <div className="almanac-frame methodology-frame">
        <header className="ledger-topbar">
          <div className="brand-mark">
            <div className="brand-sigil" aria-hidden="true">
              F
            </div>
            <div className="brand-copy">
              <h1>Methodology</h1>
              <p>
                Fitty is an admissions almanac: useful for reading public
                signals, deliberately cautious about individual outcomes.
              </p>
            </div>
          </div>
          <Link className="method-link" href="/">
            Back to Fitty
          </Link>
        </header>

        <section className="methodology-hero" aria-labelledby="methodology-title">
          <div>
            <div className="section-kicker">Public prior, not prophecy</div>
            <h2 id="methodology-title" className="methodology-title">
              Fitty shows calibrated prior probability ranges grounded in
              public data and CDS C7 priorities.
            </h2>
          </div>
          <div className="methodology-stamp" aria-label="Current model label">
            <span>Model</span>
            <strong>{artifacts.model_type}</strong>
            <small>{artifacts.honesty_label}</small>
          </div>
        </section>

        <div className="methodology-grid">
          <section className="method-panel">
            <div className="section-kicker">What it does</div>
            <h3 className="section-title">Range first, point second.</h3>
            <p className="method-copy">
              Fitty combines public College Scorecard fields, selectivity tiers,
              test ranges, school context, and seeded CDS C7 admissions
              priorities into an 80% prior interval. The single probability is
              shown only as a marker inside that interval because the interval
              is the honest object.
            </p>
          </section>

          <section className="method-panel limitation-panel">
            <div className="section-kicker">Sub-20% schools</div>
            <h3 className="section-title">
              The hard accuracy ceiling is worst below 20% admit rate.
            </h3>
            <p className="method-copy">
              At highly selective and elite schools, many decisive factors are
              invisible in public data. Fitty can frame uncertainty, but it
              cannot reliably predict one student&apos;s individual outcome at
              sub-20 admit-rate institutions.
            </p>
          </section>

          <section className="method-panel">
            <div className="section-kicker">What it cannot see</div>
            <h3 className="section-title">Unmodeled application context.</h3>
            <ul className="method-list">
              {unmodeledFactors.map((factor) => (
                <li key={factor}>{factor}</li>
              ))}
            </ul>
          </section>

          <section className="method-panel">
            <div className="section-kicker">Validation status</div>
            <h3 className="section-title">Synthetic calibration is not individual accuracy.</h3>
            <p className="method-copy">
              The current model is a synthetic public-data prior and has not
              been validated against real applicant outcomes. Self-published
              calibration checks help audit the math, but they do not prove
              accuracy for any person. A later version should improve only with
              consented applicant outcomes.
            </p>
          </section>

          <section className="method-panel">
            <div className="section-kicker">Data boundaries</div>
            <h3 className="section-title">Race and ethnicity are never used.</h3>
            <p className="method-copy">
              Fitty excludes race and ethnicity by design. The app does not sell
              personal data, and its analytics wrapper is off by default and
              restricted to non-identifying product events.
            </p>
          </section>

          <section className="method-panel">
            <div className="section-kicker">How to read it</div>
            <h3 className="section-title">Use the range as a planning signal.</h3>
            <p className="method-copy">
              Treat a result as a rough public-data baseline for list balance
              and next moves, not a verdict. A wide interval is the product
              telling the truth about missing evidence.
            </p>
          </section>

          <section className="method-panel limitation-panel">
            <div className="section-kicker">Fit Finder</div>
            <h3 className="section-title">Reasons plus ranges, never a fit score.</h3>
            <p className="method-copy">
              Fit Finder compares the student&apos;s stated interests and
              preferences with each school&apos;s published attributes: programs,
              size, setting, region, public outcomes, and published cost. It
              uses text embeddings to find nearby school records, then attaches
              the same honest chancing range Fitty uses elsewhere.
            </p>
            <ul className="method-list">
              <li>
                It cannot weigh campus culture, social fit, teaching quality,
                vibe, or anything missing from public data.
              </li>
              <li>
                Affordability uses published net price or sticker cost only.
                Merit aid is not predicted, and a family&apos;s real cost can differ.
              </li>
              <li>
                Fit is shown as matched reasons and notable attributes, not as a
                score. Chances are calibrated ranges, not guarantees.
              </li>
              <li>Race and ethnicity are never used for matching or chances.</li>
            </ul>
          </section>
        </div>

        <section className="calibration-ledger" aria-labelledby="calibration-ledger">
          <div className="calibration-ledger-head">
            <div>
              <div className="section-kicker">Published calibration</div>
              <h2 id="calibration-ledger" className="section-title">
                Real-outcome calibration ledger.
              </h2>
              <p className="method-copy">
                Status: <strong>{realCalibration.status}</strong>. Source:{" "}
                <strong>{realCalibration.source}</strong>. Fixture rows prove
                the contract; production claims require consented Supabase
                outcomes.
              </p>
            </div>
            <div className="methodology-stamp compact">
              <span>Change-course check</span>
              <strong>{realCalibration.change_course.status}</strong>
              <small>{realCalibration.change_course.recommendation}</small>
            </div>
          </div>

          <div className="calibration-table-wrap">
            <table className="calibration-table">
              <caption>Calibration by predicted range</caption>
              <thead>
                <tr>
                  <th scope="col">Predicted range</th>
                  <th scope="col">Mean marker</th>
                  <th scope="col">Observed outcomes</th>
                </tr>
              </thead>
              <tbody>
                {realCalibration.calibration_by_bin.map((row) => (
                  <tr key={row.bin}>
                    <td>{formatPredictionRange(row.bin)}</td>
                    <td>{formatMarker(row.mean_predicted)}</td>
                    <td>
                      {row.admitted_count} admitted of {row.outcome_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="calibration-table-wrap">
            <table className="calibration-table">
              <caption>Calibration by selectivity tier</caption>
              <thead>
                <tr>
                  <th scope="col">Tier</th>
                  <th scope="col">Held-out outcomes</th>
                  <th scope="col">Mean marker</th>
                  <th scope="col">Observed outcomes</th>
                </tr>
              </thead>
              <tbody>
                {realCalibration.calibration_by_tier.map((row) => (
                  <tr key={row.tier}>
                    <td>{tierLabels[row.tier] ?? row.tier}</td>
                    <td>{row.outcome_count}</td>
                    <td>{formatMarker(row.mean_predicted)}</td>
                    <td>
                      {row.admitted_count} admitted of {row.outcome_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="calibration-table-wrap">
            <table className="calibration-table">
              <caption>Real-data span compared with the Phase 2 prior</caption>
              <thead>
                <tr>
                  <th scope="col">Tier</th>
                  <th scope="col">Real held-out span</th>
                  <th scope="col">Phase 2 prior span</th>
                </tr>
              </thead>
              <tbody>
                {realCalibration.interval_width_comparison.map((row) => (
                  <tr key={row.tier}>
                    <td>{tierLabels[row.tier] ?? row.tier}</td>
                    <td>{formatSpan(row.real_mean_interval_width)}</td>
                    <td>{formatSpan(row.phase2_prior_interval_width)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Compass, ListChecks, Search, Target } from "lucide-react";

export const metadata: Metadata = {
  title: {
    absolute: "Your College Chances, School by School | Admira",
  },
  description:
    "See your admissions chances at every school and find the ones that fit — for US and Canadian college applicants.",
};

const steps = [
  {
    n: "1",
    title: "Build your profile",
    body: "Enter your grades, scores, and what you're looking for — once. Every school read and plan uses it.",
  },
  {
    n: "2",
    title: "See your chances",
    body: "Look up any school for a chance range, your fit, and what's driving the number — grounded in public data.",
  },
  {
    n: "3",
    title: "Build a balanced list",
    body: "Mix reach, target, and likely schools, then turn the list into requirements, tasks, and deadlines.",
  },
];

const features = [
  {
    icon: Target,
    title: "Chances at every school",
    body: "A clear chance range for any US or Canadian school, shown as an interval — never false precision.",
  },
  {
    icon: Compass,
    title: "Schools that fit you",
    body: "Fit Finder surfaces schools that match your interests, size, setting, and budget — fit kept separate from odds.",
  },
  {
    icon: ListChecks,
    title: "A balanced list",
    body: "Build a list with a healthy spread across reach, target, and likely, all tied to your real reads.",
  },
  {
    icon: Search,
    title: "Where similar students got in",
    body: "See outcomes from students with profiles like yours, shown only when the group stays anonymous.",
  },
];

export default function Home() {
  return (
    <main className="marketing-shell">
      <nav className="marketing-nav" aria-label="Admira marketing">
        <Link className="brand-mark" href="/">
          <div className="brand-sigil" aria-hidden="true">
            A
          </div>
          <div className="brand-copy">
            <h1>Admira</h1>
            <p>your college chances</p>
          </div>
        </Link>
        <div className="topbar-actions">
          <Link className="method-link" href="/methodology">
            Methodology
          </Link>
          <Link className="method-link" href="/privacy">
            Privacy
          </Link>
          <Link className="add-button marketing-signin" href="/start">
            Get your read
          </Link>
        </div>
      </nav>

      <section className="marketing-hero">
        <div className="marketing-copy">
          <span className="section-kicker">For the US &amp; Canada</span>
          <h2>Know your chances at every college.</h2>
          <p>
            Set up your profile once, and Admira shows your admissions chances
            at any school, finds the ones that fit you, and helps you build a
            balanced list.
          </p>
          <div className="marketing-actions">
            <Link className="add-button" href="/start">
              Get your read
            </Link>
            <Link className="method-link" href="/methodology">
              See how it works
            </Link>
          </div>
          <div className="marketing-strip" aria-label="What Admira does">
            <span>Chances at every school</span>
            <span>Schools that fit you</span>
            <span>A balanced college list</span>
          </div>
        </div>

        <aside className="sample-read-card" aria-label="Illustrative Admira read">
          <span className="sample-tag">Illustration</span>
          <div className="section-kicker">Sample read</div>
          <h3>A target. Strong academics, fierce field.</h3>
          <div className="sample-read-grid">
            <div>
              <span className="micro-label">Your chance range</span>
              <strong className="sample-range mono">24-38%</strong>
            </div>
            <span className="result-pill target">Target</span>
          </div>
          <div className="sample-rangebar" aria-hidden="true">
            <span />
            <i />
          </div>
          <p className="helper">
            These figures are illustrative only. Your real numbers appear once
            you set up your profile and pick a school.
          </p>
          <div className="sample-fit">
            <span className="micro-label">Fit overlap</span>
            <strong>FIT 71</strong>
          </div>
        </aside>
      </section>

      <section className="marketing-section" aria-labelledby="how-it-works">
        <div className="marketing-section-head">
          <span className="section-kicker">How it works</span>
          <h2 id="how-it-works">From your grades to a real plan.</h2>
        </div>
        <ol className="marketing-steps">
          {steps.map((step) => (
            <li key={step.n} className="marketing-step">
              <span className="marketing-step-num" aria-hidden="true">
                {step.n}
              </span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="marketing-section" aria-labelledby="what-you-get">
        <div className="marketing-section-head">
          <span className="section-kicker">What you get</span>
          <h2 id="what-you-get">One profile. Every answer.</h2>
        </div>
        <div className="marketing-features">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="marketing-feature">
                <span className="marketing-feature-icon" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="marketing-band" aria-labelledby="coverage">
        <div>
          <span className="section-kicker">For the US &amp; Canada</span>
          <h2 id="coverage">Built for both sides of the border.</h2>
          <p>
            Chances come from public data — College Scorecard, IPEDS, and Common
            Data Set for US schools; published admission averages and program
            requirements for Canadian programs. Canadian grades are compared in
            their own basis, never converted away.
          </p>
        </div>
        <Link className="add-button" href="/start">
          Get your read
        </Link>
      </section>

      <footer className="marketing-footer">
        <Link className="brand-mark" href="/">
          <div className="brand-sigil" aria-hidden="true">
            A
          </div>
          <div className="brand-copy">
            <h1>Admira</h1>
            <p>your college chances</p>
          </div>
        </Link>
        <nav className="marketing-footer-links" aria-label="Admira policy links">
          <Link href="/methodology">Methodology</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/privacy#terms">Terms</Link>
        </nav>
        <span className="marketing-footer-note">All sample figures are illustrative.</span>
      </footer>
    </main>
  );
}

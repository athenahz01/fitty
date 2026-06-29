import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute: "Honest, confident college chances | Admira",
  },
  description:
    "Admira separates school fit from honest admissions ranges for US and Canadian college applicants.",
};

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
            <p>honest college intelligence</p>
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
          <h2>Honest, confident college chances.</h2>
          <p>
            Admira reads one shared profile and answers two separate questions
            for every school: is it a good fit, and what is the honest
            admissions range.
          </p>
          <div className="marketing-actions">
            <Link className="add-button" href="/start">
              Get your read
            </Link>
            <Link className="method-link" href="/methodology">
              See the methodology
            </Link>
          </div>
          <div className="marketing-strip" aria-label="Admira principles">
            <span>Range, never a point</span>
            <span>FIT is not admit odds</span>
            <span>We name what we cannot see</span>
          </div>
        </div>

        <aside className="sample-read-card" aria-label="Illustrative Admira read">
          <span className="sample-tag">Illustration</span>
          <div className="section-kicker">Sample read</div>
          <h3>A target. Strong academics, fierce field.</h3>
          <div className="sample-read-grid">
            <div>
              <span className="micro-label">Honest chance range</span>
              <strong className="sample-range mono">24-38%</strong>
            </div>
            <span className="result-pill target">Target</span>
          </div>
          <div className="sample-rangebar" aria-hidden="true">
            <span />
            <i />
          </div>
          <p className="helper">
            These figures are illustrative only. A real read is generated from
            the module layer after the profile and school are selected.
          </p>
          <div className="sample-fit">
            <span className="micro-label">Fit overlap</span>
            <strong>FIT 71</strong>
          </div>
        </aside>
      </section>
    </main>
  );
}

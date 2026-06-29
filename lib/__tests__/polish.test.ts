import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readWorkspaceFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function sliceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("polish pass guardrails", () => {
  const css = readWorkspaceFile("app/globals.css");
  const app = readWorkspaceFile("app/admira-app.tsx");
  const landing = readWorkspaceFile("app/page.tsx");

  it("uses shared polish motion without broad transitions", () => {
    expect(css).toContain("--motion-fast");
    expect(css).toContain("--motion-medium");
    expect(css).toContain("--motion-slow");
    expect(css).toContain("--ease-out-quart");
    expect(css).toContain("@keyframes dashboard-reveal");
    expect(css).toContain("@keyframes data-bar-grow");
    expect(css).not.toMatch(/transition\s*:\s*all\b/i);
    expect(css).not.toMatch(/will-change\s*:\s*all\b/i);
  });

  it("disables polish animation for reduced motion", () => {
    const reducedMotion = sliceBetween(
      css,
      "@media (prefers-reduced-motion: reduce)",
      "@media (max-width: 1020px)",
    );

    for (const selector of [
      ".result-card",
      ".fit-finder-panel",
      ".sly-panel",
      ".copilot-panel",
      ".reports-panel",
      ".scale-band",
      ".skeleton-band",
    ]) {
      expect(reducedMotion).toContain(selector);
    }
    expect(reducedMotion).toContain("animation: none !important");
    expect(reducedMotion).toContain("transform: none !important");
  });

  it("keeps loading skeletons free of fake numeric metrics", () => {
    const skeletons = [
      sliceBetween(app, '<div className="fit-empty" aria-busy="true">', "if (response.results.length"),
      sliceBetween(app, '<div className="search-loading">', '{status === "error"'),
      sliceBetween(app, "function LoadingCard", "function AdmitIntelligenceCard"),
    ].join("\n");

    expect(skeletons).toContain("No temporary FIT score is shown.");
    expect(skeletons).toContain("No temporary number is shown.");
    expect(skeletons).not.toMatch(
      /\b(?:FIT|Score|chance|range|admit|records?|students?|complete)\s+\d|\d+(?:\.\d+)?\s*(?:%|pts|records?|students?|complete)|\$[0-9]/i,
    );
  });

  it("labels marketing sample figures as illustrative", () => {
    const sampleCard = sliceBetween(
      landing,
      '<aside className="sample-read-card"',
      "</aside>",
    );

    expect(sampleCard).toContain("Illustration");
    expect(sampleCard).toContain("These figures are illustrative only");
    expect(sampleCard).toMatch(/24-38%/);
    expect(sampleCard).toMatch(/FIT 71/);
  });

  it("keeps server-only secret names out of client surfaces", () => {
    const clientSources = [
      "app/admira-app.tsx",
      "app/studio/essay-studio.tsx",
      "app/compass/compass-explorer.tsx",
    ]
      .map(readWorkspaceFile)
      .join("\n");

    expect(clientSources).not.toMatch(
      /ANTHROPIC_API_KEY|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY/i,
    );
  });
});

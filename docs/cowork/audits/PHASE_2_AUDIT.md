ADMIRA V2 — PHASE 2 AUDIT
Scope: commit `3ae3d8c "Phase 2: School Universe + Smart List Builder (+ Phase 1 M1/M2)"`,
       branch `v2/phase-2-universe-list` (audited against a clean `git archive` export of the commit)
Claimed deliverable: Phase 2 — School/Program Universe + Smart List Builder; plus Phase 1 remediation M1, M2
Date: 2026-06-26
Auditor: Cowork

VERDICT: **PASS** (cleared for promotion)

Zero open Blockers, zero open Majors. The Smart List Builder is transparently auditable — one documented
objective function is the sole order determinant, tiers come from the Phase 1 engine (so they match
`/api/admit-intelligence`), and shuffling the input provably does not change the output. The Phase 1 M1/M2
remediations are correctly done, which also clears Phase 1's user-facing flag-on conditions. Standing
non-blocking item: reproduce the full suite in Linux CI (below).

---

FINDINGS

Blockers: none.
Majors: none.

Phase 1 remediation (verified resolved):
- [M1 ✓] `lib/profile/index.ts` — the per-axis `admitted` reference is now derived per-school from the
  school's selectivity tier (`TIER_ACADEMIC_REFERENCE`), published middle-50 bands, or CDS C7, and carries
  `reference_basis: "derived" | "guide_rail"`. When no signal exists it falls back to a clearly labeled
  generic guide rail; no copy claims "loaded admitted-student bands" anymore. Fit/Extracurricular axes are
  explicitly labeled heuristics. New test asserts the reference differs across schools when data differs.
- [M2 ✓] `app/api/admit-intelligence/route.ts` + `lib/score/canada.ts` — a pure `canadaBasisError()` returns
  a clear message; the route now returns **400** (not 500) on `applicant_basis` ≠ `cutoff_basis`, and also
  handles a missing cutoff_basis. Unit-tested.

Advisory:
- [A1] `lib/list-builder/index.ts` `affordabilityRead`: when a budget is set but a school has no
  `net_price_avg`, affordability = 0.6 (`UNKNOWN_COST_AFFORDABILITY`), a mild down-rank for missing data.
  The *displayed* net cost is still honestly null ("net price not published"); 0.6 is only a ranking weight
  and is documented. Fine as-is; flagging because missing-data handling is a judgment call — consider neutral
  1.0 if you'd rather never penalize absent data.
- [A2] Carryover from Phase 1: score/tier rounding boundary (`round(calibrated*100)` vs exact tier cutoffs).
- [Note] The Universe program page is a client-fetch component (not SSR) — Claude Code flagged this as a
  deliberate choice (keeps e2e mockable without a live DB). No audit concern at this stage; revisit only if
  SEO/SSR becomes a product requirement.

---

MODEL INTEGRITY
  Determinism: **pass** — no `Math.random`/`Date.now` anywhere in `lib/list-builder`, `lib/universe`,
    `lib/profile`. Input is sorted by `unitid` before scoring; intra-bucket order is desirability then
    `unitid`. **Auditor-run:** built the engine with representative stubs and confirmed shuffling the
    candidate order yields a byte-identical list (no-bias), duplicate unitids collapse to one, and Canada
    rows are excluded and counted.
  Lineage: **pass** — list rationales are generated from each row's real computed fit/tier/net_cost (verified
    by reading `rationaleFor` + a runtime sample: "Strong program fit (67), reach odds, over your $28,000
    budget."). Universe figures each carry an internal `source` label (Scorecard net price/sticker/earnings/
    completion; Fit Finder similarity). No hardcoded number is presented as data.
  Cross-module consistency: **pass** — list tier = `tierFromProbability(buildChancePayload(...).calibrated)`,
    and `buildChancePayload` defaults to `getActiveArtifact()` — the *same* artifact the `/api/admit-
    intelligence` route uses — so a school's list tier equals its admit-intelligence tier. Fit uses the same
    `keywordProgramScore`+`blendProgramFit` blend as the program page.
  No leakage: **pass** — outcome data (earnings/completion) is explicitly excluded from ranking; deferred to
    Phase 3 correctly.
  Balance/non-degeneracy: **pass** — tiers fold Reach/Target/(Likely|Safety) into 3 buckets, top-N per bucket
    (default 3/4/3); auditor-run pool spread across tiers rather than collapsing.

BUILD QUALITY
  Architecture conformance: **pass** — `lib/list-builder/*`, `lib/universe/*`, `/api/list/generate` +
    status, `/api/schools/universe`, `app/schools/[unitid]`; reuses score/fit/profile, does not fork them.
  Tests: **pass (static + auditor-run subset)** — 65 unit + 15 e2e per executor. The list-builder suite
    targets exactly the right properties (balance, rationale-matches-data, no-fabricated-cost, consistency
    with admit-intelligence, determinism, no-bias shuffle, higher-objective-outranks-regardless-of-unitid,
    Canada scoped+counted, objective exposure). `tsc --noEmit` clean across the whole project on the export.
    Full vitest/build/e2e not run here (mounted node_modules lacks the Linux rolldown native binding —
    environment, not code); the engine was independently exercised via transpile.
  Security: **pass** — `/api/list/generate` and `/api/schools/universe` are flag-gated, Zod-validated,
    server-side read clients, no writes, no secrets; `.env.example` only adds the two flags.
  Feature flags: **yes** — `ADMIRA_LIST_BUILDER_ENABLED`, `ADMIRA_UNIVERSE_ENABLED` (both default false);
    Canada gated by `ADMIRA_CANADA_ENABLED`; no auto-promote.
  MODEL_CARD: **pass** — documents the objective function, weights, affordability rules, unitid tie-break,
    and the "overlooking" row.

CONDITIONS / NOTES:
  - Cleared for promotion behind the flags now.
  - With M1/M2 resolved here, **Phase 1's user-facing flag-on conditions are also satisfied** —
    `ADMIRA_ADMIT_INTELLIGENCE_ENABLED` may be turned on for users once the standard CI/staging run is green.
  - Standing reproduction gate (applies to every phase, not a defect): Linux `npm ci` →
    `test` + `test:e2e` + `build`, and `verify:rls` on staging. Executor reports 65 unit + 15 e2e green;
    auditor verified `tsc` clean + ran the list-builder engine + Phase-1 holdout/spot battery independently.

SIGN-OFF: Cowork — **Pass.** Phase 2 cleared; Phase 1 M1/M2 cleared. Next: Phase 3 (Students-Like-You) —
the k-anonymity + consent-RLS + no-self-leakage phase; budget extra re-audit time there.

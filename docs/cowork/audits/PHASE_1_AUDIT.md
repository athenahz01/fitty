ADMIRA V2 — PHASE 1 AUDIT
Scope: commit `a3e30d8 "Add Phase 1 Admit Intelligence"`, branch `v2/phase-1-admit-intelligence`
       (audited against a clean `git archive` export of the commit, not the mounted working tree)
Claimed deliverable: Phase 1 — Admit Intelligence v2 + Profile Studio (US + Canada headline score/tier/drivers)
Date: 2026-06-26
Auditor: Cowork

VERDICT: **PASS-WITH-CONDITIONS**

The Admit Intelligence engine — the bold headline score/tier/drivers users screenshot — is sound and
independently verified: the score is an explicit deterministic transform of the calibrated probability, the
Canada scorer is native-basis and matches the published holdout 19/19, and nothing user-facing uses RNG or
time. Promotion **behind the flag (flag off)** is fine now. Two Majors must be fixed before the flag is
turned on for users — chiefly the Profile Studio, whose "admitted-student" reference lines are hardcoded
constants while the copy claims they are loaded from admitted-student data.

---

FINDINGS

Blockers: none open. (The headline engine — the primary red-line surface — passes.)

Majors (fix before enabling `ADMIRA_ADMIT_INTELLIGENCE_ENABLED` for users):

- [M1] `lib/profile/index.ts` — Profile Studio "admitted-student" reference is hardcoded and the copy
  overclaims data lineage. Every axis' `admitted` value is a constant — US `78/78/76/74/72`, CA
  `76/76/72/72/74` — identical for every school, yet the `method`/`note` strings say the axes compare against
  "loaded admitted-student bands." The applicant-side axis *values* do trace to data (school SAT/ACT bands via
  `scoreFromBand`, CDS C7 importance via `ratingValue`), but the comparison line does not. Two axes are also
  thin proxies presented as measured: **Fit** is binary (`intended_major` typed → 72, else 58) and
  **Extracurricular Impact** is derived from the character length of `activity_context` (55/70/82). Why it
  matters: a user comparing MIT to a local public sees the *same* "admitted student" radar — a number pulled
  from nowhere but labeled as admitted-student data (red-line category). Build-plan Phase 1 explicitly calls
  for per-school "you vs admitted students" distribution bands. Fix: source the reference from CDS C9–C12
  (US) / Canadian admitted-average ranges (CA), or correct the copy to stop claiming loaded admitted data and
  reconsider the Fit/EC proxies. Repro: `buildUsProfileStudio` for any two very different unitids → identical
  `admitted` values; `profile.test.ts` asserts bounds/determinism only, never lineage.

- [M2] `app/api/admit-intelligence/route.ts` — basis mismatch returns 500 instead of 400. When
  `applicant_basis` ≠ the program's `cutoff_basis`, `scoreCanadaProgram` throws and the route does not catch
  it → unhandled 500. Because `applicant_basis` defaults to `"percentage"`, a request to an R-score-basis
  program without an explicit basis 500s. It fails *safe* (no wrong number is produced — hence Major, not
  Blocker), but should validate basis compatibility and return a 400 with a clear message.

Advisory:

- [A1] Score/tier rounding boundary: `score = round(calibrated*100)` but tier boundaries are exact
  (e.g. 0.30). A calibrated 0.297 shows **score 30 / tier Reach** while 0.300 shows **score 30 / tier
  Target** — two "30"s in different tiers. Cosmetic; align the displayed score with the tier boundary or
  accept it.
- [A2] No rate-limiting on `/api/admit-intelligence` (consistent with existing routes; matters more for the
  Phase 6–7 Claude endpoints — design it in there).
- [A3] Carryover: drop the unnecessary `pgcrypto` extension (Phase 0 A1). Note: the Phase 0 geo-concordance
  risk (M3) is now **moot for scoring** — the Canada scorer refuses cross-basis comparison rather than using
  the `lib/geo` linear stubs. Keep those stubs out of any future scoring path.

---

MODEL INTEGRITY
  Reproducibility/determinism: **pass** — no `Math.random`/`Date.now`/`new Date` anywhere in
    `lib/score`, `lib/profile`, or the route; pure functions; identical inputs ⇒ identical outputs.
  Lineage (numbers trace to source/model): **pass for the headline**, **fail for the profile reference (M1)**.
    `score = round(clamp(calibrated,0,1)*100)` traces to the public-prior calibrated probability; US drivers
    come from `featureContributions` of the same model; Canada score traces to `program_requirements` rows.
    The profile *admitted reference* lines are hardcoded (M1).
  Calibration/cutoff holdout: **pass (auditor-run)** — transpiled the pure score modules and ran the 19-row
    `canada_cutoffs_holdout.json`: 19/19 (tier flips Reach→Target at `cutoff_avg_low`, clears Target above
    `cutoff_avg_high`). Native-basis enforced.
  Obvious-case spot tests: **pass (auditor-run + unit tests)** — MIT @ 3.1 GPA / 1290 SAT → Reach (score
    <30); CA in-band 92∈[90,93] → Target; below 78 → Reach; cross-basis (gpa_4_0 vs percentage) throws (fails
    closed); missing prereqs drop score 48→26 (personalization real). Score↔driver consistency guard present
    and tested.

BUILD QUALITY
  Architecture conformance: **pass** — `/api/admit-intelligence` + status route; `lib/score/{headline,tiers,
    us,canada,drivers,server}`, `lib/profile`; single shared tier table; `/api/chance` preserved.
  Tests: **pass (static + auditor-run subset)** — 51 unit + 12 e2e per Codex; the unit tests are meaningful
    (score determinism/monotonicity, tier boundaries, driver consistency, MIT obvious case, Canada
    native-basis + cross-basis refusal). `tsc --noEmit` clean across the whole project on the clean export.
    Full vitest/build not run here (mounted node_modules lacks the Linux rolldown native binding — environment,
    not code).
  Security: **pass** — input validated (Zod, bounded); server-side read client; no writes; no secrets added;
    `.env.example` only adds the flag.
  Privacy/consent: n/a for this phase (no new PII surfaces; no outcome data fed into scoring — correctly
    deferred to Phase 3 to avoid the leakage trap).
  Performance: route is `nodejs` runtime; single school + program_requirements read; fine.
  Feature flag present: **yes** — `ADMIRA_ADMIT_INTELLIGENCE_ENABLED` (default false); CA still gated by
    `ADMIRA_CANADA_ENABLED`; no auto-promote.
  MODEL_CARD: **pass** — documents the score transform, thresholds, driver consistency, Canada native-basis
    rule, confidence-as-texture, and explicitly disclaims oracle/individual-outcome prediction.

CONDITIONS FOR PROMOTION:
  - Promote behind the flag (flag OFF) now — acceptable.
  - Before turning `ADMIRA_ADMIT_INTELLIGENCE_ENABLED` ON for users: resolve **M1** (profile admitted-reference
    lineage + Fit/EC proxies) and **M2** (basis-mismatch → 400). Re-audit the profile module only.
  - CI/staging reproduction (carryover): Linux `npm ci` → `test` + `test:e2e` + `build`; `verify:rls` on
    staging; `verify:phase0:migration` on scratch (Phase 0 migration already auditor-verified on a real PG).

SIGN-OFF: Cowork — **Pass-with-conditions.** Engine cleared and independently verified; M1/M2 ticketed and
must land before user-facing flag-on. Next executor: Claude Code (Codex out of usage) — findings are
executor-agnostic.

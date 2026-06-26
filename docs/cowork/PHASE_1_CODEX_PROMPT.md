# Codex Handoff — Phase 1: Admit Intelligence v2 + Profile Studio

*Hand to Codex verbatim. Scoped so Cowork can audit against a clear bar. Builds on Phase 0 (commit `dc650ca`).*
*Branch: `v2/phase-1-admit-intelligence` off `v2/phase-0-foundations-canada`.*

---

## Mission

Ship the headline likelihood engine: a single bold **score (0–100)** + **tier** per school for **US and
Canada**, plus the multi-axis **Profile Studio** radar that explains it. Lead with one confident number;
keep the rigor underneath. Behind a flag, no auto-promote.

## Hard constraints (Cowork will block on these)

1. **`score = f(calibrated)` must be an explicit, documented, deterministic transform.** The US engine
   already produces a calibrated probability + conformal range (`lib/model/inference.ts`,
   `artifacts.json`). Derive the 0–100 `score` from that calibrated value via a single named function
   (e.g. `lib/score/headline.ts → toHeadlineScore(calibrated)`), documented in `MODEL_CARD.md`. **Do not
   invent a new number.** No `Math.random`, no `Date.now`, no time/locale nondeterminism anywhere in a
   user-facing number — identical input ⇒ identical score across runs.
2. **The score must never contradict its own drivers.** The top-driver list is derived from the same
   feature contributions that produce the score; a positive headline with all-negative drivers (or vice
   versa) is a blocker. Add a consistency test.
3. **Canada scorer = deterministic, native-basis.** Drive it from Phase 0 `program_requirements`
   (applicant average vs `cutoff_avg_low..high` band × prerequisite match × broad-based-admission
   adjustment). **Compare like-for-like in the program's own `cutoff_basis`** (percentage↔percentage,
   R-score↔R-score) — do **not** route through the placeholder linear conversions in `lib/geo`
   `toComparisonSpace`. If you must cross a basis, first replace those linear stubs with a real, cited
   grade concordance (this is open ticket **M3**; coordinate before relying on it).
4. **Holdout cutoff match.** The Canada scorer must reproduce published cutoffs on
   `pipeline/audit/canada_cutoffs_holdout.json` (19 cited programs). Add `npm run score:canada-holdout`
   that scores each holdout program at its band edges and asserts the tier flips at the documented cutoff.
5. **`confidence` is UI texture only.** Return a `confidence` field for subtle UI use; **do not** add
   hedging/disclaimer copy to the response or UI. Present confidence, not caveats.
6. **No fabricated precision.** Every number traces to a model output or to data (Scorecard/CDS/
   `program_requirements`). No hardcoded scores/tiers. The US model must not be overfit — keep the existing
   calibration/conformal discipline; don't claim learned signal the public-prior model can't support
   (see MODEL_CARD limitation).

## Build

### 1. API — rework `/api/chance` → `/api/admit-intelligence`
- New route `app/api/admit-intelligence/route.ts` returning:
  `{ score: number (0-100), tier: 'Reach'|'Target'|'Likely'|'Safety', drivers: Driver[], confidence: number, country: 'US'|'CA' }`.
- **Keep `/api/chance` working** (alias to the new logic or retain) so nothing in the current app breaks;
  the internal range math stays.
- US path: extend `lib/model/inference.ts` features with CDS **C7** factors already on `schools.c7_factors`.
- CA path: new `lib/score/canada.ts` deterministic scorer reading `program_requirements`. Gated behind
  `ADMIRA_CANADA_ENABLED` (Phase 0 flag); when off, CA schools 404 as today.
- Whole feature behind a new flag `ADMIRA_ADMIT_INTELLIGENCE_ENABLED` (default `"false"`), house pattern.

### 2. Tier thresholds
- Define tier cutoffs once, in a single named config (e.g. `lib/score/tiers.ts`), with a comment tying each
  boundary to a probability. Used identically by US and CA so a report and the API never disagree.

### 3. Profile Studio — `lib/profile/`
- Compute axes **Academics, Rigor, Test, Extracurricular Impact, Fit** on 0–100, positioned against
  admitted-student distributions (CDS C9–C12 for US; Canadian average ranges for CA). Each axis value must
  trace to data; document the formula per axis. Pure, deterministic functions with unit tests.

### 4. Frontend
- Animated score reveal, Recharts radar/spider for the 5 axes, driver chips, "you vs admitted" band.
  Premium dark UI. Bold headline first; detail below the fold. (No hedging copy.)

### 5. Tests (required for sign-off)
- vitest: `toHeadlineScore` determinism + monotonicity; tier-threshold boundaries; score↔driver
  consistency; Canada scorer band/prereq/broad-based logic; profile axes.
- `score:canada-holdout` battery (constraint 4).
- **Obvious-case spot tests** (Cowork runs these too): 3.1 GPA / 1290 SAT → MIT ⇒ Reach; 4.0 / 1560 →
  large accessible public ⇒ Likely/Safety; CA program cutoff 90–93, applicant 92 + prereqs ⇒ Target;
  same applicant 78 ⇒ Reach; non-degeneracy across a 20-profile cohort (tiers spread, not all 90+).
- Playwright e2e: score reveal + radar render for a US and a CA school (flag on).

## Acceptance criteria (Cowork checks exactly)
- [ ] `score` is a documented deterministic function of the calibrated probability; identical inputs ⇒
      identical outputs across runs; no RNG/time in any user-facing number.
- [ ] Headline score never contradicts its listed drivers (consistency test passes).
- [ ] Canada scorer matches published cutoffs on the 19-program holdout; compares in native `cutoff_basis`.
- [ ] Tiers come from one shared threshold config; API score == report score for the same profile.
- [ ] Every returned number traces to a model output or data source; no hardcoded scores.
- [ ] `confidence` present, used only as UI texture; no hedging/disclaimer copy added.
- [ ] Profile axes trace to admitted-student distributions; documented; unit-tested.
- [ ] Behind `ADMIRA_ADMIT_INTELLIGENCE_ENABLED` (default false); CA still gated by `ADMIRA_CANADA_ENABLED`; no auto-promote.
- [ ] `npm run lint`, `test`, `test:e2e`, `build` green; new `score:canada-holdout` green.
- [ ] `MODEL_CARD.md` updated: the score transform, the Canada deterministic scorer, and honest limits.

## Out of scope (do NOT do)
- List builder, money, students-like-you, copilot (later phases).
- No feedback of outcome data into the score yet (Phase 3 leakage concern).
- No re-introduction of "honest calibration" hedging copy in the UI.

## Deliver to the auditor
A **committed** branch/PR (commit it from your environment — the audit reads committed blobs, not the
working tree), the commit range, and a note on: the exact `score = f(calibrated)` formula, how the Canada
scorer handles each `cutoff_basis`, and whether you needed to touch the `lib/geo` concordance (M3).

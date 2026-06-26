# Build Plan Review — Auditor's Pre-Code Read

*From: Cowork (auditor). Re: `Admira_V2_Build_Plan.md` + existing `athenahz01/admira` code.*
*Purpose: flag gaps, contradictions, and audit blind spots before Codex starts, so they don't surface as Blockers mid-build.*

This is not product direction (that's Athena/Cole). These are integrity/auditability risks I can already see.

---

## A. Plan ↔ existing-code contradictions Codex must resolve up front

1. **`/api/chance` returns a *range + band*; Phase 1 wants a single bold *score 0–100 + tier*.**
   Today `app/api/chance/route.ts` returns a `Prediction` (`point/calibrated/low/high/width`) plus
   `climb_levers`. The plan reworks this into `/api/admit-intelligence` with a single `score`, a `tier`
   (Reach/Target/Likely/Safety), drivers, and a `confidence` field used only for UI texture.
   **Risk:** how the bold `score` is derived from the existing calibrated probability must be a documented,
   deterministic transform — not a new magic number. I will trace it. Codex should keep the internal range
   math and define `score = f(calibrated)` explicitly. The old `/api/chance` should be kept or aliased so
   nothing silently breaks.

2. **The plan kills "honest calibration" *copy* but the engine and `MODEL_CARD.md` are built around it.**
   That's fine and intended ("kill it in the copy, keep it in the engineering") — but the MODEL_CARD's
   stated limitation is sharp: the public-prior model's synthetic labels *re-encode published anchors*, so
   coefficients capture a structural relationship, not independent learned signal. **Audit consequence:** I
   will not accept claims of "predictive power" the model can't support. The bold headline is allowed; a
   driver list implying the model *learned* something it didn't is a consistency Blocker. Keep MODEL_CARD honest.

3. **Phase numbering collision.** The existing repo already shipped what its migrations call "phase6"
   (outcome capture) and "fit_finder phase1–3". The V2 plan renumbers everything (Students-Like-You is now
   Phase 3, outcome capture is its scaffolding). **Risk:** migration filenames and feature-flag names will
   get confusing. Recommend Codex adopt a clear `v2_phaseN_` prefix for new migrations and reference the
   build-plan phase, not the legacy one, in commit messages.

---

## B. Gaps the plan leaves under-specified (will cause audit friction)

4. **No rate-limiting exists yet, but the brief makes it a security requirement for AI endpoints.**
   The repo has Zod validation but I found no rate-limiter. Phases 6–7 (Claude-powered narrative + copilot)
   are the first to need it. Flag now so it's designed in, not bolted on.

5. **Canada deterministic scorer has no defined source-of-truth holdout.** The plan says it must "match
   published cutoffs on a holdout of known programs," but doesn't say where that holdout lives or who curates
   it. **I need a versioned fixture** (e.g. `pipeline/audit/canada_cutoffs_holdout.json`) with program →
   published cutoff band + source URL, or I cannot run the cutoff-match check. Should be a Phase 0/1 deliverable.

6. **k-anonymity threshold is named but never quantified.** Phase 3 says "k-anonymity threshold before a
   cohort renders" — but k=? The plan must pick a number (e.g. k≥5) and enforce it in **SQL/RLS**, not just
   app code. Until it's specified I'll treat any sub-5 cohort render as a privacy Blocker by default.

7. **"Students-Like-You feeds back into Admit Intelligence."** (Phase 3 → Phase 1.) This is a **leakage
   trap**: if a profile's own outcome (or near-duplicates) enters the cohort that then scores it, the model
   predicts the label from the label. Plan must specify dedup/exclusion of self and same-cycle records.
   I'll audit this hard. Recommend it stay disabled until volume + exclusion logic are proven.

8. **Merit/net-price validation data isn't sourced.** Phase 4 says "validated against known award letters
   *where available*." If none are available, the merit predictor has no ground truth and I can only check
   rule application, not correctness. Decide now which schools' published automatic-merit tables are the
   validation set, and store them with citations.

---

## C. Cross-cutting things I'll hold every phase to

9. **Determinism of "alive" outputs.** The plan wants outputs that "update when the profile changes." Good —
   but updates must be *deterministic functions of the profile*, not time/randomness. Any `Math.random`,
   `Date.now`, or model nondeterminism in a user-facing number is a reproducibility Blocker.

10. **Feature-flag discipline.** House style is env-var flags (`ADMIRA_*_ENABLED`, default `"false"`). Every
    new phase ships behind its own flag and does not auto-promote. New *UI/read paths* must be gated even in
    Phase 0 (schema migrations themselves aren't flag-gated, but anything surfaced from them is).

11. **No PII in embeddings/logs.** Already enforced by `assertNoForbiddenDemographicKeys` and the analytics
    scrubber. Every new module that embeds or logs must route through the same guards — I'll check that new
    code doesn't bypass them.

---

## D. Sequencing note (agree with the plan, one caveat)

The 0→1→3 "screenshot trifecta" path is sound. **Caveat:** Phase 3's feedback-into-Phase-1 loop (item 7)
and the merit ground-truth gap (item 8) are the two places most likely to produce a Blocker, so budget
re-audit time there. Phases 0, 2, 5 are comparatively low-risk for the auditor.

---

## E. Bottom line

The plan is buildable and auditable. The four things to nail down **before Phase 1** so I'm not blocking on
missing inputs: (1) the explicit `score = f(calibrated)` transform, (2) the Canada cutoff holdout fixture,
(3) a concrete k-anonymity number enforced in RLS, (4) the merit validation set with citations. None block
Phase 0 — Phase 0 is data + schema and can start now.

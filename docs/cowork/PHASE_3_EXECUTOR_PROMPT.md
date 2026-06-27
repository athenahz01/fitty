# Executor Handoff — Phase 3: Students-Like-You Engine (+ activate outcome capture)

> **New here?** Read `docs/cowork/EXECUTOR_CONTEXT.md` first — what Admira is, the build/audit loop, repo
> layout, house conventions, what's built (Phases 0–2), and how you'll be audited. Then come back.

*Executor: Codex. Builds on Phase 2 (`3ae3d8c`). Branch `v2/phase-3-students-like-you` off
`v2/phase-2-universe-list`. **Commit your work** (the audit reads committed blobs; keep LF endings).*

---

## Mission

The feature users fall in love with: "students with a profile like yours applied here — and this is where
they landed." Build a queryable, profile-matched cohort engine over consented outcome data, with per-school
admit/deny/waitlist distributions and an honest "what the admits had in common." This is the **proprietary
data moat** — and the **highest-risk phase for privacy**. Privacy is not a feature here; it's the gate.

## This phase is privacy-first. The non-negotiables (any violation = Blocker)

1. **k-anonymity, enforced in the database, before anything renders.** Pick **k = 5** (minimum cohort size).
   No cohort, distribution, card, or "what admits had in common" insight may be returned unless it
   aggregates **≥ k** distinct consented records. Enforce this in **SQL** (a view/function that filters
   `having count(distinct subject_id) >= 5`), not just app code — so an app bug cannot leak a sub-k cohort.
   A sub-k result returns an honest empty state ("not enough similar students yet"), never a partial cohort.
2. **Consent enforced by RLS, not app code.** Only records with active modeling consent
   (`consent_records` + the existing `require_active_modeling_consent` trigger) may enter any cohort. Reuse
   the Phase-6 scaffolding (`consent_records`, `applicant_profiles`, `application_outcomes`,
   `data_access_logs`) and its RLS. Revoked/deleted consent must drop the record from cohorts immediately.
3. **No re-identification.** Cohort output is **aggregates + bucketed/anonymized cards only**: round or band
   quasi-identifiers (GPA→band, test→band, cycle→year only), no free-text, no exact tuples, no rare-combo
   rows that single out a person. **Never** race/ethnicity or any forbidden demographic key — route all
   inputs through the existing `assertNoForbiddenDemographicKeys` guard. No `subject_id`, no PII, no raw
   profile in any client payload, log, or embedding.
4. **No self-leakage / no label-from-label.** A user's "students like you" cohort must **exclude the user's
   own record and same-cycle near-duplicates**. **Do NOT wire the cohort signal back into Admit Intelligence
   (Phase 1) in this phase** — that feedback loop is where a profile predicts its own outcome. Build the
   display engine only; leave the Phase-1 feedback behind a separate, default-off `ADMIRA_SLY_FEEDBACK_ENABLED`
   flag with the exclusion logic stubbed and documented, for a later phase to finish + re-audit.

## Build

### 1. Activate outcome capture (already scaffolded)
- Turn on the capture path behind `ADMIRA_OUTCOME_CAPTURE_ENABLED` (exists). Confirm the consent → profile →
  outcome write path goes through **service-role routes** (never anon), consent-gated by the existing trigger.
- Do not loosen any existing RLS/consent. The `verify:rls` harness must still pass and must be extended to
  cover the new cohort read path (anon cannot read sub-k or unconsented data).

### 2. Seed data (so the feature isn't empty at launch)
- Add a **deterministic, curated/public** outcome seed (same discipline as the Phase 0 Canada seed):
  committed fixture under `pipeline/data/`, every record carrying a `source_url` and clearly flagged as
  `provenance: 'curated_public'` vs real `consented_user` data — never blend them misleadingly. Ingest via a
  service-role script. Document sources in a `SOURCES.md`. Seeds must also satisfy consent/k-anonymity rules
  (seed rows are marked consented-for-modeling by provenance, with lineage).

### 3. Similarity engine — `lib/similarity/`
- Pure/deterministic: embed a profile with the **existing** Xenova MiniLM (`lib/fit/embedding-model.ts`) plus
  structured features; kNN over `application_outcomes` via pgvector. No `Math.random`/`Date.now`; stable
  tie-break (e.g. by distance then a non-identifying surrogate). Returns matched cohort **only after** the
  k-anonymity SQL gate.

### 4. Migration — `supabase/migrations/<ts>_v2_phase3_*.sql`
- A pgvector index for profile embeddings; a **k-anonymity-enforcing view/function** (`match_similar_cohort`
  style) that returns per-school admit/deny/waitlist counts + banded cohort attributes **only for groups of
  ≥ 5**. RLS: cohort reads respect consent; no anon writes. Reversible (paired down script, audited pattern).
  Apply/reverse cleanly on a scratch DB; no destructive drift.

### 5. API — `/api/students-like-you` (+ status)
- Behind `ADMIRA_STUDENTS_LIKE_YOU_ENABLED` (default `"false"`). POST profile → matched cohort + per-school
  admit/deny/waitlist breakdown + "what the admits had in common" (derived from real cohort aggregates that
  themselves pass k-anonymity — an insight that would reveal a sub-k subgroup must be suppressed). Zod-
  validated; server-side; rate-limited (this embeds input). No PII/`subject_id` in the response.

### 6. Frontend
- Anonymized similar-student cards (banded values only), outcome distribution viz, "what separated admits
  from denies" insight strip. Bold headline first; empty state when sub-k. No hedging copy, but suppression
  of thin cohorts is required (that's accuracy/privacy, not hedging).

### 7. Tests (required for sign-off)
- **k-anonymity test:** a cohort of size < 5 returns empty/suppressed; ≥ 5 returns aggregates. Assert at the
  SQL/engine layer, not just UI.
- **consent/RLS test:** extend `verify:rls` — unconsented and revoked records never appear in a cohort; anon
  cannot read cohort data.
- **no-self-leakage test:** a user's own record (and same-cycle dup) is excluded from their cohort.
- **no-PII test:** response/logs contain no `subject_id`, no raw profile, no forbidden demographic keys;
  quasi-identifiers are banded.
- **determinism test:** same profile + same data ⇒ identical cohort + ordering.
- **seed lineage test:** every seed record has `source_url` + provenance flag.
- Playwright e2e for the flag-on flow incl. the sub-k empty state.

## Acceptance criteria (Cowork checks exactly)
- [ ] No cohort/insight/distribution renders for < 5 distinct consented records; enforced in SQL.
- [ ] Consent + revocation enforced by RLS; `verify:rls` extended and green.
- [ ] No re-identification: aggregates + banded cards only; no PII/`subject_id`/exact tuples/demographic keys
      in any payload, log, or embedding.
- [ ] User's own + same-cycle records excluded from their cohort; **no cohort→Admit-Intelligence feedback this
      phase** (behind default-off `ADMIRA_SLY_FEEDBACK_ENABLED`, exclusion logic documented).
- [ ] "What admits had in common" derives from real cohort aggregates and itself respects k-anonymity.
- [ ] Seed is deterministic, source-cited, and provenance-flagged (curated_public vs consented_user).
- [ ] Migration applies + reverses cleanly on a scratch DB; pgvector index present; no destructive drift.
- [ ] Behind `ADMIRA_STUDENTS_LIKE_YOU_ENABLED` (default false); capture behind `ADMIRA_OUTCOME_CAPTURE_ENABLED`;
      no auto-promote.
- [ ] `npm run lint`, `test`, `test:e2e`, `build`, `verify:rls` green.
- [ ] `MODEL_CARD.md` documents the k threshold, anonymization/banding, consent model, and the (deferred)
      feedback exclusion rule.

## Out of scope (do NOT do)
- Wiring the cohort signal into Admit Intelligence scoring (leakage — later phase, behind its own flag).
- Money/merit, Climb/Command Center, essay/copilot (Phases 4–7).
- Any demographic feature anywhere.

## Deliver to the auditor
A committed branch/PR + commit range, and a note on: the exact k value + where it's enforced (SQL), how
quasi-identifiers are banded, the seed sources + provenance split, and confirmation that the Phase-1 feedback
loop is left off with exclusion logic stubbed.

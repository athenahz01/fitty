ADMIRA V2 — PHASE 3 AUDIT
Scope: commit `d8d5569 "Build phase 3 students-like-you"`, branch `v2/phase-3-students-like-you`
       (audited against a clean `git archive` export; DB checks run on a real Postgres 15 + pgvector)
Claimed deliverable: Phase 3 — Students-Like-You engine + activated outcome capture
Date: 2026-06-27
Auditor: Cowork

VERDICT: **PASS** (cleared for promotion)

This was the highest-risk phase (privacy / k-anonymity / consent / leakage) and it holds up under empirical
testing. The k-anonymity gate, consent+revocation enforcement, and self-exclusion are all enforced **in SQL**
and verified on a live database — including that a caller passing `k=1` cannot lower the floor. The cohort
signal is correctly NOT wired into Admit Intelligence this phase. Zero Blockers, zero Majors.

---

FINDINGS

Blockers: none.
Majors: none.

Advisory:
- [A1] `match_similar_cohort` is `security invoker` and the API calls it with the **service-role** client
  (which bypasses RLS). That's fine because the function itself enforces the consent join + k-gate in its
  query, so privacy does not depend on RLS here — but it means the k/consent logic lives entirely in this one
  function. Keep the SQL-layer tests (and `verify:rls`) as the guardrail against any future edit that relaxes
  it. (No action required now.)
- [A2] Carryovers still open from earlier phases: Phase 1 score/tier rounding boundary; drop the unnecessary
  `pgcrypto` extension in the Phase 0 migration.

---

MODEL INTEGRITY / PRIVACY (the core of this phase)
  k-anonymity (k=5), SQL-enforced: **pass — verified on live Postgres.** `match_similar_cohort` floors k via
    `greatest(coalesce(p_k,5),5)` and gates every group with `having count(distinct subject_id) >= k`; the
    "attribute cards" / "what admits had in common" insights carry the same `>= k` gate, so insights can't
    reveal a sub-k subgroup. Empirical results on a scratch DB:
      • unitid with 4 consented → 0 rows (suppressed)
      • unitid with 5 consented (+1 revoked) → cohort_size 5 (revoked excluded; 3 admit / 2 deny)
      • self-excluding 1 of 5 → 4 → 0 rows (suppressed)
      • caller passing p_k=1 → still floored to 5 → sub-5 group returns 0 rows
  Consent + revocation: **pass** — the eligible CTE joins `consent_records` on
    `purpose='real_outcome_modeling' AND revoked_at IS NULL`; a revoked record dropped out of the cohort live.
    The existing `require_active_modeling_consent` trigger still blocks storing data without active consent
    (confirmed when an insert for a non-consented subject was rejected).
  No self-leakage / no feedback: **pass** — `p_exclude_subject_id` (+ same-cycle clause) removes the querying
    user's own records; the API passes the authenticated bearer subject. The cohort signal is **not** wired
    into `lib/score` (grep: none); the deferred `ADMIRA_SLY_FEEDBACK_ENABLED` flag exists (default off) and is
    not consumed by scoring. Exactly the leakage-trap mitigation requested.
  No re-identification / no PII: **pass** — `match_similar_cohort`'s return table is aggregates + banded JSON
    only (no `subject_id`, no raw profile); quasi-identifiers go through `admira_gpa_band` / `admira_test_band`
    / `admira_label_or_unknown`. The API response carries only those aggregate columns. No forbidden
    demographic keys in the seed, schema, or payload (verified). App layer adds defense-in-depth (`cohort_size
    >= K`, card `count >= K`) on top of the SQL gate.
  Determinism: **pass** — kNN orders by embedding distance then `unitid`, `outcome_id` (stable); no RNG/time.
  Seed lineage: **pass** — 16 records, all `provenance='curated_public'`, all carry `source_url`; a DB check
    constraint enforces `curated_public ⇒ source_url`. Sources documented in `pipeline/data/SOURCES.md`
    (MIT/Michigan/Alabama CDS + stats). Deterministic committed fixture; provenance kept distinct from
    `consented_user`.

BUILD QUALITY
  Migration: **pass — apply verified live; reverse reviewed.** Full chain (schools → outcome capture → fit →
    phase0 → phase3) applies cleanly on a real PG+pgvector; adds `profile_embedding`/provenance/source_url +
    ivfflat index + banding/cohort functions; `curated_public ⇒ source_url` checks. Down script
    (`pipeline/audit/v2_phase3_..._down.sql`) drops functions/indexes/constraints/columns in order — matches
    the reversible pattern verified in Phase 0.
  Architecture: **pass** — `lib/similarity/*`, `/api/students-like-you` (+status), outcomes capture activated;
    reuses Xenova embeddings; no scope drift.
  Tests: **pass (static + auditor-run)** — 72 unit + 17 e2e per executor; `verify:rls` extended with an
    "anonymous cannot execute cohort RPC" check + a 5-row consented setup; `tsc --noEmit` clean on the export.
    Auditor independently ran the k-gate/consent/self-exclusion battery on a live DB (above). Full vitest/build
    not run here (mounted node_modules lacks the Linux rolldown native binding — environment, not code).
  Security: **pass** — API flag-gated, Zod-validated, embeds server-side, service-role client, no writes from
    the read path, no secrets, bearer-token subject handling; response is aggregate-only.
  Feature flags: **yes** — `ADMIRA_STUDENTS_LIKE_YOU_ENABLED`, `ADMIRA_OUTCOME_CAPTURE_ENABLED`,
    `ADMIRA_SLY_FEEDBACK_ENABLED` all default false; no auto-promote.
  MODEL_CARD/DEPLOY: **pass** — document the k threshold, anonymization/banding, consent model, and the
    deferred feedback exclusion rule.

CONDITIONS / NOTES:
  - Cleared for promotion behind the flags now.
  - Standing reproduction gate (every phase): Linux `npm ci` → `test`+`test:e2e`+`build`; run `verify:rls`
    against staging (the new cohort/anon checks); run `verify:phase3` migration on scratch. Auditor verified
    `tsc` + the live k-anonymity/consent/migration battery here.
  - When the deferred cohort→Admit-Intelligence feedback is eventually built (behind `ADMIRA_SLY_FEEDBACK_
    ENABLED`), it requires its own audit: self + same-cycle exclusion at the feature level, plus a volume gate.

SIGN-OFF: Cowork — **Pass.** Phases 0–3 all cleared. Next: Phase 4 (Money — True Net Price + Merit Predictor
+ ROI); pre-flag the merit ground-truth/validation-set requirement before that build starts.

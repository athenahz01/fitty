ADMIRA V2 — PHASE 5 AUDIT
Scope: commit `e18052d "Build phase 5 climb command center"`, branch `v2/phase-5-climb-command-center`
       (audited against a clean `git archive` export; DB checks run on a real Postgres 15 + pgvector)
Claimed deliverable: Phase 5 — Climb Roadmap + Application Command Center
Date: 2026-06-27
Auditor: Cowork

VERDICT: **PASS** (cleared for promotion)

Projected deltas are real engine recomputes (not guesses), checklists/deadlines trace to data or are omitted
honestly, and the new per-user tables + document vault are owner-isolated in RLS — verified on a live
database (user A cannot read, insert-as, update, or delete user B's rows). Money correctly absent. Zero
Blockers, zero Majors.

---

FINDINGS

Blockers: none.
Majors: none.

Advisory:
- [A1] Carryovers still open: Phase 1 score/tier rounding boundary; drop the unused `pgcrypto` extension in
  the Phase 0 migration. (Phase 5 itself correctly avoids pgcrypto — its own test asserts this.)

---

MODEL INTEGRITY
  Projected deltas tie to the model: **pass** — `lib/climb/index.ts` computes each move as
    `buildUsAdmitIntelligence(after).score − buildUsAdmitIntelligence(before).score` (the same Phase 1 engine
    the `/api/admit-intelligence` route uses), so the "before" equals the current admit score and the delta is
    a real recompute of the counterfactual. No hardcoded "+X", no `Math.random`/`Date.now`.
  No fabricated tier claims: **pass** — `crosses_tier = before.tier !== after.tier` and `tier_claim` is set
    only when the recomputed tiers differ, using the shared `ADMIT_TIER_THRESHOLDS`.
  Honest about model-unseen factors: **pass** — fixed and model-unseen levers (e.g. course rigor, essays,
    recs, demonstrated interest) are returned as context with `kind: fixed|unseen|not_model_visible` and **no
    delta**, with an explicit note that the public-prior scorer doesn't accept those inputs.
  Determinism: **pass** — deterministic move/sort ordering; same profile ⇒ identical plan.
  Lineage (deadlines): **pass** — `application_deadlines.source_url` is `NOT NULL` with an `https` check; the
    command-center surfaces a deadline only when a sourced row exists, otherwise an honest "Deadline not
    loaded" — never an invented or `Date.now()`-relative date.
  Task completeness: **pass** — `lib/command-center` emits exactly one task per loaded required item from
    `program_requirements` + the Phase 2 list; no missing, no fabricated extras (unit-tested).

BUILD QUALITY
  Privacy / owner isolation: **pass — verified on live Postgres.** `tasks`, `requirement_status`, `documents`
    carry full owner RLS (`subject_id = auth.uid()`) for select/insert/update/delete; the document vault
    storage policies namespace files by `(storage.foldername(name))[1] = auth.uid()`. Empirical results
    (simulating two authenticated users via an `auth.uid()` GUC, with table grants so RLS is the only gate):
      • user A sees 0 of user B's tasks
      • A inserting a task as B → blocked (42501 RLS)
      • A update / delete of B's task → 0 rows
      • B still reads its own task, title intact (not the attempted "hacked" value)
    `verify:rls` is extended for these paths.
  Migration: **pass — apply verified live; reverse reviewed.** Full chain (…→phase3→phase5) applies cleanly on
    a real PG+pgvector; adds `tasks`/`documents`/`requirement_status`/`application_deadlines` + storage
    policies + touch-updated triggers; uses `gen_random_uuid()` (no pgcrypto). Down script
    (`pipeline/audit/v2_phase5_..._down.sql`) reverses in order — matches the audited reversible pattern.
  Architecture: **pass** — `lib/climb` (elevated from levers), `lib/command-center`, flagged APIs
    (`/api/climb`, `/api/command-center` + requirement-status update + document upload), no scope drift.
  Tests: **pass (static + auditor-run)** — 81 unit + 19 e2e per executor; the suites target the right
    properties (delta-from-recompute, tier-crossing-only-when-crossed, no-fabricated-unseen-delta, determinism,
    1-task-per-requirement, sourced-deadline-only, honest-omission, progress determinism, migration-RLS). `tsc
    --noEmit` clean on the export; auditor ran the owner-isolation battery + migration apply on a live DB.
  Security: **pass** — APIs flag-gated, Zod-validated, service-role for writes, owner checks, document upload
    validated to a private bucket; no secrets; no anon writes.
  No money: **pass** — no cost/net-price/ROI/scholarship fields, levers, or copy anywhere (grep clean).
  Feature flags: **yes** — `ADMIRA_CLIMB_ENABLED`, `ADMIRA_COMMAND_CENTER_ENABLED` default false; no auto-promote.
  MODEL_CARD/DEPLOY: **pass** — document the delta-recompute method and the command-center/deadline model.

CONDITIONS / NOTES:
  - Cleared for promotion behind the flags now.
  - Standing reproduction gate (every phase): Linux `npm ci` → `test`+`test:e2e`+`build`; `verify:rls` against
    staging (the new owner-isolation + storage checks); migration apply/reverse on scratch. Auditor verified
    `tsc` + the live owner-isolation/migration battery here.

SIGN-OFF: Cowork — **Pass.** Phases 0,1,2,3,5 cleared. Phase 4 (Money) deferred to last by Athena. Next:
Phase 6 (Narrative & Essay Studio + Major/Career Compass) — first phase using the Anthropic API, so
rate-limiting + no-ghostwriting + voice-preservation + (ROI-deferred) Compass become the audit focus.

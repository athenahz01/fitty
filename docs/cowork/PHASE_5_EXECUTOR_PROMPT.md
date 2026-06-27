# Executor Handoff — Phase 5: Climb Roadmap + Application Command Center

> **New here?** Read `docs/cowork/EXECUTOR_CONTEXT.md` first — what Admira is, the build/audit loop, repo
> layout, house conventions, what's built (Phases 0–3), and how you'll be audited. Then come back.

*Builds on Phase 3 (`d8d5569`). Branch `v2/phase-5-climb-command-center` off `v2/phase-3-students-like-you`.*
*Commit your work (the audit reads committed blobs; keep LF endings).*
*Sequencing note: **Money/Phase 4 is deferred to the very end.** This phase must NOT reference cost, net
price, ROI, or scholarships. Leave any money-shaped hooks out entirely — don't stub fake numbers.*

---

## Mission

Turn the diagnosis into action. Two pieces: (1) the **Climb Roadmap** — a prioritized, personalized plan of
the highest-impact moves to raise admit odds, each with a *real* projected score delta; and (2) the
**Application Command Center** — per-school requirement checklists, deadlines, tasks, a document vault, and a
progress dashboard, auto-generated from the student's Phase 2 list. Behind flags, no auto-promote.

## Hard constraints (Cowork will block on these)

1. **Projected deltas are computed, not guessed.** Each lever's "+X" must be the difference between the Phase 1
   engine's score on the *modified* profile and on the *current* profile — i.e. re-run the actual scorer
   (`buildChancePayload`/admit-intelligence path) on the counterfactual (e.g. GPA +0.2, one more rigor course,
   test submitted) and report `score(after) − score(before)`. **No hardcoded "+2%", no `Math.random`, no
   invented numbers.** Identical profile ⇒ identical plan.
2. **Levers never contradict the engine.** The "before" value in a lever must equal the current
   `/api/admit-intelligence` score/tier; a lever that claims "moves Reach → Target" must actually cross the
   shared `ADMIT_TIER_THRESHOLDS` boundary when recomputed. Use the one tier table; do not re-define tiers.
3. **Only model-visible, controllable levers — honest about the rest.** Reuse the existing lever taxonomy
   (`lib/fit/levers.ts` / `lib/levers.ts`): controllable+visible (test score, application round, remaining
   rigor) get deltas; fixed (GPA-to-date) and model-unseen (essays, recs, demonstrated interest) are shown as
   context, **not** given fabricated deltas. Never promise an odds change for a factor the model can't see.
4. **Deadlines trace to data — never fabricated.** Per-school/per-system deadlines (Common App / Coalition /
   OUAC / direct / Quebec CEGEP) must come from a sourced dataset with lineage (a seed/table carrying
   `source_url`), or be omitted with an honest "deadline not loaded" — never a guessed date. Canada uses the
   Phase 0 `admission_system`. No `Date.now()`-relative invented dates.
5. **Checklists/tasks are complete and correct from real requirements.** Auto-generate per-school requirement
   checklists from Phase 0 `program_requirements` + the Phase 2 list: every required item maps to exactly one
   task (no missing, no fabricated extras). Deterministic from the same inputs.
6. **User application data is owner-isolated by RLS.** New per-user tables (`tasks`, `documents`,
   `requirement_status`) and the document vault (Supabase Storage) must enforce **owner-only** access in RLS
   (`subject_id = auth.uid()`), not just app code — user A can never read/write user B's tasks or files.
   Writes go through service-role routes; no anon writes; uploads validated; no public bucket.
7. **No money.** No cost/net-price/ROI/scholarship fields, levers, or copy anywhere in this phase.

## Build

### 1. Migration — `supabase/migrations/<ts>_v2_phase5_*.sql`
- Tables `tasks`, `documents`, `requirement_status` (per-user; `subject_id`, FKs to schools/program rows where
  relevant, status enums, timestamps). Owner-based RLS on all three. A deadlines source (table or seed-backed
  column) carrying `source_url`. `gen_random_uuid()` (core PG13+ — don't add the pgcrypto extension). Reversible
  (paired down script, audited pattern); applies/reverses cleanly on a scratch DB; no destructive drift.

### 2. `lib/climb/` (elevate `lib/levers`)
- Pure/deterministic. Given a profile + a target school (or the list), enumerate candidate moves, recompute the
  Phase 1 score for each counterfactual, rank by real delta, and emit `{ lever, before, after, delta,
  crosses_tier }`. Document the method in `MODEL_CARD.md`. "Plan v2" history = deterministic snapshots keyed to
  the profile version (no time-based nondeterminism in the numbers).

### 3. `lib/command-center/`
- Pure assembler: from the Phase 2 list + `program_requirements`, produce per-school requirement checklists,
  tasks, and (sourced) deadlines. Progress = derived from `requirement_status`.

### 4. APIs
- `/api/climb` and `/api/command-center` (+ status routes), behind `ADMIRA_CLIMB_ENABLED` and
  `ADMIRA_COMMAND_CENTER_ENABLED` (both default `"false"`). Zod-validated; service-role for writes; owner
  checks; rate-limited where they recompute scores. No PII in logs/responses beyond the owner's own data.

### 5. Frontend
- Roadmap timeline with projected-impact badges (the real deltas); a calm Kanban/timeline command center;
  document vault UI. Bold headline first; no hedging copy; no money UI.

### 6. Tests (required for sign-off)
- **Delta-recompute test:** each lever's `delta` equals `score(after) − score(before)` from the actual engine.
- **Tier-crossing test:** a "moves X → Y" claim genuinely crosses the shared threshold on recompute.
- **No-fabricated-lever test:** model-unseen factors get no delta.
- **Determinism test:** same profile ⇒ identical plan and ordering.
- **Task-completeness test:** every required item in `program_requirements` yields exactly one task; none invented.
- **Deadline-lineage test:** every shown deadline has a `source_url`; missing → honest empty, never guessed.
- **RLS ownership test:** extend `verify:rls` — user A cannot read/write user B's `tasks`/`documents`/
  `requirement_status`; anon cannot access; document-vault storage policy is owner-only.
- Playwright e2e for the roadmap + command center flows (flag on), incl. the empty/“deadline not loaded” state.

## Acceptance criteria (Cowork checks exactly)
- [ ] Every projected delta = real engine recompute of the counterfactual; no hardcoded/random numbers.
- [ ] Lever before-values and tier-crossing claims match `/api/admit-intelligence` and the shared tier table.
- [ ] Model-unseen/fixed factors carry no fabricated delta.
- [ ] Deadlines trace to a `source_url`; missing shown honestly; no invented dates.
- [ ] Checklists/tasks complete & correct from `program_requirements` + the Phase 2 list (1:1, no extras).
- [ ] `tasks`/`documents`/`requirement_status` + storage are owner-isolated in RLS; `verify:rls` extended & green.
- [ ] Deterministic: same profile ⇒ identical plan; no RNG/time in numbers.
- [ ] Migration applies + reverses cleanly on a scratch DB; no destructive drift; no pgcrypto extension.
- [ ] Behind `ADMIRA_CLIMB_ENABLED` / `ADMIRA_COMMAND_CENTER_ENABLED` (default false); no auto-promote.
- [ ] No money/cost/ROI/scholarship anywhere.
- [ ] `npm run lint`, `test`, `test:e2e`, `build`, `verify:rls` green; `MODEL_CARD.md` documents the delta method.

## Out of scope (do NOT do)
- Money / net price / merit / ROI (Phase 4, deferred to last).
- Students-Like-You changes; cohort→score feedback (still off).
- Essay/Compass/Copilot (Phases 6–7).

## Deliver to the auditor
A committed branch/PR + commit range, and a note on: how deltas are recomputed (which counterfactuals), where
deadline data comes from (+ lineage), and the RLS/storage ownership model for the vault.

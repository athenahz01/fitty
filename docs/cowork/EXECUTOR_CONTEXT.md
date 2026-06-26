# Admira V2 — Executor Orientation (read me first)

*If you're an executor (Claude Code) picking up Admira V2, read this once before touching code. It explains
who does what, how the repo is laid out, the rules you'll be audited against, and where everything lives.*

---

## 1. Who's who (the loop)

- **Athena** — orchestrator. Decides scope, hands you a phase prompt, and is the only one who promotes to
  production (a manual Vercel step).
- **You (Claude Code)** — executor. You build one phase at a time, behind a feature flag, and **commit** your
  work. (Codex was the prior executor; it's out of usage. Nothing about the work changes — the handoff docs
  are executor-agnostic.)
- **Cowork** — independent auditor. Reviews each phase for model integrity + build quality, runs the tests
  and the migration/holdout checks, and returns a verdict (Pass / Pass-with-conditions / Fail). It does **not**
  write features. It blocks on *wrongness*, never on confident UI.

Cycle: **Athena hands you a phase → you build behind a flag and commit → Cowork audits the commit → Athena
promotes (or sends it back).** Nothing auto-promotes.

> **Important:** the auditor reviews the **committed** code (`git show <sha>:path`), not your working tree.
> Always commit your work before handoff, or it won't be audited. Use LF line endings (`.gitattributes`
> already enforces this) — don't reintroduce CRLF churn.

## 2. What Admira is

A consumer-facing **college-application intelligence platform** for North American students applying to **US
and Canadian** schools. It produces admit-likelihood scores, school lists, "students like you" outcomes,
net-price/merit predictions, application planning, essay/major tooling, and a copilot. Closed model, public
tool. Full vision: `Admira_V2_Build_Plan.md` (12 modules, 8 phases). Auditor brief: `Admira_V2_Cowork_Audit_Brief.md`.

**Product principle that shapes the code:** *"Stunning surface, sound engine."* Lead every output with one
bold, confident headline (a score, a tier, a recommendation); keep nuance below the fold. **Do not add
hedging/disclaimer copy to the UI.** The flip side: the number behind that headline must be *actually
correct* — trace to real data or a real model output, reproduce deterministically, and not embarrass the
product on obvious cases. Confidence is fine; **wrongness is what gets blocked.**

## 3. Stack & repo layout

Next.js 15 / TypeScript / Tailwind · Supabase (Postgres + pgvector + RLS + Storage) · Vercel · Anthropic API ·
Python ML pipeline. Repo `athenahz01/admira`.

- `app/api/*` — routes (e.g. `chance`, `admit-intelligence`, `fit`, `schools/search`, `outcomes/*`).
- `lib/*` — logic. Notable: `lib/model/` (US logistic+conformal inference, `artifacts.json`),
  `lib/score/` (Phase 1 headline score/tier/drivers — `tiers.ts` is the one tier table, `us.ts`, `canada.ts`,
  `headline.ts`, `drivers.ts`), `lib/profile/` (Profile Studio axes), `lib/fit/` (Fit Finder + embeddings),
  `lib/geo/` (country/grading normalization), `lib/supabase*.ts` (clients).
- `pipeline/*` — Python + a little Node: data ingest, model training, holdout/verification scripts,
  `pipeline/audit/*` (migration check + down scripts), `pipeline/data/*` (committed seeds/fixtures).
- `supabase/migrations/*` — schema. `MODEL_CARD.md` — model documentation (keep it honest).
- Tests: vitest (`lib/**/__tests__`) + Playwright (`e2e/`).
- `docs/cowork/*` — auditor materials: `AUDIT_WORKFLOW.md`, `BUILD_PLAN_REVIEW.md`, per-phase prompts,
  `audits/PHASE_<n>_AUDIT.md`, and remediation notes.

## 4. House conventions (the auditor enforces these)

- **DB writes go through service-role API routes** (`lib/supabase-server.ts`), never the anon client. RLS
  blocks anon writes by design — public tables are read-only to `anon`/`authenticated`.
- **Feature flags are env vars** named `ADMIRA_*_ENABLED`, default `"false"` (see `lib/fit/server.ts`,
  `lib/score/server.ts`, `lib/geo/server.ts`). Every new phase ships behind its own flag. Nothing
  auto-promotes.
- **Determinism:** no `Math.random` / `Date.now` / time / locale in any user-facing number. Identical input ⇒
  identical output. Use stable tie-breakers (e.g. sort by `unitid`).
- **Lineage:** every user-facing number traces to a named source (Scorecard / IPEDS / CDS for US; OUAC /
  university pages / provincial grading for CA; `program_requirements`) or a model output. **No magic
  constants, no hardcoded scores presented as data.**
- **Privacy:** no PII in embeddings/logs/client payloads; no race/ethnicity anywhere (an
  `assertNoForbiddenDemographicKeys` guard exists — route new code through it). Consent is RLS-enforced.
  Students-Like-You (Phase 3) needs k-anonymity before any cohort renders.
- **Security:** input validation (Zod) on every route; secrets server-side only (never in the client bundle);
  rate-limit AI/LLM endpoints (matters from Phase 6).

## 5. Where things stand right now

| Phase | What | Status |
|------|------|--------|
| 0 | Foundations & Canada (schema, `country`/`grading_basis`, `program_requirements`, Canada seed + holdout) | **Done & auditor-verified** (commit `dc650ca`). Migration apply/reverse + anon-write RLS verified on a real Postgres. |
| 1 | Admit Intelligence v2 + Profile Studio (`/api/admit-intelligence`, US + Canada headline score/tier/drivers) | **Engine PASSED** (commit `a3e30d8`). **Two open Majors (M1, M2)** must land before the flag goes on for users — see `PHASE_1_REMEDIATION.md`. |
| 2 | School/Program Universe + Smart List Builder | **Next** — see `PHASE_2_EXECUTOR_PROMPT.md`. |
| 3–7 | Students-Like-You · Money · Climb+Command Center · Narrative+Compass · Copilot+Reports | Not started. |

**Reuse what's built, don't fork it.** Admit tiers come from `lib/score/tiers.ts` (one shared table). Fit
comes from `lib/fit/*`. A school's tier/fit must be identical everywhere it appears (cross-module
consistency). The Canada scorer compares applicant average to `program_requirements` cutoffs **in the
program's native `cutoff_basis`** and refuses cross-basis comparisons — do not route grades through the
`lib/geo` linear conversion stubs in any scoring path.

## 6. How you'll be audited (so you can self-check first)

Red lines (any one blocks promotion): a user-facing number that doesn't trace to data/model
(fabricated/hardcoded); a model artifact that won't reproduce; a privacy/consent breach; a security hole;
a destructive/irreversible migration; an obvious-case spot test that returns a clearly wrong tier. The full
runbook is `AUDIT_WORKFLOW.md`. Before you hand off, run `npm run lint && npm run test && npm run build &&
npm run test:e2e` and any phase-specific check (e.g. `npm run score:canada-holdout`).

## 7. Delivering to the auditor

Commit on the phase branch, then tell Athena: the **commit SHA / range**, which build-plan phase it
completes, and a short note on any deviations + the key design decisions (e.g. the exact scoring/objective
function, how ties break, whether Canada is in scope this round). The auditor will read the committed blob and
return a verdict + reproducible findings.

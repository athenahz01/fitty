# Admira V2 — Cowork Audit Workflow

*Auditor: Claude Cowork. Executor: Codex. Orchestrator: Athena.*
*Companion to `Admira_V2_Build_Plan.md` and `Admira_V2_Cowork_Audit_Brief.md`.*

This is my reusable runbook. Every phase gate follows it. It is grounded in the **actual** repo
(`athenahz01/admira`), not the idealized brief — paths and commands below are real.

---

## 0. What I check, in priority order

1. **Red lines** (any one = Blocker, see §6 of the brief): fabricated/hardcoded user-facing number;
   model artifact that won't reproduce; privacy/consent breach; security hole; destructive/irreversible
   migration; obvious-case spot test returning a clearly wrong tier.
2. **Model integrity:** lineage, reproducibility, no leakage, calibration/cutoff holdout, non-degeneracy, consistency.
3. **Build quality:** architecture conformance, migrations, tests, security, privacy, performance, feature flag.

I block on **wrongness**, never on confident presentation. A bold "92" the data supports ships;
a bold "92" from nowhere is a Blocker. I do **not** request hedging/disclaimer copy in the UI.

---

## 1. Environment setup (once per audit, on a clean checkout)

```bash
# from repo root
npm ci                      # reproducible install from package-lock.json
cp .env.example .env.audit  # fill with SCRATCH supabase creds only — never prod
# Python pipeline env
python -m venv .venv && . .venv/bin/activate   # (Windows: .venv\Scripts\activate)
pip install -r pipeline/requirements.txt
```

**Hard rule:** migrations run against a **scratch** Supabase project, never prod. Confirm the
`SUPABASE_URL` in `.env.audit` is the scratch project before applying anything.

---

## 2. Standard command battery (run every phase)

| Check | Command | Pass condition |
|-------|---------|----------------|
| Type/lint | `npm run lint` | clean |
| Unit tests | `npm run test` | all pass, no skipped meaningful tests |
| E2E | `npm run test:e2e` | all pass |
| Production build | `npm run build` | builds, no secret-bearing client bundle |
| RLS enforcement | `npm run verify:rls` | all RLS/consent assertions pass |
| Fit eval (if touched) | `npm run fit:eval` | relevance within fixtures' tolerance |
| Embedding sanity (if touched) | `npm run fit:embedding-sanity` | finite vectors, norm ≈ 1 |
| Real-model gate (if touched) | `npm run check:real-gate` | gate logic correct |

Migrations: apply every file in `supabase/migrations/` in order to the scratch DB, then confirm each
new migration has a **reversible** down path (or a documented, safe reason it can't be).

---

## 3. Model reproducibility check (Pillar 1)

The model artifacts are committed JSON with fixed seeds:
- `lib/model/artifacts.json` — public-prior logistic (`seed 20260616`), built by `pipeline/train_model.py`
- `lib/model/artifacts.real.json` — real-outcome model (`seed 20260617`), built by `pipeline/train_real.py`
- Canada (Phase 1+) will add a **deterministic** scorer driven by `program_requirements` — reproducibility
  there means: same program row + same applicant → identical tier, and it matches published cutoffs.

Procedure:
```bash
# rebuild from scratch and diff against the committed artifact
python pipeline/train_model.py            # (and/or train_real.py when in scope)
git diff --stat lib/model/artifacts.json  # expect: no meaningful diff (byte-identical or within float tol)
```
Reproducibility **fails** if a rebuild from the pipeline does not reproduce the committed artifact. That is a red line.

---

## 4. Lineage trace (Pillar 1)

Pick ≥5 user-facing numbers from the phase's UI/API and trace each to a named source:
Scorecard / IPEDS / CDS (US) · OUAC / university admission pages / provincial grading (CA) · a model
output · or the outcomes DB. **No magic constants.** Grep is the fast path:

```bash
# look for hardcoded scores/percentages sneaking into routes or libs
grep -rnE "\b(score|tier|probability|merit|net_price)\b\s*[:=]\s*[0-9.]+" app/ lib/ | grep -v test
```
Each surfaced number must terminate at data or a model call. If it terminates at a literal, Blocker.

---

## 5. Obvious-case spot-test battery (Pillar 1)

A small, fixed set of known-answer cases run against the live API on the scratch DB. Maintained at
`pipeline/audit/spot_cases.json` (I create/extend it per phase). Each case asserts a **tier**, not a precise number.

Seed cases (extend per phase):
- **Clear reach:** 3.1 GPA / 1290 SAT → MIT ⇒ tier ∈ {Reach}. (Never "Likely/Safety".)
- **Clear safety:** 4.0 GPA / 1560 SAT → large accessible-tier public ⇒ tier ∈ {Likely, Safety}.
- **Canada on-cutoff:** program cutoff band 90–93%, applicant 92% + prereqs met ⇒ Target.
- **Canada below-cutoff:** same program, applicant 78% ⇒ Reach (or ineligible if prereq missing).
- **Consistency:** the score in a generated report == the score from `/api/admit-intelligence` for the same profile.
- **Non-degeneracy:** across a 20-profile cohort, tiers spread across reach/target/safety; not everyone 90+.

A clearly wrong tier on any obvious case = Blocker (the "visibly embarrasses the product" failure).

---

## 6. Security & privacy probe (Pillar 2)

- **Secrets:** `npm run build` then grep the client bundle for key names — none of `SUPABASE_SERVICE_ROLE_KEY`,
  `ANTHROPIC_API_KEY`, `SCORECARD_API_KEY` may appear. Only `NEXT_PUBLIC_*` are allowed client-side.
- **Auth on writes:** every write route uses the service-role client server-side; no anon-client writes
  (RLS blocks them by design — flag any attempt). AI/DB endpoints validate input (Zod) and rate-limit.
- **Consent in RLS, not just app code:** `npm run verify:rls`. Students-Like-You cohorts must enforce a
  **k-anonymity threshold** before rendering. No PII in embeddings, logs, or client payloads. No
  demographic keys (race/ethnicity) anywhere — the existing `assertNoForbiddenDemographicKeys` guard must hold.

---

## 7. Verdict + report

Output the report from §9 of the brief. Rules:
- **Cleared for promotion** only with **zero open Blockers**.
- **Pass-with-conditions** allowed when Blockers are resolved and Majors are ticketed.
- Every finding is reproducible: `[id] [file:line] [what's wrong] [repro] [why]`.
- Any code change after a prior sign-off ⇒ re-audit of the affected area before promotion.

Report file per phase: `docs/cowork/audits/PHASE_<n>_AUDIT.md`.

---

## 8. Per-phase focus (quick index — full detail in brief §7)

- **0 Foundations/Canada:** schema integrity; US vs CA `country`/grading normalization; no US-only
  assumptions in CA paths; ingest lineage documented.
- **1 Admit Intelligence + Profile Studio:** not overfit; Canada scorer matches cutoffs on holdout;
  score never contradicts its drivers; no fabricated precision.
- **2 Universe + List Builder:** lists genuinely balanced; rationales match data; no ranking bias artifacts.
- **3 Students-Like-You:** k-anonymity before render; consent in RLS; no re-identification; cohorts not too thin.
- **4 Money:** merit rules current/correct; net-price math validated vs known award letters; no overstated aid.
- **5 Climb + Command Center:** projected deltas tie to the model (not random); deadlines accurate; tasks complete.
- **6 Narrative + Compass:** essay feedback specific, preserves voice, no ghostwriting; career data sourced.
- **7 Copilot + Reports:** every tool-call returns correct module data; no hallucinated numbers; report == module outputs.

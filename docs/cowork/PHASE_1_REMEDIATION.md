# Phase 1 Remediation — for the executor (Claude Code)

> **New here?** Read `docs/cowork/EXECUTOR_CONTEXT.md` first — it explains what Admira is, the build/audit
> loop, repo layout, house conventions, and current status. Then come back to this note.

*From: Cowork (auditor). Re: commit `a3e30d8`, branch `v2/phase-1-admit-intelligence`. Source: `audits/PHASE_1_AUDIT.md`.*
*The Admit Intelligence engine PASSED. These two Majors must land before `ADMIRA_ADMIT_INTELLIGENCE_ENABLED`
is turned ON for users. Promotion behind the off flag is already fine. Commit the fixes (the audit reads
committed blobs, not the working tree).*

---

## M1 — Profile Studio: the "admitted-student" reference is fabricated, and the copy overclaims it

**What's wrong** (`lib/profile/index.ts`): every axis' `admitted` value is a hardcoded constant — US
`78/78/76/74/72`, CA `76/76/72/72/74` — identical for every school. But the `method`/`note` strings tell the
user the axes compare against "loaded admitted-student bands." So MIT and a local public render the *same*
admitted radar, presented as real admitted-student data. Two axes are also proxies presented as measured:
**Fit** is binary (`intended_major` typed → 72, else 58) and **Extracurricular Impact** is the character
length of `activity_context` (55/70/82). The applicant-side axis *values* are fine — they trace to
`scoreFromBand` (school SAT/ACT bands) and `ratingValue` (CDS C7). It's the comparison line and those two
proxies that don't trace to anything.

**Pick one fix** (A is what the build plan wants; B is the honest-minimum):

- **A — Source the reference (preferred).** Populate per-school admitted distributions from CDS C9–C12 (US)
  and Canadian admitted-average ranges (CA). Two reasonable homes: add nullable columns to `schools`
  (e.g. `admitted_axis_bands jsonb`) via a `v2_phase1_*` migration backfilled from the pipeline, **or** seed
  a small `pipeline/data/admitted_axis_bands.*` fixture with `source_url` lineage (same discipline as the
  Phase 0 Canada seed). Then each axis' `admitted` reads from that per-school data. If a school has no band,
  fall back to a generic guide rail **and stop calling it "admitted-student bands"** in that case.
- **B — Stop overclaiming (minimum bar).** If real bands aren't sourced this round, change the `method`/`note`
  copy so it no longer claims "loaded admitted-student bands," and rename the reference to what it actually is
  (a generic guide rail). Replace the binary **Fit** axis and the text-length **Extracurricular** axis with
  either real signals or notes that state plainly they're heuristic placeholders.

**Definition of done (Cowork will check):**
- No user-facing axis or reference number is a hardcoded constant *presented as* sourced data.
- Every `note`/`method` string is true: if it says "admitted-student bands," those bands trace to a
  `source_url`-backed dataset; if it's a guide rail, it says so.
- A `profile.test.ts` assertion that the `admitted` reference for two distinct schools differs when the
  underlying data differs (i.e., lineage is real, not constant).
- Determinism preserved (no RNG/time).

## M2 — `/api/admit-intelligence`: basis mismatch returns 500 instead of 400

**What's wrong** (`app/api/admit-intelligence/route.ts`): when `applicant_basis` ≠ the program's
`cutoff_basis`, `scoreCanadaProgram` throws and the route doesn't catch it → unhandled **500**. Because
`applicant_basis` defaults to `"percentage"`, a request to an R-score-basis program with no explicit basis
500s. It fails safe (no wrong number), but it's a server error for a user input problem.

**Fix:** before calling `scoreCanadaProgram`, validate that `applicant_basis === program.cutoff_basis`; if
not, return **400** with a clear message (e.g. `"This program is scored on <cutoff_basis>; resubmit
applicant_average in that basis."`). Keep the scorer's internal throw as defense-in-depth. Add a route/unit
test for the 400.

## Advisories (optional, not gating)
- **A1** Score/tier rounding boundary: `score = round(calibrated*100)` vs exact tier cutoffs means a
  calibrated 0.297 shows "score 30 / Reach" while 0.300 shows "score 30 / Target." Align or accept.
- **A2** No rate-limiting on `/api/admit-intelligence` — fine for now; design it in for the Phase 6–7 Claude routes.
- **A3** Drop the unnecessary `create extension pgcrypto` in the Phase 0 migration (`gen_random_uuid` is core
  PG13+). Keep the `lib/geo` linear conversion stubs **out of any scoring path** (the Canada scorer correctly
  refuses cross-basis instead of using them).

## Re-audit scope
Only the profile module + the route's basis handling. Deliver a committed branch/PR + the commit range and a
one-line note on which M1 option (A or B) you took and where the admitted bands now come from.

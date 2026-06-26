ADMIRA V2 — PHASE 0 RE-AUDIT (commit dc650ca)
Scope: committed tree, branch `v2/phase-0-foundations-canada`, commit `dc650ca "Add Phase 0 Canada foundations"`
Claimed deliverable: Phase 0 — Foundations & Canada expansion (schema + data + flag gating)
Date: 2026-06-26 (re-audit)
Auditor: Cowork

VERDICT: **PASS-WITH-CONDITIONS** — all Blockers from the first audit are resolved in the commit;
remaining items are environment-gated verifications that must be run green in Athena's staging/scratch infra.

ROOT-CAUSE CORRECTION (important, and fair to Codex): the first-audit "corruption" was NOT a defect in
Codex's work. The audit sandbox mounts the live folder, and that mount serves truncated/CRLF-mangled copies
of the *modified working-tree* files while git's object store stays intact. Evidence: the committed blobs in
dc650ca are all whole, yet `git diff --ignore-all-space` against the same mounted working tree still shows
phantom multi-line *deletions* (e.g. types.ts −72, verify_rls.ts −53). So the truncation is a read-side mount
artifact. Lesson for this audit loop: **audit the committed blobs (`git show <sha>:path`) or a clean
`git archive` export, never the mounted working tree.** All re-audit checks below were run against a clean
export of dc650ca.

RE-AUDIT RESULTS vs first-audit findings:
  [B1] package.json truncated …… RESOLVED — `git show HEAD:package.json` parses; all scripts present
       (incl. new `ingest:canada`, `verify:phase0:migration`).
  [B2] six source/test files truncated …… RESOLVED — every committed file ends well-formed; and
       `tsc --noEmit -p tsconfig.json` over the whole project (includes `**/*.ts`) exits **0, clean**.
       This is independent proof there is no truncation/syntax error anywhere.
  [B3] verify_rls.ts truncated, main() never called …… RESOLVED — committed file calls `main().catch(...)`
       at line 553; harness whole, and the new anon-write-rejection checks (schools + program_requirements)
       are intact.
  [M1] no .gitattributes / CRLF churn …… RESOLVED — `.gitattributes` added (`* text=auto eol=lf` + per-ext
       `eol=lf` + image `binary`); committed model artifacts have 0 CRLF and are **byte-identical to master**
       (no spurious model change, reproducibility check unpolluted).
  [m1] Quebec alias …… RESOLVED — `["QUBEC","QC"]` alias added (handles accent-stripped token).
  [M3] geo `toComparisonSpace` naive linear conversions …… CARRIED FORWARD to Phase 1 (correctly out of
       scope for Phase 0; still not consumed by any user-facing path). Must become a real grade concordance
       before the Phase 1 Canada scorer compares applicant averages to cutoff bands.
  [M2] deliver as committed PR …… DONE (dc650ca). Branch not pushed to origin (Athena's choice) — push when
       ready so Vercel builds a preview and CI runs.

INDEPENDENTLY VERIFIED IN AUDIT ENV (clean export of dc650ca):
  - package.json parses; all previously-truncated files whole.
  - `tsc --noEmit` clean (exit 0) across the full project.
  - `.gitattributes` correct; artifacts LF and identical to master content.
  - Migration + `v2_phase0_migration_check.sql` reviewed: asserts US backfill, rejects invalid
    country/cutoff_basis, enforces program_requirements FK, confirms RLS enabled + public-read policy.
  - (Phase-0 design re-confirmed from first audit: safe migration ordering, source_url lineage, deterministic
    CA ingest setting country='CA', flag gating with US-model-never-runs-on-CA guard.)

AUDITOR-EXECUTED VERIFICATIONS (ran a userland Postgres 15 + bundled pgvector via `pgserver` in the audit
sandbox — no root needed — to clear the DB-gated conditions myself):

  ✅ COND 3 CLEARED — migration apply + check + reverse. Reproduced `verify:phase0:migration` exactly:
     applied all five prior migrations + a US harness row + the Phase 0 migration + `v2_phase0_migration_check.sql`
     + the down script + post-down assertions, in one transaction. **psql exit 0** — every check-harness
     assertion held (US rows backfilled to US/gpa_4_0/province_state; invalid `country` rejected;
     `program_requirements` FK enforced; invalid `cutoff_basis` rejected; RLS enabled; public-read policy
     present) and the down path fully reverted (program_requirements dropped, `match_fit_schools` signature
     restored, Phase 0 columns/constraints/indexes gone). Reversibility confirmed on a real DB.
     Shims used (native on Supabase, irrelevant to Phase 0 logic): created roles anon/authenticated/service_role,
     a minimal `auth` schema + `auth.uid()`, and neutralized `create extension pgcrypto` (see Advisory A1).

  ✅ COND 2 CORE CLEARED — anon cannot write the public tables. After granting `anon` full INSERT/UPDATE/DELETE
     table privileges (so RLS, not a missing grant, is the only thing that can block), anon INSERT into both
     `schools` and `program_requirements` was rejected: `42501 new row violates row-level security policy`.
     This is the defense-in-depth claim from Codex's new verify_rls checks, confirmed at the database level.
     (The full `verify:rls` harness also covers consent-trigger + per-user owner isolation via Supabase
     GoTrue/auth, which needs a real Supabase project — see remaining condition 1.)

REMAINING CONDITION FOR PROMOTION (low risk; Codex reports green locally):
  1. On Linux CI: `npm ci` then `npm run test` + `npm run test:e2e` + `npm run build`, and the full
     `ADMIRA_RLS_TARGET=staging npm run verify:rls` against a staging Supabase (for the auth/consent-trigger
     and owner-isolation portions). My sandbox's mounted node_modules lacks the Linux `rolldown` native binding
     so vitest/build can't run here; `tsc --noEmit` passed clean across the whole project as a proxy, and the
     DB-level RLS write-block is independently confirmed above. This is a reproduce-in-CI gate, not an
     unverified risk.

NEW ADVISORY (this re-audit):
  [A1] `supabase/migrations/202606260001_…sql` declares `create extension if not exists pgcrypto;` but the
       only function it uses, `gen_random_uuid()`, is core Postgres 13+. The pgcrypto dependency is
       unnecessary (harmless on Supabase, which preinstalls it). Consider dropping the line. Backlog.

SIGN-OFF: Cowork — **Pass-with-conditions.** All first-audit Blockers cleared; migration apply/reverse and
anon-write RLS independently verified by the auditor on a real Postgres. Promote once the remaining CI/staging
reproduction (condition 1) is green; ticket M3 (Phase-1 grade concordance), M2 (push branch), A1 (drop pgcrypto).
Original first-audit detail retained below for the record.

────────────────────────────────────────────────────────────────────────
ORIGINAL FIRST-AUDIT REPORT (pre-dc650ca; superseded by the re-audit above)
────────────────────────────────────────────────────────────────────────

ADMIRA V2 — PHASE 0 AUDIT
Scope: working tree on branch `v2/phase-0-foundations-canada` (uncommitted; branch HEAD == master fb2d6b7)
Claimed deliverable: Phase 0 — Foundations & Canada expansion (schema + data + flag gating)
Date: 2026-06-26
Auditor: Cowork

VERDICT: **FAIL** (promotion blocked)

The Phase 0 *design* is largely sound — migration, Canada ingest/lineage, geo helpers, and the API
flag-gating all review well on their merits. But the tree **as delivered to the audit environment does
not build**: `package.json` is unparseable and at least six source/test files are truncated mid-line.
Codex's reported "lint/test/build/e2e passed" cannot be reproduced here. Root cause looks like a
save/transfer corruption (truncation + CRLF rewrite) of the *modified* files, not a logic error — but the
zero-Blocker gate is not met, so it cannot promote until re-delivered clean.

---

FINDINGS

Blockers (must fix + re-audit):

- [B1] `package.json:37` — file is truncated mid-string, ending `"@types/react-dom": "`. Invalid JSON
  (`npm` errors `EJSONPARSE`, "Unterminated string … position 1326"). **No npm script can run** —
  lint/test/build/e2e are all impossible on this tree. Repro: `npm run lint` → EJSONPARSE.
  Why blocker: nothing that can't install/build can be promoted.

- [B2] Multiple source/test files truncated mid-line in the working tree (HEAD/master versions are all
  intact and end cleanly, so this is corruption of the uncommitted edits, not master):
    - `lib/fit/matching.ts` — ends `…programFit : nul` (should be 406 lines ending `}`)
    - `app/api/fit/route.ts` — ends `weak_program_match: balanced.weak_program_match,` (missing return/fn close)
    - `lib/types.ts` — 242 lines; HEAD has 246 ending `};` (DB types truncated)
    - `lib/fit/__tests__/fit.test.ts` — ends `const lever = leve`
    - `lib/school-fixtures.ts` — ends `.filter((school)`
    - `.env.example` — ends `NEXT_PUBLIC_A` (analytics-debug line cut)
  Because `tsconfig.json` includes `**/*.ts`, these break typecheck/build regardless of package.json.
  Repro: `tail -c 5 lib/fit/matching.ts` vs `git show HEAD:lib/fit/matching.ts | tail -1`.

- [B3] `pipeline/verify_rls.ts` — truncated at line 505 with a stray `/` (unterminated regex). The tail
  (cleanup summary, exit-code logic, and the `main().catch(...)` invocation) is gone, so **`main()` is
  defined but never called** — the RLS/privacy harness cannot run. This is the harness that proves
  consent gating + anon-write blocking, so it must be whole. Note: the *new* anon-write-rejection checks
  Codex added (schools + program_requirements) are good and should be kept once the file is restored.
  Repro: `grep -n "main()" pipeline/verify_rls.ts` shows only the definition (line 197), no call.

Majors (fix before next phase):

- [M1] No `.gitattributes` enforcing LF. A line-ending pass rewrote committed model artifacts entirely to
  CRLF — `lib/model/artifacts.json`, `artifacts.real.json`, `test_vectors*.json`,
  `pipeline/data/schools_public_cache.csv` — **zero content change** (`git diff --ignore-all-space` is
  empty) but full-file diffs. If committed this pollutes the reproducibility check (workflow §3 diffs
  `artifacts.json`) and bloats every review. Add `.gitattributes` (`* text=auto eol=lf`) and renormalize.

- [M2] Work is uncommitted; the branch points at master's commit. Per the brief, a phase audit needs the
  branch/PR + commit range. Re-deliver as a committed PR so the auditor evaluates identical bytes.

- [M3] `lib/geo/index.ts` `toComparisonSpace`/`fromComparisonSpace` use **naive linear** conversions
  (GPA `(v/4)*100`; CEGEP R-score linear over 15–40). These are placeholders. **Not consumed by any
  user-facing path yet** (verified: no imports outside `lib/geo`), so it's not a Phase 0 Blocker — but the
  Phase 1 Canada scorer will compare applicant averages to cutoff bands, and a US-GPA-as-percentage map
  this crude will produce wrong tiers. Replace with a real concordance before Phase 1 scoring goes live.

Minors (backlog):

- [m1] `lib/geo/index.ts` `CA_PROVINCES` has a duplicate `["QUEBEC","QC"]` entry (harmless). `token()`
  strips accents, so `"Québec"` → `"QUBEC"` won't match — add an alias if accented input is expected.
- [m2] The reverse migration lives in `pipeline/audit/…_down.sql` (outside `supabase/migrations/`) and
  drops `program_requirements` (data loss). Acceptable and documented in the up-migration header; note it
  in the runbook so a rollback is intentional.

---

MODEL INTEGRITY
  Reproducibility: n/a for Phase 0 (no model changes intended). Model artifacts unchanged in content
    (CRLF-only diff). No leakage surface introduced.
  Lineage: **pass (on merits)** — seed = 14 CA schools / 22 program rows; every `program_requirements`
    row carries an `https` `source_url` (enforced again by a CHECK constraint and by the ingest validator);
    holdout fixture = 19 programs, all cited; ingest is deterministic (committed fixture, fixed
    `ingested_at`, `sort_keys`) and sets `country='CA'` explicitly (no US-default mislabel). `SOURCES.md` present.
  Calibration/cutoff holdout: deferred to Phase 1 (fixture now staged — good).
  Obvious-case spot tests: n/a Phase 0 (no scoring). Verified the US model **cannot** run on CA rows
    (`/api/chance` returns 404 when flag off, 501 when on; `buildChancePayload` only runs for non-CA).

BUILD QUALITY
  Architecture conformance: **pass (on merits)** — columns + `program_requirements` table + flag match the
    Phase 0 spec; new files in expected locations.
  Migrations: **pass (on merits, static review)** — safe add→backfill→constrain ordering; idempotent
    constraint guards; RLS enabled with public-read-only (no write policy → anon/auth writes blocked);
    `match_fit_schools` extended with `p_include_canada` (default false → Canada excluded by default).
    **Not yet executed against a real Postgres** — `verify:phase0:migration` was blocked locally (no psql/DB);
    apply+reverse on a scratch DB is a promotion condition.
  Tests: **FAIL** — cannot run (B1); plus `fit.test.ts` itself is truncated (B2).
  Security: **pass (partial)** — no inline secrets in the diff; `.env` not tracked; new flag defaults false.
    Full "no secret in client bundle" check deferred (build doesn't run).
  Privacy/consent: **FAIL to verify** — RLS harness is broken (B3). Design intent (public-read-only RLS +
    new anon-write-rejection checks) is correct, but unverifiable until the harness runs.
  Performance: n/a Phase 0; new indexes on `country`, `province_state`, `program_requirements.unitid/system` present.
  Feature flag present: **yes** — `ADMIRA_CANADA_ENABLED` (default false); `/api/chance`, `/api/fit`,
    `/api/schools/search` all gate on it; nothing auto-promotes.

---

CONDITIONS FOR PROMOTION:
1. Re-deliver `v2/phase-0-foundations-canada` as a **clean, committed PR** from Codex's environment.
   Verify integrity: `package.json` parses; every changed `.ts/.tsx` ends well-formed (no mid-line truncation).
2. Add `.gitattributes` (`* text=auto eol=lf`, JSON/CSV `eol=lf`) and renormalize so model artifacts show
   no spurious CRLF diff.
3. Restore `pipeline/verify_rls.ts` (incl. the `main()` invocation) and run `npm run verify:rls` against
   staging (`ADMIRA_RLS_TARGET=staging`) — must pass, including the new anon-write-rejection checks.
4. Run `verify:phase0:migration` (apply + reverse) against a scratch Supabase/Postgres with `psql` — confirm
   the US backfill and clean reversibility on a real DB.
5. Re-run `lint` + `test` + `build` + `test:e2e` on the committed tree and attach logs.

On a clean re-delivery the design pieces already reviewed should clear quickly; re-audit will focus on the
corrupted files, the RLS harness run, and the live migration apply/reverse.

SIGN-OFF: Cowork — **blocked**, pending the conditions above.

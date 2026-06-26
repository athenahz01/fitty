# Codex Handoff — Phase 0: Foundations & Canada Expansion

*Hand this to Codex verbatim. It is scoped so Cowork can audit it against a clear acceptance bar.*
*Repo: `athenahz01/admira`. Branch off `master` as `v2/phase-0-foundations-canada`.*

---

## Mission

Extend the existing **US-only** data layer to cover **Canada** and prepare the schema for the V2 modules.
This phase is **data + schema only** — no model changes, no new user-facing scores. Ship behind a flag.
Output must reproduce, migrate reversibly, and keep all existing US paths working unchanged.

## Context you must respect (existing repo)

- `schools` table (migration `202606150001_create_schools.sql`) currently has: `unitid (PK), name, state,
  setting, size, admit_rate, gpa_avg, test_policy, ed_admit_rate, rd_admit_rate, selectivity_tier`, plus
  Fit-Finder columns added later (`program_areas, programs, size_band, region, net_price_avg, sticker_cost,
  median_earnings_10yr, completion_rate, control, embedding vector(384)`). **There is no `country`,
  `province_state`, `grading_basis`, `admission_system`, `broad_based_admission`, or `merit_auto` column,
  and no `program_requirements` table.** You are adding these.
- DB writes go through **service-role API routes** (`lib/supabase-server.ts`), never the anon client. RLS
  blocks anon writes by design.
- Feature flags are env vars named `ADMIRA_*_ENABLED`, default `"false"` (see `lib/fit/server.ts` pattern).
- Pipeline is Python + a little Node (`pipeline/`); tests are vitest (`lib/**/__tests__`) + Playwright (`e2e/`).

## Build (do exactly this)

### 1. Schema migration — `supabase/migrations/<ts>_v2_phase0_canada_foundations.sql`
- Extend `schools`:
  - `country text not null default 'US' check (country in ('US','CA'))` — **backfill all existing rows to `'US'`**.
  - `province_state text` (use for US state OR CA province; keep existing `state` populated for US, mirror into `province_state`).
  - `admission_system text check (admission_system in ('common_app','coalition','ouac','direct','quebec_cegep'))`.
  - `grading_basis text not null default 'gpa_4_0' check (grading_basis in ('gpa_4_0','percentage','cegep_r_score'))`.
  - `broad_based_admission boolean not null default false`.
  - `merit_auto jsonb` (nullable; auto-merit tiers, structured).
- New table `program_requirements`:
  - `id uuid pk default gen_random_uuid()`, `unitid integer references schools(unitid)`,
    `program_name text not null`, `system text`, `cutoff_avg_low numeric`, `cutoff_avg_high numeric`,
    `cutoff_basis text check (... in ('gpa_4_0','percentage','cegep_r_score'))`,
    `prerequisites jsonb`, `test_policy text`, `supplemental_app boolean default false`,
    `broad_based_admission boolean default false`, `source_url text not null`, `ingested_at timestamptz default now()`.
  - Index on `unitid`. Add RLS: this is public reference data → readable, but **no anon writes** (writes via service role only), consistent with `schools`.
- **Reversibility:** provide a tested down-path (a paired `down` SQL section or documented reverse). Migration must apply cleanly to a scratch DB and reverse cleanly. No destructive changes to existing columns/data.

### 2. Canada ingest — `pipeline/ingest/` (new)
- Add scripts (Python, matching existing pipeline style) to ingest Canadian institution + program data:
  OUAC program list, university admission-average ranges, entrance-scholarship thresholds, prerequisite
  courses, broad-based-admission flags (UBC/Waterloo/McGill AIF/PP). Normalize into `schools` (with
  `country='CA'`, correct `grading_basis`) and `program_requirements`.
- **Every ingested row must carry a `source_url`.** No uncited data. Write a short `pipeline/ingest/SOURCES.md`
  documenting each source + retrieval date (lineage requirement).
- Add a deterministic seed/fixture so the ingest reproduces (no live-scrape nondeterminism in what gets committed).
  Commit a small curated CA seed (Ontario-first is acceptable for Phase 0; see open decision) under
  `pipeline/data/` with fixed contents.

### 3. Holdout fixture for the auditor — `pipeline/audit/canada_cutoffs_holdout.json`
- A versioned list of known CA programs → published admission-average band + `source_url`. This is what
  Cowork uses in Phase 1 to verify the Canada scorer matches published cutoffs. Seed it now (≥15 programs).

### 4. Normalization helpers — `lib/geo/` (new, small)
- Pure functions: `normalizeCountry`, `normalizeGradingBasis`, `provinceOrState`, and a converter scaffold
  for `percentage`/`cegep_r_score` ↔ comparison space. **No US-only assumptions in shared code paths** — any
  function that branches on country must handle CA explicitly, not fall through to US defaults.

### 5. Flag
- Gate any new surfaced read path behind `ADMIRA_CANADA_ENABLED` (default `"false"`), same pattern as
  `ADMIRA_FIT_FINDER_ENABLED`. (The migration itself is not flag-gated; anything that reads/serves CA data is.)

### 6. Tests
- vitest unit tests for `lib/geo/` (US and CA cases, grading conversions, no-fallthrough).
- A migration test / script asserting: existing US rows still valid, `country` backfilled to `'US'`,
  new constraints hold, `program_requirements` FK integrity.
- Keep the full existing suite green (`npm run test`, `npm run test:e2e`, `npm run lint`, `npm run build`).

## Acceptance criteria (Cowork will check these exactly)

- [ ] Migration applies to a clean scratch DB **and reverses cleanly**; no destructive drift; all existing US rows intact and `country='US'`.
- [ ] `country`/`grading_basis`/`province_state` normalized correctly for both US and CA; no US-only assumption leaks into a CA path (covered by `lib/geo/` tests).
- [ ] Every CA row in `schools`/`program_requirements` traces to a `source_url`; `pipeline/ingest/SOURCES.md` present and accurate.
- [ ] Ingest is reproducible from committed seed/fixtures (no nondeterministic live-scrape in the committed dataset).
- [ ] `canada_cutoffs_holdout.json` present with ≥15 cited programs.
- [ ] New read paths gated behind `ADMIRA_CANADA_ENABLED`; nothing auto-promotes.
- [ ] `npm run lint`, `npm run test`, `npm run test:e2e`, `npm run build`, `npm run verify:rls` all pass.
- [ ] No secrets in the client bundle; no anon-client writes introduced.

## Out of scope for Phase 0 (do NOT do)
- No changes to `/api/chance`, the model artifacts, or scoring logic (that's Phase 1).
- No new user-facing scores, tiers, or UI beyond what's needed to prove the data loads.
- No essay/copilot/money logic.

## Deliver to the auditor
Branch + PR, the commit range, this phase's name ("V2 Phase 0 — Foundations/Canada"), and a one-paragraph
note on what data sources you used and any deviations from this spec.

# Executor Handoff — Phase 2: School & Program Universe + Smart List Builder

> **New here?** Read `docs/cowork/EXECUTOR_CONTEXT.md` first — what Admira is, the build/audit loop, repo
> layout, house conventions, what's already built (Phases 0–1), and how you'll be audited. Then come back here.

*Hand to the executor (Claude Code; Codex is out). Executor-agnostic. Builds on Phase 1 (`a3e30d8`).*
*Branch: `v2/phase-2-universe-list` off `v2/phase-1-admit-intelligence`. Commit your work (the audit reads
committed blobs). Do M1/M2 from `PHASE_1_REMEDIATION.md` first if not already landed — Phase 2 leans on them.*

---

## Mission

Two things: (1) rich, beautiful **program/school pages** that pull everything into one view, and (2) a
one-tap **Smart List Builder** that returns an auto-balanced reach/target/safety list with a one-line, honest
rationale per school. Reuse the existing engines — do not fork or contradict them. Behind a flag, no auto-promote.

## Reuse, don't reinvent (existing repo)

- Admit tier/score: `lib/score/*` (`tierFromProbability`, the shared `ADMIT_TIER_THRESHOLDS`, US + Canada
  scorers). The list's tier for a school **must equal** what `/api/admit-intelligence` returns for the same
  profile — one source of truth.
- Fit: `lib/fit/*` + `match_fit_schools` (pgvector). Reuse for "similar programs" and the fit dimension.
- Cost: only what already exists on `schools` — `net_price_avg`, `sticker_cost`, `median_earnings_10yr`.
  **The real Money module (merit/net-price prediction) is Phase 4 — do NOT fabricate merit or predicted aid
  now.** Use `net_price_avg` where present; where absent, say so — never invent a number.
- Program data: `program_requirements` (Phase 0). Flags/gating: house `ADMIRA_*_ENABLED` env pattern.

## Hard constraints (Cowork will block on these)

1. **Genuine balance, deterministically.** The generated list must spread across tiers (e.g. ~3 reach / 4
   target / 3 safety), not collapse to all-reach or all-safety. Tiers come from the Phase 1 engine, not a new
   calculation. Same profile + same preferences ⇒ **identical list** (no `Math.random`/`Date.now`; if you
   need tie-breaking, sort by a stable key like unitid).
2. **Every rationale traces to real computed values.** Each school's one-line rationale must be generated
   from that school's actual admit tier + fit score + net cost — not a templated claim that isn't checked
   against the data. "Strong fit, target odds, under budget" is only allowed if fit/tier/cost actually say so.
   No fabricated precision.
3. **No bias/commission artifacts in ranking.** The objective function (probability spread × fit × net cost)
   must be explicit, documented, and the *only* thing driving order. No hidden per-school boost, no sponsored
   weighting, no hardcoded "preferred" schools. A reviewer must be able to read the scoring function and
   reproduce the order by hand.
4. **Cross-module consistency.** A school's tier on its program page == its tier in a generated list == the
   `/api/admit-intelligence` tier for that profile. A school's fit number is the same everywhere. If they can
   disagree, that's a blocker.
5. **Canada handling is honest.** CA admit scoring needs `applicant_average` in the program's `cutoff_basis`
   (Phase 1 rule). Either (a) collect those inputs and include CA schools in the list, or (b) scope the list
   builder to US for now and clearly gate CA behind `ADMIRA_CANADA_ENABLED` — but do **not** silently score CA
   schools with US assumptions or cross-basis conversions.

## Build

### 1. Program/School Universe pages
- A rich page per school/program pulling: admit stats, `program_requirements`, cost (`net_price_avg`/
  `sticker_cost`), outcomes (`median_earnings_10yr`, `completion_rate`), and "similar programs" via the Fit
  Finder embeddings. Every figure shows its source/lineage internally (traceable on audit). No deadlines yet
  (that's Phase 5 Command Center) — omit rather than fake.
- Premium UI, bold headline first, detail below the fold. No hedging copy.

### 2. `lib/list-builder/`
- Pure, deterministic module: input = profile + preferences (location, size, major, budget, ambition);
  output = a balanced list with, per school: tier (from Phase 1), fit score (from Fit Finder), net cost,
  and a one-line rationale assembled from those three. Document the objective function in a header comment
  and in `MODEL_CARD.md`.
- Include a "schools you're overlooking" surprise row — must be fit/data-driven (e.g. high fit + under
  budget + tier diversity), not random.

### 3. `/api/list/generate`
- POST profile + preferences → `{ list: [{ unitid, name, tier, fit, net_cost, rationale }], objective: {...} }`.
- Behind `ADMIRA_LIST_BUILDER_ENABLED` (default `"false"`). Input validated (Zod). Server-side read client,
  no writes, no secrets. CA gated by `ADMIRA_CANADA_ENABLED` per constraint 5.

### 4. Frontend
- Drag-to-adjust list with live re-balance; the "overlooking" surprise row. Reuses the score/fit components.

### 5. Tests (required for sign-off)
- **Balance test:** a cohort of varied profiles → each list spreads across tiers (assert not all-one-tier;
  assert reach/target/safety counts within the intended shape).
- **Rationale-matches-data test:** for sampled rows, the rationale's claims (fit/tier/cost) equal the
  computed values.
- **Consistency test:** list tier == `/api/admit-intelligence` tier for the same profile/school.
- **Determinism test:** same input twice ⇒ identical ordered list.
- **No-bias test:** reordering the input school set or relabeling ids doesn't change the ranking logic
  (order depends only on the objective function).
- Playwright e2e: generate a list, re-balance, render a program page (flag on), for a US profile (and CA if
  included).

## Acceptance criteria (Cowork checks exactly)
- [ ] Lists spread across tiers (not degenerate); shape ≈ reach/target/safety as configured.
- [ ] Every rationale's claims equal the row's real computed fit/tier/cost; no fabricated numbers.
- [ ] Objective function is explicit, documented, and the sole determinant of order; no per-school boosts.
- [ ] Tier/fit/cost agree across program page, list, and `/api/admit-intelligence` (cross-module consistency).
- [ ] Deterministic: identical input ⇒ identical list; no RNG/time.
- [ ] No merit/predicted-aid invented (Phase 4); missing cost shown as missing, never fabricated.
- [ ] CA either fully scored with native-basis inputs or cleanly scoped out behind `ADMIRA_CANADA_ENABLED`.
- [ ] Behind `ADMIRA_LIST_BUILDER_ENABLED` (default false); no auto-promote; input validated; no writes/secrets.
- [ ] `npm run lint`, `test`, `test:e2e`, `build` green; `MODEL_CARD.md` documents the objective function.

## Out of scope (do NOT do)
- Real merit/net-price prediction or ROI modeling (Phase 4).
- Deadlines/tasks/document vault (Phase 5).
- Students-Like-You cohort signal (Phase 3) — and do NOT feed outcome data into ranking yet (leakage).

## Deliver to the auditor
A committed branch/PR, the commit range, and a note on: the exact objective function (weights + how net cost
enters), how ties are broken deterministically, and whether CA schools are included or scoped out this round.

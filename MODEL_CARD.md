# Admira V2 Model Card

## Model

`public_prior_logistic_v1` is Admira's Phase 2 synthetic public-data prior model. It is trained offline in `pipeline/train_model.py` and exported as plain JSON to `lib/model/artifacts.json` for later TypeScript inference.

## Purpose

The model provides an honest prior range for school-specific admissions chances using only public, school-level data. It exists to prove the artifact contract, calibration flow, and uncertainty behavior before Admira has consented applicant-level admit/deny outcomes.

## Synthetic Cohort Assumptions

For each school, the pipeline generates a fixed-seed synthetic applicant cohort around that school's public SAT/ACT middle-50% bands. Applicant strength is expressed as standardized SAT and ACT gaps from the school midpoint. GPA gap is included only when school average GPA exists; otherwise it is neutral and explicitly marked missing.

Synthetic admission probabilities are generated with a monotonic link: probability rises as standardized academic position improves, and an early-application bump is added only when public ED/RD rates show `ed_admit_rate > rd_admit_rate`. A per-school intercept is solved so the mean generated probability matches the school's published admit rate. Synthetic admit/deny labels are then sampled from those generated probabilities.

## Features

The feature set is deliberately small and public-data-only:

- standardized SAT gap and missing indicator
- standardized ACT gap and missing indicator
- GPA gap and missing indicator
- ED/EA indicator
- log undergraduate enrollment
- selectivity tier one-hot
- test-policy one-hot
- Scorecard setting one-hot

Race and ethnicity are explicitly excluded. They are not generated, loaded, stored, or modeled.

## Calibration And Intervals

The pipeline trains an L2-penalized logistic regression on the synthetic training split, fits isotonic calibration on a held-out calibration split, and uses MAPIE on a separate held-out conformal split to estimate probability-interval residuals. Exported intervals are tier-conditioned and widened with public-prior uncertainty floors so low-admit schools remain visibly uncertain.

Every downstream prediction must be presented as a range. The point probability is only a marker inside the interval, never the answer by itself.

## Phase 1 Admit Intelligence

Admit Intelligence v2 is feature-flagged by `ADMIRA_ADMIT_INTELLIGENCE_ENABLED`. When the flag is off, `/api/chance` remains the active public range experience.

For U.S. schools, the headline score is a deterministic presentation transform of the calibrated probability already produced by the public-prior model:

`score = round(clamp(calibrated_probability, 0, 1) * 100)`

No new random draw, resampling step, or independent point estimate is introduced. Tier labels share one threshold table:

- `Reach`: `0 <= p < 0.30`
- `Target`: `0.30 <= p < 0.55`
- `Likely`: `0.55 <= p < 0.80`
- `Safety`: `0.80 <= p <= 1.00`

U.S. drivers are grouped from the same engineered feature contributions used by the scorer. The driver layer must remain directionally consistent with the headline tier: high tiers require positive support, reach tiers require a negative driver, and targets require non-neutral evidence. Drivers are explanation of the same score, not a second model.

For Canadian programs, Phase 1 uses `program_requirements` rows directly. Applicant averages are compared only in the row's native `cutoff_basis`; Admira refuses cross-basis comparisons rather than using placeholder GPA/percentage/R-score conversions. The deterministic Canada scorer anchors below, within, and above the loaded cutoff band, then tempers the result for missing prerequisites and broad-based or supplemental review flags. `npm run score:canada-holdout` checks cutoff behavior against the seeded Canadian holdout rows.

Profile Studio axes are deterministic support views, not separate admit probabilities. The five axes are Academics, Rigor, Test, Extracurricular Impact, and Fit. The `confidence` field is a texture for UI display based on available public-data width or Canada row completeness; it is not calibrated applicant-level certainty.

## Phase 2 School Universe & Smart List Builder

Phase 2 adds two surfaces, each behind its own off-by-default flag, and neither
introduces a new admit model — both reuse the Phase 1 engine and the Fit Finder
embeddings so a school's tier and fit are identical everywhere they appear.

### Smart List Builder (`ADMIRA_LIST_BUILDER_ENABLED`, default false)

`lib/list-builder` is a pure, deterministic module. Given a profile, preferences,
and a candidate pool it returns an auto-balanced reach/target/safety list. The
**objective function is the only thing that drives order**:

`desirability(school) = W_FIT * (fit / 100) + W_COST * affordability`

with `W_FIT = 0.7`, `W_COST = 0.3` (exported constants, identical for every
school). `fit` is the Fit Finder hybrid program-fit (keyword + embedding), and
`affordability` is `1` when no budget is given, `1` when net price ≤ budget,
`max(0, 1 - over/budget)` when net price exceeds budget, and a neutral `0.6`
when a budget is given but the school publishes no net price. There is **no
per-school boost, no sponsored weight, and no hardcoded "preferred" school**. Two
schools with equal desirability are ordered by `unitid` ascending — a stable
tie-break, never a quality signal — so the order is reproducible by hand.

Tiers are **not recomputed**: each US school's tier is
`tierFromProbability(calibrated)` on the same public-prior chance the
`/api/admit-intelligence` route returns, so the list tier equals the
admit-intelligence tier for the same profile/school. The four engine tiers fold
into three buckets (Reach→reach, Target→target, Likely|Safety→safety); the list
keeps the top schools per bucket (default 3 reach / 4 target / 3 safety) so it
spreads across tiers instead of collapsing. A "schools you're overlooking" row
surfaces affordable, genuinely-fitting schools that missed the cut, biased toward
under-filled tiers — fit/data-driven, never random.

Net cost is `net_price_avg` only; when it is absent the list says so and never
substitutes sticker price or invents a number. **Merit/predicted aid is Phase 4
and is deliberately absent.** Outcome data (earnings, completion) is never fed
into ranking (leakage). Each one-line rationale is generated from that row's real
computed tier + fit + net cost, so every claim is checkable against the data.

Canada is **out of scope for the list this round**: CA admit scoring needs a
per-program native-basis average that the list flow does not collect, so CA rows
are excluded and counted, gated behind `ADMIRA_CANADA_ENABLED` for a later
increment. The engine never scores CA schools with US assumptions.

### School Universe (`ADMIRA_UNIVERSE_ENABLED`, default false)

`lib/universe` assembles one school's row + its `program_requirements` + its Fit
Finder embedding neighbors into a single view. Every figure carries an internal
`source` lineage label (Scorecard / IPEDS / CDS / `program_requirements`), and a
missing figure is reported as missing with an honest note rather than estimated.

### Phase 1 remediation folded in

Profile Studio (`lib/profile`) no longer presents hardcoded constants as
admitted-student bands. Each axis' reference is now derived per-school from that
school's published signals (selectivity tier, middle-50 bands, CDS C7 ratings, or
the Canadian program cutoff) and carries a `reference_basis` of `derived` or
`guide_rail`; where no signal exists it falls back to a labeled generic guide
rail and the note says so. The previously over-claimed Fit and Extracurricular
axes are now labeled plainly as heuristics. The `/api/admit-intelligence` route
returns a 400 (not a 500) when the applicant basis does not match a Canadian
program's native `cutoff_basis`.

## Phase 3 Students-Like-You

Students-Like-You is feature-flagged by `ADMIRA_STUDENTS_LIKE_YOU_ENABLED`
(default false). It is a display engine over consented outcome records, not an
input to Admit Intelligence. The separate `ADMIRA_SLY_FEEDBACK_ENABLED` flag is
also default false; Phase 3 intentionally does not wire cohort outcomes back into
any scoring path.

The privacy threshold is **k = 5** distinct consented subjects. This is enforced
inside SQL by `public.match_similar_cohort` in
`supabase/migrations/202606270001_v2_phase3_students_like_you.sql` with
`having count(distinct subject_id) >= 5` after similarity matching and school
grouping. The API and UI also suppress sub-k rows, but those are secondary
guards; the database function is the first gate.

Consent is enforced at storage time by the existing
`require_active_modeling_consent` trigger and at cohort time by the SQL join to
`consent_records` where `purpose = 'real_outcome_modeling'` and `revoked_at is
null`. Revoking consent removes that record from future cohorts immediately; if
that drops a cohort below five records, the SQL function returns no row.

Profile matching uses the existing Xenova MiniLM embedding model, but the
embedded document contains only controlled or banded fields: cycle year, GPA
band, test band, course-rigor bucket, activity bucket, application round,
demonstrated-interest bucket, and whether a major was supplied. Activity text,
raw intended-major text, subject IDs, names, emails, and forbidden demographics
are never embedded or returned.

Returned cohort data is aggregate only: per-school admit/deny/waitlist/defer
counts and rates, broad attribute cards, and "what admits had in common" strips.
Attribute cards and admit insights are themselves suppressed unless that bucket
has at least five distinct subjects. Similar-student cards are aggregate bucket
cards, not individual rows.

The launch seed at `pipeline/data/students_like_you_seed.json` is deterministic
and tagged `provenance: "curated_public"` with a `source_url` on every row. These
are aggregate-derived archetypes documented in `pipeline/data/SOURCES.md`, not
real users. Real outcome-capture records default to `provenance: "consented_user"`
and participate only while active consent remains unrevoked.

No self-leakage: the SQL function accepts `p_exclude_subject_id` and
`p_exclude_cycle_year`; the API passes the signed-in subject when a bearer token
is present. The current phase excludes the user's own same-cycle rows from
display cohorts and leaves scoring feedback off for a later, separately audited
phase.

## Phase 5 Climb Roadmap + Command Center

Climb Roadmap is feature-flagged by `ADMIRA_CLIMB_ENABLED` (default false). Each
projected move is computed by rerunning the same Phase 1 Admit Intelligence US
scorer on a counterfactual profile, then reporting `score(after) -
score(before)`. The current emitted counterfactuals are model-visible and
controllable only: a modest higher submitted test score and regular-to-early
application round. The before score/tier and after score/tier both come from
`buildUsAdmitIntelligence`; tier-crossing claims use the shared
`ADMIT_TIER_THRESHOLDS` table through the scorer. Fixed factors and model-unseen
factors such as GPA-to-date, essays, recommendations, demonstrated interest, and
remaining course rigor are shown as context only and carry no fabricated delta.

Roadmap snapshots are deterministic. The snapshot key is a stable hash of the
profile, ordered school ids, and model version. No timestamp or random value is
used in the score, ordering, or displayed impact numbers.

Application Command Center is feature-flagged by
`ADMIRA_COMMAND_CENTER_ENABLED` (default false). Requirement tasks are assembled
from the selected school list plus `program_requirements`. Each loaded
prerequisite, academic cutoff band, required-testing policy, supplemental
application flag, and broad-based review flag maps to exactly one task. Missing
requirement data yields no invented checklist item.

Deadlines are loaded only from `application_deadlines` rows that carry
`source_url`. If no sourced row exists for a school/program/system, the UI shows
`Deadline not loaded` and no due date is invented. The command center does not
display cost, net-price, ROI, merit, or scholarship fields.

Owner data lives in `tasks`, `requirement_status`, and `documents`, with RLS
policies requiring `subject_id = auth.uid()` for owner reads and writes. The
document vault uses the private `admira-document-vault` Supabase Storage bucket;
storage policies require the first path segment to match `auth.uid()`. API
writes use service-role routes after validating the signed-in bearer token.

## Phase 6 Narrative & Essay Studio + Major/Career Compass

Phase 6 adds the first Anthropic-backed surface and a major/career explorer, each
behind its own off-by-default flag (`ADMIRA_NARRATIVE_ENABLED`,
`ADMIRA_COMPASS_ENABLED`). Two contracts are first-class here.

### No-ghostwriting, voice-preserving feedback

`lib/narrative` gives feedback, diagnostics, and targeted suggestions about the
student's OWN text. It never writes, drafts, or rewrites an essay, and there is
no "write my essay" path and no AI-detection-evasion / humanizer feature. The
guarantees are enforced in three places: (1) `detectGhostwritingRequest` refuses
write/rewrite inputs and redirects to feedback BEFORE any model call; (2) the
system prompt (read verbatim by the audit in `lib/narrative/index.ts`) forbids
drafting/rewriting, requires quoting short snippets of the student's own
sentences, and preserves their voice; (3) `looksGhostwritten` stops the stream if
the model output starts to read like a drafted essay. The prompt also bans vague
platitudes ("be more specific", "show don't tell", etc.) unless they quote the
exact words and name the concrete change, and asks the model to lead with the one
or two highest-impact changes for that school — sharper feedback on the student's
own text, never a rewrite of it.

### Grounding (traceable, not free-floating)

Feedback is grounded in (a) the target school's stated CDS C7 priorities and (b)
retrieved patterns from a curated essay-craft corpus
(`pipeline/data/essay_pattern_corpus.json` — qualitative writing principles, no
real-student PII, no numbers, each row `source_url`-tagged and `curated_public`).
Retrieval reuses the Xenova embedding stack. The streamed response carries the
deterministic `grounding` frame first — the C7 priorities and the exemplar
references (id, theme, source_url) it was grounded in — so the audit can trace
what every piece of feedback rests on.

### No hallucinated numbers — the LLM never emits figures

The Anthropic call produces qualitative text only; the system prompt forbids any
numbers. Every figure shown in Narrative or Compass (admit tier/score, major-level
earnings, career wages) comes from the deterministic data/model layer and is
injected around the call — in Narrative via the `grounding` frame, in Compass via
sourced rows and the Phase 1 scorer. LLM prose may be non-deterministic; numbers
never are.

### Anthropic endpoint safety

`ANTHROPIC_API_KEY` is read server-side only (never shipped to the client
bundle). `/api/narrative` and `/api/compass` are Zod-validated and rate-limited
(in-memory per-requester buckets); `/api/narrative` streams (SSE) and never logs
raw essay text. Essays are ephemeral — there is no essay storage table this phase
(so no owner-RLS surface to add); the demographic-key guard
(`assertNoForbiddenDemographicKeys`) runs on the request.

### Compass: real admit odds, sourced earnings, deferred ROI

`lib/compass` is a deterministic assembler. It connects majors → careers → sourced
earnings and ranks major fit by embedding similarity (keyword fallback). Each
major's admit odds come from the **Phase 1 scorer** (`buildUsAdmitIntelligence`),
so the tier/score shown equals `/api/admit-intelligence` for the same
profile/school. Career/earnings rows are passed through from `compass_majors` /
`compass_careers` reference tables (public-read RLS, `source_url` required, loaded
by `npm run ingest:compass` from operator-supplied College Scorecard + O*NET/BLS
data); a missing figure stays null and is labeled "pending dataset", never
fabricated. Each major now carries a deterministic, **number-free `reason`** that
ties it to the student's stated interests and names a real career it opens, so the
list reads as specific recommendations rather than a generic catalog; the reason
is assembled from the same sourced rows and invents no figure. **ROI / net price
is a clearly-labeled deferred stub** (`ROI_STUB`, no number) — it arrives with the
Money module (Phase 4). No essay or cohort data is fed back into the admit score
(leakage stays off).

## Phase 7 Admira Copilot + Reports

Phase 7 is feature-flagged by `ADMIRA_COPILOT_ENABLED` and
`ADMIRA_REPORTS_ENABLED` (both default false). It adds an orchestration layer, not
a new admissions model.

`lib/copilot` registers tool wrappers around the existing modules:
`buildUsAdmitIntelligence`, `generateList`, `studentsLikeYouResponse`,
`buildClimbRoadmap`, `assembleCommandCenter`, and `generateCompass`. Tool output
is the module output; the agent layer does not reimplement scoring, list balance,
k-anonymity, roadmap deltas, command-center task assembly, or compass major fit.
The only write receipt is command-center requirement status, which is reversible
(`todo`, `in_progress`, `done`) and persists through the same owner-scoped
service-role pattern as the Phase 5 command-center routes.

Every number in the Copilot answer is rendered from tool receipts. Optional
Anthropic prose is qualitative only: the server prompt forbids numerals and the
stream is sanitized before it reaches the UI. To make that prose specific rather
than boilerplate, the model is now fed the student's qualitative profile
(intended major, round, interests) and a **number-free digest of the actual tool
findings** (`summarizeResultsForModel` — school names, tiers, lever and module
names, never a figure) and is instructed to answer the question, cite the module
each fact came from, and end with a concrete next step. The grounding is richer;
the guards are unchanged — `sanitizeModelText` still scrubs any numeral and
`assertChatNumbersCameFromTools` still rejects any figure absent from a tool
result. Money planning remains out of scope
for this phase; Copilot does not register a money tool, and report rendering
omits list-builder net-cost fields plus Compass ROI/earnings fields. Report
figures are copied from the tool receipts that produced them.

Report shares are stored in `report_shares` behind RLS (`subject_id =
auth.uid()`). Share creation requires a signed-in owner bearer token. Public
lookup uses an unguessable token whose SHA-256 hash is stored in the database;
the returned payload is sanitized and contains no subject/profile/consent ids,
token hashes, storage paths, or raw similar-student rows.

## Intended Use

This model is for decision support and product-contract validation. It can say, in a public-data-prior sense, where a student sits relative to a school's published bands and how much uncertainty remains. It must not be used as an oracle or as a claim that Admira can predict real individual outcomes from public data alone.

## Known Limitations

Because this phase has no applicant-level real outcomes, the model cannot learn essay quality, recommendation strength, institutional priorities, major-level capacity, class-shaping needs, counselor context, or yield-management behavior. Those blind spots are especially large at sub-20% admit-rate schools, where public statistics leave a hard ceiling on individual prediction accuracy.

Required honesty statement: because the synthetic labels are generated from the same public structure the model then fits, the prior model's coefficients re-encode public anchors (admit rate + middle-50% position) rather than independent learned evidence. Its only legitimate claims are the anchoring relationship and the width/calibration of its uncertainty, not incremental predictive signal. This is why the architecture's value here is the stable artifact contract, swapped for real-data-trained coefficients in Phase 6.

## Phase 6 Plan

When Whetstone has consented profile-to-outcome data, Admira should retrain behind the same artifact/API contract using real applicant outcomes. The Phase 2 public prior remains useful as a transparent fallback and as a benchmark for whether proprietary data actually narrows uncertainty without overpromising.

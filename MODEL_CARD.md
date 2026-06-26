# Admira Phase 2 Model Card

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

## Intended Use

This model is for decision support and product-contract validation. It can say, in a public-data-prior sense, where a student sits relative to a school's published bands and how much uncertainty remains. It must not be used as an oracle or as a claim that Admira can predict real individual outcomes from public data alone.

## Known Limitations

Because this phase has no applicant-level real outcomes, the model cannot learn essay quality, recommendation strength, institutional priorities, major-level capacity, class-shaping needs, counselor context, or yield-management behavior. Those blind spots are especially large at sub-20% admit-rate schools, where public statistics leave a hard ceiling on individual prediction accuracy.

Required honesty statement: because the synthetic labels are generated from the same public structure the model then fits, the prior model's coefficients re-encode public anchors (admit rate + middle-50% position) rather than independent learned evidence. Its only legitimate claims are the anchoring relationship and the width/calibration of its uncertainty, not incremental predictive signal. This is why the architecture's value here is the stable artifact contract, swapped for real-data-trained coefficients in Phase 6.

## Phase 6 Plan

When Whetstone has consented profile-to-outcome data, Admira should retrain behind the same artifact/API contract using real applicant outcomes. The Phase 2 public prior remains useful as a transparent fallback and as a benchmark for whether proprietary data actually narrows uncertainty without overpromising.

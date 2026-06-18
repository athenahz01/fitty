# Fitty

Fitty is an honest college admit-probability engine. It renders public-data admissions priors as ranges first, cites available CDS C7 context, and makes the uncertainty visible instead of presenting a single number as a verdict.

## Prerequisites

- Node.js 20+
- Python 3.11+
- A Supabase project with database access
- Supabase CLI installed and logged in
- A College Scorecard API key from `api.data.gov`

## 1. Install app dependencies

```powershell
npm install
```

## 2. Install pipeline dependencies

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r pipeline/requirements.txt
```

## 3. Configure environment

```powershell
Copy-Item .env.example .env
```

Fill the five required values in `.env`; leave the optional Phase 6 flags off until you intentionally enable capture or the real model path:

```dotenv
SCORECARD_API_KEY=your_scorecard_api_key
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
FITTY_OUTCOME_CAPTURE_ENABLED=false
FITTY_CAPTURE_ALLOW_UNSIGNED_SUBJECT=false
FITTY_REAL_MODEL_ENABLED=false
NEXT_PUBLIC_FITTY_ANALYTICS_DEBUG=false
```

Do not commit `.env`; it is ignored by git.

## 4. Run the Supabase migration

Link the checkout to your Supabase project, then push the checked-in migration:

```powershell
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

The migration creates `public.schools` from `supabase/migrations/202606150001_create_schools.sql`.

## 5. Ingest College Scorecard schools

Run the public-data ingest from the project root:

```powershell
python pipeline/ingest_scorecard.py
```

The script reads `pipeline/data/seed_unitids.json`, fetches public Scorecard fields, derives `selectivity_tier`, upserts by `unitid`, and prints:

- total seeded, returned, and upserted rows
- counts per selectivity tier
- expected-tier mismatches
- schools missing admit rate
- schools missing SAT or ACT middle-50 fields

The seed list contains 150 schools across all four tiers.

## 6. Seed CDS C7 rubric data

After the Scorecard ingest succeeds, run:

```powershell
python pipeline/seed_cds_c7.py
```

The script reads `pipeline/data/cds_c7_seed.json`, validates every C7 rating enum, merges the seeded factors into matching `schools` rows, updates `test_policy`, and prints any seed school not found.

## 7. Start the dev server

```powershell
npm run dev
```

Open `http://localhost:3000`. The app searches the populated Supabase `schools` table, adds schools to a list, and renders the admissions prior interval returned by `/api/chance`.

## Verification

```powershell
npm run lint
npx tsc --noEmit
npm run test
npm run test:e2e
npm run build
```

Expected Phase 1 coverage after a successful ingest:

- 150 Scorecard seed entries
- 33 `elite`
- 39 `highly_selective`
- 39 `selective`
- 39 `accessible`
- 25 CDS C7 seed entries

No applicant personal data is collected in Phase 1, and no race or ethnicity field is present in the schema, seed data, or ingestion scripts.

## Fit Finder Phase 1 - School Attributes and Embeddings

Fit Finder Phase 1 enriches the existing `schools` table with public school attributes and pinned embeddings. It does not add `/api/fit`, applicant-facing UI, or runtime query embedding.

The shared embedding constants live in `lib/fit/embedding-model.ts`:

- `EMBEDDING_MODEL_ID`: `Xenova/all-MiniLM-L6-v2`
- `EMBEDDING_DIM`: `384`

The Python pipeline reads those constants from the TypeScript file so stored school vectors and future query vectors use the same model id and dimension.

Apply the new migration after the original schools migration:

```powershell
supabase db push
```

Then run the enrichment pass:

```powershell
npm run fit:enrich
```

This fetches public College Scorecard fields for the checked-in seed schools, derives `program_areas`, `size_band`, `region`, `net_price_avg`, `sticker_cost`, `median_earnings_10yr`, and `completion_rate`, then upserts those nullable fields into `schools`.

Build and store the school embeddings:

```powershell
npm run fit:embed
```

The embedding script builds deterministic school documents from public attributes only, embeds them with `Xenova/all-MiniLM-L6-v2`, and upserts `schools.embedding` as a `vector(384)` value.

Run the sanity report after embeddings are stored:

```powershell
npm run fit:embedding-sanity
```

The report is written to `pipeline/reports/embedding_sanity.md` and compares known school pairs by cosine similarity. It is a smoke check for populated vectors, not an admissions quality claim.

## Fit Finder Phase 2 - Matching API

Fit Finder Phase 2 adds `POST /api/fit`. It embeds a student's fit preferences with the same pinned model used for Phase 1 school documents, queries pgvector for nearby schools, applies hard filters, and attaches Fitty's existing honest chancing band to each result.

The route does not return a single numeric fit score. Similarity is used only for internal ranking. The response explains fit through structured matched attributes and notable school data.

Example request:

```json
{
  "interests": "hands-on engineering, computing, applied research",
  "intended_major": "computer science",
  "preferred_size": "large",
  "preferred_setting": "city",
  "preferred_region": "Northeast",
  "cost_ceiling": 30000,
  "learning_style_notes": "project-based classes and collaborative labs",
  "sat_score": 1540,
  "act_score": 35,
  "gpa": 3.95,
  "application_round": "regular"
}
```

Example response shape:

```json
{
  "query": {
    "embedded": true,
    "dim": 384,
    "model": "Xenova/all-MiniLM-L6-v2"
  },
  "results": [
    {
      "school": {
        "unitid": 166683,
        "name": "Massachusetts Institute of Technology",
        "region": "Northeast",
        "size_band": "large",
        "setting": "city",
        "selectivity_tier": "elite",
        "net_price_avg": 22000,
        "sticker_cost": 82000,
        "program_areas": ["Computer and information sciences", "Engineering"]
      },
      "match_reasons": {
        "matched": ["region", "size", "setting", "cost within ceiling", "programs: computer and information sciences"],
        "notable": ["completion 0.94", "median earnings 10yr 95000"],
        "cost_status": "within_ceiling"
      },
      "probability": {
        "point": 0.04,
        "calibrated": 0.03,
        "low": 0,
        "high": 0.49,
        "width": 0.49,
        "coverage": 0.8
      },
      "band": {
        "label": "reach",
        "wide_band": true
      }
    }
  ],
  "balance": {
    "reach": 1,
    "target": 0,
    "likely": 0,
    "note": "All returned schools landed in reach based on the chancing ranges."
  },
  "disclaimers": [
    "Fit uses published attributes only; campus culture and social fit are not modeled.",
    "Affordability uses published net price or sticker cost. Merit aid is not predicted.",
    "Chances are calibrated ranges, not guarantees."
  ]
}
```

The pgvector search lives in `public.match_fit_schools`, added by `supabase/migrations/202606180002_fit_finder_phase2_match_function.sql`. It searches rows with stored embeddings, orders by cosine distance, and applies hard filters for region, size, setting, and published cost. Cost filtering uses `net_price_avg` first, falls back to `sticker_cost`, and keeps schools with both costs missing as `unknown`.

The route pulls a candidate pool, computes each candidate's chance by calling `buildChancePayload` directly, then interleaves reach, target, and likely buckets where the pool allows it. If every candidate lands in one bucket, the balance note says that plainly.

## Fit Finder Phase 3 - UI and Explanations

Fit Finder now appears as a `Find schools` panel on the main Almanac page. It reuses the student profile already entered in the left column for GPA, SAT, ACT, and application round, then collects fit preferences: interests, intended major, preferred size, setting, region, published cost ceiling, and learning notes.

Fit Finder is dark by default. Set this server flag only after the target Supabase project has Phase 1 enrichment and embeddings:

```dotenv
FITTY_FIT_FINDER_ENABLED=true
```

Run locally:

```powershell
npm run dev
```

Open `http://localhost:3000`, fill the student profile, then use the Fit Finder panel. The form calls `POST /api/fit`; each returned school card shows the range band, matched attributes, notable public outcomes, cost status, the API disclaimers, and an `Add to my Fitty list` action that uses the existing school-list path.

Claude explanations are optional. Add these values when you want the `why it fits` paragraph:

```dotenv
ANTHROPIC_API_KEY=your_anthropic_key
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```

If `ANTHROPIC_API_KEY` is missing or the call fails, `POST /api/fit/explain` returns a fallback flag and the card remains usable with structured reasons only. The explanation prompt is constrained to use only the provided school attributes, matched reasons, and range band. It cannot use outside facts, rankings, unprovided programs, or a single admit number.

With analytics debug enabled, Fit Finder emits only non-identifying events: viewed, search run, and school added. It records booleans for which filters were used and result counts. It does not record preference text, intended major, scores, GPA, costs, school identifiers, names, or state.

## Phase 2 - Modeling

Phase 2 trains a synthetic public-data prior model. It does not claim real-outcome accuracy. The default run uses the checked-in cache at `pipeline/data/schools_public_cache.csv`, which contains the same public school fields produced by the Phase 1 ingest plus the C7 seed overlays. You can also point the trainer at Supabase with `--source supabase` after filling `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

Run the trainer from the project root:

```powershell
python pipeline/train_model.py
```

Optional Supabase-backed run:

```powershell
python pipeline/train_model.py --source supabase
```

The script uses fixed seed `20260616` and generates the same synthetic cohort, coefficients, artifacts, vectors, and report when run against the same input data.

Outputs:

- `lib/model/artifacts.json` - plain JSON for the Phase 3 TypeScript inference layer
- `lib/model/test_vectors.json` - 15 shared examples across all selectivity tiers
- `pipeline/reports/calibration_report.md` - synthetic reliability table and tier interval-width audit
- `pipeline/reports/reliability_curve.png` - reliability curve labeled as synthetic prior calibration
- `MODEL_CARD.md` - assumptions, exclusions, limitations, and Phase 6 retrain plan

Phase 2 intentionally does not build `/api/chance` or any results UI. Every exported prediction includes a range; the point probability is only a marker inside that range.

## Phase 3 - Inference API

Phase 3 adds `POST /api/chance`, a Next.js App Router route that consumes `lib/model/artifacts.json` in TypeScript. It does not call Python, retrain the model, or fetch model files at runtime.

Example request:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/api/chance `
  -ContentType 'application/json' `
  -Body '{
    "unitid": 166683,
    "sat_score": 1540,
    "act_score": 35,
    "gpa": 3.95,
    "application_round": "regular"
  }'
```

Example response shape:

```json
{
  "school": {
    "unitid": 166683,
    "name": "Massachusetts Institute of Technology",
    "selectivity_tier": "elite",
    "sat_25": 1520,
    "sat_75": 1580,
    "act_25": 34,
    "act_75": 36,
    "gpa_avg": null,
    "test_policy": "required"
  },
  "probability": {
    "point": 0.0403255,
    "calibrated": 0.032967,
    "low": 0,
    "high": 0.492967,
    "width": 0.492967,
    "coverage": 0.8
  },
  "band": {
    "label": "reach",
    "wide_band": true,
    "note": "Public data cannot narrow this interval enough for a target/likely label.",
    "input_confidence": "standard"
  },
  "levers": {
    "controllable": [],
    "fixed": [],
    "unseen": []
  },
  "rubric": {
    "c7_factors": {},
    "gaps": {
      "sat": { "score": 1540, "mid": 1550, "gap": -0.22483333333333333 },
      "act": { "score": 35, "mid": 35, "gap": 0 },
      "gpa": { "score": 3.95, "mid": null, "gap": null }
    }
  },
  "disclaimers": [
    "Synthetic public-data prior - not validated real-outcome accuracy.",
    "Essays, recommendations, and institutional priorities are not modeled."
  ],
  "model": {
    "type": "public_prior_logistic_v1",
    "version": "2026.06.16-phase2",
    "honesty_label": "Synthetic public-data prior. Not validated real-outcome accuracy."
  }
}
```

The actual `levers` arrays include modeled-feature logit contributions grouped into controllable/fixed categories and unseen disclosure entries for the "what we can't see" panel. The example above is shortened only for readability.

Run the Phase 3 golden tests:

```powershell
npm run test
```

The tests assert that TypeScript feature engineering and prediction reproduce every entry in `lib/model/test_vectors.json` within `1e-6`, validate malformed input handling, confirm missing SAT/ACT input widens the band instead of erroring, and verify that race/ethnicity keys are stripped and never returned.

## Phase 4 - Frontend

Phase 4 builds the Admissions Almanac UI on top of the existing `/api/chance` route. It does not change the model artifact or inference contract.

Local run:

```powershell
npm install
npm run dev
```

Required environment for end-to-end school search and chance calls:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

The `schools` table must be populated with Phase 1 data. The browser searches public school rows through the Supabase anon client, and each added school calls `POST /api/chance` for the full honesty payload.

Design notes live in `DESIGN_NOTES.md`. The UI uses the range band as the dominant visual, shows the point only as a marker inside the band, renders lever decomposition, includes the "what we cannot see" disclosure, and grounds each result in C7 rubric factors and middle-50 gaps.

## Phase 5 - Disclosure, Tests, and Deploy Readiness

Phase 5 adds `/methodology`, linked from the app header, with the current artifact `model_type` and `honesty_label`, the sub-20 admit-rate limitation, unmodeled factors, validation status, race/ethnicity exclusion, and privacy boundaries.

Result cards now add a contextual note for `elite` and `highly_selective` schools, cite CDS C7 `_source` when present, and label home state, intended major, and activity notes as not yet used by the model.

Run browser coverage without live Supabase:

```powershell
npm run test:e2e
```

The Playwright suite starts Next on port `3100`, enables the local school-search fixture, mocks `/api/chance`, and verifies range-first rendering, honesty panels, sub-20 disclosure, list balance warning, dark mode, and the methodology page.

Analytics are implemented as a no-op-by-default privacy wrapper. With `NEXT_PUBLIC_FITTY_ANALYTICS_DEBUG=true`, it logs only sanitized product events to the browser console: `page_view`, `profile_completed`, `school_added`, and `methodology_viewed`. It never records GPA, SAT, ACT, scores, school identifiers, names, state, email, phone, or zip-like fields.

Deployment steps live in `DEPLOY.md`.

## Phase 6 - Consented Outcomes and Real-Data Retraining

Phase 6 adds disabled-by-default outcome capture and a dark real-outcome model path. Capture APIs live under `/api/outcomes/*` and require `FITTY_OUTCOME_CAPTURE_ENABLED=true`; production subject identity is resolved from a Supabase bearer token, while unsigned subject headers are local-audit only.

New Supabase tables are created by `supabase/migrations/202606170001_phase6_outcome_capture.sql`: `consent_records`, `applicant_profiles`, `application_outcomes`, and `data_access_logs`. RLS is enabled on all four, and a database trigger blocks profile/outcome storage unless an active consent record exists for the same subject.

Run the real trainer after consented outcomes exist:

```powershell
npm run train:real -- --source supabase
```

For local contract checks only:

```powershell
python pipeline/train_real.py --source fixture
```

The fixture run writes `lib/model/artifacts.real.json`, `lib/model/test_vectors.real.json`, and `pipeline/reports/real_calibration.json` so the route, tests, and methodology page can be audited without pretending fixture rows are production evidence. Set `FITTY_REAL_MODEL_ENABLED=true` only after reviewing a Supabase-trained real calibration report.

Privacy, retention, data-subject controls, and threat model details live in `PRIVACY.md`.

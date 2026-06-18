# Fitty Go-Live Checklist

This is the ordered, gated path from "audited in code" to "serving the real-outcome model to real students." Each gate must pass before the next. The whole point of Fitty is honesty, so none of these gates may be skipped to move faster.

Tone note: no em-dashes in repo copy by convention.

---

## 0. Local verification (do this first, on a real machine)

The CI-style checks must all pass on your machine. (A sandboxed mount can corrupt files and give false failures, so trust a clean local checkout, not a remote sandbox.)

```powershell
cd C:\AA_Whetstone\fitty
npm ci
npm run lint
npx tsc --noEmit
npm run test
npm run test:e2e
npm run build
```

All five must be green. If `tsc` reports "Invalid character" or "Unterminated string" on files that look fine in your editor, re-clone the repo fresh; that signature means a corrupted working copy, not a real code defect.

Security pre-flight (confirm by inspection):

- `.env` is git-ignored and was never committed. Rotate any key that ever touched a commit.
- Service-role key is referenced only from `lib/supabase-server.ts` (which starts with `import "server-only"`). It is never a `NEXT_PUBLIC_` variable.
- No `race` or `ethnicity` field exists anywhere in schema, capture UI, model features, or logs.
- Analytics captures no scores, GPA, identifiers, or home state.
- Fit Finder analytics captures no interests, intended major, published cost values, scores, GPA, school identifiers, names, or state.

---

## 1. Provision staging Supabase

- Create a dedicated staging project (never production).
- Apply the migration in `supabase/migrations/`.
- Confirm RLS is enabled on `consent_records`, `applicant_profiles`, `application_outcomes`, `data_access_logs`, and that the `require_active_modeling_consent()` trigger exists.

## 2. Fit Finder ship gate

Fit Finder stays dark until its data pipeline has run on the target Supabase project.

```powershell
python pipeline/ingest_scorecard.py
python pipeline/seed_cds_c7.py
npm run fit:enrich
npm run fit:embed
npm run fit:embedding-sanity
```

- Keep `FITTY_FIT_FINDER_ENABLED=false` until these steps pass on the target project.
- `GET /api/fit/status` must return `{ "enabled": false }` while the flag is off, and the Fit Finder UI must not render.
- After data verification, set `FITTY_FIT_FINDER_ENABLED=true` and confirm `/api/fit` returns range-first results with matched reasons and no fit score.
- `ANTHROPIC_API_KEY` is optional. If it is missing, Fit Finder must still show structured reasons and the Claude explanation endpoint must degrade gracefully.
- Confirm the methodology page states what matching cannot weigh and that merit aid is not predicted.

## 3. Live RLS + consent verification (hard gate)

This is the precondition for collecting any real data. The harness has only been proven to refuse without a staging flag; it has not yet run against a live project.

```powershell
$env:FITTY_RLS_TARGET = "staging"
npm run verify:rls
```

Every check must print PASS and the process must exit 0: cross-user reads/inserts/deletes blocked, insert-without-consent rejected, insert-after-revoke rejected, and teardown removes only the harness's own rows. If any check fails, stop. Do not enable capture.

## 4. Keep capture OFF until gate 3 passes

- `FITTY_OUTCOME_CAPTURE_ENABLED` stays unset/false until the live RLS run is green.
- With the flag off, the capture and data-control UIs do not render and the capture APIs return 404. Verify this on staging.

## 5. Turn on capture (staging first)

- Set `FITTY_OUTCOME_CAPTURE_ENABLED=true` on staging only.
- Do one full real pass as a test user: sign in, give explicit consent, submit a profile and one outcome.
- Exercise the data-subject controls: export downloads JSON, revoke marks consent revoked, delete removes data and leaves exactly one `deleted` tombstone.
- Only after this is clean should capture be enabled in production.

## 6. Accumulate consented outcomes

- Let real, consented outcomes accrue. The trainer refuses to export a production model below `len(FEATURE_ORDER) * 20` consented outcomes.
- Until then, Fitty serves the honest synthetic public-data prior, clearly labeled as such.

## 7. Real-model enablement (hard gate)

```powershell
npm run train:real
npm run check:real-gate
```

- `check:real-gate` must end with `GATE: PASS` (status trained, enough held-out outcomes, calibration within tolerance, Brier/log-loss under ceilings). A fixture report cannot pass.
- A human reviews `pipeline/reports/real_calibration.json` and the gate output. The gate informs the decision; it does not flip the flag.
- Only then set `FITTY_REAL_MODEL_ENABLED=true`. On FAIL, the flag stays off and Fitty keeps serving the prior.

## 8. Publish honest calibration

- Surface Fitty's own calibration table (by probability bin and by tier) on `/methodology`.
- Run the change-course check: if sub-20% intervals stay near 0 to 100 percent even with real data, do not fake precision. Pivot messaging to "fit plus honest ranges" and keep the prior as the transparent fallback.

---

## Standing invariants (true at every stage)

1. No bare percentage anywhere; ranges only.
2. Race and ethnicity never collected, stored, modeled, or logged.
3. No storage without a recorded, revocable consent row.
4. No overpromising copy. If the data cannot narrow elite uncertainty, say so.
5. `/api/chance` request/response contract stays stable so the UI never breaks when the model is swapped.

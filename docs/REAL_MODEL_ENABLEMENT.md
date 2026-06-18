# Real Model Enablement

The real-outcome model stays off until a human reviews fresh Supabase training evidence and the gate check passes. The gate does not change `FITTY_REAL_MODEL_ENABLED`. It only reports whether the latest evidence is ready for review.

## Order Of Steps

Run these from PowerShell in `C:\AA_Whetstone\fitty`.

1. Train from Supabase consented outcomes:

   ```powershell
   python pipeline/train_real.py --source supabase
   ```

2. Check the real-model gate:

   ```powershell
   npm run check:real-gate
   ```

3. Read the command output and `pipeline/reports/real_calibration.json`.

4. If the gate prints `GATE: FAIL`, keep `FITTY_REAL_MODEL_ENABLED=false`.

5. If the gate prints `GATE: PASS`, a human reviewer may decide whether to set:

   ```powershell
   FITTY_REAL_MODEL_ENABLED=true
   ```

The gate informs that decision. It does not flip the flag, deploy the app, train a model, or call Supabase.

## Thresholds

The current gate uses constants in `pipeline/check_real_gate.py`.

- Report status must be `trained`. Fixture reports and no-data reports fail.
- Total consented outcomes must be at least `420`. This matches the trainer's production rule of `21` model features times `20` outcomes per feature.
- Held-out outcomes must be at least `100`. Smaller held-out sets are too thin for an enablement decision.
- Calibration bins are checked only when the bin has at least `30` held-out outcomes. At least one bin must meet that size. For every checked bin, the observed admit rate must be within `0.10` of the predicted-bin midpoint.
- Brier score must be present and at or below `0.20`.
- Log loss must be present and at or below `0.65`.

If any threshold fails or any required number is missing, the command ends with `GATE: FAIL` and exits nonzero. The real model flag stays off.

## What To Review

Look for plain evidence that the model is stable enough to serve as an optional real-outcome path:

- The report came from Supabase, not fixtures.
- The held-out set is large enough.
- Calibration bins with enough samples are close to their predicted ranges.
- Brier score and log loss are under the documented ceilings.
- The model card and user-facing copy still avoid accuracy promises.

Passing this gate is necessary, not automatic approval. A reviewer can still keep the real model off.

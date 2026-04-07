# P86 — Data collection / extraction

## From live runs

1. Run `npx tsx scripts/check-ml-image-remediation.ts <productId>` (or your internal pipeline that persists `mlChileCanonicalPipeline`).
2. Copy `metadataPatch.mlChileCanonicalPipeline.trace` (or full JSON stdout).
3. For each finalist, copy:
   - `finalCoverQuality` (entire object)
   - `heroMetrics`
   - `preferenceScore`
   - `candidateUrl`, `recipeId`, `objectKey`

## From logs / CI

If trace is only in logs, grep for `finalCoverPreferenceFinalists` or persist the check script output to a `.json` file (strip leading log lines if needed).

## Calibration-friendly format

- **JSON lines:** one object per sample with keys `productId`, `humanLabel`, `finalCoverQuality`, `heroMetrics`, `preferenceScore`, `recipeId`, `capturedAt`.
- **Starter file:** `artifacts/ml-calibration/p86_starter_labeled_traces.json` — two samples (Good / Weak) extracted from `p84_32690_forced_raw.txt` finalist table.

## Trace fields used by the floor

The evaluator consumes:

- `preferenceScore`
- `finalCoverQuality.*` (readability, silhouette, deadSpaceRatio, centerSignalRatio, washoutIndex)
- `heroMetrics.subjectAreaRatio`

These are the columns to export for spreadsheet or notebook analysis when the labeled set grows.

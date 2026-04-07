# P84 — Final preference stage integration

## Location

`backend/src/services/marketplace-image-pipeline/ml-chile-canonical-pipeline.service.ts` — remediation branch after direct-pass exhaustion.

## Behavior

1. If `isFinalCoverPreferenceEnabled()` (**default on**; `ML_FINAL_COVER_PREFERENCE=0` disables):
   - Build simulation plan (if rows exist) and **ordered attempt list**.
   - For each attempt (until `maxFinalists` passes or attempts exhausted): load source buffer, `applyRecipe`, run **full** gates, append `remediationAttempts` trace rows.
   - Collect passing outputs; score each with `evaluateFinalCoverPreferenceOnBuffer`.
   - If **≥ 2** finalists: `selectFinalCoverPreferenceWinner` by `preferenceScore` with deterministic tie-break (`compareFinalCoverPreferenceTieBreak`).
   - If **1** finalist: use it; trace `single_passing_final_no_comparison`.
   - Emit pack from the chosen finalist only after preference completes.

2. If preference is **disabled**: legacy behavior — first gate-passing remediation returns immediately (same as pre-P84).

## Determinism

- Fixed attempt order from plan + grid dedup.
- Tie-break: `preferenceScore` → `subjectAreaRatio` → min WH ratio → `recipeId` → `candidateUrl` (lexical).

## Non-regression

Policy, conversion, hero, and integrity thresholds and implementations are **not** modified by P84.

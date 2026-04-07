# P84 — Finalist generation strategy

## Bounded collection

- **Max finalists:** `getFinalCoverPreferenceMaxFinalists()` — default **3**, env `ML_FINAL_COVER_PREFERENCE_MAX_FINALISTS` (2–5).
- Stop when **that many distinct gate-passing** remediated covers are collected **or** all unique `(candidate, recipe)` attempts are exhausted.

## Attempt order (deterministic)

1. **Simulation plan (priority)** — When P82/P83 `remediationSimulation` rows exist, take up to `maxFinalists` distinct `(candidateUrl, recipeId)` pairs by **max `simScore`** per pair (dedup low+high fidelity). Respects recipe chain and skips `inset_white_catalog_png` when no inset override (same as production).
2. **Full grid (tail)** — Remaining pairs from `remediationOrder × defaultRemediationRecipeChain`, deduplicated, same order as legacy nested loops.

This keeps compute bounded while trying **likely-best** full remediations first.

## Cost

Worst case: one full `applyRecipe` + gate evaluation per unique pair until three passes or list end. No change to gate strictness; extra work is only **additional** passing combos up to the cap.

## Fail-closed

If **zero** pairs pass, the trace records `final_cover_preference_zero_passing` and the pipeline ends in `human_review_required` (same terminal outcome class as before when nothing passes).

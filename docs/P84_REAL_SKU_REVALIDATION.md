# P84 — Real SKU re-validation (32690)

## Normal run (on-disk approved cover present)

`npx tsx scripts/check-ml-image-remediation.ts 32690`

Result sample (`p84_32690_check.json`): **`direct_pass`** via `local:pack:…:cover_main` — remediation and P84 preference **not exercised** (trace shows `finalCoverPreferenceEnabled: false` defaults from early return).

## Forced remediation (exercises P84)

Temporarily renamed `artifacts/ml-image-packs/product-32690/cover_main.png` so the canonical path could not take direct local pass; ran the same script; restored `cover_main.png` after the run.

**Capture:** `p84_32690_forced_raw.txt` (logs + JSON), 2026-03-25.

### Summary

| Field | Value |
|-------|--------|
| `traceFinalOutcome` | `remediated_pass` |
| `winningRecipeId` | `inset_white_catalog_png` |
| `winningRemediationCandidateUrl` | `https://ae01.alicdn.com/kf/Sd8adf1f1f796411e96d94f9f8c6d45440.jpg` |
| `remediationSimulationRows` | `14` |
| `remediationSimulationWinner.recipeId` | `inset_white_catalog_png` (aligned with P83) |
| `finalCoverPreferenceEnabled` | `true` |
| `finalCoverPreferenceMaxFinalists` | `3` |
| `finalCoverPreferencePlanSlots` | `3` |
| `finalCoverPreferenceFinalistsCount` | `2` |
| `finalCoverPreferenceWinner.preferenceScore` | `128938.67` |

### vs P83

P83 could still stop at the **first** full pass. P84 collected **two** gate-passing finals and selected the higher `preferenceScore` winner, with `finalCoverPreferenceBeatReasons` documenting the margin vs the runner-up (`beat_…_inset_white_catalog_png_by_74499.28`).

## `winningFinalCoverSource`

Same as `winningRemediationCandidateUrl` + `winningRecipeId` on the canonical trace root (no separate field name in v1 trace).

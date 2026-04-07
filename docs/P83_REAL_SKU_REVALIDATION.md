# P83 — Real SKU re-validation (32690)

## Command

```bash
cd backend
npx tsx scripts/check-ml-image-remediation.ts 32690
```

## Forced remediation capture (P83)

`cover_main.png` was **temporarily removed** so the canonical path entered remediation; then restored from a timestamped backup (`cover_main.pre_p75_backup_2026-03-25T03-21-50-215Z.png`).

Output: `p83_32690_forced.json` (2026-03-25).

## Results

| Field | Value |
|-------|--------|
| `traceFinalOutcome` | `remediated_pass` |
| `winningRecipeId` | `inset_white_catalog_png` |
| `winningRemediationCandidateUrl` | `https://ae01.alicdn.com/kf/Sd8adf1f1f796411e96d94f9f8c6d45440.jpg` |
| `remediationSimulationRows` | `14` (10 low + 4 high for top 2 × 2 recipes) |
| `remediationSimulationHiFiInvoked` | `true` |
| `remediationSimulationHiFiRowCount` | `4` |
| `remediationSimulationWinner.simScore` (calibrated) | `1466523.69` |
| `remediationSimulationWinner` recipe | `inset_white_catalog_png` |

### Winner detail (high-fidelity inset row)

- `simScoreBase`: `1391849.55`
- `simScore`: `1466523.69` (calibration delta visible)
- `simulationQuality.readabilityEstimate`: `62.38`
- `simulationQuality.centerSignalRatio`: `0.58386`
- `calibratedReasons`: include readability, silhouette, center signal, washout penalty, dead space, subject min WH

## Comparison vs P82

- P82: 10 simulation rows, winner driven by uncalibrated `simScore` only, no hi-fi tier.
- P83: additional **high** rows for top candidates; **winner** selected by **calibrated** `simScore`; trace exposes **base vs calibrated** and **quality metrics**.

Same final source URL/recipe on this SKU run — selection remains sensible; P83 adds **richer discrimination** and **hi-fi confirmation** for the top shortlist.

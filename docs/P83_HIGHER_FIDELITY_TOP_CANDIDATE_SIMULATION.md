# P83 — Higher-fidelity top-candidate simulation

## Goal

Reduce false winners when **low-res-only** preview mis-ranks candidates that look acceptable small but weak at real display sizes.

## Behavior

1. **Low tier (`fidelityTier: low`)** — unchanged P82-style preview:
   - max input shrink default 900px
   - preview square min side 960; inset canvas 1152 / inner 880

2. **High tier (`fidelityTier: high`)** — after all low-tier rows:
   - take the **top N** candidates by **calibrated** `simScore` from low tier (default **N = 2**)
   - re-run preview with max input **1400px** (env-tunable)
   - preview square min **1152**; inset canvas **1408** / inner **1100**

## Tradeoff

| | Low | High |
|---|-----|------|
| CPU / memory | lower | higher |
| Fidelity vs final | approximate | closer |
| Coverage | full shortlist | top N only |

## Env

- `ML_REMEDIATION_SIM_HIFI` — default on; `0` / `false` disables
- `ML_REMEDIATION_SIM_HIFI_TOP_N` — 0–5 (default 2)
- `ML_REMEDIATION_SIM_HIFI_MAX_INPUT` — 640–2000 (default 1400)

## Code

`remediation-recipes.service.ts` — `applySquareWhiteCatalogJpegPreviewHigh`, `applyInsetWhiteCatalogPngPreviewHigh`, `applyRecipePreview(..., fidelity)`

`remediation-simulation.service.ts` — second pass `runForCandidate(..., 'high')`

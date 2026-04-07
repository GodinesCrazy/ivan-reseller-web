# P83 — Calibrated simulation quality model

## Code

`backend/src/services/marketplace-image-pipeline/simulation-quality-metrics.service.ts`

## New metrics (`CanonicalSimulationQualityMetrics`)

Computed on each **simulated output** buffer:

| Metric | Meaning |
|--------|---------|
| `deadSpaceRatio` | `1 - hero.subjectAreaRatio` (expected dead canvas share proxy) |
| `centerSignalRatio` | Signal-pixel ratio in a downsampled **58% center crop** (readability / presence) |
| `globalLuminanceStdev` | Mean RGB channel stdev from `sharp.stats()` (global energy) |
| `edgeTextureStdev` | Top 8% strip texture (busy-edge / halo risk) |
| `washoutIndex` | 0–1 blend of high near-white + low luminance range (flat/wash risk) |
| `silhouetteStrength` | \((luminanceRange/255)\cdot\sqrt{signalPixelRatio}\) style proxy |
| `readabilityEstimate` | 0–100 weighted blend of center signal, hero ratios, washout, global stdev |

## Scoring

1. **`simScoreBase`** — P82 formula unchanged (gate bonuses + hero/integrity scalars).
2. **`simScore`** — calibrated:
   - `+ readabilityEstimate * 920`
   - `+ silhouetteStrength * 480`
   - `+ centerSignalRatio * 52_000`
   - `- washoutIndex * 108_000`
   - `- deadSpaceRatio * 32_000`
   - `+ min(subjectWidthRatio, subjectHeightRatio) * 12_000`
   - edge texture penalty above 40 stdev
   - **Suspicious-pass penalty:** if `simAllCorePass` and `washoutIndex > 0.68` and `centerSignalRatio < 0.14` → `-220_000`

## Hard vs soft

- **No new production hard gate.** All adjustments are **ranking-only** on simulation rows.
- The suspicious-pass rule is a **soft simulation veto** (large score hit), not a gate change.

## Trace

Each simulation row carries `calibratedReasons` (first 8 strings) for operator-readable justification.

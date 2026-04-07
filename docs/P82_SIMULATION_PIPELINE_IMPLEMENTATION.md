# P82 — Simulation pipeline implementation

## Code locations

| Piece | File |
|-------|------|
| Preview recipes | `backend/src/services/marketplace-image-pipeline/remediation-recipes.service.ts` — `applySquareWhiteCatalogJpegPreview`, `applyInsetWhiteCatalogPngPreview`, `applyRecipePreview` |
| Simulation output policy/conversion | `backend/src/services/marketplace-image-pipeline/dual-gate.service.ts` — `evaluateSimulationDualGatesOnOutputBuffer` |
| Ranking engine | `backend/src/services/marketplace-image-pipeline/remediation-simulation.service.ts` — `runRemediationSimulationRanking` |
| Pipeline wiring | `backend/src/services/marketplace-image-pipeline/ml-chile-canonical-pipeline.service.ts` |
| Env toggles | `backend/src/services/marketplace-image-pipeline/policy-profiles.ts` — `isRemediationSimulationEnabled`, `getRemediationSimulationMaxCandidates`, `getRemediationSimulationPreviewMaxInput` |
| Template vars | `backend/env.local.example` |

## Cost controls

1. **Shortlist size** capped (default 5).
2. **Input downscale** before preview (default 900px).
3. **Preview recipes** use smaller square minimum and smaller inset canvas than production, reducing memory and JPEG/PNG work while preserving recipe shape (inset fractions, trim, modulate, neutral crush).

## Representativeness

Preview outputs are **not** publish buffers. They exist only to rank candidates. The **final** remediation still runs production recipes and **full** output gates.

## Recipe order in simulation

Same as production: `defaultRemediationRecipeChain` order (`square_white_catalog_jpeg` then `inset_white_catalog_png` when inset metadata exists).

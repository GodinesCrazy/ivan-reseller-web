# P109 — Mass-publish readiness V2

## `PortadaPublishReadiness` extensions

Built by `buildPortadaAutomationReadinessFromP103` in `ml-image-readiness.service.ts`:

| Field | Purpose |
|--------|---------|
| `winningSegmentationVariantId` | Winning P109 segmentation id, if any |
| `winningStudioPrepId` | Winning studio prep id, if any |
| `segmentationVariantsAttempted` | Ordered list tried this attempt |
| `studioPrepIdsAttempted` | Ordered list tried this attempt |
| `recoveryEngineVersion` | `p109_autonomous_v2` / `p108_alpha_waves` / `p107_compose_only` |
| `dominantFailureCluster` | Coarse bucket from top gate signal (`collage_or_multi_panel`, `sticker_or_cutout_edge`, `white_field_compliance`, `text_or_graphic_risk`, `other`) |
| `autonomousPipelineExhausted` | `true` when attempt failed, no supplement fail-closed, and classification is exhausted/insufficient |
| `autonomousImageReviewRecommended` | Mirrors exhausted path for operator routing |
| `portadaAutomationRecipeFamily` | e.g. `p109_seg_x_studio_x_p108_x_p107` |

## Consumption guidance

Large-scale publishing flows should persist:

- `publishAllowedPortada`
- `classification` (including `AUTONOMOUS_V2_RECOVERY_EXHAUSTED`)
- `recoveryEngineVersion`
- `dominantFailureCluster` + `topRejectionSignals`
- Whether the SKU needs **manual review** or **stronger source imagery** (`autonomousImageReviewRecommended`)

**Seller Center** remains authoritative if/when live listing images are applied outside this pipeline.

# P109 — Product 32714 V2 benchmark (supplier-only)

## Command

```text
cd backend
npx tsx scripts/p109-automatic-portada-benchmark-32714.ts
```

Optional fast matrix (CI / smoke):

```text
set P109_BENCHMARK_FAST=1
npx tsx scripts/p109-automatic-portada-benchmark-32714.ts
```

## Method

- Load product **32714** from DB; parse supplier image URLs.
- Strip supplement hero fields **in memory** via `stripPortadaSupplementHeroFieldsForAutomaticBenchmark`.
- Call `attemptMercadoLibreP103HeroPortadaFromUrls` with `multiRecipe: true`, `advancedRecovery: true`, `p109V2: true`.

## Artifact

**`p109-benchmark-32714.json`** (repo root).

## Result (2026-03-27, fast mode)

Fast mode intentionally uses a **reduced** matrix:

- Segmentation: `p103_v1_default`, `p109_border_relaxed`
- Studio prep: `p109_none`, `p109_halo_light`
- Recovery: `p108_none`, `p108_feather_alpha_light`, `p108_feather_alpha_medium`

| Field | Value |
|--------|--------|
| `p103Ok` | `false` |
| `automaticPortadaClassification` | `AUTONOMOUS_V2_RECOVERY_EXHAUSTED` |
| `recoveryEngineVersion` | `p109_autonomous_v2` |
| `supplierUrlCount` | `7` |
| `winningUrl` / `winningRecipeId` / `winningSegmentationVariantId` / `winningStudioPrepId` | `null` |
| `coverSha256` | `null` |

### Dominant gate signals (aggregated)

From `dominantStrictNaturalSignalsAcrossAllVariants` in the artifact:

1. `portada_natural_look_harsh_silhouette_vs_white_field_sticker_or_cutout_risk` (432)
2. `portada_white_background_insufficient_near_white_dominance` (344)
3. `portada_high_local_contrast_fragmentation_sticker_collage_risk` (228)
4. `portada_white_background_insufficient_true_white_pixels` (193)
5. `portada_white_background_border_non_uniform` (74)
6. `portada_white_background_border_shadow_or_object_bleed` (72)
7. `portada_vertical_split_seam_collage_risk` (48)
8. … (see JSON for full ordered list)

### Ranked inputs

Top ranked URL in this run: `https://ae01.alicdn.com/kf/S4005cfbe2ecc4d22bd0f51da34bfc1c6M.jpg` (see `rankedSources[0]` in JSON). Trials iterate sources by rank until `maxTrials` (script uses `12`).

## Conclusion

With **P109 V2** (segmentation variants + fringe studio prep + P108 + P107), **no** automatic portada passed the strict stack for **32714** in this benchmark. Classification: **`AUTONOMOUS_V2_RECOVERY_EXHAUSTED`** (fail closed).

For a **full** matrix run, unset `P109_BENCHMARK_FAST` and re-execute; artifact format is unchanged.

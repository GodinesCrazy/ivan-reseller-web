# P102 — White-background portada policy

## Mandatory policy (cover_main)

`cover_main` must pass **both**:

1. Structural anti-text/banner/screenshot strict gate
2. White-background compliance gate

Fail closed if either gate fails.

## Implemented enforcement points

- `backend/src/services/ml-portada-visual-compliance.service.ts`
  - `evaluateMlPortadaStrictGateFromBuffer` now merges:
    - structural signals
    - white-background signals
- `backend/src/services/mercadolibre-image-remediation.service.ts`
  - `inspectAsset()` already validates `cover_main` through strict gate; now this includes white-background checks implicitly.
- `backend/src/services/marketplace-image-pipeline/ml-chile-canonical-pipeline.service.ts`
  - direct candidate and remediation candidate acceptance both call strict gate; now both require white-background pass.

## White-background metrics/rules (implemented)

- Near-white thresholds: RGB >= 245
- Pure-white thresholds: RGB >= 252
- Border/corner checks from resized analysis canvas

Hard fail signals:

- `portada_white_background_insufficient_near_white_dominance`
- `portada_white_background_insufficient_true_white_pixels`
- `portada_white_background_border_not_white_enough`
- `portada_white_background_corner_not_white_enough`
- `portada_white_background_border_gray_cast`
- `portada_white_background_border_non_uniform`
- `portada_white_background_border_shadow_or_object_bleed`

Current thresholds:

- `nearWhiteDominance >= 0.58`
- `pureWhiteDominance >= 0.28`
- `borderNearWhiteRatio >= 0.90`
- `cornerMinNearWhite >= 0.93`
- `borderMeanLuma >= 246`
- `borderLumaStd <= 13`
- `borderDarkRatio <= 0.01`

## Why this policy closes the P101 gap

P101 old cover had strong structural compliance but weak white-background dominance. P102 policy blocks that class explicitly and propagates to pack inspection + canonical pipeline acceptance.

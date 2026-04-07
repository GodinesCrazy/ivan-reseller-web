# P76 — Policy profile model

## Purpose

A **PolicyProfile** is the first-class container for **marketplace + site** image rules, including **slot-aware** constraints (main vs gallery/detail) and **dual-gate thresholds** used after scoring.

## TypeScript model

- **File**: `backend/src/services/marketplace-image-pipeline/types.ts`
- **`MarketplaceImagePolicyProfile`**: `id`, `marketplace`, `siteId`, `label`, `slots`, `dualGate`, `defaultRemediationRecipeChain`, `compatibleRecipeIds`.
- **`MarketplaceImageSlot`**: `main` | `gallery` | `detail`.
- **`SlotPolicyRules`**: minimum dimensions, max aspect deviation, white-background proxy flag, edge texture stdev cap, edge mean luminance floor.

## ML Chile v1 profile

- **File**: `backend/src/services/marketplace-image-pipeline/policy-profiles.ts`
- **Constant**: `ML_CHILE_POLICY_PROFILE_V1` (`id: mercadolibre_mlc_v1`)
- **Main slot**: stricter edge/luminance proxies (portada-oriented).
- **Gallery/detail**: relaxed thresholds for supporting assets.
- **Dual gate**: `minPolicyFitness`, `minConversionFitness` (0–100 scale on scored candidates).
- **Default recipe chain**: `square_white_catalog_jpeg` → `inset_white_catalog_png` (inset skipped unless `mlImagePipeline.insetCrop` is set).

## Accessor

- `getMercadoLibreChilePolicyProfile()` returns the active profile (v1 today).

## Feature flag

- **`ML_CANONICAL_IMAGE_PIPELINE`**: unset = **enabled**; `0` or `false` disables canonical run (legacy remediation only). Documented in `backend/env.local.example`.

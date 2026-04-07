# P39 ML Image Pipeline Design

Date: 2026-03-23

## Goal

Define the native internal MercadoLibre Chile image-compliance pipeline as a reusable product capability.

## Implemented Pipeline

`raw supplier assets`
-> `asset intake`
-> `raw image compliance audit`
-> `remediation decision engine`
-> `automatic remediation path selection`
-> `canonical ML asset pack inspection`
-> `reviewed-proof / provenance metadata`
-> `publish-blocking handoff`

## Stage Contract

### 1. Asset intake

Inputs:

- `product.images`
- `product.productData`
- `product.id`
- optional listing context

Outputs:

- normalized raw image URL set
- existing stored proof
- canonical pack directory path

Failure states:

- no source images present

Persistence:

- canonical pack root `artifacts/ml-image-packs/product-<productId>`

### 2. Raw image compliance audit

Implemented by existing raw audit service:

- `auditMercadoLibreChileImagePolicy`

Outputs:

- raw `ml_image_policy_pass | fail | manual_review_required`
- manual-review reasons
- hard blockers
- source family
- metadata availability

### 3. Remediation decision engine

Implemented by:

- `evaluateMercadoLibreImageRemediationDecision`

Outputs:

- `pass_as_is`
- `reject_hard`
- `auto_remediate`
- `manual_review_required`

Retry states:

- rerun after compliant pack appears

### 4. Automatic remediation path

Implemented path options:

- `raw_images_publish_safe`
- `internal_process_existing_images`
- `internal_generated_asset_pack`
- `manual_review`
- `reject_hard`

Current software truth:

- simple internal processing is implemented for multi-image size/square normalization
- internal generated-pack orchestration is implemented as a native manifest/prompt package
- publish remains blocked until the pack becomes approved

### 5. Canonical ML asset pack

Canonical assets:

- `cover_main`
- `detail_mount_interface`
- `usage_context_clean` optional

Outputs:

- manifest
- prompt files
- local asset slots
- approval states

### 6. Reviewed proof persistence

Metadata prepared by pipeline:

- `mlChileImageCompliance`
- `mlChileImageRemediation`
- `mlChileAssetPack`

### 7. Publication handoff

The real ML publish path now depends on:

- compliant raw images, or
- approved canonical ML asset pack

It no longer depends on risky raw supplier images alone.


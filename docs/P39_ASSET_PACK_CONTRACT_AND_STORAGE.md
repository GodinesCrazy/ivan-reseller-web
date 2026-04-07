# P39 Asset Pack Contract And Storage

Date: 2026-03-23

## Goal

Define the canonical ML asset pack and how the software stores it.

## Canonical Pack

Required:

- `cover_main`
- `detail_mount_interface`

Optional:

- `usage_context_clean`

## Canonical Storage Path

Implemented path:

- `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-<productId>`

For current case:

- `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32690`

## Stored Files

Implemented artifacts:

- `ml-asset-pack.json`
- `cover_main.prompt.txt`
- `detail_mount_interface.prompt.txt`
- `usage_context_clean.prompt.txt`
- `README_P39_ML_IMAGE_PIPELINE.txt`

## Stored Metadata

The pipeline now prepares/persists:

- `mlChileImageCompliance.status`
- `reviewedAt`
- `reviewedBy`
- `reviewedByAgent`
- `assetSource`
- `primaryImageUrl`
- `visualSignals`
- `remediationPathUsed`
- `assetPackDir`
- `packApproved`

Additional product metadata:

- `mlChileImageRemediation`
- `mlChileAssetPack`

## Provenance Model

Supported provenance values:

- `raw_images_publish_safe`
- `internal_processed`
- `internal_generated`
- `manual_replacement`


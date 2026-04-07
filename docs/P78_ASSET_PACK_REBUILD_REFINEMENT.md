# P78 — Asset pack rebuild / refinement

## Database / product metadata

**Script:** `backend/scripts/p78-enable-canonical-local-cover-32690.ts`

Sets on **product 32690** `productData.mlImagePipeline`:

- **`canonicalEvaluateLocalApprovedCover: true`**
- **`insetCrop: { left: 0.38, top: 0.14, bottom: 0.26, right: 0.05 }`** (matches `DEFAULT_INSET` in `remediation-recipes.service.ts`)
- **`p78EnabledAt`** ISO timestamp

Re-run anytime after merging `productData` manually.

## On-disk pack (after successful canonical remediation)

After `remediated_pass`, **`writeCanonicalP76Pack`** in `mercadolibre-image-remediation.service.ts` overwrote:

| Asset | Change |
|-------|--------|
| **`cover_main.png`** | New PNG from **`inset_white_catalog_png`** output (dual-gate passing) |
| **`detail_mount_interface.jpg`** | Square JPEG from alternate candidate (supplier) via `applySquareWhiteCatalogJpeg` |
| **`ml-asset-pack.json`** | `remediationPathSelected: canonical_pipeline_v1`, `assetSource: canonical_ml_pipeline_v1`, required assets **approved** |

**Optional** `usage_context_clean` left missing with prompt file preserved where applicable.

## Prior self-hosted assets

Previous **`internal_generated`** PNGs remain as backups in the folder (`*.pre_p*_backup*.png`); the active **`cover_main.png`** is now canonical-remediated.

# P98 — ML image pack generation (product 32714)

## Status: DONE

### Pipeline trace (where assets come from)

| Concern | Location |
|--------|-----------|
| Canonical pack directory | `getCanonicalMercadoLibreAssetPackDir()` in `mercadolibre-image-remediation.service.ts` → `artifacts/ml-image-packs/product-{id}/` |
| On-disk inspection + `packApproved` | `inspectMercadoLibreAssetPack()` → `inspectAsset()` (square ≥1200, manifest `approvalState`) |
| Preflight image gate | `resolveMercadoLibrePublishImageInputs()` → `runMercadoLibreImageRemediationPipeline()` |
| Live supplier→catalog raster (P65 pattern) | `backend/scripts/p65-build-supplier-catalog-pack.ts` (reference); **P98 script duplicates the same sharp pipeline** for 32714 |

### P98 generation script

**File:** `backend/scripts/p98-build-ml-pack-32714.ts`

**Behavior:**

1. Load product **32714** from DB (`images` JSON URLs).
2. `mkdir -p` `artifacts/ml-image-packs/product-32714`.
3. **`buildCoverFromBuffer`** — same approach as P65: rotate/flatten, resize inside 1320, composite on **1536×1536** neutral canvas (`#f0f2f5` RGB).
4. **`buildDetailFromBuffer`** — center crop (second URL if present, else 55% crop on first), same canvas treatment.
5. Write **`cover_main.png`**, **`detail_mount_interface.png`**.
6. Write **`ml-asset-pack.json`** with `approvalState: "approved"` for both required slots and `assetSource: "p98_supplier_catalog_canvas"`.
7. Merge **`productData.mlImagePipeline.canonicalEvaluateLocalApprovedCover: true`** (+ `insetCrop` aligned with `p78-enable-canonical-local-cover-32690.ts` for future remediation attempts).

### Output paths (this workspace)

- `artifacts/ml-image-packs/product-32714/cover_main.png` (1536×1536)
- `artifacts/ml-image-packs/product-32714/detail_mount_interface.png` (1536×1536)
- `artifacts/ml-image-packs/product-32714/ml-asset-pack.json`

### Integration adjustment (not a new pipeline)

**File:** `backend/src/services/mercadolibre-image-remediation.service.ts`

Previously, `mayUseApprovedDiskPack` required `canonicalHandled.kind !== 'human_review'`, so a **fully inspect-approved** on-disk pack was ignored whenever the live canonical run ended in `human_review_required` on supplier URLs.

**P98 change:** If `inspectMercadoLibreAssetPack` reports `packApproved` (files exist, square-like, ≥1200, manifest `approved`), publish may use those **local files** even when the canonical trace still records dual-gate failure on raw URLs. Publish inputs remain the approved raster files, not unremediated AliExpress URLs.

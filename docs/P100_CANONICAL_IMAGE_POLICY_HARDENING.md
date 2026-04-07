# P100 — Canonical ML image policy hardening (portada)

## Problem

Local approval (`packApproved`, remediation integration) could mark **`cover_main`** as approved even when the asset still carried **text-/logo-like visual structure** that **live Mercado Libre moderation** later rejects.

## Hardening implemented

### 1. Mandatory portada strict gate (on-disk `cover_main`)

**Module:** `backend/src/services/ml-portada-visual-compliance.service.ts`

**Function:** `evaluateMlPortadaStrictGate(imagePath)`

**Technique (fail-closed, non-OCR):**

- Normalize to grayscale analysis grid (480×480).
- Sobel edge magnitude means in **top / middle / bottom** bands.
- Flags **top or bottom strip edge-energy ratios** typical of **banners, promo strips, or watermark bars**.
- Flags **high fraction of high local-contrast blocks** (grid **10×10**) typical of **text / stickers / busy UI** scattered on the image.

**Signals (examples):** `portada_top_band_edge_ratio_ml_text_risk`, `portada_bottom_band_edge_ratio_ml_text_risk`, `portada_global_edge_busy_with_strip_bias`, `portada_high_local_contrast_fragmentation_ml_text_risk`.

### 2. Integration point (canonical pack inspection)

**File:** `backend/src/services/mercadolibre-image-remediation.service.ts`

In `inspectAsset`, when `assetKey === 'cover_main'` and **dimensions are valid**, the service **awaits** `evaluateMlPortadaStrictGate(localPath)`. If the gate **fails**:

- `approvalState` is forced to **`invalid`** (overrides manifest `approved`).
- Notes append `P100_portada_strict_gate_fail:<signals>`.

Because `inspectMercadoLibreAssetPack` marks `packApproved` only when required assets are **approved**, **`cover_main` can no longer be canonically approved** if the strict portada gate fails.

### 3. Mercado Libre replace flow

**File:** `backend/src/services/mercadolibre.service.ts` — `replaceListingPictures` now **reactivates before upload** and **fails closed** with a **409** and ML’s message if reactivation is impossible (moderation hold).

## Tests

- `backend/src/services/__tests__/ml-portada-visual-compliance.service.test.ts` — clean pass vs top-strip fail.

## Limits (explicit)

- Heuristics reduce **false approvals**; they **do not guarantee** ML will never reject an image.
- **Live moderation** can still disagree; operator review remains the final escape hatch.

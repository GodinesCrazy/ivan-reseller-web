# P74 — Specialized cover remediation agent

## Role

Listing-scoped **operational** path for **product 32690** when **direct selection** is not viable: transform the **best-ranked** real supplier image into a **MercadoLibre-style catalog portada** that targets the known rejections:

- Reduce **logos/text** exposure (aggressive **center crop** drops peripheral strips).
- Enforce **light/plain background** (synthetic **pure white** canvas, not wood/lifestyle).

## Implementation

**Script:** `backend/scripts/p74-execute-cover-strategy.ts`  
**Invocation:** `npx tsx scripts/p74-execute-cover-strategy.ts 32690`

### Pipeline (remediation branch)

1. **Download** chosen supplier URL (best `remediationFitness`).
2. **Auto-orient** (`sharp.rotate()`).
3. **Center extract** with **`REMEDY_CENTER_KEEP = 0.64`** (stronger crop than P73’s 0.72) to discard corner badges and side copy where possible.
4. **Flatten** on `#ffffff` (handles alpha).
5. **Resize** `fit: 'inside'` max **1240** px (inner box before canvas).
6. **Modulate** saturation **0.82**, brightness **1.09** (catalog-like, slightly less “ad splash”).
7. **Mild sharpen** (`sigma: 0.38`).
8. **Composite** onto **1536×1536** RGB canvas background **`rgb(255,255,255)`**, centered.

### Direct branch (when `directPass` — not used this run)

- Flatten white, resize inside **1320**, composite on **`rgb(252,252,253)`** 1536 canvas — minimal processing.

### Outputs

- Writes **`artifacts/ml-image-packs/product-32690/cover_main.png`**
- Backs up prior cover to **`cover_main.pre_p74_backup_<timestamp>.png`**
- Does **not** modify **`detail_mount_interface.png`**

## Relation to other paths

- **P73** (`p73-build-clean-catalog-cover.ts`): similar intent; P74 uses **tighter crop (0.64)**, **white** (not `#f8f9fa`), and a **scored choice** between direct vs remediate.
- **Self-hosted hosting** (`backend/src/services/self-hosted-image-provider.service.ts`): available for publishing URLs; P74 build is **local Sharp** only (no generative model).

## Limits (honest)

- No OCR or inpainting; **persistent text printed on the product body** cannot be removed by this pipeline.
- If ML still flags **content inside the kept crop**, the next lever is stronger isolation (segmentation / inpaint) or a different supplier asset.

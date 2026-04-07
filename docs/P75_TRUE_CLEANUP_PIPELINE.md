# P75 — True cleanup pipeline

## Script

`backend/scripts/p75-build-seller-proof-cover.ts`

**Default run (listing 32690):**

```bash
cd backend
npx tsx scripts/p75-build-seller-proof-cover.ts 32690
```

**Overrides:**

- `--object-key=<S…>` — use another AliExpress object key from `products.images`.
- `--strip-left-only` — legacy left-strip-only path (non-32690 experiments).
- `--strip-left=<0..0.45>` — strip ratio when using `--strip-left-only`.

## Listing 32690 parameters (`P75_INSETS_32690`)

| Edge | Fraction of source W/H | Purpose |
|------|-------------------------|---------|
| left | **0.42** | Remove **9.7cm** vertical graphic + arrow rail |
| top | **0.15** | Remove **3.5cm** horizontal graphic |
| bottom | **0.28** | Remove **“orange”** bottom callout |
| right | **0.05** | Trim minor right-edge clutter |

Calibrated iteratively: **0.34** left still showed texto fragments; **0.42** cleared visible measurement copy in review while keeping the **full product** (no 1200×1200 `cover` zoom — that mutilated the SKU).

## Steps (ordered)

1. `rotate()` — EXIF orientation.
2. **Extract** rectangle after applying insets on W×H.
3. `flatten({ background: '#ffffff' })`.
4. `trim({ threshold: 18 })` — drop uniform margins (best-effort).
5. `resize(INNER_MAX, INNER_MAX, { fit: 'inside', background: white })` with INNER_MAX **1320**.
6. `modulate({ saturation: 0.88, brightness: 1.05 })`.
7. **Composite** on **1536×1536** RGB white canvas — **geometric center** of the resized bitmap.
8. **Neutral chroma crush** on raw RGBA: near-gray pixels with luminance in **[178, 252]** and chroma spread ≤ **20** → `#ffffff` (reduces shadow “texture” while preserving saturated plastic).

## Outputs

- Writes `artifacts/ml-image-packs/product-32690/cover_main.png`
- Backs up prior file to `cover_main.pre_p75_backup_<timestamp>.png`

## Self-hosted / IA path

`mercadolibre-image-executor.service.ts` can call OpenAI/Gemini/self-hosted providers for **generation**; P75 deliberately uses **deterministic Sharp** for this listing so the cover stays **supplier-truth** and reproducible.

## ML upload pipeline interaction

`mercadolibre.service.ts` runs `image-pipeline.service.ts` `processBuffer` → JPEG before upload. Local PNG remains **1536×1536**; MercadoLibre’s upload response **`max_size`** string (e.g. `459x1200`) still appears for this SKU and is treated as **API-side subject metric**, not local file dimensions (see `P75_LIVE_COVER_REPLACEMENT.md`).

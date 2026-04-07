# P66 — Seller-feedback-truth diagnosis

**Listing:** `MLC3786354420` — **Product:** `32690`

## Primary truth source (operator)

Per sprint **active truth** (screenshots / seller UI copy):

- **“Detectamos errores en tus fotos”**
- **“Tienes fotos por revisar”**

These strings are **not** returned on `GET /items/{id}` in our `MLItemSnapshot`. **API `active` + `sub_status: []` does not disprove** seller-center photo review.

## What the repo can infer without seller HTML

| Signal | Implication |
|--------|-------------|
| P65 used **two slots** from **one** supplier URL (full + crop) | Risk of **duplicate / derivative** appearance in ML’s **visual** review (not necessarily `items` sub_status). |
| Self-hosted path historically used **SVG** for this SKU family | Prior **non-photographic** origin may have primed stricter review. |
| Single-image `replaceListingPictures` experiment (this sprint) | Produced **`paused`** + **`out_of_stock`** — see `P66_LISTING_PHOTO_REPLACEMENT.md`. |

## Most likely remaining blocker (hypothesis)

**`ml_seller_photo_quality_or_duplicate_slot_review`** — ML keeps a **parallel** seller-facing review state for **photo set quality**, **authenticity**, or **slot differentiation**, while the public API shows **active** after stock/activation fixes.

Secondary: **`insufficient_distinct_supplier_angles`** — DB still holds **one** AliExpress image URL when Dropshipping enrichment is unavailable (this run: **`no_dropshipping_credentials`**).

## Operator-guided capture (minimum next evidence)

If warnings persist after P66, record **exactly**:

1. Screenshot of the **photo** tab with any **per-image** badges (ML often marks **which** photo fails).
2. Whether ML offers **“Reemplazar” / “Corregir”** with a **reason code** or tooltip text.
3. Whether **both** thumbnails look like the **same** shot vs clearly different angles.

**Classification label:** **`unknown_due_missing_seller_feedback`** until those fields are captured — automation cannot scrape logged-in `misarticulos` without new tooling.

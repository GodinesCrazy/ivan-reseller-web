# P66 — Minimum corrective strategy

## Strategies evaluated

| Strategy | Verdict |
|----------|---------|
| **Single-image listing** (`replaceListingPictures` ×1) | **Rejected after trial** — left item **`paused`** / **`out_of_stock`**; recovered only via **`available_quantity` + activate**. |
| **Two identical bytes** (duplicate file twice) | **Rejected** — likely worsens duplicate perception. |
| **Enrich DB with more AliExpress URLs** via Dropshipping `getProductInfo` | **Preferred when creds exist** — true **second angle**. **Blocked** this run: `no_dropshipping_credentials`. |
| **One URL → full-frame cover + distinct zoom detail** | **Selected** — **non-identical** rasters, both from **real** supplier JPEG, catalog canvas, no SVG. |

## Chosen minimum path (executed)

1. **`p66-enrich-product-images.ts`** — attempt API merge of `productImages` / SKU images (skipped without creds).
2. **`p66-rebuild-supplier-catalog-pack.ts`** — `single_supplier_url_cover_plus_distinct_zoom_detail`.
3. **`p49-reactivate-ml-listing.ts`** — two uploads, replace on ML.
4. **`p66-resume-listing-stock-and-activate.ts`** — set **`available_quantity`** (3) + **`activateListing`** after pause state from step 1 mis-step was cleared.

## Rationale

Satisfies **listing-scoped** change, avoids **byte-identical** dual slots, avoids **unsafe** single-photo listing state, and restores **sellable** API posture (`active`, empty `sub_status`) while **seller UI** still needs human confirmation.

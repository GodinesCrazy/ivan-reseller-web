# P100 — Live ML image rejection analysis (32714 / MLC3804135582)

## Live observation (seller UI)

- Mercado Libre flagged **the portada (first photo)** with reason **“Contiene logos y/o textos”**.
- Second photo was not reported as problematic in the user’s review.

## What the system used as portada at publish (P99)

- **Local file:** `artifacts/ml-image-packs/product-32714/cover_main.png`
- **Generator:** P98-style **square catalog canvas** (`p98-build-ml-pack-32714.ts` / same visual recipe: supplier image on neutral canvas with resize, sharpen, saturation bump).
- **Publish order:** `[cover_main.png, detail_mount_interface.png]` → Mercado Libre picture upload → `pictures: [{id}…]` on item create.

## Why that class of asset is risky versus live ML moderation

Local gates (dimensions, square-like, `packApproved`, URL-term heuristics) **did not** model Mercado Libre’s **post-publish visual moderation** for text/logo-like structure.

The P98 portada recipe can still produce:

- High-frequency edge structure (sharpen + product + packaging) that moderators or ML classifiers associate with **overlays or commercial graphics**.
- Compositions that are still **supplier-commercial** in character even on a neutral background.

**Conclusion:** **Live ML moderation is the source of truth.** Local `publishSafe` / `packApproved` was **too optimistic** for portada until the P100 strict portada gate (below) was added.

## Runtime state discovered during P100 API work

- `GET` item (internal service): **`status: inactive`** before picture replace.
- Mercado Libre **rejects `PUT /items/{id}`** for picture updates with:  
  `Cannot update item MLC3804135582 [status:inactive, has_bids:false]`  
  and the same class of error when attempting `status: active` via API.

So **API-based picture replacement is blocked until the listing is active / hold cleared** in Mercado Libre’s seller flows.

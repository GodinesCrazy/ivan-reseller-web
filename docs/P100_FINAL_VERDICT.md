# P100 — Final verdict (32714 / MLC3804135582)

## Verdict class

**PRODUCT_32714_PARTIALLY_FIXED_STILL_UNDER_REVIEW**

## What is definitively fixed (local / pipeline)

- **Root cause of false confidence:** Local pack could approve a **P98-style portada** without **ML-aligned text/logo structural checks**.
- **Hardening:** **`cover_main` must pass `evaluateMlPortadaStrictGate`** or the canonical pack is **not** approved (`inspectMercadoLibreAssetPack`).
- **New portada asset:** Regenerated under **`artifacts/ml-image-packs/product-32714/cover_main.png`** using stricter crops + calmer grading + **1200×1200** square export; manifest notes `p100_supplier_clean_square_portada_gate`.
- **`packApproved`:** **`true`** on last inspection run tied to `p100-portada-hotfix-result.json`.

## What is not completed (Mercado Libre API reality)

- Listing **`MLC3804135582`** was **`inactive`** during the replace attempt.
- API **`PUT` to reactivate** failed with Mercado Libre’s validation: **`Cannot update item MLC3804135582 [status:inactive, has_bids:false]`**.
- Therefore **`replaceListingPictures` did not apply** new ML picture IDs to the live item in this session.

## Reason string (single sentence)

**Pipeline and disk portada are upgraded and gate-safe, but Mercado Libre keeps the item inactive, so the API cannot push the new portada until seller-center moderation / policy state allows edits.**

## Remaining blocker (exact)

- **Mercado Libre account item state:** `inactive` **with API rejection** on status/picture mutation until the **moderation / policy hold** is cleared or the listing is made editable through seller flows.

## Highest-leverage next move

In **Mercado Libre seller center**, resolve the **inactive / moderation** state for **`MLC3804135582`**, then immediately re-run:

`cd backend && npx tsx scripts/p100-hotfix-32714-portada-ml-listing.ts`

—or upload the generated **`cover_main.png`** as the new first photo in the ML UI.

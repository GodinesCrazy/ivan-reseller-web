# P106 — Live apply result (32714)

## This run

**Not executed.** No **`--try-replace-ml`** path ran because the script never reached a successful **`cover_main`** build.

## Intended behavior (when rebuild succeeds)

1. **`MercadoLibreService.replaceListingPictures(itemId, [coverPath, detailPath])`**
2. **Image order:** `[cover_main.png, detail_mount_interface.png|jpg]`
3. **Proof:** `p106-live-result.json` → **`mlPictureReplace`** (snapshot or error).

## Listing context (unchanged)

Latest known listing id from prior snapshots: **MLC3805190796** (confirm in DB / Seller Center before replace).

## Controlled republish

If replace is not allowed, use **`p101-clean-republish-32714.ts`** ( **`p106`** is now an allowed **`cover_main`** lineage mark in **`REQUIRED_COVER_SOURCE_MARKS`**).

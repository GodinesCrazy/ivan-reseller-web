# P78 — Next operational use

## For SKU 32690

- **DB:** Keep `mlImagePipeline.canonicalEvaluateLocalApprovedCover` and **`insetCrop`** as set by `p78-enable-canonical-local-cover-32690.ts` while you rely on canonical remediation for this listing.  
- **Verify before publish:** `npx tsx scripts/check-ml-image-remediation.ts 32690` → expect **`integrationLayerOutcome: remediated_pass`** or **`direct_pass`**.  
- **Persist metadata (optional):** same script with `--persist`.

## For other SKUs

- If supplier URLs never pass gates but you have a **visually approved** local pack, enable **`canonicalEvaluateLocalApprovedCover`** and consider **`insetCrop`** (or custom fractions) so **`inset_white_catalog_png`** can run.  
- To prepend hosted clean heroes, use **`canonicalSupplementUrls`** (HTTPS only).

## Removing P78 behavior

- Remove or set **`canonicalEvaluateLocalApprovedCover: false`** and clear **`insetCrop`** if you want canonical to ignore local pack / inset again for that product (canonical may return `human_review_required` again for similar supplier quality).

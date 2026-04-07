# P75 — Fallback if cleanup still fails

## If `warning_persists_same_reason` after this cover

1. **Manual inpaint / Photoshop-style cleanup** on the **inset-trimmed** supplier crop — remove any **residual** stroke fragments ML still detects (sub-pixel anti-aliased black from dimension lines).
2. **Try alternate real key** with fewer overlays, without changing product identity:
   ```bash
   npx tsx scripts/p75-build-seller-proof-cover.ts 32690 --object-key=sd8adf1f1f796411e96d94f9f8c6d45440
   ```
   Then re-run `check-ml-asset-visual-approval.ts 32690 --apply` and `p49`.
3. **Seller-center manual replace** — upload the local `cover_main.png` directly in ML UI if API path and ML’s JPEG pipeline diverge.
4. **ML support** — open case with: permalink, **before/after picture IDs** (`P75_LIVE_COVER_REPLACEMENT.md`), local **1536×1536** proof, and screenshot of persistent warning.

## If new reason is **resolution / calidad**

- Investigate **`max_size` 459×1200** from upload response vs **1536** local file.
- Options: adjust `image-pipeline.service.ts` for listing-pack uploads (e.g. optional **no-trim** / PNG path), or provide a **wider-angle** supplier shot so subject bbox is naturally broader.

## If `warning_persists_new_reason` (e.g. autenticidad)

- Stop automated rotation; gather **supplier proof** and align title/attributes — out of scope for cover-only scripts.

## Irreducible blocker (if text is printed on SKU)

If **legal/marking text is molded into the plastic** and visible in every real photo, **no crop** clears it — only **retouch** or **different SKU photography** from supplier resolves it.

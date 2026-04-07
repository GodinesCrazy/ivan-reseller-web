# P101 — Final verdict (product 32714)

## Mission outcome

The hardened **local** portada pipeline produced an on-disk `cover_main.png` that passed **`evaluateMlPortadaStrictGate`**, was **first** in the Mercado Libre publish payload, and was accepted through **real** `MarketplaceService.publishProduct` into a **new** listing **MLC3804623142**.

## FINAL PRODUCT VERDICT

**`PRODUCT_32714_REPUBLISHED_CLEANLY`** — with the caveat that “cleanly” here means: **create-listing succeeded**, Items API snapshot shows **`active`**, **`warnings: []`**, and **`good_quality_thumbnail`** on the new item. Late or off-API moderation cannot be ruled out by this stack alone.

## REAL PROOF (concise)

| Proof | Value |
|-------|--------|
| Cover path used in publish | `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32714\cover_main.png` |
| Detail path used in publish | `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32714\detail_mount_interface.png` |
| Picture order to ML | `[cover_main.png, detail_mount_interface.png]` (positions 0, 1) |
| Cover SHA-256 | `f0514738a2085f297fbd95eade925442cc8388e622953243ce991aa29fa21122` |
| New listing id | `MLC3804623142` |
| New permalink | `https://articulo.mercadolibre.cl/MLC-3804623142-rotating-table-cell-phone-holder-support-desktop-stand-fo-_JM` |
| ML item `warnings` (immediate) | `[]` |
| ML item `status` / `sub_status` (immediate) | `active` / `[]` |
| Persisted listing row | Latest `marketplace_listing` → `MLC3804623142`, `active` |
| Product row | `PUBLISHED`, `isPublished: true` |

## Blockers encountered during sprint

1. **Preflight:** Product was `APPROVED` — preflight requires `VALIDATED_READY`; resolved via `p101-set-validated-ready-32714.ts`.
2. **App duplicate guard:** Stale `marketplace_listing` row triggered false “already published” even with `duplicateListing: true`; fixed by threading `duplicateListing` into `publishToMercadoLibre` (`allowDuplicateListing`).
3. **Pack assets:** Canonical pack lacked PNGs until `p98` + `p100 --build-only` were run.

**Remaining blockers:** none for republish at time of success.

## NEXT STEP (single highest-leverage)

**Monitor listing `MLC3804623142` in seller tools for 24–48h** (moderation messages / listing health). If ML raises portada again, diff **`GET /items/MLC3804623142`** `pictures[0]` derivative vs local `cover_main.png` and compare to prior `poor_quality_thumbnail` item to target one additional guardrail metric (likely **contrast fragmentation** — gate metric `highContrastBlockPct` was **0.39** vs fail **0.40**).

# P99 — Final verdict (product 32714)

## Verdict

**PRODUCT_32714_PUBLISHED_SUCCESSFULLY**

## Reason (runtime-backed)

1. **Preflight immediately before publish:** `ready_to_publish`, `publishAllowed: true`, `listingSalePriceUsd: 12`, ML connection OK, image pack approved (`p99-publish-result.json` → `preflightRecheck`).
2. **Controlled publish** used the production code path `MarketplaceService.publishProduct` → `publishToMercadoLibre` → `MercadoLibreService.createListing`.
3. **ML returned** a live item id **`MLC3804135582`**, permalink under **articulo.mercadolibre.cl**, status **`active`**, **2** pictures, **no** warnings in the item payload.
4. **Ivan Reseller DB** shows `products` **32714** as `PUBLISHED` with `publishedAt` set, and **`marketplace_listings`** row **1366** storing the same `listingId` / `listingUrl` / `active`.

## Engineering note (not a blocker)

- First publish attempt failed because `parseImageUrls` ignored local pack paths; **fixed** in `marketplace.service.ts` for Mercado Libre only so local approved assets can flow through the same publish path as production.

## Remaining blockers

**None** for “create listing + persist in Ivan Reseller” for this product on this run.

## Next step (single highest leverage)

Monitor the live listing (stock, ML policy, first sale) and ensure operational webhooks/reconciliation jobs treat **`MLC3804135582`** as the canonical ML publication for product **32714**.

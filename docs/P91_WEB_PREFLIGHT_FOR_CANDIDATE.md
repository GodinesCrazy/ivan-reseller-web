# P91 — Web preflight for this candidate

## Intended path

`GET /api/products/:internalProductId/publish-preflight?marketplace=mercadolibre`  
→ `buildMercadoLibrePublishPreflight` (`mercadolibre-publish-preflight.service.ts`)

## Execution in this sprint

**NOT RUN.** There is **no internal product id** bound to AliExpress `1005009130509159` in the workspace evidence, and this closure did not perform an authenticated call against a deployment.

## What would be captured when run (contract)

Per `docs/P89_WEB_PREFLIGHT_READINESS_CONTRACT.md`:

- `images.publishSafe`, `canonicalPricing`, `language`, `credentials`, `postsale`, `overallState`, `blockers`, `nextAction`, `publishAllowed`

## Honest classification

- **Preflight for this candidate:** **not proven** — **blocked upstream** (no product row + no runtime).

## Exact next action

1. Create `Product` with `aliexpressUrl` pointing to this item and **`aliexpressSku` = gray skuId** from DS API.  
2. Drive product to **`VALIDATED_READY`** per preventive workflow.  
3. Call preflight with that **`id`**.

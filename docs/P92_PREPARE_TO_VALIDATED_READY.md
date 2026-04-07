# P92 — Prepare to VALIDATED_READY + preflight

## Preflight (executed path in script)

When a product row exists, the script calls:

`buildMercadoLibrePublishPreflight({ userId, productId, isAdmin: true })`  
→ `GET /api/products/:id/publish-preflight` equivalent truth.

## This sprint

**Preflight not run** — no `productId` was created.

## Expected state before `ready_to_publish`

Typical blockers for a fresh `PENDING` product (from P89 contract):

- `blocked_product_status` — need **`VALIDATED_READY`** (preventive pipeline: freight truth for CL, `prepareProductForSafePublishing`, etc.).  
- Possible `blocked_images`, `blocked_pricing`, `blocked_credentials`, `blocked_postsale_readiness` depending on env.

**Do not** set `VALIDATED_READY` manually in DB — that would bypass fail-closed economics and images.

## Exact next action

1. Complete P92 DS + product row.  
2. Run Chile freight / destination enrichment scripts already used in repo (e.g. ML Chile freight passes) if required for this SKU.  
3. Drive **`prepareProductForSafePublishing`** outcome via the normal workflow until status **`VALIDATED_READY`**.  
4. Re-run preflight and save `artifacts/p92/p92-preflight-product-{id}.json`.

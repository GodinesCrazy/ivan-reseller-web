# P90 — Exact test entry conditions (when blockers are closed)

> **Note:** Final P90 verdict is **NOT_READY**. Use this checklist **only after** `P90_MINIMUM_BLOCKER_SET.md` items are closed with evidence.

## Preconditions (all required)

1. Deployment URL, DB, Redis, secrets match runbook.  
2. ML production (or agreed sandbox) OAuth for the publishing account.  
3. `WEBHOOK_SECRET_MERCADOLIBRE` set; ML notifications point to `POST …/webhooks/mercadolibre`; at least one **verified** inbound event recorded (`webhook_event_proof:mercadolibre` or equivalent logs).  
4. AliExpress Dropshipping API token valid for the **same** `userId` that owns the product.  
5. Single SKU: **VALIDATED_READY**, Chile freight truth if MLC/CL, `aliexpressUrl` valid, `marketplaceListing` will exist after publish.  
6. `GET /api/products/:id/publish-preflight?marketplace=mercadolibre` → `ready_to_publish`.  
7. Capital / limits / `AUTO_PURCHASE_*` posture explicitly agreed for the test.  
8. If using strict post-sale gate: `ML_WEB_PUBLISH_REQUIRE_ML_WEBHOOK_SECRET=true`.

## Operator steps

1. Open Product Preview with `marketplace=mercadolibre`; confirm preflight card green.  
2. Publish via approved web flow; store `listingId` / permalink.  
3. Third-party (or designated buyer) completes purchase on ML.  
4. Monitor backend logs `[WEBHOOK_MERCADOLIBRE]`, DB order row, then fulfill outcome / manual queue.

## Success criteria

- Webhook returns 200, proof row updated, order created with correct `listingId` / marketplace order reference.  
- Fulfill ends in **expected terminal state** (purchased with supplier id, or documented manual path with reason).  
- No silent mismatch between listing price and `preventivePublish.listingSalePriceUsd` (drift guard).

## Abort conditions

- Preflight not green.  
- Webhook secret missing when strict flag on.  
- Duplicate listing / ML API hard failure.  
- Autopilot or capital guard triggers unexpected spend — **stop** and switch to manual per runbook.

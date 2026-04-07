# Phase 6 Connectors Ready

Date: 2026-03-20
Scope: Production Railway backend + real marketplace APIs + real production database
Deployment: Railway backend deploy `98961105-3df4-4160-8518-6f082487ae2e`

## Final Status

Result: `NOT READY`

Phase 6 is not complete yet.

What is now verified as working:
- eBay production connector is operational with real APIs.
- eBay order retrieval works against the live Sell Fulfillment API.
- Real marketplace order sync works and reads live production data.
- Real order records keep buyer name and shipping address truth in the database.

What is still blocking readiness:
- Production webhook secrets are not configured for eBay, MercadoLibre, or Amazon.
- There is no Amazon webhook route implemented in the backend.
- No newly observed live webhook event was captured after deploy, so event-driven order creation was not re-verified in production during this pass.
- The real eBay order currently in the system still fails supplier purchase with `SKU_NOT_EXIST`.
- A real authenticated `GET /api/orders` call over public production HTTP could not be completed from this environment because no valid operator session was available and the local JWT secret does not match Railway production.

## Changes Applied

### 1. eBay operational truth fix

Production was falsely reporting eBay as broken because the health path depended on `GET /sell/account/v1/account`, which returned `Resource not found` even while real commerce APIs were working.

Code changes deployed:
- `backend/src/services/ebay.service.ts`
  - Replaced the brittle account-only connection test with a real operational probe covering:
    - `GET /sell/fulfillment/v1/order`
    - `GET /sell/inventory/v1/location`
    - `GET /sell/account/v1/fulfillment_policy`
- `backend/src/services/api-availability.service.ts`
  - Stopped forcing eBay into degraded state when `SAFE_AUTH_STATUS_MODE` is enabled.
  - Kept bounded live checks with timeout and cache protection.

### 2. Production deploy

Railway build succeeded and the new container booted successfully.

Verified:
- internal health endpoint reachable
- service started on port `8080`
- deployment logs showed normal backend startup

## Real Validation

### A. eBay status

Endpoint:
- `GET /api/internal/ebay-connection-test`

Before deploy:
- `{"success":false,"message":"eBay account info error: Resource not found"}`

After deploy:
- `{"success":true,"message":"eBay orders, inventory, and fulfillment APIs are operational"}`

Conclusion:
- `eBay operational = true`

### B. eBay scopes and policy surfaces

Endpoint:
- `GET /api/internal/ebay-policies-diagnostic`

Verified live after deploy:
- inventory locations: `200`
- fulfillment policies: `200`
- payment policies: `200`
- return policies: `200`

Verified live objects:
- inventory locations present: `2`
- fulfillment policies present: `3`
- payment policies present: `2`
- return policies present: `1`

Conclusion:
- inventory scope works
- fulfillment/account policy scope works
- seller account is reachable on the operational surfaces needed for real listing and order flow

### C. Webhook status

Endpoint:
- `GET /api/webhooks/status`

Live result:

```json
{
  "ebay": { "configured": false },
  "mercadolibre": { "configured": false },
  "amazon": { "configured": false }
}
```

Conclusion:
- no production webhook secret is configured for any marketplace
- webhook integrity is not ready

Important security note:
- current middleware behavior does **not** hard-reject unsigned webhooks when the secret is missing; it logs a warning and continues
- this means webhook readiness is still unverified and signature enforcement is not production-safe while secrets are absent

### D. Order sync validation

Real sync executed directly against production data and production credentials:
- eBay sync
- MercadoLibre sync
- Amazon sync

Live sync result:

```json
{
  "before": 1,
  "after": 1,
  "delta": 0,
  "ebayResult": [
    {
      "marketplace": "ebay",
      "userId": 1,
      "fetched": 1,
      "created": 0,
      "skipped": 1,
      "createdUnmapped": 0,
      "errors": []
    }
  ],
  "mlResult": {
    "marketplace": "mercadolibre",
    "userId": 1,
    "fetched": 0,
    "created": 0,
    "skipped": 0,
    "errors": []
  },
  "amzResult": {
    "marketplace": "amazon",
    "userId": 1,
    "fetched": 0,
    "created": 0,
    "skipped": 0,
    "errors": [
      "Amazon credentials not found or inactive"
    ]
  }
}
```

Conclusion:
- eBay sync is real and operational
- MercadoLibre has no retrievable live orders right now
- Amazon order sync is blocked by inactive credentials

### E. Real order truth

Latest real marketplace order in production:

```json
{
  "id": "cmmwp9eo000015j48dt3qrqhh",
  "userId": 1,
  "status": "FAILED",
  "customerName": "Jenuin Santana Navarro",
  "customerEmail": "buyer@unknown.com",
  "paypalOrderId": "ebay:17-14370-63716",
  "aliexpressOrderId": null,
  "createdAt": "2026-03-18T23:56:08.449Z"
}
```

Verified stored shipping address:
- address line present
- city present
- state present
- zip code present
- country present
- phone present

Conclusion:
- real buyer and shipping data are being stored
- no fake marketplace order was introduced during this phase

### F. Event -> fulfillment flow

Verified from the real stored order:
- marketplace order exists
- automatic fulfillment was attempted
- order moved to `FAILED`
- `fulfillRetryCount = 1`
- failure reason stored in `errorMessage`

Live failure:
- `AliExpress Dropshipping API failed`
- supplier response includes `SKU_NOT_EXIST`

What is proven:
- the system does reach the purchase-attempt stage for the real eBay order
- failure is visible in backend truth

What is not newly proven in this pass:
- a fresh live webhook event reaching production after deploy
- a fresh webhook-created order flowing from event receipt to automatic purchase inside the current deployment window

## Failure Visibility

Verified in code:
- frontend has failed/manual fulfillment handling in:
  - `frontend/src/pages/Orders.tsx`
  - `frontend/src/pages/OrderDetail.tsx`
  - `frontend/src/pages/PendingPurchases.tsx`
  - `frontend/src/services/orders.api.ts`

Verified backend actions:
- force fulfill endpoint exists
- promote to manual fulfillment endpoint exists

Not fully runtime-verified in production UI during this pass:
- operator visibility on the live deployed frontend for the current failed order

Reason:
- no valid production operator session was available from this environment after the default admin lockout change

## Blocking Issues

### Critical blockers

1. Webhook secrets missing in production
- eBay: not configured
- MercadoLibre: not configured
- Amazon: not configured

2. Amazon webhook ingestion missing
- backend has no `/api/webhooks/amazon` handler

3. Amazon real order flow blocked
- production sync reports `Amazon credentials not found or inactive`

4. Supplier fulfillment still failing on real order
- latest real eBay order fails with `SKU_NOT_EXIST`

5. No fresh live webhook event captured after deploy
- event-driven production automation remains only partially verified

### Security blocker

6. Unsigned webhook acceptance when secret is missing
- current middleware continues when webhook secret is absent
- this must be tightened before declaring connector readiness

## Verdict By Task

### Task 1 — eBay operational fix

Status: `DONE`

Verified:
- token refresh works
- orders endpoint works
- inventory endpoint works
- fulfillment policy endpoint works
- production eBay connection test now returns success

### Task 2 — Webhooks setup

Status: `NOT DONE`

Verified blockers:
- secrets absent in production
- no Amazon webhook route
- no fresh live webhook event observed

### Task 3 — Order sync validation

Status: `PARTIAL`

Verified:
- real eBay sync works
- real order remains visible in production DB

Blocked:
- public authenticated `GET /api/orders` was not verifiable from this environment without a valid production operator session

### Task 4 — Event to fulfillment flow

Status: `PARTIAL`

Verified:
- real order reached automatic purchase-attempt stage
- failure recorded with supplier error

Not verified in this pass:
- fresh post-deploy webhook-driven event

### Task 5 — Failure visibility

Status: `PARTIAL`

Verified:
- backend manual fallback exists
- frontend code includes failed/manual order handling

Not verified:
- live operator UI rendering in production for the current failed order

### Task 6 — Final validation

Status: `NOT READY`

Readiness criteria check:
- eBay operational = `true`
- webhooks working = `false`
- orders sync working = `partial`
- fulfillment triggered automatically = `partial`

## Next Required Actions

1. Configure real Railway production webhook secrets for eBay, MercadoLibre, and Amazon.
2. Add and deploy a real `/api/webhooks/amazon` handler.
3. Register real marketplace webhook subscriptions that target the production backend.
4. Tighten webhook middleware so missing secrets do not silently allow unsigned webhook traffic.
5. Repair supplier mapping for the live eBay order path so `SKU_NOT_EXIST` is resolved before purchase.
6. Re-run a live end-to-end test only after a real webhook event or real new marketplace order is observed.


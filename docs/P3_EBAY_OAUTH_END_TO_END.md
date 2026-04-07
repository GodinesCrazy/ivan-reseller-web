# P3 eBay OAuth End-to-End

## Goal

Prove that the eBay connector is actually usable, not just “configured”.

## Implemented Changes

- Added `https://api.ebay.com/oauth/api_scope/commerce.notification.subscription` to:
  - `backend/src/services/marketplace.service.ts`
  - `backend/src/api/routes/marketplace-oauth.routes.ts`
  - `backend/src/services/ebay.service.ts`
- Preserved the previously hardened callback persistence validation.

## Real Proof Achieved

`npx tsx scripts/fetch-ebay-order-api.ts 1 17-14370-63716 --list`

Produced real Sell Fulfillment API data:

- `orderId = 17-14370-63716`
- real buyer data returned
- real shipping address returned
- `fulfillmentStatus = NOT_STARTED`
- the connector refreshed the access token automatically before the request

This proves:

- stored production eBay credentials are readable
- refresh-token flow is usable
- real production eBay Orders API is reachable

## Limitation

A fresh interactive browser OAuth cycle was not completed in this session. So P3 reached:

- `connector usable = YES`
- `fresh local browser OAuth cycle re-executed = NO`

## Important operational note

The operator informed us that this eBay order was manually cancelled directly in eBay because it was not profitable. Even though the Sell Fulfillment API still returns it as `NOT_STARTED`, this order must **not** be used as proof of profitable sales readiness.

# P92 — Order → fulfill proof unlock

## Dependency

1. Webhook (or manual order) creates **`Order`** linked to `Product` + `marketplaceListing`.  
2. `fulfillOrder` can run with valid AliExpress DS + capital guards + `aliexpressUrl` + `aliexpressSku`.

## This sprint

**Unchanged / not unlocked** — no order row for this candidate.

## Classification

**fulfill_not_proven** for this SKU.

## Exact next step

After webhook proof: supervised low-risk fulfill (or internal test handler extended with explicit `productId` for this row) and capture terminal state + supplier order id or documented manual reason.

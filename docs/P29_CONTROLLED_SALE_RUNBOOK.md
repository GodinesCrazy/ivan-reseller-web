# P29 Controlled Sale Runbook

Date: 2026-03-22
Primary candidate: `32690`
Backup candidate: `32691`

## Goal

Run exactly one controlled MercadoLibre Chile sale to produce real business proof, not scale.

## Who Buys

- A trusted operator-controlled buyer account that is not the seller account.
- Real Chile delivery address.
- Real payment method.
- One unit only.

## When To Buy

- Only after `ENABLE_ML_PUBLISH=true` is intentionally enabled.
- Only after the single listing is visible on MercadoLibre Chile with a real `listingId` and permalink.
- Only during a monitored operator window so order ingestion and supplier purchase can be observed immediately.

## Exact Monitoring Checklist

1. Publish only candidate `32690` in `STAGING_REAL` / limit `1`.
2. Capture MercadoLibre listing proof:
   listingId
   permalink
   seller-side screenshot
   buyer-side visible listing screenshot
3. Buyer purchases exactly one unit.
4. Monitor order ingestion in two ways:
   webhook path if enabled
   manual polling fallback via `POST /api/orders/sync-marketplace`
5. Confirm internal order proof:
   `paypalOrderId = mercadolibre:{mlOrderId}`
   mapped `productId = 32690`
   status reaches at least `PAID`
6. Observe supplier purchase attempt:
   automatic path via `orderFulfillmentService.fulfillOrder(order.id)`
   if auto purchase fails, use manual fallback `POST /api/orders/:id/mark-manual-purchased`
7. Capture supplier purchase proof:
   AliExpress order number
   supplier checkout screenshot
   payment confirmation screenshot
8. Capture tracking truth:
   tracking number stored internally
   if needed, submit manually through `POST /api/orders/:id/submit-tracking`
9. Wait for delivered truth:
   marketplace delivery state
   internal sale/order state progression
10. Wait for released-funds and payout truth:
    production sale reaches commercially valid completed state
    payout executed

## Screenshots / Logs Required

- MercadoLibre listing created page
- MercadoLibre buyer checkout confirmation
- Internal order row after sync/webhook
- AliExpress supplier order confirmation
- Tracking number screen
- MercadoLibre delivered state
- Sale row showing payout execution

## Required State Transitions

- `candidate VALIDATED_READY`
- `listing published`
- `MercadoLibre order ingested`
- `order status PAID`
- `order status PURCHASED` with real `aliexpressOrderId`
- `sale created`
- `tracking attached`
- `delivered/completed`
- `payoutExecuted=true`

## If Webhooks Stay Off

The sale is still runnable, but the operator must:

- call `POST /api/orders/sync-marketplace`
- verify order creation manually
- watch the order queue until supplier purchase and tracking are confirmed

## Abort Conditions

- Candidate publish fails before listing is visible
- MercadoLibre rejects listing payload
- No real buyer purchase occurs
- Supplier checkout requires data not captured by the current flow and cannot be completed manually
- Any attempt would require publishing more than one candidate

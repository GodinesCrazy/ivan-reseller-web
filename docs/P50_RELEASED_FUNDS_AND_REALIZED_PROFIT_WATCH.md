# P50 Released Funds And Realized Profit Watch

## Current stage against the proof model

Current truthful stage:

- `listing_active_no_order_yet`

That means all later business proof remains absent.

## Exact evidence still required for released-funds proof

- real MercadoLibre order id
- internal order row linked to `mercadolibre:{mlOrderId}`
- real supplier purchase proof with non-test `aliexpressOrderId`
- truthful tracking / shipment progression
- delivered/completed marketplace truth
- production sale reaching a commercially valid completed state
- `payoutExecuted=true`

## Exact evidence still required for realized-profit proof

- released-funds proof already obtained
- production sale, not simulated
- positive `netProfit`
- payout execution succeeded

## Current gap snapshot

As of P50:

- no real MercadoLibre buyer order
- no internal order row for `32690`
- no supplier purchase proof
- no tracking proof
- no delivered truth
- no released-funds proof
- no realized-profit proof

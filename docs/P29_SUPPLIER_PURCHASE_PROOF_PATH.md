# P29 Supplier Purchase Proof Path

Date: 2026-03-22

## Classification

`purchase_path_partially_ready`

## Automatic Path That Already Exists

1. MercadoLibre order is ingested by webhook or by `POST /api/orders/sync-marketplace`.
2. A real internal `order` row is created with `paypalOrderId = mercadolibre:{mlOrderId}`.
3. The system calls `orderFulfillmentService.fulfillOrder(order.id)`.
4. `fulfillOrder()` resolves the AliExpress product URL and SKU, sets `PURCHASING`, and calls `purchaseRetryService.attemptPurchase(...)`.
5. If AliExpress returns a real supplier order id, the order is updated to:
   `status = PURCHASED`
   `aliexpressOrderId = real supplier order id`
6. `saleService.createSaleFromOrder(orderId)` is triggered automatically after `PURCHASED`.

## Manual Backstops That Already Exist

- `POST /api/orders/sync-marketplace`
  manual/polling ingestion if webhook automation is absent
- `POST /api/orders/:id/mark-manual-purchased`
  operator can continue lifecycle after a real manual AliExpress purchase
- `POST /api/orders/:id/submit-tracking`
  operator can attach supplier tracking and push it back to MercadoLibre

## Exact Proof That Can Be Captured

If the first controlled sale reaches supplier purchase successfully, the project can capture:

- real MercadoLibre order id
- real internal order row
- real AliExpress supplier order id
- real purchase timestamp
- real tracking number

## Exact Remaining Supplier-Purchase Blocker

Chile supplier checkout realism is still not fully proven.

Persisted product readiness evidence still says:

- `classification = absent_but_likely_required`
- reason: `AliExpress trade.buy.placeorder is expected to require rut_no for Chile, but the current checkout request shape does not model it yet.`

That means:

- automatic purchase infrastructure exists
- manual recovery exists
- but the first real Chile supplier checkout may still require data the current automatic request shape does not yet capture

## Why This Is Partial, Not Fully Ready

- There is still no real production `PURCHASED` order on a non-test AliExpress item proving the path end to end.
- `rut_no` realism remains unproven for Chile.
- Webhook automation is not configured, so ingestion cannot yet be called fully automatic.

## Operational Conclusion

The first controlled sale can proceed only with an operator prepared to:

- watch the order ingestion manually if needed
- complete the AliExpress supplier purchase manually if `rut_no` or checkout realism blocks the automatic attempt
- capture the supplier order proof immediately

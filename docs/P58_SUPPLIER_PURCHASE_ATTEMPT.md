# P58 — Supplier Purchase Attempt

Date: 2026-03-24  
Sprint: P58 — Controlled Commercial Proof Path

## Objective

If a real order exists, capture the supplier purchase truth.

## Precondition

**No real order exists.** P50 reported zero matching MercadoLibre orders and zero internal `mercadolibre:` orders for productId 32690. P58 could not run live checks due to DB connection limits, but no new order has been reported.

## Supplier Purchase Path (when order exists)

### Automatic Path

1. Order ingested (webhook or `POST /api/orders/sync-marketplace`).
2. Order created with `paypalOrderId=mercadolibre:{mlOrderId}`, `productId=32690`, `status=PAID`.
3. `mercadolibre-order-sync.service` (or webhook) calls `orderFulfillmentService.fulfillOrder(newOrder.id)`.
4. `fulfillOrder` → resolves AliExpress URL/SKU → `purchaseRetryService.attemptPurchase(...)`.
5. Success: `status=PURCHASED`, `aliexpressOrderId=<real supplier order id>`.
6. `saleService.createSaleFromOrder(orderId)` triggered after PURCHASED.

### Manual Backstops

| Route | Purpose |
|-------|---------|
| `POST /api/orders/:id/mark-manual-purchased` | Operator completes AliExpress purchase manually, submits aliexpressOrderId |
| `POST /api/orders/:id/submit-tracking` | Attach tracking and push to MercadoLibre |

## Blocker Classification (for when attempt is made)

| Blocker | Meaning |
|---------|---------|
| rut_no_required | Chile requires RUT; checkout shape does not model it |
| checkout_shape_incomplete | Missing required checkout fields |
| payment_blocked | AliExpress/PayPal payment failed |
| supplier_rejected | Supplier rejected order |
| unknown_purchase_failure | Unclassified failure |

## P29 Supplier-Purchase Readiness

Per `P29_SUPPLIER_PURCHASE_PROOF_PATH.md`:

- `classification = absent_but_likely_required` for rut_no
- Automatic purchase infrastructure exists
- Manual recovery exists
- First real Chile supplier checkout may require data not yet in automatic request shape

## P58 Supplier Purchase Result

**Status:** NOT ATTEMPTED — no order to fulfill.

## When an Order Exists

1. Run `p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420` (or equivalent) to capture:
   - `internalOrders` with status, aliexpressOrderId
   - `latestSale` if created
   - `furthestStage` from `classifyStage`
2. If `fulfillOrder` fails: capture `errorMessage`, `failureReason` from Order row; classify blocker.
3. If manual purchase is used: call `POST /api/orders/:id/mark-manual-purchased` with real aliexpressOrderId.

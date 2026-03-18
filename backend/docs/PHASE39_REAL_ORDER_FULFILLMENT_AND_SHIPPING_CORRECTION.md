# Phase 39 — Real Order Fulfillment + Shipping Correction Engine

This document implements the **Real Order Fulfillment and Shipping Correction** behavior for the first real eBay sale (order `17-14370-63716`).

## Critical context

- **Order ID (eBay):** `17-14370-63716`
- **Buyer:** Jenuin Santana Navarro  
  calle 12 par. 41 San Isidro  
  Canovanas, PR 00729-2831  
  United States
- **System must:** detect order → purchase from AliExpress → ship to this address → update tracking in eBay (without using eBay label when ship-from is outside US).

---

## Implemented behavior

### Phase 1–2 — Order validation

- **Order exists:** [order-fulfillment.service.ts](../src/services/order-fulfillment.service.ts) loads order by `orderId`; if not found, returns `FAILED` with "Order not found".
- **Payment status:** Only orders with `status === 'PAID'` are fulfilled.
- **No duplicate purchase:** If `status` is `PURCHASED` or `PURCHASING`, fulfillment returns immediately with "Order already processed or in progress".

### Phase 2 — Product mapping

- **Product URL:** Fulfillment requires `order.productUrl`; if missing, order is marked `FAILED` with "Product URL missing" and notification is sent (manual order path).
- **Shipping address:** Parsed from `order.shippingAddress` (JSON or fallback format). Invalid address → `FAILED` + notification.

### Phase 3 — Shipping origin correction

- **Dropship only:** Shipping is **supplier → buyer**. No Chile (or any non-US address) is used as ship-from when updating eBay.
- **eBay label error:** If eBay returns *"ship from address must be in the United States"*, the system must **not** use eBay’s label purchase. Use **shipped externally** with AliExpress tracking (see Phase 8).

### Phase 4–5 — Auto purchase and failsafe

- **Capital check:** [working-capital.service](../src/services/working-capital.service.ts) ensures sufficient free capital before purchase.
- **If insufficient funds:** Order is set to `FAILED` with `FAILED_INSUFFICIENT_FUNDS`; [markFailed](../src/services/order-fulfillment.service.ts) sends notification: *"Action required: order pending fulfillment"* and the order appears in **Orders to Fulfill** (Compras pendientes).

### Phase 5 (frontend) — Orders to Fulfill

- **Pending purchases API:** `GET /api/sales/pending-purchases` returns:
  - Sales in `PENDING` / `PROCESSING` (need purchase).
  - **Phase 39:** Orders with `status = FAILED` are appended so they appear in the same list with `isFailedOrder: true` and optional `errorMessage`.
- **UI:** [PendingPurchases.tsx](../../frontend/src/pages/PendingPurchases.tsx) shows "Order failed — fulfill manually" and the error message for failed orders.

### Phase 8 — eBay shipping error handling

- **Do not use eBay label** when ship-from is outside the US (e.g. Chile).
- **Correct flow:** Mark as **shipped externally** and use tracking from AliExpress. Internal tracking is stored in `Sale.trackingNumber` / `PurchaseLog.trackingNumber`; any eBay API call to mark the order shipped must use “external” shipment with that tracking, not eBay-purchased labels.

### Phase 10 — Processing order `17-14370-63716`

1. **Ensure order exists in DB** with `status = PAID` (e.g. created by PayPal capture or webhook).
2. **Trigger fulfillment:**
   - If order is **PAID:** Fulfillment runs automatically from:
     - PayPal capture: [paypal.routes.ts](../src/api/routes/paypal.routes.ts) → `fulfillOrder(order.id)`
     - Webhook: [webhooks.routes.ts](../src/api/routes/webhooks.routes.ts) → `fulfillOrder(order.id)`
     - Cron: [process-paid-orders.service.ts](../src/services/process-paid-orders.service.ts) (batch PAID → fulfill)
   - If order is **FAILED** (e.g. insufficient funds) and error is `FAILED_INSUFFICIENT_FUNDS`, use **Retry fulfill:**
     - `POST /api/orders/:id/retry-fulfill` with `id = 17-14370-63716` (if that is the internal Order `id` in the database).
3. **Verify:** After success, order should have `status = PURCHASED` and `aliexpressOrderId` set. Then add tracking to the Sale and, if applicable, update eBay as shipped externally with that tracking.

**Note:** The eBay order ID `17-14370-63716` may be stored in `Order.paypalOrderId` or in metadata; the internal Order `id` in the app is a CUID. Use the **Orders** page in the UI or `GET /api/orders` to find the row for this eBay order (match by `paypalOrderId` or creation time), then call `POST /api/orders/:id/retry-fulfill` with that internal `id` (only when the order is FAILED with `FAILED_INSUFFICIENT_FUNDS` and retry count &lt; 3). For other failures (e.g. ship-from error), complete the purchase manually via **Orders to Fulfill** and then add tracking to the Sale / eBay as shipped externally.

---

## Files touched (Phase 39)

| File | Change |
|------|--------|
| [order-fulfillment.service.ts](../src/services/order-fulfillment.service.ts) | Comment: shipping origin = supplier→buyer; no eBay label from Chile. Guard: skip if already PURCHASED/PURCHASING. |
| [sales.routes.ts](../src/api/routes/sales.routes.ts) | `GET /api/sales/pending-purchases`: include FAILED orders with `isFailedOrder` and `errorMessage`. |
| [PendingPurchases.tsx](../../frontend/src/pages/PendingPurchases.tsx) | Support `isFailedOrder` and `errorMessage`; show "Order failed — fulfill manually" and error text. |
| [phase39_real_order_fulfillment_and_shipping_correction_prompt.md](../../phase39_real_order_fulfillment_and_shipping_correction_prompt.md) | Prompt spec (repo root). |

---

## Success criteria (order `17-14370-63716`)

- ✔ Purchased from supplier (AliExpress).
- ✔ Shipped to correct address (Jenuin Santana Navarro, Canovanas, PR 00729-2831, US).
- ✔ Tracking stored (Order / Sale / PurchaseLog as applicable).
- ✔ eBay updated (shipped externally with tracking, no US ship-from label when operator is in Chile).

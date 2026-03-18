# Phase 42 — Full Post-Sale System Audit & Fixes

**Date:** 2025-03-18  
**Context:** Real eBay sale (orderId 17-14370-63716, US$68.47, buyer Jenuin Santana Navarro) not reflected consistently; fulfillment not executed or not visible.

---

## Phase 1 — System Audit Results

### Task 1 — Trace the order end-to-end

| Step | Where | Status |
|------|--------|--------|
| Order enters | `POST /api/webhooks/ebay` → `recordSaleFromWebhook()` in `webhooks.routes.ts` | ✅ Implemented |
| Stored in DB | `Order` created with `status: PAID`, `paypalOrderId: "ebay:{ebayOrderId}"` | ✅ Single ingestion |
| Triggers fulfillment | `orderFulfillmentService.fulfillOrder(order.id)` immediately after create | ✅ Called |
| Where it can get lost | (1) Webhook not received (signature/config). (2) `listingId` missing or no `MarketplaceListing`. (3) Product has no `aliexpressUrl`. (4) Fulfillment fails (limits, capital, AliExpress error) → Order stays PAID/FAILED, no Sale. (5) **Bug (fixed):** GET /api/orders with `environment` returned only orders that had a Sale → PAID/FAILED orders without Sale were hidden. |

### Task 2 — Breakpoints

- **eBay ingestion:** Webhook handler exists; signature validator `createWebhookSignatureValidator('ebay')`; payload parsed from multiple shapes (`listingId`, `orderId`, `amount`, `buyer`, `shippingAddress`). If `listingId` is missing → 400.
- **DB persistence:** Order is created in `recordSaleFromWebhook`; idempotency by `paypalOrderId` (ebay:17-14370-63716).
- **Event triggers:** Fulfillment is triggered synchronously after Order create. On PURCHASED, `createSaleFromOrder(orderId)` is called inside `order-fulfillment.service`.
- **Fulfillment execution:** `purchaseRetryService.attemptPurchase` → AliExpress (Dropshipping API or fallback). Failure → Order marked FAILED, `errorMessage` set, user notified.

### Task 3 — Frontend data inconsistency

| Page / API | Data source | Issue (before fix) |
|-------------|-------------|--------------------|
| Dashboard stats | `saleService.getSalesStats()` → Sale table only | Orders without Sale (PAID/FAILED) not counted in “sales” (by design: Sale = completed cycle). |
| Dashboard inventory-summary | `prisma.order.groupBy` + Sale counts | Uses Order for order counts → consistent. |
| **GET /api/orders** | Orders filtered by… | **Bug:** When `environment` was sent, only orders that had a Sale were returned → PAID/FAILED orders without Sale disappeared from Órdenes. **Fixed.** |
| GET /api/sales | Sales + “orphan” Orders (eBay/ML/Amazon without Sale) as virtual rows | ✅ Merged view already in place. |
| Ventas (Sales.tsx) | GET /api/sales | ✅ Shows real + virtual sales. |
| Órdenes (Orders.tsx) | GET /api/orders | ✅ Now shows all orders (fix below). |
| Control center | Dashboard + inventory-summary | ✅ Uses Order counts. |

---

## Phase 2 — Fixes Applied (Sales Visibility)

### Task 4–5 — Single source of truth / Remove contradictions

- **Single source for “something sold”:** `Order` table is the single ingestion point (webhook and sync create Order). Sale is created only after successful fulfillment (`createSaleFromOrder`).
- **GET /api/orders** no longer filters by “orders that have a Sale”. It returns **all** orders for the user (and all for admin). So PAID, PURCHASING, PURCHASED, FAILED all appear; no sale is hidden.

### Task 6 — Real-time sync

- `marketplace-order-sync.service` runs on an interval (5–10 min). `GET /api/sales/sync-status` exposes `lastSyncAt`. No code change required for sync frequency.

---

## Phase 3–4 — Post-sale pipeline and state machine

- **Trigger when PAID:** Already in place: `recordSaleFromWebhook` creates Order with status PAID and immediately calls `fulfillOrder(order.id)`.
- **Order states (current):** CREATED | PAID | PURCHASING | PURCHASED | FAILED. Mapped in UI with `OrderStatusBadge`: Por comprar (PAID), Comprando (PURCHASING), Comprado (PURCHASED), Fallido (FAILED).

---

## Phase 5–8 — Purchase execution, pending queue, retry, tracking

- **Execute purchase:** Handled by `order-fulfillment.service` + `purchase-retry.service` + AliExpress (API or browser).
- **Pending purchases:** `GET /api/sales/pending-purchases` returns PENDING/PROCESSING sales and FAILED orders; frontend “Compras pendientes” shows buyer, product, supplier link, amount.
- **Retry:** `POST /api/orders/:id/retry-fulfill` for FAILED orders with `FAILED_INSUFFICIENT_FUNDS` and `fulfillRetryCount < 3`.
- **Tracking:** `POST /api/orders/:id/submit-tracking` stores tracking and can be sent to marketplace.

---

## Phase 9 — UX and clarity

- **Order detail (Task 19–20):** `OrderDetail.tsx` updated to show:
  - Buyer (name, email)
  - Full shipping address (parsed from `shippingAddress` JSON)
  - Product (title), status (badge), amount
  - Tracking (AliExpress order ID + Sale tracking when present)
  - Payment/fulfillment state (Order status badge)
  - Marketplace order ID (e.g. eBay 17-14370-63716) when available
- **GET /api/orders/:id** now returns `marketplaceOrderId` and `sale: { id, status, trackingNumber }` for the unified view.
- **GET /api/orders/by-ebay-id/:ebayOrderId** added to find an order by marketplace ID (e.g. 17-14370-63716) for validation.
- Orders list table shows marketplace order ID (eBay/ML) when present instead of only internal CUID.

---

## Phase 11 — Validation for order 17-14370-63716

1. **If the order is not in the system:**  
   - Use **Órdenes** → “Traer pedido desde eBay” and enter `17-14370-63716` to fetch from eBay API and create/update Order; if product is mapped, fulfillment runs.  
   - Or use “Importar orden eBay” with order ID, amount 68.47, buyer “Jenuin Santana Navarro”, and listing/product mapping.

2. **If the order is in the system:**  
   - **Órdenes** list now shows all orders (no filter by Sale), so it will appear.  
   - Open the order → Order detail shows buyer, address, product, status, tracking.  
   - Or call `GET /api/orders/by-ebay-id/17-14370-63716` to get the order + sale info.

3. **Fulfillment:**  
   - If status is PAID/PURCHASING, wait or check logs.  
   - If FAILED, use “Reintentar” (when allowed) or complete purchase manually from Compras pendientes and submit tracking.

---

## Files changed

| File | Change |
|------|--------|
| `backend/src/api/routes/orders.routes.ts` | GET /api/orders: return all orders for user (removed “only orders with Sale” filter). Added GET /api/orders/by-ebay-id/:ebayOrderId. GET /api/orders/:id now returns marketplaceOrderId and sale (id, status, trackingNumber). |
| `frontend/src/services/orders.api.ts` | Order type extended with marketplaceOrderId, sale (OrderSaleInfo). |
| `frontend/src/pages/OrderDetail.tsx` | Unified view: buyer, full address, product, status, tracking, payment state; marketplace order ID; Spanish labels. |
| `frontend/src/pages/Orders.tsx` | Table “Orden” column shows eBay/ML marketplace ID when available. |
| `phase42_full_post_sale_system_audit_and_fix_prompt.md` | Stored prompt for this audit. |
| `docs/PHASE42_POST_SALE_SYSTEM_AUDIT_AND_FIXES.md` | This document. |

---

## Summary

- **Single source of truth:** Order table for ingestion; Sale for completed cycle and payout.
- **Visibility:** All orders appear in Órdenes; Sales page continues to merge Sales + orphan Orders.
- **Consistency:** Dashboard uses Sale for “sales” metrics and Order for order counts; no contradiction.
- **Order 17-14370-63716:** Can be fetched via “Traer pedido desde eBay” or imported; then visible in Órdenes and Order detail with full buyer/address/status/tracking.

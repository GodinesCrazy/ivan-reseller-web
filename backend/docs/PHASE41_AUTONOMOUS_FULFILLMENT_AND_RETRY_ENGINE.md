# Phase 41 — Autonomous Fulfillment Execution & Retry Engine

## Summary

Phase 41 implements an **autonomous fulfillment and retry engine** so that every real sale is processed, purchased from the supplier, shipped, tracked, and recovered if failed.

## Implemented Features

### 1. Auto-trigger on PAID (Task 1)

- **Webhook / capture:** When an order is created with status `PAID`, fulfillment is triggered (existing flow).
- **Cron:** `process-paid-orders` runs every 5 minutes and calls `orderFulfillmentService.fulfillOrder(orderId)` for all PAID orders.
- No manual trigger required for new PAID orders.

### 2. Product link validation (Task 2)

- In `order-fulfillment.service.ts`, if the AliExpress product URL is missing or mapping is incorrect, the order is marked **FAILED** and appears in **Compras pendientes** (pending purchases). User can fix mapping or add URL and retry.

### 3. Payment failure handling (Tasks 4–6)

- On PayPal insufficient funds, payment rejected, or transaction error, the order is set to **FAILED** with `errorMessage` containing `FAILED_INSUFFICIENT_FUNDS` (or the specific error).
- Failed orders are listed in **GET /api/sales/pending-purchases** and shown in the **Compras pendientes** UI with buyer info, supplier link, and amount needed.

### 4. Retry engine (Tasks 7–10)

- **Worker 1 — retry-failed-orders:** Runs every **30 minutes**, retries FAILED orders (with `FAILED_INSUFFICIENT_FUNDS`) with **max 3 retries**, last 72 hours, sorted by `createdAt` ASC.
- **Worker 2 — fulfillment-retry-engine (Phase 41):** Runs every **24 hours** (2:00 AM), retries FAILED orders with **max 5 retries**, last 168 hours (7 days), sorted by `createdAt` ASC.
- After each failed retry, `fulfillRetryCount` is incremented. When `fulfillRetryCount >= maxRetriesPerOrder`, the order’s `errorMessage` is updated to include **NEEDS_MANUAL_INTERVENTION** so the user knows to handle it manually.

### 5. Success flow (Tasks 11–12)

- After successful purchase: `supplierOrderId` (aliexpressOrderId), `trackingNumber`, and purchase date are stored on Order/Sale and PurchaseLog.
- Tracking is sent to eBay when `Order.paypalOrderId` starts with `ebay:` (existing `submitTrackingToEbay` flow). ML/Amazon can be extended similarly.

### 6. Manual mode (Tasks 14–15)

- **Compras pendientes** shows each pending order with:
  - Supplier link (open AliExpress).
  - **“Compré manualmente — enviar tracking”:** input + **“Enviar tracking”** button.
- **POST /api/orders/:id/submit-tracking** with body `{ trackingNumber }`:
  - Updates Order to `PURCHASED`, sets `aliexpressOrderId` to `'manual'` if not set.
  - Updates Sale `trackingNumber` and `status` to `SHIPPED`.
  - If the order originated from eBay (`paypalOrderId` starts with `ebay:`), calls `submitTrackingToEbay` so the marketplace is updated.
- After submitting tracking, the order leaves the pending list and the flow continues normally.

### 7. Traceability (Task 16)

- Each fulfillment attempt and retry is logged via `logger` (e.g. `[RETRY-FAILED-ORDERS]`, `[ORDER-FULFILLMENT]`, `[FULFILLMENT] FAILED`).
- Order state: `fulfillRetryCount`, `errorMessage` (including `NEEDS_MANUAL_INTERVENTION` when applicable).
- PurchaseLog records successful/failed purchases linked to orders/sales.

### 8. Validation — Order 17-14370-63716 (Task 17)

To validate that the system handles a real order correctly:

1. **Detected:** Order is present in the system (eBay sync or manual import).
2. **In system:** `GET /api/orders` or Sales page shows the order/sale.
3. **Fulfillment triggered:** PAID orders are picked by `process-paid-orders` or by webhook/capture; `fulfillOrder(orderId)` is called.
4. **Purchase attempted:** Order moves to PURCHASING then either PURCHASED or FAILED (see logs and `errorMessage`).
5. **Status correct:** Order status is one of CREATED | PAID | PURCHASING | PURCHASED | FAILED; if FAILED, it appears in Compras pendientes and can be retried (auto or manual) or marked NEEDS_MANUAL_INTERVENTION after 5 retries.

**Runbook for 17-14370-63716:**

- If the order is not in the app: use **Importar orden eBay** with the eBay order ID and complete product mapping.
- If it is FAILED (e.g. insufficient funds): add capital and wait for the next retry (30 min or 24h), or use **Retry** from the order detail, or buy manually and **Enviar tracking** from Compras pendientes.
- If it shows NEEDS_MANUAL_INTERVENTION: complete the purchase manually and submit tracking via Compras pendientes or `POST /api/orders/:id/submit-tracking`.

## Configuration

- **Retry (30 min):** `maxAgeHours: 72`, `maxRetriesPerOrder: 3` (insufficient-funds only).
- **Fulfillment retry (24h):** `maxAgeHours: 168`, `maxRetriesPerOrder: 5` (same criteria).
- Cron: `retry-failed-orders` every 30 min; `fulfillment-retry-engine` at 2:00 AM daily (BullMQ repeat pattern `0 2 * * *`).

## Files Touched

- `backend/src/services/retry-failed-orders.service.ts` — max 5 retries, NEEDS_MANUAL_INTERVENTION when exceeded, optional `anyFailure`.
- `backend/src/services/scheduled-tasks.service.ts` — queue and worker `fulfillment-retry-engine`, schedule every 24h.
- `backend/src/api/routes/orders.routes.ts` — `POST /:id/submit-tracking`.
- `backend/prisma/schema.prisma` — comment on `fulfillRetryCount` (cap 5, NEEDS_MANUAL_INTERVENTION).
- `frontend/src/pages/PendingPurchases.tsx` — manual tracking input and “Enviar tracking” button.
- `phase41_autonomous_fulfillment_execution_and_retry_engine_prompt.md` — original prompt (repo root).

## Final objective

The system is designed so that:

- **No sale is lost:** FAILED orders are retried automatically and surface in Compras pendientes for manual action.
- **Automated fulfillment** for PAID orders when capital and product link exist.
- **Intelligent retry** (30 min and 24h) with a clear cap and NEEDS_MANUAL_INTERVENTION.
- **Manual backup** via supplier link + submit tracking.
- **Full control** via Compras pendientes, order detail, and API.

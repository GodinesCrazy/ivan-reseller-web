# Phase 44 — Force Real Orders Sync & Fulfillment Execution

**Date:** 2025-03-18  
**Goal:** Force fetch real orders from eBay, remove fake data from view, trigger fulfillment for real orders (e.g. 17-14370-63716).

---

## Summary of changes

### Backend

1. **POST /api/orders/sync-marketplace** (enhanced)  
   - Triggers `runMarketplaceOrderSync('production')`: fetches orders from eBay Fulfillment API (NOT_STARTED / IN_PROGRESS / FULFILLED, last 90 days), upserts into Order table by `paypalOrderId = ebay:{orderId}`.  
   - Optional `body.ebayOrderId` or `query.ebayOrderId`: after sync, verifies that order exists and returns `verifiedOrder: { orderId, status, exists }`.  
   - Logs: orders fetched, created, skipped, errors (via `results` in response).

2. **POST /api/orders/by-ebay-id/:ebayOrderId/force-fulfill** (new)  
   - Finds order by `paypalOrderId = ebay:{ebayOrderId}`.  
   - If PAID and user authorized, calls `orderFulfillmentService.fulfillOrder(order.id)`.  
   - Returns `{ success, orderId, ebayOrderId, status, aliexpressOrderId, error }`.  
   - If order not found: 404 with message to run sync or use “Traer pedido desde eBay”.

3. **Script delete-test-orders.ts**  
   - Deletes from DB all orders whose `paypalOrderId` starts with TEST, test, DEMO, demo, MOCK, mock, SIM_, ORD-TEST.  
   - Run: `npx tsx scripts/delete-test-orders.ts` (or `--dry-run` to only list).  
   - With production DB: `railway run npx tsx scripts/delete-test-orders.ts`.

4. **GET /api/orders**  
   - Unchanged from Phase 43: returns only real orders (excludes TEST/DEMO/MOCK, etc.). No mock/fallback.

5. **Production rule**  
   - Unchanged from Phase 43: in production, test order creation (e.g. internal test-fulfillment-only) is blocked (403).

### Frontend

1. **Orders page**  
   - **Sincronizar con eBay:** button that calls POST `/api/orders/sync-marketplace` then refreshes the list. Shows toast with number of new orders if any.  
   - **Client-side safety (Phase 44):** before rendering, filters out any order whose `paypalOrderId` matches test/demo/mock pattern (redundant with API but ensures zero fake rows).

2. **Order detail**  
   - When order is **PAID** and has **eBay marketplace ID** (`marketplaceOrderId` and `paypalOrderId` starting with `ebay:`): shows block “Orden pagada en eBay — pendiente de compra en AliExpress” with button **Forzar compra en AliExpress** that calls POST `/api/orders/by-ebay-id/:ebayOrderId/force-fulfill`.  
   - After success, detail refreshes and shows new status (e.g. PURCHASED or FAILED with error).

3. **orders.api.ts**  
   - New `forceFulfillByEbayOrderId(ebayOrderId)` calling the force-fulfill endpoint.

---

## Flow for order 17-14370-63716

1. **Bring order into the system**  
   - **Option A:** Click “Sincronizar con eBay” on Orders page → sync fetches from eBay API and upserts → order appears in list.  
   - **Option B:** “Traer pedido desde eBay” with ID `17-14370-63716` → fetches that order, upserts, and if product is mapped triggers fulfillment.  
   - **Option C:** “Importar orden eBay” with ID, amount 68.47, buyer, listing/product.

2. **Trigger fulfillment if still PAID**  
   - Open the order (Ver) → in detail, click **Forzar compra en AliExpress**.  
   - Or call `POST /api/orders/by-ebay-id/17-14370-63716/force-fulfill` with auth.

3. **If no funds (FAILED_INSUFFICIENT_FUNDS)**  
   - Order appears in Compras pendientes; user can complete purchase manually or retry when funds are available (Reintentar when allowed).

---

## Files touched

| File | Change |
|------|--------|
| `backend/src/api/routes/orders.routes.ts` | force-fulfill route; sync-marketplace with optional verify `ebayOrderId`. |
| `backend/scripts/delete-test-orders.ts` | New script to hard-delete test orders. |
| `frontend/src/pages/Orders.tsx` | isRealOrder filter; handleSyncMarketplace; “Sincronizar con eBay” button. |
| `frontend/src/pages/OrderDetail.tsx` | canForceFulfill + handleForceFulfill; “Forzar compra en AliExpress” block. |
| `frontend/src/services/orders.api.ts` | forceFulfillByEbayOrderId. |
| `phase44_force_real_orders_sync_and_fulfillment_execution_prompt.md` | Stored prompt. |
| `docs/PHASE44_FORCE_REAL_ORDERS_SYNC_AND_FULFILLMENT.md` | This document. |

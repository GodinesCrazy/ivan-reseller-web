# Phase 43 — Orders Truth & Real Fulfillment

**Date:** 2025-03-18  
**Goal:** Orders page shows only real data; no test/demo/mock orders. Marketplace as source of truth.

---

## Summary of changes

### Backend

1. **GET /api/orders (list)**  
   - Excludes orders whose `paypalOrderId` starts with: `TEST`, `test`, `DEMO`, `demo`, `MOCK`, `mock`, `SIM_`, `ORD-TEST`.  
   - Only real marketplace (eBay, Mercado Libre, Amazon) or checkout orders are returned.

2. **GET /api/orders/:id (detail)**  
   - In production (`NODE_ENV=production`), returns 404 for orders that match the same test/demo/mock patterns (same list as above).

3. **GET /api/orders/sync-status**  
   - New endpoint. Returns `lastSyncAt` from marketplace-order-sync (eBay/ML/Amazon).  
   - Used by the frontend to show “Última sincronización: hace X min”.

4. **POST /api/internal/test-fulfillment-only**  
   - In production, responds with **403** and does not create any order.  
   - Prevents test orders from being created in production.

### Frontend

1. **Orders page**  
   - Fetches **GET /api/orders** (real-only) and **GET /api/orders/sync-status**.  
   - Shows “Solo se muestran órdenes reales (eBay, Mercado Libre, Amazon)” and “Última sincronización: hace X min” (when `lastSyncAt` is available).  
   - Table columns: Orden, **Marketplace**, Título, **Comprador**, Estado, Importe, Fecha, Acciones.  
   - No hardcoded or static order data; all from API.

2. **Auto refresh**  
   - Existing `useLiveData` (15 s) and “Actualizar” button unchanged.

### Data flow

- **Real orders** come from:  
  - Webhooks (eBay/ML/Amazon) → `recordSaleFromWebhook` → `Order` + `fulfillOrder`.  
  - Marketplace sync → `upsertOrderFromEbayPayload` (and equivalent for ML/Amazon).  
  - Manual “Traer pedido desde eBay” / “Importar orden eBay” (both set `paypalOrderId` to `ebay:...`).  
- **Test orders** (e.g. `TEST_FULFILLMENT_*`) are excluded from the list and from detail in production, and cannot be created in production.

---

## Validation (order 17-14370-63716)

- Once the order exists in the DB (via webhook, sync, or “Traer pedido desde eBay”), it has `paypalOrderId = "ebay:17-14370-63716"`.  
- It is **not** filtered out (does not start with TEST/DEMO/MOCK/etc.).  
- It will appear in **GET /api/orders** and on the Orders page with correct amount, buyer, marketplace (eBay), and status.

---

## Files touched

| File | Change |
|------|--------|
| `backend/src/api/routes/orders.routes.ts` | Real-only filter for list; sync-status route; isTestOrderPaypalId + 404 for test orders in production on GET /:id. |
| `backend/src/api/routes/internal.routes.ts` | 403 in production for POST test-fulfillment-only. |
| `frontend/src/pages/Orders.tsx` | lastSyncAt state and sync-status call; “Última sincronización”; columns Marketplace and Comprador; copy “solo órdenes reales”. |

# Phase 40 — Real Sales Sync & Frontend Reflection

Implementation of the Real Sales Sync and Frontend Reflection Engine so the system reflects exactly what happens in marketplaces (eBay, MercadoLibre, Amazon).

## Implemented

### Phase 1 — eBay sales ingestion

- **eBay getOrders** ([ebay.service.ts](../src/services/ebay.service.ts)): `getOrders(params?)` calls Sell Fulfillment API `GET /sell/fulfillment/v1/order` with filter `creationdate:[last 90 days]`, `orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}`. Returns normalized list with orderId, buyerName, buyerUsername, buyerEmail, shippingAddress, lineItems (sku, itemId, title, quantity, price), total, orderDate.
- **Store in DB** ([marketplace-order-sync.service.ts](../src/services/marketplace-order-sync.service.ts)): For each user with eBay credentials, fetches orders and creates `Order` (status PAID, paypalOrderId = `ebay:{orderId}`) when no Order with that paypalOrderId exists. Resolves product via MarketplaceListing (by itemId or sku). Requires product to have aliexpressUrl.
- **Deduplication**: Idempotent by `paypalOrderId`; existing order skips create.

### Phase 3 — Sync worker

- **Queue + worker** ([scheduled-tasks.service.ts](../src/services/scheduled-tasks.service.ts)): `marketplace-order-sync` queue and worker run `runMarketplaceOrderSync('production')` every 10 minutes (configurable via `MARKETPLACE_ORDER_SYNC_CRON`, default `*/10 * * * *`).
- **Incremental**: Only creates new orders; already-synced orders are skipped.

### Phase 4 — Frontend integration

- **Sales list** ([Sales.tsx](../../frontend/src/pages/Sales.tsx)): Shows product image (first from product.images), product name, buyer name, full address in detail modal, total (salePrice), marketplace fee, status, order date. Source badge (eBay / ML / Amazon / checkout).
- **Order detail modal**: Full buyer info, shipping address (string or parsed JSON), financial breakdown (sale price, cost, marketplace fee, commission, gross/net profit), fulfillment status (badge), tracking if exists. Product image and source at top.
- **Status visibility**: PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED from API; no hardcoded statuses.

### Phase 5 — Data trust

- **Filter fake data**: In production, sales with `orderId` matching `DEMO`, `TEST`, `SIM_`, `ORD-TEST`, `mock-`, `MOCK` are excluded from GET /api/sales ([sales.routes.ts](../src/api/routes/sales.routes.ts)).
- **Source tagging**: Each sale has `source` = marketplace (eBay / mercadolibre / amazon / checkout). Shown in list and detail.
- **Last sync**: `GET /api/sales/sync-status` returns `lastSyncAt` (updated when marketplace-order-sync runs). Frontend shows "Última sincronización: X min" / "ahora mismo".

### Phase 6 — Backend ↔ frontend consistency

- Sales page consumes only `/api/sales`, `/api/sales/stats`, `/api/sales/sync-status`. No hardcoded counters; fulfillment rate in overview is computed from real sales in period.

### Phase 7 — Validation order 17-14370-63716

- **Check in DB**: Order exists with `paypalOrderId = 'ebay:17-14370-63716'` (see [RUNBOOK_EBAY_ORDER_17-14370-63716.md](RUNBOOK_EBAY_ORDER_17-14370-63716.md)).
- **Frontend**: Once the order has a Sale (after fulfillment), it appears in Ventas with correct buyer, address, total. Total in Phase 38 doc is US$61.41; if your eBay data shows US$68.47, use the value that matches the marketplace.
- **Validation steps**: 1) GET /api/orders and find order with paypalOrderId containing 17-14370-63716. 2) GET /api/sales and find sale with same orderId. 3) In UI Ventas, open the sale and confirm buyer (Jenuin Santana Navarro), address (Canovanas, PR 00729-2831), and total.

### Phase 8 — Multi-marketplace

- Same sync pattern (fetch orders → create Order with dedup) is prepared for MercadoLibre and Amazon; currently only eBay is implemented in the worker. Schema is unified (Order + Sale); frontend uses one list with `source` to distinguish marketplace.

## Files touched

| File | Change |
|------|--------|
| [ebay.service.ts](../src/services/ebay.service.ts) | `getOrders()` for Fulfillment API list. |
| [marketplace-order-sync.service.ts](../src/services/marketplace-order-sync.service.ts) | New: sync eBay orders per user, dedup, `getLastMarketplaceSyncAt()`. |
| [scheduled-tasks.service.ts](../src/services/scheduled-tasks.service.ts) | Queue + worker + cron for marketplace-order-sync. |
| [sales.routes.ts](../src/api/routes/sales.routes.ts) | Filter fake orderIds in production; add productImage, source; GET /sync-status. |
| [Sales.tsx](../../frontend/src/pages/Sales.tsx) | productImage, source, lastSyncAt, product image column, modal with full detail, real fulfillment rate. |

## Success criteria

- Real eBay orders (NOT_STARTED / IN_PROGRESS) are fetched and stored as Order (PAID) without duplicates.
- Sales list shows product image, buyer, address, total, status, source, order date from real API data.
- Test/demo sales are excluded in production.
- "Last synced" reflects the last run of marketplace-order-sync.
- Order 17-14370-63716 can be validated in DB and in Ventas with correct buyer and address.

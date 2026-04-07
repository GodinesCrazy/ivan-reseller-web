# P58 — First Order Watch

Date: 2026-03-24  
Sprint: P58 — Controlled Commercial Proof Path

## Objective

Monitor for the first real buyer order on the controlled listing (productId=32690, listingId=MLC3786354420).

## Order Ingestion Paths

### 1. Webhook Path

| Aspect | Detail |
|--------|--------|
| Endpoint | `POST /api/webhooks/mercadolibre` |
| Signature | `createWebhookSignatureValidator('mercadolibre')` — requires WEBHOOK_SECRET_MERCADOLIBRE |
| Payload | orders_v2 format: `body.data.id` = order ID, `body.user_id` = ML seller id |
| Flow | Fetch full order via `mlService.getOrder(mlOrderId)` → `recordSaleFromWebhook` → creates Order → `fulfillOrder(order.id)` |
| Config | WEBHOOK_VERIFY_SIGNATURE_MERCADOLIBRE, WEBHOOK_SECRET_MERCADOLIBRE |

**Webhook configuration status:** Not verified in this sprint. P29 runbook states: "If Webhooks Stay Off — call POST /api/orders/sync-marketplace".

### 2. Manual/Polling Fallback

| Aspect | Detail |
|--------|--------|
| Endpoint | `POST /api/orders/sync-marketplace` |
| Service | `syncMercadoLibreOrdersForUser(userId, 'production')` |
| Source | `mercadolibre-order-sync.service.ts` |
| Logic | Fetches `mlService.searchRecentOrders(30)`, filters `status=paid`, matches `listingId` to `marketplaceListing`, creates Order, calls `fulfillOrder(newOrder.id)` |
| Frontend | Orders page "Sincronizar con eBay" button; SalesReadinessPanel |
| Cron | `process-paid-orders` runs every ~5 min for PAID orders; sync is separate (job or manual) |

### 3. Internal Order Representation

| Field | Format |
|-------|--------|
| paypalOrderId | `mercadolibre:{mlOrderId}` |
| productId | From marketplaceListing.productId for matching listingId |
| status | PAID (initial) → PURCHASING → PURCHASED or FAILED |

## P58 Live Order Check

**Attempted:** `p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420`  
**Result:** Failed (DB connection limit). No fresh order data.

## Last Known Order State (P50)

| Metric | Value |
|--------|-------|
| matchingRecentOrders.count | 0 |
| syncResult | fetched=0, created=0, skipped=0, errors=[] |
| internal mercadolibre: orders for productId 32690 | none |

## Classification

**Result:** `monitored_no_order_yet`

- No real buyer order observed.
- Webhook path exists and is code-ready; configuration not verified.
- Manual sync path is available via `POST /api/orders/sync-marketplace`.
- Listing was under_review in P50, which may reduce visibility and thus order probability.

## Operational Watch Instructions

1. Resolve listing `under_review / waiting_for_patch` if possible.
2. Periodically call `POST /api/orders/sync-marketplace` (or use Orders page sync button) to pull any new ML orders.
3. When a real order appears: internal order will have `paypalOrderId=mercadolibre:{mlOrderId}`, `productId=32690`, `status=PAID` initially.
4. Fulfillment is triggered automatically by sync (or webhook); `process-paid-orders` cron also picks PAID orders.
5. Verify webhook configuration if instant ingestion is desired: `GET /api/webhooks/status`, WEBHOOK_SECRET_MERCADOLIBRE in env.

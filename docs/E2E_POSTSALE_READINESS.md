# E2E — Post-sale / fulfillment readiness

## Chain (happy path)

1. **Inbound webhook** — `POST /api/webhooks/mercadolibre` (signature middleware).
2. **Parse / enrich** — For `orders_v2`-style notifications, fetch order via `MercadoLibreService` using seller-scoped credentials (`findMercadoLibreCredentialsBySellerId`).
3. **`recordSaleFromWebhook`** — Idempotency on `paypalOrderId = mercadolibre:<marketplaceOrderId>`; finds `marketplaceListing` by `listingId`; requires **`product.aliexpressUrl`** (or fails closed).
4. **`Order` created** with `status: PAID`.
5. **`fulfillOrder`** — Validates address, **free working capital**, resolves `productUrl` (product → **listing supplierUrl** fallback).
6. **`attemptPurchase`** (AliExpress) — timeouts, retries via purchase retry service.
7. **On `PURCHASED`** — `createSaleFromOrder`, user notification.

## Idempotency / failures

- Duplicate webhook → existing order/sale short-circuit.
- Fulfillment failure → user notification **manual action**; order may stay `PAID` or move to failed / manual states per service logic.

## Fix in this audit

- **`supplierUrl` fallback** previously queried **eBay only**. It now includes **`mercadolibre`** listings so ML-origin SKUs can still resolve a supplier link if `aliexpressUrl` were missing (edge case).

## Remaining real-world blockers

- **AliExpress API** availability, SKU mapping, captcha / policy changes.
- **Capital** and **daily limits** (`checkDailyLimits`, `hasSufficientFreeCapital`).
- **Webhook** must hit **public Railway URL** configured in ML developer portal.
- **ML order payload** must expose listing/item id compatible with DB `listingId`.

## Smoke without a real buyer

- `backend/scripts/test-complete-real-cycle.ts` with `SIMULATE_FULFILLMENT=1` exercises Order → Sale path without AliExpress (see script header).

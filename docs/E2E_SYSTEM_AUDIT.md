# E2E — Full system audit (Ivan Reseller)

## Scope

Monorepo: **`backend/`** (Node + Express + Prisma + TypeScript), **`frontend/`** (Vite + React admin), optional **`native-scraper/`**, **`scraper-bridge/`**. Production patterns: **Railway** (API + DB + Redis), **Vercel** (SPA with `/api/*` rewrite to Railway).

## Main services / modules (backend)

| Area | Location / entry |
|------|------------------|
| HTTP API | `backend/src/api/routes/*.routes.ts`, mounted from `server.ts` |
| Auth | JWT + cookies; `middleware/auth.middleware.ts` |
| Products | `product.service.ts`, `products.routes.ts` |
| Marketplace publish | `marketplace.service.ts`, `marketplace.routes.ts` (`POST /api/marketplace/publish`) |
| ML-specific | `mercadolibre.service.ts`, `mercadolibre.publisher.ts`, `mercadolibre-publish-preflight.service.ts` |
| Pre-publish gates | `pre-publish-validator.service.ts` (economics, freight, supplier) |
| ML images | `mercadolibre-image-remediation.service.ts`, `ml-portada-*` reconstruction |
| Webhooks | `webhooks.routes.ts` — ML / eBay → `recordSaleFromWebhook` |
| Orders / fulfillment | `order-fulfillment.service.ts`, `aliexpress-auto-purchase.service.ts`, `purchase-retry.service` |
| Sales / commissions | `sale.service.ts` |
| Workers / Redis | Listing reconciliation, jobs (see `.env.example` `REDIS_URL`) |
| Health | `server-bootstrap.ts` early `/health` for Railway |

## Core flows

1. **Opportunity → product**: scrape/import (`POST /api/products/scrape`, research flows), workflow to `VALIDATED_READY`.
2. **Publish**: Intelligent Publisher + `send_for_approval` / `approve`; direct `POST /api/marketplace/publish` with credential test; ML preflight `GET /api/products/:id/publish-preflight`.
3. **Sale**: Marketplace webhook → internal `Order` (`paypalOrderId` = `mercadolibre:<id>`) → `fulfillOrder` → AliExpress purchase → `Sale` / notifications.
4. **Capital / limits**: Free working capital check, daily limits inside fulfillment.

## Frontend (admin)

- **Login**: `/login`, JWT in cookies.
- **Products**: list, filters, workflow indicators, **Canary ML panel** (this audit), links to preview.
- **Product preview**: `/products/:id/preview?marketplace=mercadolibre` — ML preflight + canary tier + publish button (disabled when `publishAllowed === false`).
- **Orders / Sales / Pending purchases**: post-sale visibility.
- **Settings / API configuration**: OAuth ML, eBay.

## Critical dependencies

- **PostgreSQL** (`DATABASE_URL`), **Prisma migrations**.
- **Mercado Libre OAuth** + site `MLC` for Chile listings.
- **`WEBHOOK_SECRET_MERCADOLIBRE`** for signed webhooks; `ML_WEB_PUBLISH_REQUIRE_ML_WEBHOOK_SECRET` can hard-block publish if unset.
- **AliExpress Dropshipping API** credentials for automatic purchase.
- **Redis** for scheduled reconciliation / workers (optional but recommended for listing truth).

## Weak points (honest)

- **Image automation** can fail closed on hard SKUs (strict ML gates); use **canary picker** to avoid one bad SKU blocking the *process* test.
- **Webhook payload shapes** vary; ML `orders_v2` path fetches full order via API — depends on valid ML token at webhook time.
- **Multi-tenant admin**: canary list is **scoped to logged-in `userId`** so ML credentials and asset paths align (no cross-user credential mix).
- **Fulfillment** requires valid `productUrl` (AliExpress). Fallback from `marketplaceListing.supplierUrl` now includes **both** `mercadolibre` and `ebay` (fix in this audit).

## Reference docs (existing)

- `VERIFICACION_FLUJO_DROPSHIPPING.md`, `docs/GUIA_PASO_A_PASO_MERCADOLIBRE.md`, `backend/COMPLETE_AUTOMATION_VERIFICATION.md`, `docs/RAILWAY_REDIS_SETUP.md`, `backend/.env.example`.

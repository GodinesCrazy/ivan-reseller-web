# Ivan Reseller Web — Deployment Repair and Phase 2 Continuation

This document records the current system status, Prisma/Railway fixes, worker strategy, metrics collection, frontend deployment, and Phase 2 implementation plan.

---

## CURRENT SYSTEM STATUS

### Phase 1 Systems Verified

| System | Location | Integration |
|--------|----------|-------------|
| **Inventory Sync Service** | `backend/src/services/inventory-sync.service.ts` | BullMQ queue `inventory-sync`, worker in `scheduled-tasks.service.ts`, cron every 6h (`INVENTORY_SYNC_CRON`). Uses AliExpress Dropshipping API, `Product.supplierStock` / `supplierStockCheckedAt`, `marketplaceService.syncInventory()`. |
| **Listing Metrics Schema** | `backend/prisma/schema.prisma` → `ListingMetric` | Table `listing_metrics` (listingId, marketplace, impressions, clicks, sales, conversionRate, price, competitorPrice, date). Migration `20250315000000_phase1_inventory_sync_listing_metrics`. |
| **Analytics API** | `backend/src/api/routes/analytics.routes.ts` | `GET /api/analytics/listings` (authenticated). Aggregates by listing, optional `days`, `marketplace`, `limit`. Mounted at `/api/analytics` in `app.ts`. |
| **Listing Optimization Worker** | `backend/src/services/listing-optimization-loop.service.ts` | Queue `listing-optimization-48h`, worker in scheduled-tasks, cron every 2 days. Reprice + optional title refresh; optional image change when `LISTING_OPTIMIZATION_CHANGE_IMAGE=true`. |
| **Marketplace Rate Limiting** | `backend/src/services/marketplace-rate-limit.service.ts` | Used by eBay, Mercado Libre, Amazon axios interceptors. Env: `RATE_LIMIT_EBAY_PER_MIN`, `RATE_LIMIT_MERCADOLIBRE_PER_MIN`, `RATE_LIMIT_AMAZON_PER_MIN`. |

### Redis / BullMQ

- **Redis**: `backend/src/config/redis.ts` — `getBullMQRedisConnection()` for BullMQ; `isRedisAvailable` guards queue/worker init. If `SAFE_BOOT=true` or no `REDIS_URL`, workers are not started.
- **BullMQ**: All scheduled jobs and workers live in `ScheduledTasksService` (single process with the API). Queues: financial-alerts, commission-processing, ali-auth-health, fx-rates-refresh, listing-lifetime-optimizer, product-unpublish, dynamic-pricing, ali-express-token-refresh, retry-failed-orders, process-paid-orders, ebay-traffic-sync, listing-optimization-48h, winner-detection, inventory-sync, listing-metrics-aggregate.

### PostgreSQL

- **Prisma**: `backend/src/config/database.ts` — `connectWithRetry()`. Migrations applied at startup via `runMigrations()` in `server.ts` (calls `npx prisma migrate deploy`).

---

## PRISMA DEPLOYMENT FIX

### Rule

- **Production must use:** `prisma generate` (in build) and `prisma migrate deploy` (at start or in server boot).  
- **Production must NOT use:** `prisma migrate dev` (uses a shadow DB and can fail with P3006/P1014 if the real DB schema differs).

### Current Backend Flow

1. **Build** (`npm run build`): runs `prisma generate` and `tsc`. No DB access required.
2. **Start** (production): use `npm run start:with-migrations` or `npm run start:prod`, which run `prisma migrate deploy && node dist/server-bootstrap.js`.
3. **Server boot** (`server.ts`): also runs `runMigrations()` → `npx prisma migrate deploy` with retries. So migrations run both from the start script and from the app; both are safe.

### Scripts (package.json)

- `start` — server only (no migrations). Do **not** use in production.
- `start:with-migrations` — **use this in production:** `prisma migrate deploy && node dist/server-bootstrap.js`.
- `start:prod` — same as above.
- `prisma:migrate` — `prisma migrate dev` (local development only).
- `prisma:deploy` — `prisma migrate deploy` (for manual runs).

### Railway

- **Start command must be:** `npm run start:with-migrations` (or `npm run start:prod`).  
- **Build command:** `npm install && npm run build` (or `npm ci && npm run build`). Build already includes `prisma generate`.

---

## RAILWAY DEPLOYMENT REPAIR

### Backend (recommended)

- **Root directory:** `backend` (so paths are from repo root and `backend` is the app root).
- **Build command:** `npm install && npm run build`  
  - Ensures `prisma generate` runs (inside `npm run build`) and compiles TypeScript.
- **Start command:** `npm run start:with-migrations`  
  - Runs `prisma migrate deploy` then starts the server. No `migrate dev`.
- **Required env:** `DATABASE_URL`, `REDIS_URL`, `NODE_ENV=production`, `PORT` (Railway usually sets PORT).
- **Healthcheck:** `/health` (server-bootstrap responds quickly).

### Config Files

- **backend/railway.json** (when Railway service root = `backend`):

```json
{
  "build": {
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "npm run start:with-migrations",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 120
  }
}
```

- **railway.toml** (when deploying from repo root with `cd backend`):

```toml
[build]
buildCommand = "cd backend && npm install && npm run build"

[deploy]
startCommand = "cd backend && npm run start:with-migrations"
healthcheckPath = "/health"
healthcheckTimeout = 120
```

### Common Failure Causes

1. **Wrong start command** — Using `npm start` (no migrations) or a command that runs `prisma migrate dev`. Fix: use `npm run start:with-migrations`.
2. **Missing DATABASE_URL** — Migrations and DB access fail. Set in Railway variables.
3. **Missing REDIS_URL** — Workers and queues do not start; app still runs. Set for full automation.
4. **Build without prisma generate** — `npm run build` already includes it; do not remove it from the build script.

---

## WORKER EXECUTION STRATEGY

### Current Model: In-Process Workers

All BullMQ workers run **in the same Node process** as the API server:

- On load, `server.ts` calls `getScheduledTasksService()`, which constructs `ScheduledTasksService` and starts all queues and workers.
- Redis must be available (`REDIS_URL`); otherwise workers are not initialized (`SAFE_BOOT` or missing Redis).

### Workers and Schedules

| Queue | Schedule (cron) | Purpose |
|-------|------------------|---------|
| financial-alerts | 0 6 * * * | Daily financial checks |
| commission-processing | 0 2 * * * | Daily commission processing |
| ali-auth-health | 0 4 * * * | AliExpress auth health |
| fx-rates-refresh | 0 1 * * * | FX rates |
| listing-lifetime-optimizer | 0 3 * * * | Listing lifetime |
| product-unpublish | 0 */6 * * * | Unpublish products |
| dynamic-pricing | 0 */6 * * * | Repricing |
| winner-detection | 0 2 * * * (WINNER_DETECTION_CRON) | Phase 3: Winner Product Detection (listing_metrics + sales → winning_products) |
| ali-express-token-refresh | 0 * * * * | Token refresh |
| retry-failed-orders | */30 * * * * | Retry failed orders |
| process-paid-orders | */5 * * * * | Process PAID orders |
| ebay-traffic-sync | 0 */12 * * * | eBay view counts → viewCount + listing_metrics |
| listing-optimization-48h | 0 0 */2 * * | 48h optimization (reprice/title) |
| inventory-sync | 0 */6 * * * | AliExpress stock → pause/resume listings |
| listing-metrics-aggregate | 30 3 * * * | Sales → listing_metrics (yesterday) |

### Optional: Dedicated Worker Process

If you want workers in a **separate process** (e.g. to scale or isolate crashes):

1. Add a script, e.g. `src/worker-entry.ts`, that only loads and runs `ScheduledTasksService` (no Express).
2. In Railway, add a second service with the same codebase, build, and env, but start command: `node dist/worker-entry.js` (or similar).
3. Both processes must use the same `REDIS_URL` and `DATABASE_URL`.

Current design keeps one process for simplicity; workers and API share the same Redis and DB.

---

## METRICS COLLECTION IMPLEMENTATION

### Data Flow

1. **Impressions (eBay)**  
   - **ebay-traffic-sync** (every 12h): fetches eBay Analytics, updates `MarketplaceListing.viewCount`, then calls **listing-metrics-writer** `upsertListingMetricImpressions(listingId, 'ebay', today, viewCount)`.  
   - So `listing_metrics` gets impressions (and optionally clicks when API provides them) per listing per day.

2. **Sales and conversion**  
   - **listing-metrics-aggregate** (daily at 3:30 AM): for each `MarketplaceListing`, counts `Sale` rows for **yesterday** (same productId, userId, marketplace), computes `conversionRate = sales / impressions` when impressions > 0, and upserts **listing_metrics** via `aggregateSalesIntoListingMetricsForDate(yesterday)`.

3. **Price / competitor price**  
   - Can be wired from **dynamic-pricing** or **competitor-analyzer** when they run (e.g. after reprice or competitor fetch) by calling `upsertListingMetricPrices(listingId, marketplace, date, price, competitorPrice)`. Optional follow-up.

### Files

- **backend/src/services/listing-metrics-writer.service.ts**  
  - `upsertListingMetricImpressions`, `upsertListingMetricSales`, `upsertListingMetricPrices`, `aggregateSalesIntoListingMetricsForDate`.
- **backend/src/services/ebay-traffic-sync.service.ts**  
  - After updating `viewCount`, calls `upsertListingMetricImpressions`.
- **backend/src/services/scheduled-tasks.service.ts**  
  - Queue and worker `listing-metrics-aggregate`, cron `30 3 * * *` (env: `LISTING_METRICS_AGGREGATE_CRON`).

### Env

- `LISTING_METRICS_AGGREGATE_CRON` — default `30 3 * * *` (daily 3:30 AM).

### Phase 3: Winner Product Detection

- **Table:** `winning_products` (migration `20250316000000_phase3_winning_products`). Run `prisma migrate deploy` to apply.
- **Service:** `winner-detection.service.ts` — aggregates `listing_metrics` over last N days, applies criteria (min impressions, min conversion rate, min sales), computes score, upserts `winning_products`, sets `Product.winnerDetectedAt`.
- **Worker:** Same BullMQ job `winner-detection` also runs `runMetricsBasedWinnerDetection()` (Phase 3) then the existing sales-based logic. Env: `WINNER_MIN_IMPRESSIONS`, `WINNER_MIN_CONVERSION_RATE`, `WINNER_MIN_SALES_METRICS`, `WINNER_DAYS_WINDOW_METRICS`.
- **API:** `GET /api/analytics/winning-products` (days, marketplace, limit). Dashboard: Reportes → pestaña "Productos Ganadores".

---

## FRONTEND DEPLOYMENT STRATEGY

### Current Stack

- **React + Vite** SPA; `npm run build` → `dist/`; `npm run start` = `vite preview --host`.

### Railway

- **Build:** `npm run build` (from frontend directory).  
- **Start:** For a static SPA, use a static server, e.g. `npx serve dist -s` (install `serve` as dependency or use `npx`).  
- **frontend/railway.json** can be set to:

```json
{
  "build": {
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "npx serve dist -s -l 3000",
    "healthcheckPath": "/",
    "healthcheckTimeout": 30
  }
}
```

- Set `PORT` (e.g. 3000) if required by the static server.

### Vercel (Alternative)

- **Pros:** Simple SPA deploy, CDN, serverless; good for Vite/React.  
- **Setup:** Connect repo, set root to `frontend`, build command `npm run build`, output directory `dist`.  
- **Env:** Add `VITE_API_URL` (or equivalent) pointing to the backend API.  
- No code change required beyond existing env usage.

### Recommendation

- **Railway:** Keep frontend on Railway if the rest of the stack is there; use a proper static serve command as above.  
- **Vercel:** Prefer for frontend if you want better global latency and simpler frontend-only deploys; backend stays on Railway.

---

## PHASE 2 IMPLEMENTATION PLAN

After deployment is stable, Phase 2 can include:

1. **Product Research UI**  
   - New page(s) or extend Opportunities: search, filters (margin, ROI, supplier, demand), trend/saturation hints, “add to opportunities”.  
   - Reuse `opportunity-finder.service.ts`, `competitor-analyzer.service.ts`, `google-trends.service.ts` and expose via API + React.

2. **Image Processing Pipeline**  
   - Optional watermark removal, resize (e.g. min 1200×1200), structured image set.  
   - Integrate before publish in `marketplace.service.ts` or publishers; consider external service or sharp/jimp for resize.

3. **Full Inventory Sync (Multi-Supplier)**  
   - Abstract “supplier” behind an interface (get product, get stock).  
   - Add a second supplier (e.g. CJ or domestic) and a 6h job that syncs stock from all configured suppliers and updates listings (pause/resume) like the current inventory-sync.

4. **CTR / Conversion Metrics Collection**  
   - eBay (and others if available) analytics: fetch clicks where API provides them; write to `listing_metrics.clicks`.  
   - Use existing `listing_metrics` and analytics API; add conversion targets/alerts in UI later.

All of these should integrate with existing systems (no removal of current behavior), use existing queues/workers where relevant, and keep Prisma and Railway usage as above.

---

## SUMMARY

- **Prisma:** Production uses only `prisma generate` (build) and `prisma migrate deploy` (start + server). No `migrate dev` in production.  
- **Railway backend:** Build = `npm install && npm run build`; Start = `npm run start:with-migrations`; env = `DATABASE_URL`, `REDIS_URL`, `NODE_ENV`, `PORT`.  
- **Workers:** Run in-process with the API; same Redis and DB. Optional separate worker process later.  
- **Metrics:** `listing_metrics` populated by eBay traffic sync (impressions) and daily listing-metrics-aggregate job (sales, conversion).  
- **Frontend:** Railway with static serve or Vercel; both are valid.

This keeps Ivan Reseller Web stable in production while allowing safe evolution into Phase 2.

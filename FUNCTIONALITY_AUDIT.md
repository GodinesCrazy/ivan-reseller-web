# Functionality Audit ? Ivan Reseller

**Purpose:** Classify each dropshipping-automation function as **WORKING**, **PARTIAL**, or **MISSING** based on code and behavior evidence.

---

## Summary Table

| Function | Status | Key evidence |
|----------|--------|--------------|
| Product Discovery | WORKING | opportunity-finder pipeline, trends, AliExpress Affiliate; diagnostics |
| Pricing Engine | WORKING | financial-calculations, profitability.service, opportunity-finder margin/ROI |
| Automatic Listing | WORKING | publishToMarketplace ? eBay/Amazon/ML createListing, OAuth |
| Winning Product Detection | PARTIAL | product-performance.engine (winningScore, shouldRepeatWinner); not wired to autopilot |
| Automatic Duplication | PARTIAL | Only ?skip duplicate? in catalog; no ?duplicate winning listing? flow |
| Automatic Repricing | PARTIAL | dynamic-pricing.service + BullMQ job; no user UI for interval/country |
| Auto Order | WORKING | OrderFulfillmentService + AliExpress placeOrder/checkout with OAuth |
| Order Tracking | PARTIAL | Sale.trackingNumber, PurchaseLog; update path exists but not full E2E UI |
| Inventory Sync | PARTIAL | POST /api/marketplace/sync-inventory, jobs/sync-inventory; per product |
| Listing Cleanup | PARTIAL | listing-lifetime.service, product-unpublish queue; no ?delete after X days? user config |
| Autopilot Scheduler | WORKING | AutopilotSystem runSingleCycle, scheduleNextCycle, cycleIntervalMinutes |
| User Configuration Panel | PARTIAL | WorkflowConfig + Autopilot (marketplaces, start/stop); many strategy knobs missing |
| Marketplace OAuth | WORKING | eBay, Amazon, MercadoLibre, AliExpress Dropshipping |
| Payment System | WORKING | PayPal checkout/payout, Payoneer |

---

## 1. Product Discovery

**Status: WORKING**

- **Evidence:** `opportunity-finder.service.ts` runs a pipeline (trends ? search ? normalize ? pricing ? marketplace compare). Uses `trends.service.ts` / `google-trends.service.ts` for keywords; AliExpress Affiliate API / scraping for product data. Pipeline returns `opportunities` and `diagnostics` (discovered, normalized, sourcesTried).
- **Endpoints:** Internal pipeline used by autopilot; `POST /api/internal/test-full-cycle-search-to-publish` and `POST /api/internal/test-full-dropshipping-cycle` exercise it.
- **Files:** `backend/src/services/opportunity-finder.service.ts`, `trends.service.ts`, `aliexpress-affiliate-api.service.ts`.

---

## 2. Pricing Engine

**Status: WORKING**

- **Evidence:** Margins and ROI computed in `opportunity-finder.service.ts` (profitMargin, roiPercentage, suggestedPriceUsd). `financial-calculations.service.ts` for profit/margin/ROI; `modules/profitability/profitability.service.ts` for publish decisions; `profit-guard.service.ts` to block below-minimum profit.
- **Files:** `opportunity-finder.service.ts`, `financial-calculations.service.ts`, `profitability.service.ts`, `profit-guard.service.ts`.

---

## 3. Automatic Listing

**Status: WORKING**

- **Evidence:** `autopilot.service.ts` calls `publishToMarketplace(opp, userId)` which uses `MarketplaceService`. `marketplace.service.ts` resolves credentials and calls `ebay.service.createListing`, `amazon.service.createListing`, `mercadolibre.service.createListing`. Results stored in `MarketplaceListing` and `MarketplacePublication`.
- **Endpoints:** Autopilot-driven; also manual publish via publisher/marketplace routes.
- **Files:** `autopilot.service.ts`, `marketplace.service.ts`, `ebay.service.ts`, `amazon.service.ts`, `mercadolibre.service.ts`.

---

## 4. Winning Product Detection

**Status: PARTIAL**

- **Evidence:** `product-performance.engine.ts` computes `getProductPerformance(userId, daysBack)` with `winningScore` (ROI, velocity, margin, return rate) and `shouldRepeatWinner(winningScore, capitalAllocation, marketSaturated)`. Used by AI suggestions and logic that recommends ?repeat winner?; not invoked inside the autopilot cycle to auto-duplicate or prioritize.
- **Gap:** No scheduled job or autopilot step that ?marks as winning? and triggers duplication.
- **Files:** `backend/src/services/product-performance.engine.ts`, `ai-suggestions.service.ts`.

---

## 5. Automatic Duplication

**Status: PARTIAL**

- **Evidence:** Autopilot skips publishing when the product already exists in catalog (duplicate detection by URL/data). There is no flow to ?duplicate a winning product? (e.g. create a second listing or variant for a high-performing product).
- **Gap:** `shouldRepeatWinner` exists but no service/route that creates additional listings for winners.
- **Files:** `autopilot.service.ts` (duplicate skip), `product-performance.engine.ts` (shouldRepeatWinner).

---

## 6. Automatic Repricing

**Status: PARTIAL**

- **Evidence:** `dynamic-pricing.service.ts` implements `repriceByProduct(productId, supplierPriceUsd, marketplace, userId)` using competitor-analyzer and profit guard; writes to `DynamicPriceHistory`. `scheduled-tasks.service.ts` enqueues a dynamic-pricing job (interval from `DYNAMIC_PRICING_INTERVAL_HOURS`, default 6).
- **Gap:** No user-facing configuration for repricing interval or target country; single global env.
- **Files:** `dynamic-pricing.service.ts`, `scheduled-tasks.service.ts`, `competitor-analyzer.service.ts`.

---

## 7. Auto Order (Buy from supplier on sale)

**Status: WORKING**

- **Evidence:** When an order is PAID, `order-fulfillment.service.ts` `fulfillOrder(orderId)` sets status to PURCHASING, calls AliExpress (placeOrder/checkout), then updates Order to PURCHASED/FAILED and writes `PurchaseLog`. AliExpress Dropshipping OAuth and checkout services are implemented.
- **Files:** `order-fulfillment.service.ts`, `aliexpress-checkout.service.ts`, `aliexpress-dropshipping-api.service.ts`.

---

## 8. Order Tracking

**Status: PARTIAL**

- **Evidence:** `Sale.trackingNumber` and `PurchaseLog.trackingNumber` store tracking; order status (CREATED ? PAID ? PURCHASING ? PURCHASED/FAILED) is updated. Backend can persist and return tracking.
- **Gap:** End-to-end ?tracking update? from supplier to sale/order (e.g. webhook or poll) and full UI for tracking status may not be complete.
- **Files:** `order-fulfillment.service.ts`, `sale.service.ts`, Prisma schema (Sale, PurchaseLog, Order).

---

## 9. Inventory Sync

**Status: PARTIAL**

- **Evidence:** `marketplace.service.syncInventory(userId, productId, quantity)` and `POST /api/marketplace/sync-inventory`; `POST /api/jobs/sync-inventory` adds a job. Syncs quantity to marketplace (e.g. MercadoLibre); eBay has inventory-item diagnostic.
- **Gap:** May be marketplace-specific; not a single ?verify all supplier stock? sweep.
- **Files:** `marketplace.service.ts` (syncInventory), `marketplace.routes.ts`, `jobs.routes.ts`, `job.service.ts`.

---

## 10. Listing Cleanup

**Status: PARTIAL**

- **Evidence:** `listing-lifetime.service.ts` provides decisions (KEEP, IMPROVE, PAUSE, UNPUBLISH) and config in SystemConfig. `scheduled-tasks.service.ts` has `listing-lifetime-optimizer` and `product-unpublish` queues to run cleanup logic.
- **Gap:** No user-configurable ?delete listings after X days with no sales?; config is system-level/default.
- **Files:** `listing-lifetime.service.ts`, `listing-lifetime.routes.ts`, `scheduled-tasks.service.ts`.

---

## 11. Autopilot Scheduler

**Status: WORKING**

- **Evidence:** `AutopilotSystem.start(userId)` runs first cycle then `scheduleNextCycle()` with `cycleIntervalMinutes` (and backoff on failures). Timer runs `runSingleCycle` repeatedly until `stop()`.
- **Endpoints:** `POST /api/autopilot/start`, `POST /api/autopilot/stop`, `GET /api/autopilot/status`.
- **Files:** `autopilot.service.ts`, `autopilot.routes.ts`.

---

## 12. User Configuration Panel

**Status: PARTIAL**

- **Evidence:** WorkflowConfig page: workflow mode, stage modes (scrape, analyze, publish, purchase, etc.), working capital. Autopilot page: start/stop, target marketplaces (PUT /api/autopilot/config). Settings: profile, notifications, API status, pending product limit (admin).
- **Gap:** No UI for: max active listings, profit margin, min/max supplier price, product categories, max duplicates, auto repeat winners, delete listings after X days, repricing interval, target country, shipping policy. Backend autopilot config has some of these (e.g. minProfitUsd, minRoiPct) but not all exposed in a dedicated Autopilot Settings panel.
- **Files:** `frontend/src/pages/WorkflowConfig.tsx`, `frontend/src/pages/Autopilot.tsx`, `frontend/src/pages/Settings.tsx`, `backend/src/api/routes/autopilot.routes.ts`, `workflow-config.routes.ts`.

---

## 13. Marketplace OAuth

**Status: WORKING**

- **Evidence:** OAuth flows for eBay, Amazon, MercadoLibre, AliExpress Dropshipping: auth URL generation, callback handling, token exchange and storage in `api_credentials` (CredentialsManager). Documented in OAUTH_ACTIVATION_REPORT.md and related docs.
- **Files:** `marketplace-oauth.routes.ts`, `marketplace.routes.ts`, `ebay.service.ts`, `aliexpress-dropshipping-api.service.ts`, `aliexpress-oauth.service.ts`, etc.

---

## 14. Payment System

**Status: WORKING**

- **Evidence:** PayPal: create order, capture (paypal-checkout.service), payouts (paypal-payout.service). Payoneer: configuration and certificate (payoneer.service, generate-payoneer-cert.ps1). Routes under `/api/paypal`; commission processing via scheduled tasks.
- **Files:** `paypal-checkout.service.ts`, `paypal-payout.service.ts`, `payoneer.service.ts`, `paypal.routes.ts`.

---

## Conclusion

Core flows (discovery, pricing, listing, auto order, payments, OAuth, autopilot scheduling) are **WORKING**. Gaps are mainly: (1) user-facing strategy configuration (margins, limits, categories, repricing, cleanup rules), (2) winning-product engine wired to automatic duplication, and (3) listing cleanup and inventory sync fully configurable and visible to the user.

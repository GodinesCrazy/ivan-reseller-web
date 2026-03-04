# Production Improvement Plan ? Ivan Reseller

**Purpose:** Technical plan to close production gaps without breaking existing functionality. All changes are additive (new or extended endpoints, pages, config, and optional tables).

---

## 1. New or Extended Functions

| Function | Description | Where to implement |
|----------|-------------|--------------------|
| **Autopilot strategy config** | Persist and apply: maxActiveListings, minProfitUsd, minRoiPct, minSupplierPrice, maxSupplierPrice, searchQueries/categories, maxDuplicatesPerProduct, autoRepeatWinners, deleteListingsAfterDays, repricingIntervalHours, targetCountry. | Backend: extend `autopilot.service` config and `PUT/GET /api/autopilot/config` schema. Optionally use UserWorkflowConfig or SystemConfig (per-user key). |
| **Respect max active listings** | Before publishing in autopilot (and in publisher), count user?s active MarketplaceListing (or Product isPublished); if count >= maxActiveListings, skip or queue. | `autopilot.service.ts` (publishToMarketplace / runSingleCycle), `marketplace.service` or publish entry points. |
| **Winning product duplication** | Scheduled job or autopilot step: getProductPerformance ? filter by winningScore threshold and user setting ?auto repeat winners? / ?max duplicates per product? ? create duplicate listing (same product, new listing or variant per marketplace rules). | New service e.g. `winning-product-duplicate.service.ts` or extend `product-performance.engine`; call from scheduled-tasks or autopilot. |
| **User repricing interval** | Read repricing interval from user/config (SystemConfig or user table); schedule dynamic-pricing job accordingly. | `scheduled-tasks.service.ts` (read config), `dynamic-pricing.service` (already exists). |
| **Listing cleanup by ?X days?** | User setting ?delete listings after X days (no sales)?. Job: find MarketplaceListing with no Sale in last X days, unpublish or mark for removal. | `listing-lifetime.service` (extend) or new job in `scheduled-tasks.service`; config in SystemConfig or user. |
| **Business diagnostics aggregator** | Single endpoint that returns: autopilot, marketplace, supplier, payment, database, scheduler, listings, sales (each with status and optional counts). | New handler in `system.routes.ts`: GET /api/system/business-diagnostics. |

---

## 2. New or Extended Tables (Optional)

| Table / model | Purpose | When to add |
|---------------|---------|-------------|
| **PricingRules** | Per-user or global rules: min margin %, max discount %, category overrides. | If product roadmap requires explicit rules beyond profit guard and min margin. |
| **AutopilotUserSettings** (or extend UserWorkflowConfig) | Per-user: maxActiveListings, repricingIntervalHours, targetCountry, deleteListingsAfterDays, maxDuplicatesPerProduct, autoRepeatWinners. | Prefer extending existing config (SystemConfig key per user, or UserWorkflowConfig columns) to avoid new table; add table only if schema clarity demands it. |

Recommendation: first extend **SystemConfig** (e.g. `autopilot_config` per user key like `autopilot_config_user_${userId}`) or **UserWorkflowConfig** (add columns) for new knobs; add **PricingRules** only if needed.

---

## 3. New or Extended Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/autopilot/config | Already exists; extend response with new fields (maxActiveListings, minSupplierPrice, maxSupplierPrice, searchQueries, maxDuplicatesPerProduct, autoRepeatWinners, deleteListingsAfterDays, repricingIntervalHours, targetCountry). |
| PUT | /api/autopilot/config | Already exists; extend body schema to accept the above; persist and return updated config. |
| GET | /api/system/business-diagnostics | **New.** Return JSON: autopilot, marketplace, supplier, payment, database, scheduler, listings, sales. Each: status (OK/FAIL), optional message or counts. Reuse logic from existing diagnostics and from dashboard/sales/listing counts. |
| GET | /api/dashboard/autopilot-metrics (or similar) | **New or extend /api/dashboard.** Return: activeListingsCount, dailySalesCount, winningProductsCount (or top N), profitToday, profitMonth. Used by Autopilot Dashboard. |

---

## 4. New or Extended Frontend Pages

| Page / section | Purpose | Location |
|----------------|---------|----------|
| **Settings / Autopilot** (or ?Autopilot Settings? on Autopilot page) | Form: max active listings, profit margin (or min profit/ROI), min/max supplier price, product categories (or search queries), max duplicates per product, auto repeat winners, delete listings after X days, repricing interval, target country. Save via PUT /api/autopilot/config. | New section in `frontend/src/pages/Autopilot.tsx` or new `frontend/src/pages/settings/AutopilotSettings.tsx`; route under /settings/autopilot or tab on Autopilot. |
| **Settings / Pricing** | Optional. Repricing interval, target country, future pricing rules. | New page or tab under Settings, e.g. `frontend/src/pages/settings/PricingSettings.tsx`. |
| **Settings / Marketplace** | Optional. Target country, shipping policy (if needed). | New page or tab, or extend RegionalConfig. |
| **Autopilot Dashboard** | Cards/section: active listings, daily sales, winning products (count or list), profit today, profit month. Data from GET /api/dashboard/autopilot-metrics or existing dashboard/sales APIs. | New component or page `frontend/src/pages/AutopilotDashboard.tsx` or a dashboard section on `Autopilot.tsx`; route e.g. /autopilot or /dashboard/autopilot. |

---

## 5. File-Level References

| Area | Files to extend or add |
|------|-------------------------|
| Backend autopilot config | `backend/src/services/autopilot.service.ts` (AutopilotConfig interface, default config, updateConfig, loadPersistedData). `backend/src/api/routes/autopilot.routes.ts` (updateConfigSchema, GET/PUT /config). |
| Backend max listings check | `backend/src/services/autopilot.service.ts` (before publish: count MarketplaceListing for userId; compare to config.maxActiveProducts). |
| Backend business-diagnostics | `backend/src/api/routes/system.routes.ts` (add GET /business-diagnostics). Reuse: prisma for DB/counts, existing env checks (eBay, AliExpress, PayPal, Payoneer), autopilot stats from SystemConfig, sale/listing counts. |
| Backend dashboard metrics | `backend/src/api/routes/dashboard.routes.ts` (add route for autopilot metrics) or new route; use prisma (Sale, MarketplaceListing, Product, etc.) and optional product-performance.engine for ?winning? count. |
| Frontend Autopilot config UI | `frontend/src/pages/Autopilot.tsx` or new `frontend/src/pages/settings/AutopilotSettings.tsx`; call GET/PUT /api/autopilot/config with new fields. |
| Frontend Autopilot Dashboard | `frontend/src/pages/AutopilotDashboard.tsx` or section in Autopilot/Dashboard; fetch autopilot-metrics and display. |
| Frontend routes | `frontend/src/App.tsx`: add route for /settings/autopilot, /dashboard/autopilot, or equivalent. |

---

## 6. Implementation Order (No Breaking Changes)

1. **GET /api/system/business-diagnostics** ? Add route and handler; no change to existing behavior.
2. **Extend GET/PUT /api/autopilot/config** ? Add optional fields to schema and to AutopilotConfig; default missing fields so existing clients keep working.
3. **Respect max active listings in autopilot** ? In publish path, if config.maxActiveProducts set, count and skip when at cap.
4. **Autopilot Settings UI** ? New form reading/writing extended config; existing Autopilot page (start/stop, marketplaces) unchanged.
5. **Dashboard autopilot-metrics endpoint** ? New route returning activeListings, dailySales, profitToday, profitMonth, optional winningProductsCount.
6. **Autopilot Dashboard UI** ? New section or page consuming autopilot-metrics.
7. **Winning product duplication** ? New service + job or autopilot step; feature-flag or config so it can be turned off.
8. **Repricing interval and listing cleanup** ? Config + jobs; UI in Settings/Autopilot or Settings/Pricing.

This order keeps existing behavior intact and adds capabilities incrementally.

# Phase 23 — Sales Acceleration Mode + Data Integrity + Worker Health — Report

**Last updated:** 2025-03-15

## Summary

- **Redis health:** No longer returns "unknown" when REDIS_URL is set; returns "ok" / "fail" / "degraded".
- **Workers health:** New `health.workers` in readiness-report; derived from Redis + BullMQ (ok when both ok).
- **Dashboard sales:** Production revenue excludes test/mock/demo order IDs; real-sales filter in `getSalesStats` and charts/sales.
- **Sales Acceleration Mode:** New module runs every 3 hours; triggers DMO, CRO, dynamic pricing; status in readiness and dedicated endpoint.
- **Publishing limits:** `AUTONOMOUS_MAX_LISTINGS_PER_DAY` (e.g. 40) and `SALES_ACCELERATION_CRON` (default every 3h) supported.

---

## Task 1 — Sales Data Integrity

- **Approach:** No new DB column. Production sales are filtered by:
  - `environment = 'production'`
  - `orderId` not starting with `test`, `mock`, or `demo`.
- **Where applied:** `sale.service.ts` `getSalesStats()` (dashboard summary/stats) and dashboard route `GET /api/dashboard/charts/sales` for production.
- **Audit:** Existing data is not modified; reporting and dashboard metrics only include "real" sales when using production + the above filters.

---

## Task 2 — Clean Dashboard Sales Metrics

- **totalRevenue / totalOrders / profitDistribution:** Sourced from `saleService.getSalesStats()` with default `environment = 'production'` and real-sales filter (no test/mock/demo orderIds).
- **Charts:** `/api/dashboard/charts/sales` applies the same orderId exclusions when `environment === 'production'`.

---

## Task 3 — Redis Health Check

- **Change:** `system-health.service.ts` `checkRedis()`:
  - If `REDIS_URL` is missing or empty → return `"degraded"` (was "unknown").
  - If `REDIS_URL` is set → run `redis.ping()`; return `"ok"` on PONG, `"fail"` on error.
- **Result:** Control Center can show **Redis: ok** when Redis is configured and responding.

---

## Task 4 — Worker Health Detection

- **Change:** `SystemHealthResult` now includes `workers: HealthStatus`.
- **Logic:** `workers = ok` when both `redis === 'ok'` and `bullmq === 'ok'`; otherwise `fail` or `degraded`.
- **Readiness:** `GET /api/system/readiness-report` returns `health.workers` and `workerStatus` is derived from `health.workers` (running when ok).

---

## Task 5 — Automation Pipeline

- All listed workers (trend radar, market intelligence, competitor intelligence, auto listing strategy, publishing, listing metrics, dynamic optimization, winner detection, strategy brain, scaling, conversion optimization, revenue monitor) remain registered in `scheduled-tasks.service.ts`.
- **Fix:** `getBullMQRedisConnection()` no longer forces null in production when `SAFE_BOOT` is not set; only skips when `SAFE_BOOT === 'true'`, so workers can run in production.

---

## Task 6–8 — Sales Acceleration Mode

- **Module:** `sales-acceleration-mode.service.ts`
- **Enable:** `SALES_ACCELERATION_MODE=true` or system config key `sales_acceleration_mode` with `enabled: true`.
- **Run:** Every 3 hours (cron `SALES_ACCELERATION_CRON`, default `0 */3 * * *`).
- **Actions:**
  - Dynamic Marketplace Optimization (titles, images, price, expansion).
  - Conversion Rate Optimization.
  - Dynamic pricing job enqueued (aggressive; existing service respects MIN_ALLOWED_MARGIN).
- **Publishing:** `AUTONOMOUS_MAX_LISTINGS_PER_DAY` (e.g. 40) used by auto-listing-strategy when set; `RATE_LIMIT_LISTINGS_PER_HOUR` (e.g. 15) documented for use where publishing rate is limited.
- **Competitor:** Uses existing Competitor Intelligence; DMO and dynamic pricing use competitor/fee intelligence.

---

## Task 9 — Control Center

- **Readiness report:** `GET /api/system/readiness-report` now includes `salesAccelerationMode: { enabled, strategy, recentOptimizations }`.
- **Dedicated endpoints:**
  - `GET /api/system/sales-acceleration-status` — full status (enabled, strategy, recentOptimizations, lastRunAt, nextRunHint).
  - `POST /api/system/run-sales-acceleration` — run once.

---

## Task 10 — Final Validation

- **Redis:** ok when REDIS_URL set and ping succeeds.
- **Workers:** ok when Redis and BullMQ both ok.
- **Autonomous mode:** readiness reports `automationModeStatus: "enabled"` when `AUTONOMOUS_OPERATION_MODE=true`.
- **Dashboard:** Revenue and charts use production + real-sales filter.
- **Pipeline:** Workers active when Redis/BullMQ are configured and SAFE_BOOT is not true.

---

## Env Variables (Phase 23)

| Variable | Purpose |
|----------|--------|
| `SALES_ACCELERATION_MODE` | Set to `true` to enable Sales Acceleration Mode. |
| `SALES_ACCELERATION_CRON` | Cron for runs (default `0 */3 * * *`, every 3 hours). |
| `AUTONOMOUS_MAX_LISTINGS_PER_DAY` | Max listings per day when acceleration is on (e.g. 40). |
| `RATE_LIMIT_LISTINGS_PER_HOUR` | Optional; use 15 for acceleration (documented for future use). |
| `REDIS_URL` | Must be set in production for Redis/Workers to report ok. |
| `SAFE_BOOT` | Set to `true` only to disable Redis/BullMQ (e.g. for safe deploy); do not set in normal production. |

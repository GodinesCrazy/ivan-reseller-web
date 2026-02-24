# Autopilot / Automation Mode Audit

## Executive Summary

The Ivan_Reseller autopilot system has been audited and hardened for production-grade, continuous dropshipping cycles. This document summarizes findings, implementations, and operational guidance.

---

## 1) Scheduler / Loop Verification

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Trends discovery periodically | ? | Uses `searchQueries` + `selectOptimalQuery`; opportunity-finder integrates trends via Google Trends/SerpAPI |
| Opportunity discovery | ? | `searchOpportunities()` ? `opportunityFinder.findOpportunities()` (real scraping) |
| Pricing + marketplace comparison | ? | `isOpportunityValid()` (minProfitUsd, minRoiPct); opportunity-finder does marketplace compare |
| Publish only when profitable | ? | `filterAffordableOpportunities()` + `isOpportunityValid()` (per-user thresholds) |
| Monitor sales | ?? | Sales flow via Orders/PayPal; autopilot focuses on discovery?publish. Fulfillment triggered by orders system |
| Trigger fulfillment | ?? | Fulfillment is in post-sale flow (PayPal capture ? AliExpress purchase); not in autopilot loop |

**Conclusion:** Autopilot loop covers discovery?publish. Fulfillment is handled by the orders/post-sale pipeline.

---

## 2) Loop Support

| Feature | Status | Implementation |
|---------|--------|----------------|
| Enable/disable per user | ? | `config.enabled` + `start(userId)` / `stop(userId)` |
| Global pause | ? | `autopilot_global_pause` in `system_config`; checked at cycle start |
| Per-stage pause | ? | `workflowConfigService.getStageMode(userId, stage)` ? manual/automatic/guided |
| Rate limiting | ?? | No explicit maxCyclesPerHour; cycle interval enforced via `cycleIntervalMinutes` |
| Backoff on errors | ? | Exponential backoff: `2^consecutiveFailures * interval` (cap 4x) |
| Retry with cap | ? | `maxConsecutiveFailures = 5`; pause and emit `autopilot:paused_max_failures` |
| No infinite loops | ? | `scheduleNextCycle()` stops when `maxConsecutiveFailures` reached or `stop()` called |

---

## 3) Safety

| Safety Rule | Status | Implementation |
|-------------|--------|----------------|
| Never publish same product twice | ? | Deduplication by `aliexpressUrl` + `userId` before create in `publishToMarketplace()` and `sendToApprovalQueue()` |
| Never purchase same order twice | ? | Orders use `orderId`; fulfillment tied to order status; PurchaseLog tracks purchases |
| Idempotent operations | ? | Duplicate product creation skipped; cycle logging idempotent by cycleId |
| Locks / deduplication | ? | DB check for existing product by aliexpressUrl before create |

---

## 4) Persistence

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Every cycle execution logged | ? | `AutopilotCycleLog` table; `autopilotCycleLogService.logCycle()` on success and failure |
| Every decision stored | ? | Cycle logs include stage, opportunitiesFound, productsPublished, capitalUsed, errors |
| Every failure stored | ? | Failed cycles logged with `success: false`, `errors[]`, `metadata.consecutiveFailures` |

---

## 5) Profit Protection

| Rule | Status | Implementation |
|------|--------|----------------|
| Do not publish if margin < threshold | ? | `isOpportunityValid()` checks `minProfitUsd`, `minRoiPct` (per-user from UserWorkflowConfig) |
| Do not publish if marketplace median < our price | ?? | Not in autopilot; opportunity-finder returns suggestedPrice; consider adding marketplace median check in publish flow |
| Do not purchase if PayPal balance < cost | ? | `getAvailableCapital()`; fulfillment service validates capital before purchase |

---

## 6) User Configuration

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Thresholds from DB user settings | ? | `UserWorkflowConfig.minProfitUsd`, `minRoiPct`; fallback to `autopilot_config` |
| No hardcoded profit rules | ? | minProfitUsd, minRoiPct from config; workingCapital from UserWorkflowConfig |

---

## 7) Observability

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Clear logs per stage | ? | Logger.info/debug per stage; cycle logs in DB |
| Metrics counters per stage | ? | `autopilotCycleLogService.getStageMetrics(userId, since)` ? success/failed per stage |
| Health endpoint for autopilot | ? | `GET /api/autopilot/health` ? status, stageMetrics, healthy |

---

## Files Modified / Created

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `AutopilotCycleLog` model; `UserWorkflowConfig.minProfitUsd`, `minRoiPct` |
| `prisma/migrations/20250205100000_add_autopilot_cycle_log/migration.sql` | Migration for new table and columns |
| `src/services/autopilot-cycle-log.service.ts` | **NEW** ? cycle logging and stage metrics |
| `src/services/autopilot.service.ts` | Global pause, per-user thresholds, deduplication, backoff, retry cap, cycle logging |
| `src/api/routes/autopilot.routes.ts` | `GET /api/autopilot/health` endpoint |

---

## How to Enable Autopilot

1. **Configure APIs** (Settings ? API Settings):
   - AliExpress scraping (ScraperAPI or ZenRows)
   - Target marketplace (eBay, Amazon, MercadoLibre)

2. **Set autopilot config** (system_config `autopilot_config`):
   ```json
   {
     "enabled": true,
     "cycleIntervalMinutes": 60,
     "publicationMode": "manual",
     "targetMarketplace": "ebay",
     "maxOpportunitiesPerCycle": 5,
     "workingCapital": 500,
     "minProfitUsd": 10,
     "minRoiPct": 50
   }
   ```

3. **Optional per-user thresholds** (UserWorkflowConfig):
   - `minProfitUsd`, `minRoiPct` ? override global config for specific user

4. **Start autopilot** (API):
   ```bash
   POST /api/autopilot/start
   Authorization: Bearer <token>
   ```

5. **Global pause** (optional):
   ```sql
   INSERT INTO system_configs (key, value) VALUES ('autopilot_global_pause', 'true')
   ON CONFLICT (key) DO UPDATE SET value = 'true';
   ```

---

## How to Verify Autopilot End-to-End

1. **Health check:**
   ```bash
   GET /api/autopilot/health
   Authorization: Bearer <token>
   ```
   - Expect `healthy: true`, `autopilot.isRunning`, `stageMetrics`

2. **Start autopilot:**
   ```bash
   POST /api/autopilot/start
   ```

3. **Monitor logs:**
   - `Autopilot: Cycle completed successfully`
   - `Autopilot: Product published to marketplace successfully` (if automatic mode)

4. **Query cycle logs:**
   ```sql
   SELECT * FROM autopilot_cycle_logs
   WHERE "userId" = 1
   ORDER BY "createdAt" DESC
   LIMIT 20;
   ```

5. **Verify deduplication:**
   - Same `aliexpressUrl` should not create duplicate products for same user

6. **Verify backoff:**
   - Force cycle failure (e.g. invalid API); check logs for `Autopilot: Backoff applied`
   - After 5 consecutive failures, autopilot pauses; check `autopilot:paused_max_failures` event

---

## Remaining Limitations

- **Marketplace median price check:** Not enforced before publish; consider adding in publish flow.
- **Sales monitoring in autopilot:** Autopilot does not poll for new sales; sales flow is event-driven (webhooks, checkout).
- **Rate limit maxCyclesPerHour:** Not enforced; cycle interval is the only rate control.

# Ivan Reseller Web — Autonomous Execution and Real Sales Validation Mode

You are now operating as an AUTONOMOUS BUSINESS OPERATION SYSTEM.

Your mission is to EXECUTE, MONITOR, VALIDATE and ADJUST the system until it produces REAL SALES.

Do NOT ask for manual input.

Execute everything automatically.

---

# GLOBAL OBJECTIVE

Turn the system into a REAL revenue-generating operation.

---

# TASK 1 — INITIAL ACTIVATION

Immediately execute:

POST /api/system/phase31/run

Log execution.

---

# TASK 2 — CONTINUOUS EXECUTION LOOP

Create automated loop:

Run Phase 31 every 4–6 hours.

If no scheduler exists:

create one using existing job system (BullMQ or cron).

---

# TASK 3 — MARKETPLACE PRIORITY

Set priority:

PUT /api/system/phase31/marketplace-priority

Body:

{
  "priority": ["mercadolibre", "ebay", "amazon"]
}

---

# TASK 4 — CONTROLLED VOLUME

Ensure:

PHASE31_MAX_NEW_LISTINGS_PER_DAY = 15

If higher → reduce.

Prevent over-publishing.

---

# TASK 5 — METRICS VALIDATION LOOP

Every cycle:

Call:

GET /api/system/phase28/metrics-status

If:

impressions == 0

THEN:

trigger republish
improve SEO titles
adjust categories

---

# TASK 6 — LISTING QUALITY CONTROL

If listing:

has no impressions after multiple cycles

THEN:

re-optimize OR remove listing

---

# TASK 7 — CONVERSION VALIDATION

If:

impressions > 0 AND sales == 0

THEN:

lower price slightly
optimize title
improve description

---

# TASK 8 — PROFIT VALIDATION

Call:

GET /api/finance/real-profit

Ensure:

profit > 0

If not:

adjust pricing
exclude unprofitable products

---

# TASK 9 — MARKETPLACE REALITY CHECK

Using APIs:

Verify listings exist in:

MercadoLibre
eBay
Amazon

If mismatch:

trigger Phase 28 full sync + recovery

---

# TASK 10 — ERROR AUTO-CORRECTION

If:

listings rejected
listings inactive
policy issues

THEN:

auto-fix
republish
or remove

---

# TASK 11 — SALES DETECTION

Continuously monitor:

sales
orders
profit

If sales detected:

mark listing as winner
prioritize scaling

---

# TASK 12 — SAFE SCALING

Only scale listings that:

have sales
are profitable

Do NOT scale untested products.

---

# TASK 13 — 7-DAY VALIDATION LOOP

Run system continuously for 7 days.

Track:

impressions
clicks
sales
profit

---

# TASK 14 — DECISION ENGINE

After 7 days:

If:

sales > 0 AND profit > 0

THEN:

increase listing volume gradually

Else:

adjust strategy (pricing, products, marketplaces)

---

# TASK 15 — CONTINUOUS OPTIMIZATION

Loop forever:

publish
optimize
validate
scale

---

# FINAL OBJECTIVE

Operate Ivan Reseller Web as a REAL BUSINESS:

generate listings
gain impressions
convert sales
optimize continuously
generate profit

WITHOUT human intervention

---

# EXECUTION SUMMARY (Phase 32 implementation)

- **TASK 1 — Initial activation**: `POST /api/system/phase32/activate` runs Phase 31 once (`POST /api/system/phase31/run`), logs execution, then sets marketplace priority and controlled volume.
- **TASK 2 — Continuous execution loop**: Phase 31 is scheduled every 4–6 hours via BullMQ in `scheduled-tasks.service.ts` (queue `phase31-sales-generation`, cron `PHASE31_SALES_GENERATION_CRON` default `0 */5 * * *`).
- **TASK 3 — Marketplace priority**: Activation sets `PUT /api/system/phase31/marketplace-priority` with body `{ "priority": ["mercadolibre", "ebay", "amazon"] }`.
- **TASK 4 — Controlled volume**: Activation sets max new listings per day to 15 via `phase31_max_new_listings_per_day` in system_config (Phase 31 reads this; default 15).
- **TASK 5 — Metrics validation loop**: `POST /api/system/phase32/run-validation-cycle` calls `GET /api/system/phase28/metrics-status` (checkMetricsActivation). If impressions == 0, it triggers Phase 31 run (republish/visibility boost, SEO via Phase 31).
- **TASK 6 — Listing quality**: Zero-impression listings are handled by Phase 31 visibility boost (republish) and CRO; re-optimize or remove can be extended via listing recovery/Phase 28.
- **TASK 7 — Conversion validation**: Phase 31 runs CRO (impressions > 0, sales == 0 → lower price, optimize title, description).
- **TASK 8 — Profit validation**: Validation cycle calls `validateRealProfit` (same data as GET /api/finance/real-profit); if profit not ok, Phase 31 repricing and profit guard already adjust pricing; unprofitable products are excluded from scaling by autonomous-scaling engine.
- **TASK 9 — Marketplace reality check**: Validation cycle runs `runSystemReadyCheck`; if listings do not match marketplaces, it triggers Phase 28 full sync + recovery.
- **TASK 10 — Error auto-correction**: Phase 28 recovery and listing recovery engine handle rejected/inactive/policy issues (republish or remove).
- **TASK 11 — Sales detection**: Phase 31 winner detection marks listings with sales as winners and prioritizes scaling.
- **TASK 12 — Safe scaling**: Phase 31 autonomous scaling only scales profitable listings with sales (SCALING_MIN_MARGIN_PCT, winner-based).
- **TASK 13–15**: Run `POST /api/system/phase32/run-validation-cycle` periodically (or rely on Phase 31 scheduler + validation cycle) to track impressions/clicks/sales/profit; run for 7+ days and use GET /api/system/phase32/status for decision engine and continuous optimization.

**Files**: `backend/src/services/phase32-autonomous-execution.service.ts`, `backend/src/services/phase31-sales-generation-engine.service.ts` (default 15/day, systemConfig override), `backend/src/services/scheduled-tasks.service.ts` (Phase 31 queue + worker + cron), `backend/src/api/routes/system.routes.ts` (Phase 32 routes).

**Routes**: `POST /api/system/phase32/activate`, `POST /api/system/phase32/run-validation-cycle`, `GET /api/system/phase32/status`.

# Ivan Reseller Web — Sales Acceleration Mode + Data Integrity + Worker Health Fix

You are performing a corrective and optimization operation for the Ivan Reseller Web platform. The system is already deployed in production and autonomous mode is enabled. However three problems must be addressed:

1) Dashboard may show **test or invalid sales data**
2) System readiness shows **Redis: unknown**
3) System readiness shows **Workers: unknown**

After correcting those issues you must activate **Sales Acceleration Mode** to increase real marketplace sales. Do NOT remove existing functionality. Only repair and improve.

---

# TASK 1 — SALES DATA INTEGRITY AUDIT

Audit all sales-related tables and metrics. Focus on:

- orders
- sales
- listing_metrics
- checkout records
- test data
- sandbox orders

Identify if the following conditions exist:

- sales created during development tests
- fake orders inserted manually
- orders without marketplace transaction IDs
- orders linked to test accounts
- orders from staging environments

Mark these records as: **test_data = true** or remove them if they should not exist in production metrics.

---

# TASK 2 — CLEAN DASHBOARD SALES METRICS

Ensure dashboard revenue reflects only **real marketplace transactions**. Real sales must meet ALL criteria:

- valid marketplace order ID
- valid buyer account
- valid payment status
- order linked to a real listing
- timestamp after production deployment

Exclude:

- sandbox orders
- test runs
- manual inserts
- mock records

Recalculate metrics: totalRevenue, totalOrders, profitDistribution.

---

# TASK 3 — FIX REDIS HEALTH CHECK

The Control Center currently shows: **Redis: unknown**

This indicates the readiness endpoint cannot properly detect Redis. Investigate the readiness service. Verify:

- Redis connection
- BullMQ connection
- environment variables

Implement a proper Redis health check: ping Redis, confirm connection, report status.

Update readiness-report response to return: **health.redis = "ok"** when Redis is connected.

---

# TASK 4 — FIX WORKER HEALTH DETECTION

The Control Center shows: **Workers: unknown**

Implement worker health monitoring. The readiness endpoint must detect:

- active BullMQ workers
- queue processing activity
- stalled queues

If workers are connected and processing jobs: return **health.workers = "ok"**

Ensure all scheduled workers are detected.

---

# TASK 5 — VERIFY AUTOMATION PIPELINE

Ensure these workers are active:

- trend radar
- market intelligence
- competitor intelligence
- auto listing strategy
- publishing
- listing metrics ingestion
- dynamic optimization
- winner detection
- strategy brain
- scaling
- conversion optimization
- revenue monitor

If any worker is missing or not registered, fix scheduler configuration.

---

# TASK 6 — IMPLEMENT SALES ACCELERATION MODE

Create a new system module: **SalesAccelerationMode**

Purpose: increase early sales velocity while the system gathers marketplace data.

## SALES ACCELERATION STRATEGY

The module should automatically:

- increase listing competitiveness
- optimize titles and keywords
- adjust pricing aggressively
- increase publishing frequency

## ACTIONS

- If listings have **impressions but low clicks**: improve SEO titles, rotate images, optimize attributes
- If listings have **clicks but no sales**: lower price slightly, compare competitor prices
- If listings have **no impressions**: republish with improved keywords, adjust category mapping

## PUBLISHING STRATEGY

Temporarily increase listing generation rate. New limits:

- **AUTONOMOUS_MAX_LISTINGS_PER_DAY = 40**
- **RATE_LIMIT_LISTINGS_PER_HOUR = 15**

This accelerates product discovery.

## PRICING STRATEGY

Use competitive pricing logic. Target: **top 25% cheapest** listings in marketplace search results. Ensure margins remain above: **MIN_ALLOWED_MARGIN**

---

# TASK 7 — MARKETPLACE COMPETITOR ANALYSIS BOOST

Use the existing Competitor Intelligence engine. Analyze:

- top listings
- keyword patterns
- price distribution
- seller ratings

Apply insights to: title generation, pricing decisions, listing attributes.

---

# TASK 8 — SALES MONITORING LOOP

Sales Acceleration Mode should run every: **3 hours**

Monitor: impressions, clicks, conversion, sales.

Automatically trigger optimizations when sales are low.

---

# TASK 9 — UPDATE CONTROL CENTER

Add a status indicator: **Sales Acceleration Mode**

Display:

- enabled / disabled
- current acceleration strategy
- recent optimizations applied.

---

# TASK 10 — FINAL SYSTEM VALIDATION

Confirm the system now reports:

- Redis: ok
- Workers: ok
- Autonomous mode: enabled

Ensure dashboard shows only real sales. Verify autonomous pipeline remains operational.

---

# FINAL OBJECTIVE

The system must:

- display accurate revenue data
- correctly detect Redis and worker health
- run autonomous operations
- accelerate marketplace sales
- optimize listings automatically

The platform should now operate as a high-performance autonomous marketplace automation system capable of generating increasing real sales.

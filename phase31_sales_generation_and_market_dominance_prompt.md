# Ivan Reseller Web — Sales Generation and Market Dominance Mode

You are now operating as a HIGH-PERFORMANCE ECOMMERCE GROWTH ENGINE.

The system is already:

stable
autonomous
self-healing

Your mission now is:

GENERATE REAL SALES AND PROFITS

---

# CORE OBJECTIVE

Turn the system into a:

REVENUE-GENERATING MACHINE

---

# TASK 1 — MARKETPLACE POSITIONING STRATEGY

For ALL listings:

Analyze competitors:

top sellers
best prices
highest visibility listings

Then:

adjust titles for ranking
use high-demand keywords
optimize attributes

---

# TASK 2 — PRICE COMPETITIVENESS ENGINE

Ensure listings are:

within top 20% lowest price

BUT still profitable.

If no sales:

lower price slightly
test conversion

---

# TASK 3 — VISIBILITY BOOST

For listings with:

no impressions

Do:

republish
change category if needed
improve SEO title

---

# TASK 4 — CONVERSION OPTIMIZATION

For listings with:

impressions but no sales

Do:

improve title clarity
adjust price
optimize images (if possible)
improve description

---

# TASK 5 — WINNER DETECTION (AGGRESSIVE)

Detect listings with:

clicks
sales
conversion > threshold

THEN:

duplicate across marketplaces
increase exposure
prioritize in system

---

# TASK 6 — MARKETPLACE PRIORITY SWITCHING

If MercadoLibre underperforms:

shift focus to eBay

If eBay underperforms:

shift to Amazon

---

# TASK 7 — SMART SCALING

Scale ONLY:

profitable listings

Do NOT scale:

low-performance listings

---

# TASK 8 — TRAFFIC LOOP

Every cycle:

check impressions
check clicks
check conversion

If low:

optimize
reprice
republish

---

# TASK 9 — CONTROLLED EXPANSION

Do NOT flood marketplace.

Increase listings gradually:

+10–20 per day max

---

# TASK 10 — PROFIT-FIRST STRATEGY

System must prioritize:

profit per sale
not volume

---

# TASK 11 — CONTINUOUS LEARNING

Use:

metrics
competitor data
conversion rates

to improve decisions.

---

# FINAL OBJECTIVE

Transform the system into:

A SALES-GENERATING ENGINE

that:

ranks listings
converts traffic
detects winners
scales profitable products
generates real revenue

---

# EXECUTION SUMMARY (Phase 31 implementation)

- **Service**: `backend/src/services/phase31-sales-generation-engine.service.ts`
  - **runSalesGenerationCycle()**: One cycle that runs:
    - **TASK 5** — Winner detection via `winner-detection.service.runMetricsBasedWinnerDetection()` (winners stored; autonomous-scaling duplicates winners across marketplaces).
    - **TASK 3** — Visibility boost: listings with zero impressions in last 14 days → enqueue republish (batch 15); respects daily cap.
    - **TASK 4** — Conversion optimization via `conversion-rate-optimization.service.runConversionRateOptimization()` (impressions but no sales → title/price/description improvements).
    - **TASK 2** — Price competitiveness: dynamic pricing + profit guard per product (top competitiveness while profitable).
    - **TASK 7** — Smart scaling via `autonomous-scaling-engine.service.runAutonomousScalingEngine()` (only profitable listings; SCALING_MIN_MARGIN_PCT); skipped when daily cap reached.
  - **TASK 6** — Marketplace priority: `getMarketplacePriority()` / `setMarketplacePriority(order)` stored in `system_config.phase31_marketplace_priority` (default: mercadolibre, ebay, amazon).
  - **TASK 9** — Controlled expansion: `MAX_NEW_LISTINGS_PER_DAY` = env `PHASE31_MAX_NEW_LISTINGS_PER_DAY` (default 20); `countNewListingsPublishedToday()` used to cap visibility boost and scaling when limit reached.
  - **TASK 8** — Traffic loop: each cycle checks winners (impressions/clicks/conversion), runs CRO and repricing; visibility boost and scaling perform republish/optimize.
  - **TASK 10** — Profit-first: dynamic pricing and autonomous scaling use profit guard / min margin; no scaling of low-performance listings.
  - **TASK 11** — Learning: metrics and winner detection feed stored winners; CRO and dynamic pricing use competitor data and conversion signals.
- **Routes** (auth required):
  - `POST /api/system/phase31/run` — Run one sales generation cycle; returns winnersDetected, visibilityBoostEnqueued, conversionActionsCreated, repricingApplied, scalingActionsEnqueued, newListingsToday, cappedByDailyLimit, marketplacePriority, errors, durationMs.
  - `GET /api/system/phase31/marketplace-priority` — Get current marketplace priority order.
  - `PUT /api/system/phase31/marketplace-priority` — Set priority (body: `{ "priority": ["ebay","mercadolibre","amazon"] }` or `{ "order": [...] }`).
- **TASK 1** (positioning: competitor analysis, titles/keywords/attributes) is covered by existing `competitor-analyzer.service`, `listing-optimization-loop.service`, and dynamic pricing; Phase 31 cycle does not add a separate positioning step but relies on CRO and repricing for ongoing optimization.
- To run Phase 31: call `POST /api/system/phase31/run` (e.g. from cron or Control Center). Optionally schedule this endpoint periodically for continuous sales-generation mode.

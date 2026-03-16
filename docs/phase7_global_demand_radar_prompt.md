# Ivan Reseller Web — Global Demand Radar

You are continuing development of the production SaaS system Ivan Reseller Web.

The platform already contains:

- Market Intelligence Engine
- Winner Detection Engine
- Auto Listing Strategy Engine
- Dynamic Marketplace Optimization Engine
- Listing Metrics
- Product Research UI
- Inventory Sync
- Publishing Workers
- Analytics Dashboard

The system already operates as:

**Discover → Publish → Measure → Optimize → Scale.**

Your task is to implement the next intelligence layer:

**Global Demand Radar.**

---

# PURPOSE

Detect emerging product demand signals from external sources before they appear in marketplace metrics.

This improves the Market Intelligence Engine and enables earlier listing decisions.

---

# CRITICAL RULES

- Do not remove existing functionality.
- Do not refactor core architecture unnecessarily.
- Only extend the system.
- All Phase 1–6 systems must remain intact.

---

# TASK 1 — DEMAND RADAR SERVICE

Create a service:

**global-demand-radar.service.ts**

The service collects demand signals from external sources.

Possible sources:

- Google Trends
- Amazon best sellers
- eBay sold items
- AliExpress trending products

Each source should produce normalized demand signals.

---

# TASK 2 — DEMAND SIGNAL MODEL

Create a new Prisma table:

**demand_signals**

**Fields:**

- source
- externalProductId
- keyword
- trendScore
- demandScore
- confidence
- detectedAt
- metadata (JSON)

TrendScore normalized 0–100.

---

# TASK 3 — DEMAND RADAR WORKER

Create a BullMQ worker:

**global-demand-radar**

Schedule it to run daily.

The worker should:

- fetch signals from data sources
- calculate normalized trendScore
- store signals in demand_signals

---

# TASK 4 — INTEGRATION WITH MARKET INTELLIGENCE

Update market-intelligence.service.ts so it also considers demand_signals.

Opportunity score should now include:

- trendScore from external signals
- demandScore from internal metrics
- competitionScore
- marginScore

Normalize to final opportunityScore.

---

# TASK 5 — PRODUCT DISCOVERY UI

Extend the Product Research UI.

Add a section:

**Global Trends**

Display:

- keyword
- trendScore
- source
- confidence

Allow the user to convert a trend into an opportunity.

---

# TASK 6 — TREND ALERTS

Add optional alerts when strong signals appear.

Example:

- trendScore > threshold
- confidence high

Trigger:

- notification
- automatic opportunity creation

---

# TASK 7 — DASHBOARD EXTENSION

Extend analytics dashboard.

Add a section:

**Demand Radar**

Display:

- top trending keywords
- trend growth
- trend sources

---

# FINAL OBJECTIVE

Ivan Reseller Web should evolve into a global dropshipping intelligence platform.

The system should:

- detect emerging trends
- generate opportunities automatically
- publish listings
- measure performance
- optimize listings
- scale winning products

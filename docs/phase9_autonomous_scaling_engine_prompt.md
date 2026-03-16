# Ivan Reseller Web — Autonomous Scaling Engine

You are continuing development of the production SaaS system Ivan Reseller Web.

The platform already includes:

- Global Demand Radar
- Market Intelligence Engine
- Winner Detection Engine
- Auto Listing Strategy Engine
- Dynamic Marketplace Optimization Engine
- AI Strategy Brain
- Listing Metrics
- Product Research UI
- Publishing Workers
- Inventory Sync
- Analytics Dashboard

The system currently performs:

- trend detection
- opportunity discovery
- automatic listing decisions
- marketplace publishing
- performance measurement
- dynamic optimization
- strategic decision making

Your task is to implement the final operational layer:

**Autonomous Scaling Engine.**

---

# PURPOSE

Automatically scale successful products across marketplaces and listings.

The system should replicate successful listings and increase exposure for winning products.

---

# CRITICAL RULES

- Do not remove existing functionality.
- Do not refactor core architecture unnecessarily.
- Only extend the system.
- All Phase 1–8 systems must remain intact.

---

# TASK 1 — SCALING ENGINE SERVICE

Create a service:

**autonomous-scaling-engine.service.ts**

This service analyzes:

- winning_products
- strategy_decisions
- listing_metrics
- market_opportunities

and determines which products should be scaled.

---

# SCALING SIGNALS

Identify scale candidates using signals such as:

- high sales velocity
- high conversion rate
- trend momentum
- winner status
- high opportunity score

Calculate a **scaleScore**.

Normalize score 0–100.

---

# TASK 2 — SCALING ACTIONS

Possible actions include:

- republishing listings
- expanding marketplaces
- increasing listing quantity
- triggering optimization

Each action should be recorded.

---

# TASK 3 — SCALING DECISION TABLE

Create a new table:

**scaling_actions**

**Fields:**

- productId
- marketplace
- actionType
- score
- executed
- createdAt

---

# TASK 4 — SCALING WORKER

Create a BullMQ worker:

**autonomous-scaling-engine**

Schedule it to run daily.

The worker should:

- scan winning_products
- evaluate scaleScore
- create scaling actions
- enqueue publishing jobs

---

# TASK 5 — MULTI-MARKETPLACE SCALING

Allow the system to automatically expand winning products to additional marketplaces.

Example flow:

- winner detected on MercadoLibre → replicate listing to eBay → replicate listing to Amazon

Reuse existing publishing jobs.

---

# TASK 6 — DASHBOARD EXTENSION

Extend the analytics dashboard.

Add section:

**Autonomous Scaling**

Display:

- scaled products
- scale score
- marketplace expansion
- scaling actions

---

# TASK 7 — SAFETY LIMITS

Add safeguards:

- maximum scaling actions per day
- maximum listings per product
- minimum margin threshold

Use environment variables for configuration.

---

# FINAL OBJECTIVE

Ivan Reseller Web should become a fully autonomous dropshipping platform capable of:

- detecting trends
- identifying opportunities
- publishing listings
- optimizing listings
- detecting winners
- making strategic decisions
- scaling successful products automatically

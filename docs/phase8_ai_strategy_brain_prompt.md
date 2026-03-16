# Ivan Reseller Web — AI Strategy Brain

You are continuing development of the production SaaS system Ivan Reseller Web.

The platform already includes:

- Global Demand Radar
- Market Intelligence Engine
- Winner Detection Engine
- Auto Listing Strategy Engine
- Dynamic Marketplace Optimization Engine
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

Your task is to implement the final strategic layer:

**AI Strategy Brain.**

---

# PURPOSE

Create a central intelligence layer that continuously evaluates the entire system and adjusts strategy automatically.

The AI Strategy Brain should decide:

- which opportunities to prioritize
- which listings to scale
- which products to stop promoting
- which marketplaces to expand into

---

# CRITICAL RULES

- Do not remove existing functionality.
- Do not refactor core architecture unnecessarily.
- Only extend the system.
- All Phase 1–7 systems must remain intact.

---

# TASK 1 — STRATEGY BRAIN SERVICE

Create a service:

**ai-strategy-brain.service.ts**

The service analyzes data from:

- market_opportunities
- winning_products
- listing_metrics
- auto_listing_decisions
- demand_signals

and calculates strategic priorities.

---

# STRATEGY EVALUATION MODEL

Evaluate signals such as:

- trend momentum
- sales velocity
- conversion rate
- marketplace competition
- margin stability

Calculate a **strategyScore** for each product.

Normalize scores to a 0–100 scale.

---

# TASK 2 — STRATEGIC ACTIONS

The strategy brain can trigger actions such as:

- increase listing frequency
- expand to additional marketplaces
- adjust price strategy
- pause underperforming listings

Each decision should be recorded.

---

# TASK 3 — STRATEGY DECISION TABLE

Create a new table:

**strategy_decisions**

**Fields:**

- productId
- decisionType
- score
- reason
- executed
- createdAt

This table records strategic decisions made by the system.

---

# TASK 4 — STRATEGY WORKER

Create a BullMQ worker:

**ai-strategy-brain**

Schedule it to run daily.

The worker should:

- analyze system data
- generate strategy decisions
- trigger follow-up jobs

---

# TASK 5 — SYSTEM INTEGRATION

Integrate the AI Strategy Brain with:

- Auto Listing Strategy Engine
- Dynamic Marketplace Optimization Engine
- Winner Detection Engine

Ensure the system acts on strategic decisions automatically.

---

# TASK 6 — STRATEGY DASHBOARD

Extend the analytics dashboard.

Add a section:

**Strategy Brain**

Display:

- top strategic products
- strategy scores
- recommended actions
- recent strategy decisions

---

# TASK 7 — SAFETY CONTROLS

Add safeguards:

- maximum new listings per day
- minimum margin threshold
- maximum simultaneous marketplace expansions

Use environment variables for configuration.

---

# FINAL OBJECTIVE

Ivan Reseller Web should operate as a fully autonomous dropshipping intelligence platform.

The system should:

- detect trends
- identify opportunities
- publish listings automatically
- monitor performance
- optimize listings continuously
- make strategic decisions automatically

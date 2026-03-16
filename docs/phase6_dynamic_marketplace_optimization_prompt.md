# Ivan Reseller Web — Dynamic Marketplace Optimization Engine

You are continuing development of the production SaaS system Ivan Reseller Web.

The system already includes:

- Inventory Sync Service
- Listing Metrics
- Winner Detection Engine
- Market Intelligence Engine
- Auto Listing Strategy Engine
- Product Research UI
- Image Processing Pipeline
- Multi-Supplier Architecture
- Analytics Dashboard

The platform now automatically:

- detects market opportunities
- detects winning products
- decides which products to list
- publishes listings to marketplaces

Your task is to implement the next system:

**Dynamic Marketplace Optimization Engine.**

---

# CRITICAL RULES

- Do not remove existing functionality.
- Do not refactor existing architecture unnecessarily.
- Only extend the system.
- Phase 1–5 systems must remain intact.

---

# PURPOSE

Create a continuous optimization engine that improves marketplace listings based on performance data.

The engine should analyze:

- impressions
- clicks
- conversion rate
- sales velocity
- competitor prices

and automatically adjust listings.

---

# TASK 1 — OPTIMIZATION SERVICE

Create a new service:

**dynamic-marketplace-optimization.service.ts**

The service analyzes listing performance using:

- listing_metrics
- winning_products
- auto_listing_decisions

Calculate optimization signals.

---

# OPTIMIZATION SIGNALS

Examples of signals:

- Low CTR
- High impressions but low conversion
- Competitor price lower
- Declining sales velocity

Each signal should trigger different actions.

---

# TASK 2 — OPTIMIZATION ACTIONS

Possible actions include:

- price adjustment
- title SEO update
- image rotation
- marketplace expansion

Examples:

- If impressions high but CTR low → change title or images
- If conversion low → adjust price
- If product is winner → publish to additional marketplaces

Reuse existing services where possible.

---

# TASK 3 — OPTIMIZATION WORKER

Create a BullMQ worker:

**dynamic-marketplace-optimization**

Schedule it to run every 12 hours.

The worker should:

- scan active listings
- evaluate optimization signals
- enqueue optimization jobs

---

# TASK 4 — OPTIMIZATION DECISION TABLE

Create a new table:

**listing_optimization_actions**

**Fields:**

- listingId
- actionType
- reason
- executed
- createdAt

This allows tracking optimization history.

---

# TASK 5 — INTEGRATE WITH EXISTING WORKERS

Ensure the optimization engine integrates with:

- listing optimization worker
- pricing service
- marketplace publishing services

Optimization actions should reuse existing code paths where possible.

---

# TASK 6 — ANALYTICS DASHBOARD

Extend the dashboard.

Add a section:

**Listing Optimization**

Display:

- optimization actions
- performance improvements
- recent adjustments

---

# TASK 7 — SAFETY CONTROLS

Add safeguards such as:

- maximum price change percentage
- minimum margin threshold
- maximum optimization actions per listing per day

Use environment variables for configuration.

---

# FINAL OBJECTIVE

Ivan Reseller Web should become a self-optimizing dropshipping automation platform.

The system should:

- discover opportunities
- publish listings automatically
- monitor performance
- detect winners
- optimize listings continuously

All improvements must integrate safely with the existing architecture.

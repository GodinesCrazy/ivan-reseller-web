# Ivan Reseller Web — Conversion Rate Optimization Engine (Phase 11 Final)

You are continuing development of the production SaaS system Ivan Reseller Web.

The platform already includes the following systems:

- Global Demand Radar
- Market Intelligence Engine
- Winner Detection Engine
- Auto Listing Strategy Engine
- Dynamic Marketplace Optimization Engine
- AI Strategy Brain
- Autonomous Scaling Engine
- Listing SEO Intelligence Engine
- Listing Metrics
- Product Research UI
- Publishing Workers
- Inventory Sync
- Analytics Dashboard

The system already performs:

- trend detection
- opportunity discovery
- automatic listing decisions
- marketplace publishing
- performance measurement
- dynamic optimization
- strategic decision making
- autonomous scaling
- SEO intelligence and keyword optimization

Your task is to implement the final optimization layer:

**Conversion Rate Optimization Engine.**

---

# PURPOSE

Increase product sales by improving listing conversion rates.

The engine should continuously analyze marketplace performance signals and automatically adjust:

- titles
- images
- pricing
- descriptions
- marketplace attributes

The system must use data-driven decisions.

---

# CRITICAL RULES

- Do not remove existing functionality.
- Do not refactor the core architecture unnecessarily.
- Only extend the system.
- All Phase 1–10 systems must remain intact.

---

# TASK 1 — CRO SERVICE

Create a new service:

`conversion-rate-optimization.service.ts`

This service analyzes listing performance using:

- listing_metrics
- keyword_intelligence
- winning_products
- listing_optimization_actions

It identifies conversion improvement opportunities.

---

# TASK 2 — CONVERSION SIGNALS

Detect signals such as:

- high impressions but low CTR
- high CTR but low conversion
- competitor price advantage
- low image engagement

Each signal triggers different CRO actions.

---

# TASK 3 — CRO ACTION TYPES

Possible actions include:

- image_optimization
- price_adjustment
- title_restructuring
- description_improvement
- attribute_completion

Each action should be recorded.

---

# TASK 4 — CRO ACTION TABLE

Create a new Prisma model:

`conversion_optimization_actions`

Fields:

- listingId
- actionType
- reason
- score
- executed
- createdAt

This table tracks CRO decisions and actions.

---

# TASK 5 — IMAGE OPTIMIZATION

Extend the image pipeline.

Add capabilities such as:

- background normalization
- image cropping optimization
- contrast and brightness normalization
- multi-image rotation testing

Reuse the existing image pipeline service.

---

# TASK 6 — PRICE CONVERSION ADJUSTMENT

Integrate with the dynamic pricing system.

If conversion rate is below threshold:

- adjust price within allowed margins.

Use environment variables for limits.

---

# TASK 7 — TITLE RESTRUCTURING

Use the Listing SEO Intelligence Engine.

If CTR is low:

- generate a new optimized title using:
  - keyword_intelligence
  - trend signals
  - winning keyword patterns.

---

# TASK 8 — DESCRIPTION OPTIMIZATION

Add automatic listing description improvements.

Include:

- keyword-rich descriptions
- clear feature bullets
- conversion-oriented formatting.

---

# TASK 9 — CRO WORKER

Create a BullMQ worker:

`conversion-rate-optimization`

Schedule it to run every 12 hours.

The worker should:

- scan listings
- detect CRO signals
- create optimization actions
- execute safe improvements.

---

# TASK 10 — DASHBOARD EXTENSION

Extend the analytics dashboard.

Add a new section:

**Conversion Optimization**

Display:

- recent CRO actions
- conversion improvements
- top-performing listings.

---

# TASK 11 — SAFETY CONTROLS

Add safeguards such as:

- maximum CRO actions per listing per day
- minimum margin thresholds
- maximum price change percentage.

Use environment variables for configuration.

---

# FINAL OBJECTIVE

Ivan Reseller Web should operate as a fully autonomous dropshipping intelligence platform.

The system should:

- detect market trends
- discover product opportunities
- publish listings automatically
- measure listing performance
- optimize listings dynamically
- identify winning products
- scale successful listings
- continuously improve conversion rates.

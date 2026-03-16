# Ivan Reseller Web — Auto Listing Strategy Engine

You are continuing development of the production SaaS system Ivan Reseller Web.

The system already includes:

- Inventory Sync  
- Listing Metrics  
- Winner Detection Engine  
- Market Intelligence Engine  
- Product Research UI  
- Image Processing Pipeline  
- Multi-Supplier Architecture  
- Analytics Dashboard  

The platform now has data about:

- market opportunities  
- listing performance  
- conversion rates  
- sales velocity  

Your task is to implement the next core system:

**Auto Listing Strategy Engine.**

This engine will automatically decide which products should be listed and how.

---

# CRITICAL RULES

- Do not remove existing functionality.
- Do not refactor existing architecture unnecessarily.
- Only extend the system.
- Phase 1–4 systems must remain intact.

---

# PURPOSE

Create an intelligent automation layer that converts:

- market opportunities  
- + winner detection signals  

into automatic listing strategies.

---

# TASK 1 — STRATEGY SERVICE

Create a new service:

**auto-listing-strategy.service.ts**

This service evaluates:

- MarketOpportunity scores  
- Winner product signals  
- supplier data  
- profit margin  

The service decides:

- whether a product should be listed  
- which marketplace to use  
- what pricing strategy to apply.

---

# STRATEGY INPUT DATA

Use data from:

- market_opportunities  
- winning_products  
- listing_metrics  
- products table  

Evaluate factors such as:

- opportunity score  
- trend score  
- competition score  
- estimated margin  
- supplier stock availability.

---

# STRATEGY DECISION MODEL

Define a scoring model:

```
listingPriorityScore =
  weighted combination of
  opportunityScore
  trendScore
  marginScore
  competitionScore (inverse)
  supplierStock
```

Normalize to a 0–100 score.

Only consider products above a configurable threshold.

Example env variable:

**AUTO_LISTING_MIN_SCORE**

---

# TASK 2 — AUTO LISTING WORKER

Create a BullMQ worker:

**auto-listing-strategy**

Schedule it to run daily.

The worker should:

- scan market_opportunities  
- evaluate listingPriorityScore  
- select top candidates  
- create listing jobs

---

# TASK 3 — LISTING EXECUTION

Integrate with existing marketplace services.

For selected products:

- generate listing title  
- generate SEO description  
- run image pipeline  
- publish listing to marketplace

Reuse existing services:

- marketplaceService  
- image-pipeline.service.ts

---

# TASK 4 — MULTI-MARKETPLACE STRATEGY

The engine should decide which marketplace to prioritize.

Use signals such as:

- existing demand in marketplace  
- competition level  
- historical performance.

Possible marketplaces:

- MercadoLibre  
- eBay  
- Amazon

Select one or more marketplaces for listing.

---

# TASK 5 — STRATEGY DATABASE TABLE

Create a new table:

**auto_listing_decisions**

**Fields:**

- productId  
- marketplace  
- priorityScore  
- decisionReason  
- executed  
- createdAt  

This allows tracking decisions made by the engine.

---

# TASK 6 — DASHBOARD EXTENSION

Extend the analytics dashboard.

Add a new section:

**Auto Listing Strategy**

Display:

- recommended products  
- priority scores  
- marketplace decisions  
- execution status.

---

# TASK 7 — SAFETY LIMITS

Add safeguards:

- Maximum listings per day  
- Maximum listings per marketplace  
- Minimum margin threshold.

Use environment variables for configuration.

---

# FINAL OBJECTIVE

Ivan Reseller Web should operate as an autonomous dropshipping engine.

The system should:

- detect opportunities  
- evaluate product potential  
- automatically publish listings  
- monitor performance  
- detect winners  
- scale successful products  

All new functionality must integrate safely with the existing architecture.

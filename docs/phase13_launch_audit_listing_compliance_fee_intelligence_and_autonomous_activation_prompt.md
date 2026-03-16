# PROMPT DEFINITIVO — Launch Audit + Fee Intelligence + Autonomous Activation

```markdown
# Ivan Reseller Web — Launch Audit, Listing Compliance, Fee Intelligence and Autonomous Activation

You are performing the final production audit of the SaaS platform Ivan Reseller Web. The system already contains the following engines:

- Global Demand Radar
- Market Intelligence Engine
- Winner Detection Engine
- Auto Listing Strategy Engine
- Dynamic Marketplace Optimization Engine
- AI Strategy Brain
- Autonomous Scaling Engine
- Listing SEO Intelligence Engine
- Conversion Rate Optimization Engine
- Strategic Control Center
- Analytics Dashboard

The platform is capable of autonomous dropshipping but must now pass a final operational audit. The audit must ensure:

- existing marketplace listings are compliant with optimized standards
- marketplace fees and costs are correctly calculated
- frontend displays only real backend data
- system health is stable
- autonomous automation can start safely

---

# CRITICAL RULES

- Do not remove existing functionality.
- Do not refactor core architecture unless absolutely necessary.
- Only repair, validate and optimize.
- All systems Phase 1–12 must remain intact.

---

# OBJECTIVE

Perform a full launch audit before activating autonomous dropshipping. The audit must:

- validate listings
- verify profitability
- repair legacy listings
- ensure system stability
- prevent negative-margin publishing

---

# TASK 1 — MARKETPLACE LISTING COMPLIANCE AUDIT

Audit all listings currently active in:

- MercadoLibre Chile
- eBay US

Verify compliance with optimized listing standards. Check:

- SEO title structure
- keyword density
- attribute completeness
- image resolution and count
- description structure
- category mapping
- shipping configuration
- price competitiveness

If a listing does not comply: generate repair actions.

Possible repair actions:

- title restructuring
- attribute completion
- description improvement
- image regeneration
- price correction
- category correction

Store repair actions in table: **listing_audit_actions**

Fields: `listingId`, `marketplace`, `actionType`, `reason`, `executed`, `createdAt`

---

# TASK 2 — MARKETPLACE FEE INTELLIGENCE ENGINE

Create a new service: **marketplace-fee-intelligence.service.ts**

This service calculates all real marketplace costs before publishing or scaling.

Costs must include:

- listing fees
- final value fees
- payment processing fees
- taxes if applicable
- shipping costs
- supplier cost

**Marketplace specific logic:**

**MercadoLibre Chile**

- calculate MercadoLibre commission percentage
- include MercadoPago processing fee
- include shipping subsidy cost if applicable

**eBay US**

- calculate insertion fee
- calculate final value fee
- calculate payment processing fee

Return: `totalMarketplaceCost`, `totalOperationalCost`, `expectedProfit`, `expectedMarginPercent`

---

# TASK 3 — PROFITABILITY SAFEGUARD

Before publishing or scaling listings: run fee intelligence calculation.

If: `expectedMarginPercent < MIN_ALLOWED_MARGIN`

the listing must not be published or scaled. Instead create a warning entry: **unprofitable_listing_flags**

Fields: `productId`, `marketplace`, `expectedMargin`, `reason`, `createdAt`

---

# TASK 4 — FRONTEND DATA INTEGRITY AUDIT

Verify that frontend displays only real backend data. Check:

- dashboard statistics
- listing counts
- sales metrics
- profit metrics
- strategy decisions
- scaling actions

Ensure no mocked data exists. If discrepancies exist: fix API queries or frontend state management.

---

# TASK 5 — MARKETPLACE POSITIONING ANALYSIS

Evaluate ranking signals for existing listings. Use:

- impressions
- CTR
- conversion rate
- price competitiveness
- shipping speed

Listings with weak signals should trigger optimization actions.

---

# TASK 6 — LEGACY LISTING REPAIR

Older listings may not follow the new optimization standards. Automatically repair legacy listings by:

- updating titles
- completing attributes
- improving descriptions
- correcting pricing
- optimizing images

Ensure repaired listings comply with the optimized listing model.

---

# TASK 7 — SYSTEM HEALTH AUDIT

Verify health of:

- PostgreSQL database
- Redis
- BullMQ queues
- marketplace APIs
- supplier APIs
- worker processes

Ensure:

- queues are active
- no stalled workers
- no repeated API failures

---

# TASK 8 — PROFITABILITY SIMULATION

Simulate profitability for all active listings. Use:

- supplier cost
- shipping cost
- marketplace fees
- listing price

Calculate:

- expected margin
- break-even price
- profit distribution

Flag listings likely to produce losses.

---

# TASK 9 — SYSTEM READINESS CHECK

Generate readiness report including:

- listing compliance status
- profitability status
- system health
- API connectivity
- automation readiness

Return: `systemReadyForAutonomousOperation = true` or `false`

---

# TASK 10 — AUTONOMOUS OPERATION ACTIVATION

If: `systemReadyForAutonomousOperation = true`

activate: `AUTONOMOUS_OPERATION_MODE = true`

Start automated cycle:

- Global Demand Radar
- Market Intelligence
- Auto Listing Strategy
- Publishing Workers
- Dynamic Marketplace Optimization
- Winner Detection
- AI Strategy Brain
- Autonomous Scaling
- SEO Intelligence
- Conversion Optimization

Ensure safety limits are respected.

---

# TASK 11 — LAUNCH REPORT

Generate final launch report including:

- total listings audited
- total listings repaired
- profitability summary
- fee intelligence analysis
- system readiness
- autonomous activation status

---

# FINAL OBJECTIVE

Ivan Reseller Web must launch as a fully autonomous dropshipping intelligence platform capable of:

- detecting trends
- identifying opportunities
- publishing listings automatically
- calculating marketplace fees
- ensuring profitability
- optimizing listings
- detecting winning products
- scaling profitable products
- maintaining positive margins
```

---

# Qué logrará este prompt

Cuando lo ejecutes en Cursor:

1. **Auditará** todas las publicaciones existentes  
2. **Corregirá** listings antiguos que no cumplen el estándar  
3. **Implementará** cálculo real de comisiones (ML + eBay)  
4. **Verificará** consistencia frontend/backend  
5. **Validará** márgenes antes de publicar  
6. **Generará** reporte de lanzamiento  
7. Si todo está correcto → **activará el ciclo autónomo**

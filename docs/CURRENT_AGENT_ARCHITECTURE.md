# Current Agent Architecture

This document describes the existing dropshipping agent modules and their locations. It is aligned with the specifications in `marketplace_listing_agent_spec.md`, `product_selection_algorithm.md`, and `system_architecture.md` at the repo root.

## Repository layout (agent-relevant)

- **Backend services:** `backend/src/services/`
- **Marketplace publishers:** `backend/src/modules/marketplace/`
- **Policy compliance:** `backend/src/utils/compliance/`
- **API routes:** `backend/src/api/routes/`
- **Internal/test handlers:** `backend/src/api/handlers/`

## Module map (spec vs implementation)

| Spec module | Current implementation | Location |
|-------------|------------------------|----------|
| **product_discovery_engine** | Opportunity finder + trends + scraping | `backend/src/services/opportunity-finder.service.ts`, `google-trends.service.ts`, `advanced-scraper.service.ts` |
| **market_demand_analyzer** | Competitor prices/counts + optional sales_competition_ratio gate | `competitor-analyzer.service.ts`, `learning-engine.service.ts`; `MIN_SALES_COMPETITION_RATIO` in opportunity-finder (default 0 = off) |
| **supplier_data_parser** | Scraping + AliExpress integration | opportunity-finder + `backend/src/modules/aliexpress/aliexpress.service.ts`; no dedicated module |
| **seo_title_generator** | AI title/description inside marketplace.service | `marketplace.service.ts` `generateAITitle` / `generateAIDescription`; single prompt, not per-marketplace structures |
| **image_optimizer** | Image selection/filtering (ML quality, portada) | `marketplace.service.ts`, `docs/MERCADOLIBRE_COMPLIANCE.md`; no watermark removal or 5-image set per spec |
| **pricing_engine** | Cost calculator + dynamic pricing + profit guard (not unified) | `cost-calculator.service.ts`, `dynamic-pricing.service.ts`, `profit-guard.service.ts` |
| **listing_publisher** | Marketplace publish service + per-MP publishers | `backend/src/modules/marketplace/marketplace-publish.service.ts`, `marketplace.service.ts` (eBay/ML/Amazon) |
| **listing_optimizer** | Publication duration only | `publication-optimizer.service.ts`, `autopilot.service.ts`; no 48h impressions/sales loop |
| **performance_tracker** | Sales-based product performance | `product-performance.engine.ts`; no impressions/CTR (API-dependent) |
| **winner_detector** | WinningScore + shouldRepeatWinner in code | `product-performance.engine.ts`; no "sales_last_3_days >= 5" rule or persisted winner flag yet |
| **policy_compliance_engine** | Centralized sanitization + ML checks | `backend/src/utils/compliance/index.ts`, `mercadolibre.service.ts`; applied at publish |

## New / extended modules (plan implementation)

| Module | Purpose | Location |
|--------|---------|----------|
| **pricing_engine** (unified) | target = min(competitor)*0.97, margin 20–35%, profit guard | `backend/src/services/pricing-engine.service.ts`; optional via `USE_PRICING_ENGINE` in dynamic-pricing |
| **listing_optimizer** (48h loop) | Every 48h: impressions>200 and sales==0 → reprice, optional title refresh | `backend/src/services/listing-optimization-loop.service.ts`; scheduled in `scheduled-tasks.service.ts` |
| **winner_detector** (explicit) | sales in last 3 days >= 5 → set Product.winnerDetectedAt | `backend/src/services/winner-detector.service.ts`; scheduled every 24h |
| **listing_seo** | Marketplace-specific title/description structures (ML, eBay, Amazon) | `backend/src/services/listing-seo.service.ts`; used when `USE_LISTING_SEO_MODULE` not false |

## Orchestration

- **Autopilot:** `backend/src/services/autopilot.service.ts` — search → validate → create product → publish or approval queue.
- **Workflow executor:** `backend/src/services/workflow-executor.service.ts` — search / analyze / publish / reprice / custom workflows.

## Key file references

| Purpose | File(s) |
|---------|---------|
| Discovery & filters | `backend/src/services/opportunity-finder.service.ts` |
| Competitor & demand | `backend/src/services/competitor-analyzer.service.ts` |
| Pricing | `backend/src/services/cost-calculator.service.ts`, `dynamic-pricing.service.ts`, `profit-guard.service.ts` |
| Publish & SEO | `backend/src/services/marketplace.service.ts`, `backend/src/modules/marketplace/marketplace-publish.service.ts` |
| Optimization & winner | `backend/src/services/publication-optimizer.service.ts`, `backend/src/services/product-performance.engine.ts` |
| Compliance | `backend/src/utils/compliance/index.ts`, `docs/MERCADOLIBRE_COMPLIANCE.md` |
| Scheduler | `backend/src/services/scheduled-tasks.service.ts`, `backend/src/services/autopilot.service.ts` |

## Specs and compliance

- **Specs (repo root):** `marketplace_listing_agent_spec.md`, `product_selection_algorithm.md`, `system_architecture.md`
- **Policy compliance:** `docs/MARKETPLACE_POLICY_COMPLIANCE.md` (eBay, ML, Amazon rules); `docs/MERCADOLIBRE_COMPLIANCE.md` (ML IP/images)

## Optional env (plan features)

| Env | Purpose | Default |
|-----|---------|--------|
| `USE_PRICING_ENGINE` | Use spec pricing (min*0.97, margin 20–35%) in dynamic repricing | not set (legacy) |
| `USE_LISTING_SEO_MODULE` | Use marketplace-specific SEO title/description | not false (enabled) |
| `MIN_SUPPLIER_ORDERS` | Drop opportunities with supplier orders below this | 0 (off) |
| `MIN_SUPPLIER_RATING` | Min supplier rating (e.g. 4.5) | 0 (off) |
| `MIN_SUPPLIER_REVIEWS` | Min supplier reviews (e.g. 50) | 0 (off) |
| `MAX_SHIPPING_DAYS` | Max shipping days (e.g. 15) | 999 (off) |
| `MIN_SUPPLIER_SCORE_PCT` | Min supplier score % (e.g. 90) | 0 (off) |
| `MIN_SALES_COMPETITION_RATIO` | Reject when estimated_sales/listing_count < this (e.g. 0.3) | 0 (off) |
| `WINNER_SALES_THRESHOLD` | Sales in window to mark winner | 5 |
| `WINNER_DAYS_WINDOW` | Days window for winner detection | 3 |
| `LISTING_OPTIMIZATION_IMPRESSIONS_THRESHOLD` | Min views to consider for 48h optimization | 200 |
| `LISTING_OPTIMIZATION_REFRESH_TITLE` | Refresh title in 48h loop when true | not set |

# Opportunities — backend runtime fix

## Affiliate discovery (primary path)

- **`normalizeOpportunityPagination`** still clamps UI `maxItems` to 1–20 and `pageNo` to 1..500.
- For each UI **page** `N`, provider pages start at  
  `providerStart = 1 + (N - 1) * K`  
  where `K = OPPORTUNITY_AFFILIATE_PROVIDER_PAGES_PER_UI` (default **2**, max **3**).
- For each of up to **K** steps, call `aliexpressAffiliateAPIService.searchProducts` with **`pageSize: 20`**, merge results, **dedupe** by `productId` / `productUrl`, stop at `maxItems` or empty/partial provider page.

This addresses tenants where **each** Affiliate response only contains ~**10** rows.

## HTTP API

- **`GET /api/opportunities`**
  - Query: `query`, `maxItems` (1–20), `page` (1..500), `refresh` (`1` / `true` / `yes` skips cache read), `marketplaces`, `region`, …
  - Response: `pagination: { page, pageSize, returned, mayHaveMore }`
  - Headers: `Cache-Control: private, no-store`
- **Redis**: key includes `page` and `maxItems`; **not** used when `refresh` is truthy.

## Research route

- `GET /api/opportunities/research` uses the same coercion for `page` / `maxItems` and sets `Cache-Control: private, no-store`.

## Files

- `backend/src/services/opportunity-finder.service.ts`
- `backend/src/api/routes/opportunities.routes.ts`
- `backend/src/utils/opportunity-search-pagination.ts` (shared limits)

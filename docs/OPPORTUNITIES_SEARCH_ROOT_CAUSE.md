# Opportunities search — root cause

## Symptoms

- Searching (e.g. «soporte celular») surfaced only a small, fixed batch of results (~10).
- Re-running the same search showed the same first batch.

## Causes (exact)

### 1. Hard cap of 10 inside the opportunity finder

In `backend/src/services/opportunity-finder.service.ts`, `findOpportunities` contained:

`const maxItems = Math.min(Math.max(filters.maxItems || 10, 1), 10);`

So regardless of the API route allowing a higher `maxItems`, **at most 10 products** were ever requested from discovery (including AliExpress Affiliate).

### 2. Affiliate API always used page 1

The same service called `aliexpressAffiliateAPIService.searchProducts` with **`pageNo: 1`** only. There was **no way to request the next provider page** for the same keywords, so exploration stopped at the first provider page.

### 3. AliExpress Affiliate page size cap (unchanged contract)

`backend/src/services/aliexpress-affiliate-api.service.ts` enforces `page_size` at **maximum 20** per request (provider constraint). This is correct; the gap was not exposing **page** to the client, not the 20 cap itself.

### 4. Frontend capped UI at 10 and defaulted to 5

`frontend/src/pages/Opportunities.tsx` used `maxItems` default **5** and an `<input max={10}>` so the admin could not even ask for 20 per page.

### 5. Response cache ignored page

`GET /api/opportunities` cache key included `query` and `maxItems` but **not** `page`. If pagination had been added without fixing the key, page 2 could have incorrectly returned page 1 from cache. This was fixed by including `page` in the cache key.

## Summary

The flow was **double-limited**: backend forced `maxItems ≤ 10`, and **page was fixed at 1**, while the UI also prevented requesting more than 10 per request.

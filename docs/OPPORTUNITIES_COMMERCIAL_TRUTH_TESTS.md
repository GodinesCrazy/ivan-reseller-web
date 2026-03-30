# Opportunities commercial truth — tests

## Automated

- `backend/src/services/__tests__/mercadolibre-public-catalog.test.ts`  
  - Verifies `MercadoLibreService.searchSiteCatalogPublic` maps ML JSON results without OAuth.

## Recommended manual smoke

1. Log in as a real user with regional default **CL** (or pass `region=cl`).
2. Search Opportunities for a broad term (e.g. `auriculares`).
3. Confirm rows show **Real** on price/margin/ROI when `commercialTruth.suggestedPrice === 'exact'` (and UI green badge).
4. Confirm `Comparables:` line lists `Mercado Libre (catálogo público)` and/or eBay source.
5. Save any marketplace credential in Settings; repeat the same search without `refresh` and confirm results can change (cache invalidation).

## Full suite

- `cd backend && npm test` — note `opportunity-finder.test.ts` hits live dependencies and is slow; run targeted tests for day-to-day:

```bash
cd backend
npx jest src/services/__tests__/mercadolibre-public-catalog.test.ts
```

## Build / typecheck

- `cd backend && npx tsc --noEmit`
- `cd frontend && npm run build`

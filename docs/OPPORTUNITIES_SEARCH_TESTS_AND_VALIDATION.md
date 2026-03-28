# Opportunities search — tests and validation

## Automated

From repo root:

```bash
cd backend && npm run type-check && npx jest src/utils/__tests__/opportunity-search-pagination.test.ts --no-cache
```

```bash
cd frontend && npm run build
```

## Unit test added

- `backend/src/utils/__tests__/opportunity-search-pagination.test.ts` — clamps for `pageSize` (max 20) and `pageNo` (1..500).

## Manual smoke (recommended)

1. Log in as admin, open `/opportunities`.
2. Search `soporte celular` with **20 por página**.
3. Confirm up to 20 rows; click **Siguiente**; confirm rows **differ** from page 1 (or empty if the catalog ends).
4. Click **Anterior**; confirm return to page 1.
5. Repeat Search with the same term; with cache, results should still respect **page** (page 1 vs 2 differ when using pagination controls).
6. **Importar** one product and confirm product creation still works.

## Note on integration tests

`backend/src/services/__tests__/opportunity-finder.test.ts` performs **live** searches; it remains valid but may be slow or flaky depending on credentials and AliExpress availability.

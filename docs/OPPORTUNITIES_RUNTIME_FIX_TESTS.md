# Opportunities — runtime fix tests

## Commands

```bash
cd backend && npm run type-check && npx jest src/utils/__tests__/opportunity-search-pagination.test.ts --no-cache
```

```bash
cd frontend && npm run build
```

## Coverage

- `backend/src/utils/__tests__/opportunity-search-pagination.test.ts` — clamps for page size and page number.

## Manual

See `docs/OPPORTUNITIES_PRODUCTION_ALIGNMENT_PROOF.md`.

## Note

`backend/src/services/__tests__/opportunity-finder.test.ts` hits **live** dependencies; run only in an environment with valid credentials when validating end-to-end.

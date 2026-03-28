# Import runtime deploy — tests

## Local / CI (executed)

- `cd backend && npm run type-check` — PASS
- `cd frontend && npm run build` — PASS
- Jest (focused):
  - `src/utils/__tests__/aliexpress-item-id.test.ts`
  - `src/__tests__/services/operational-truth.service.test.ts`
  - `src/services/__tests__/catalog-validation-state.service.test.ts`  
  — PASS

## Production HTTP (executed)

- `GET https://ivan-reseller-backend-production.up.railway.app/version` — PASS (SHA `99766fb`)
- `GET https://ivan-reseller-backend-production.up.railway.app/api/version` — PASS

## Production authenticated smoke

- **Pending** — requires logged-in user; see `IMPORT_RUNTIME_PRODUCTION_RETEST.md`.

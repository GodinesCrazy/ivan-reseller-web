# P89 — Tests and validation

## Executed

- `backend`: `npm run type-check` — **PASS** (after P89 changes).  
- `backend`: `npx jest src/services/__tests__/mercadolibre-preflight-state.test.ts` — **PASS** (priority ordering for `overallState`).  

## Frontend

- `frontend`: `npm run type-check` — **FAIL** in this repo due to **pre-existing** errors in `api-configuration` wizard and `setup.ts` (no `ProductPreview` errors observed). P89 UI change is small; full frontend gate needs separate cleanup.

## Not automated (honest limitations)

- No integration test against live ML / AliExpress in CI.  
- `buildMercadoLibrePublishPreflight` calls external APIs — unit tests focus on **pure** `resolveMercadoLibrePreflightOverallState`.  
- E2E webhook + fulfill remains manual/staging proof.

## Suggested follow-up tests

- Mock `runPreventiveEconomicsCore` and assert preflight JSON shape.  
- Supertest: `GET /publish-preflight` returns 403 for other user’s product.

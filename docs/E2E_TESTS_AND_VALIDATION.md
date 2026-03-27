# E2E — Tests and validation

## Commands run (this audit)

| Check | Command | Result |
|-------|---------|--------|
| Backend type-check | `cd backend && npm run type-check` | Pass |
| Frontend build | `cd frontend && npm run build` | Pass |
| Canary + preflight unit tests | `cd backend && npx jest mercadolibre-canary-assessment mercadolibre-preflight-state` | Pass |

## Recommended ongoing checks

- `npm test` in backend for broader regressions.
- `GET /health` on deployed API.
- `GET /api/webhooks/status` with auth as appropriate.
- Manual: `GET /api/products/canary/mlc` after login (cookie) — expect ranked list or empty if no `VALIDATED_READY` products.

## What is not automated here

- Real ML publish without credentials.
- Real webhook injection without ML.
- Real AliExpress checkout without account + funds.

Use **`backend/scripts/test-complete-real-cycle.ts`** with `SIMULATE_FULFILLMENT=1` for a **local** Order → Sale path smoke (see script).

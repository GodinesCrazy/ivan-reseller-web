# E2E — Deploy / environment audit

## Railway (backend)

- **`railway.toml`** (repo root) and **`backend/railway.json`**: `npm ci && npm run build`, start `node dist/server-bootstrap.js` or `npm run start`, **healthcheck** `/health`.
- **`server-bootstrap`**: binds HTTP immediately so health passes before full Express load.
- **Release / migrate**: see `scripts/railway-migrate-deploy.js` and comments in `.env.example`.

## Vercel (frontend)

- **`frontend/vercel.json`**: SPA rewrite + **`/api/*` → Railway** backend URL (also injected at build via `scripts/inject-vercel-backend.mjs`).
- Confirm production rewrite target matches current Railway service URL after redeploys.

## Required env (minimum credible canary)

| Variable | Role |
|----------|------|
| `DATABASE_URL` | Postgres |
| `JWT_SECRET` | Auth |
| `REDIS_URL` | Workers / reconciliation (recommended) |
| ML OAuth / tokens | `MERCADOLIBRE_*`, user rows in `ApiCredential` |
| `WEBHOOK_SECRET_MERCADOLIBRE` | Signed ML webhooks |
| `BACKEND_URL` / redirect URI | OAuth callback |
| AliExpress DS API | Auto-purchase |
| `API_URL` / CORS | Frontend ↔ API |

Full template: **`backend/.env.example`**.

## Flags

- `ENABLE_ML_PUBLISH`, `BLOCK_NEW_PUBLICATIONS`, `PRE_PUBLISH_*`, `ML_WEB_PUBLISH_REQUIRE_ML_WEBHOOK_SECRET` — verify before a live canary.

## Observability

- Structured logs via `logger`; webhook proof / connector readiness in `webhook-readiness.service.ts`, surfaced in preflight `postsale` and `GET /api/webhooks/status`.

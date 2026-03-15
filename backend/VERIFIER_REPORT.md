# Full Dropshipping Cycle Verifier ? Report

## Goal

- `POST /api/internal/test-full-dropshipping-cycle` ? `success === true`
- `npm run test-full-dropshipping-cycle` ? exit code 0
- Only real data (no fallbacks, no simulated values)

---

## Phase 1 ? ENV inventory

Done. See **`backend/ENV_INVENTORY.md`** for:

- **A) Mandatory for discovery-only cycle:**  
  `INTERNAL_RUN_SECRET`, `SERP_API_KEY` or `GOOGLE_TRENDS_API_KEY`, `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET`, `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY` (or JWT_SECRET fallback)
- **B) Mandatory for full post-sale cycle:**  
  `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT`, `ALLOW_BROWSER_AUTOMATION=true`, `ALIEXPRESS_USER`, `ALIEXPRESS_PASS`
- **C) Optional / advanced:**  
  PORT, NODE_ENV, CORS_*, REDIS_URL, ALIEXPRESS_*, LOG_LEVEL, etc.

---

## Phase 2 ? ENV template

- **File:** `backend/env.local.example`  
  (Copy to `.env.local`: `cp env.local.example .env.local` then replace `REPLACE_ME`.)
- **Note:** `.env.local.example` is gitignored; the project uses `env.local.example` (no leading dot) as the template.

---

## Phase 3 ? Auto-generate local `.env.local`

- **Script:** `backend/scripts/ensure-env-local.ps1`  
  Creates `.env.local` from `env.local.example` only if `.env.local` does not exist (does not overwrite).
- **Current state:** `.env.local` already exists on this machine; script left it unchanged.

---

## Phase 4 ? Discovery-only mode

- **Default:** `skipPostSale = true` (script sends `skipPostSale: true` by default).
- **Stages that must be real for success:**  
  trends, aliexpressSearch, pricing, marketplaceCompare (all must be ok; trends must not use fallback).
- **Implementation:**  
  Verifier handler uses `SERP_API_KEY` or `GOOGLE_TRENDS_API_KEY` for ?real? trends, and `ALIEXPRESS_APP_KEY` + `ALIEXPRESS_APP_SECRET` for real AliExpress product discovery.

---

## Phase 5 ? Execute verifier

**Last run:**

```bash
cd backend && npm run test-full-dropshipping-cycle
```

**Result:** Exit code 1. Response: HTTP 503 ? `INTERNAL_RUN_SECRET no esta configurado`.

So the **backend** that served the request did not have `INTERNAL_RUN_SECRET` set. For the verifier to return 200 and then `success: true`:

1. **Backend** must be run with the same env that contains real values (see below).
2. **Client** (test script) loads `INTERNAL_RUN_SECRET` from `.env.local` (or env) and sends it in `x-internal-secret`.

**Success condition (no code change can replace real APIs):**

- Backend env must include:
  - `INTERNAL_RUN_SECRET` (any non-empty secret; same value used by the script).
  - `SERP_API_KEY` or `GOOGLE_TRENDS_API_KEY` (real key so trends are not fallback).
  - `ALIEXPRESS_APP_KEY` and `ALIEXPRESS_APP_SECRET` (real Affiliate API so product discovery returns real products).
  - `DATABASE_URL` (PostgreSQL URL for app and Prisma).
  - `JWT_SECRET` (min 32 chars; required for server boot).
  - `ENCRYPTION_KEY` (min 32 chars) or rely on JWT_SECRET fallback.

---

## Phase 6 ? Final report

### Final env variables required (discovery-only ? success: true)

| Variable | Required | Notes |
|----------|----------|--------|
| `INTERNAL_RUN_SECRET` | Yes | Same value in backend and script (e.g. in `.env.local` when running both locally). |
| `SERP_API_KEY` or `GOOGLE_TRENDS_API_KEY` | Yes | Real key; otherwise trends use fallback and success stays false. |
| `ALIEXPRESS_APP_KEY` | Yes | Real AliExpress Affiliate app key. |
| `ALIEXPRESS_APP_SECRET` | Yes | Real AliExpress Affiliate app secret. |
| `DATABASE_URL` | Yes | PostgreSQL connection string. |
| `JWT_SECRET` | Yes | Min 32 characters (server boot). |
| `ENCRYPTION_KEY` | Optional | Min 32 chars if set; else JWT_SECRET is used. |

### APIs confirmed working (when env is set)

- **Internal verifier endpoint:** Mounted at `POST /api/internal/test-full-dropshipping-cycle`; returns 503 when `INTERNAL_RUN_SECRET` is missing, 200 + JSON when secret is valid.
- **Trends:** Real path uses SerpAPI/Google Trends when `SERP_API_KEY` or `GOOGLE_TRENDS_API_KEY` is set.
- **AliExpress Affiliate:** Used by opportunity finder when `ALIEXPRESS_APP_KEY` and `ALIEXPRESS_APP_SECRET` are set.
- **Pricing / marketplace compare:** Use data from opportunity finder; no extra env for discovery-only.

### Verifier JSON output (when secret is missing)

```json
{
  "success": false,
  "error": "Internal endpoint not configured",
  "message": "INTERNAL_RUN_SECRET no esta configurado"
}
```

When the secret is set but trends/AliExpress are not configured or use fallback/simulated data, the response is 200 with `success: false` and `stages`/`diagnostics` indicating which stage failed.

### How to get success: true and exit 0

1. **Set env (e.g. in `backend/.env.local`):**  
   All variables from the table above, with **real** values (no `REPLACE_ME`). Include `INTERNAL_RUN_SECRET` so the backend accepts the verifier request.
2. **Start backend with that env:**  
   From repo: `cd backend && npm run dev`. Ensure no other process is using PORT (e.g. 4000); if "Port already in use", stop the other process or set a different PORT.
3. **Run verifier:**  
   - To hit the **local** server: set `VERIFIER_TARGET_URL=http://localhost:4000` (overrides `API_URL` from .env.local). Example PowerShell: `$env:VERIFIER_TARGET_URL="http://localhost:4000"; npm run test-full-dropshipping-cycle`.
   - To hit the URL in `.env.local` (e.g. Railway): run `npm run test-full-dropshipping-cycle` and ensure the deployed backend has the same `INTERNAL_RUN_SECRET` in its env.
4. **Optional check before running:**  
   `cd backend && npx tsx scripts/check-verifier-env.ts` — exit 0 only if required discovery-only vars are set and not placeholders.

### Commit hash

Not run in this session. After you commit the changes (ENV_INVENTORY.md, env.local.example, ensure-env-local.ps1, check-verifier-env.ts, VERIFIER_REPORT.md, test script loading .env.local), use:

```bash
git rev-parse HEAD
```

---

## Test E2E: ciclo completo hasta utilidad

El test de ciclo completo puede ejecutarse **hasta la generación de utilidad** (registro `Sale` con `netProfit`) cuando se incluye post-sale (PayPal capture + fulfillment + compra AliExpress).

### Comandos

- **Solo discovery (por defecto):**  
  `npm run test-full-dropshipping-cycle` o `npm run test:dropshipping-cycle`  
  Env: `INTERNAL_RUN_SECRET`; backend corriendo. No ejecuta PayPal ni compra; no crea Sale.

- **Ciclo hasta utilidad (post-sale):**  
  `SKIP_POST_SALE=0 npm run test-full-dropshipping-cycle`  
  o `npm run test:full-dropshipping-e2e` (mismo script; para E2E hasta utilidad configurar `SKIP_POST_SALE=0` en el entorno).  
  Requiere: además de lo anterior, PayPal configurado (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, etc.) y, para compra real, AliExpress (p. ej. `ALLOW_BROWSER_AUTOMATION`, `ALIEXPRESS_USER`, `ALIEXPRESS_PASS`). En `AUTOPILOT_MODE=production` el handler no permite `skipPostSale=true`.

### Qué comprueba

- **Estructura:** Respuesta 200 con `stageResults` (trends, aliexpressSearch, pricing, marketplaceCompare, publish, sale, paypalCapture, aliexpressPurchase, tracking, accounting).
- **Utilidad:** Cuando post-sale se ejecuta (`SKIP_POST_SALE=0`), la respuesta debe incluir `saleCreated: { saleId, netProfit }` si el ciclo llegó a PURCHASED y se creó una Sale. El script imprime "--- Utilidad (Sale) ---" cuando existe; si post-sale corrió pero no hay `saleCreated`, el script **falla** (exit 1) para garantizar que el E2E verifica generación de utilidad.

### Criterios de éxito

- **Discovery-only:** `success === true` cuando trends, aliexpressSearch, pricing, marketplaceCompare y publish son reales (APIs configuradas). No se exige `saleCreated`.
- **Hasta utilidad:** Con `SKIP_POST_SALE=0`, además de `success === true` y etapas post-sale reales, la respuesta debe incluir `saleCreated` con `saleId` y `netProfit`; si falta, el script devuelve exit code 1. El handler crea el Order con `userId` (y `productId` si hay producto APPROVED/PUBLISHED del usuario) para que `createSaleFromOrder` genere la Sale y el `netProfit`.

---

## Summary

- **Env inventory:** `backend/ENV_INVENTORY.md`
- **Env template:** `backend/env.local.example` ? copy to `.env.local` and replace `REPLACE_ME`.
- **Create .env.local if missing:** `backend/scripts/ensure-env-local.ps1`
- **Discovery-only:** Default; real trends and AliExpress require the env vars above.
- **Verifier:** Fails with 503 when the server has no `INTERNAL_RUN_SECRET`; with the correct env and real API keys, the same verifier run returns 200 and can return `success: true` and exit 0.

**Stop condition:** The verifier will return `success === true` and exit 0 only when the backend is run with real values for `INTERNAL_RUN_SECRET`, `SERP_API_KEY` or `GOOGLE_TRENDS_API_KEY`, `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET`, `DATABASE_URL`, and `JWT_SECRET` (and optional `ENCRYPTION_KEY`). No code changes can replace these requirements.

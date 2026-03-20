# Phase 54 — Risk scan analysis (platform cleanup runbook)

**Generated:** 2026-03-19 (automated operator run)  
**Scope:** Active listings vs Phase 53 pre-publish rules + Phase 54 scan service.

---

## Step 1 — BASE_URL discovery (order used)

| Priority | Source | Value used this run |
|----------|--------|---------------------|
| 1 | Local backend default | `http://localhost:4000` |
| 2 | `frontend/.env.development` → `VITE_API_URL` | `http://localhost:4000` |
| 3 | `frontend/src/config/runtime.ts` (dev fallback) | `http://localhost:4000` |
| 4 | Railway / production | **Not used** — set `BASE_URL` env when targeting Railway |

**Resolved `BASE_URL` for HTTP calls:** `http://localhost:4000`

---

## Step 2 — Dry run execution

**Request**

```http
POST {BASE_URL}/api/internal/active-listings-risk-scan
x-internal-secret: <INTERNAL_RUN_SECRET from environment — do not commit>
Content-Type: application/json

{"dryRun": true}
```

**Retries:** up to 3 with 2s backoff.

**Result (this workspace run)**

| Field | Value |
|--------|--------|
| HTTP | **Connection failed** (no server listening on `:4000`) |
| Error (ES) | No es posible conectar con el servidor remoto |
| Attempts | 3 |

**Payload / `summary` / `dangerous` / `entries`:** *not available* — backend unreachable.

---

## Continuación — Railway production (retry)

**Fecha:** 2026-03-19  
**`BASE_URL`:** `https://ivan-reseller-backend-production.up.railway.app`

| Check | Resultado |
|--------|-----------|
| `GET /api/internal/health` | **200 OK**, `hasSecret: true` |
| Rutas listadas en `health` | Solo ciclo de pruebas (run-ebay-cycle, test-full-cycle, …) **sin** `active-listings-risk-scan` |
| `POST /api/internal/active-listings-risk-scan` + `{"dryRun":true}` (3 reintentos) | **404** `{"success":false,"message":"Route not found"}` |

### Diagnóstico

El **código en este repo** sí define `POST /api/internal/active-listings-risk-scan` en `internal.routes.ts` y el servicio `active-listings-risk-scan.service.ts`.  
El despliegue actual en Railway **no incluye ese commit** (el health de producción es la versión anterior).

### Acción requerida

1. **Push + deploy** del backend (`ivan-reseller-backend`) desde la rama que contiene Phase 54.  
2. Verificar de nuevo:

   ```http
   GET https://ivan-reseller-backend-production.up.railway.app/api/internal/health
   ```

   En la lista `routes` debe aparecer: `POST /api/internal/active-listings-risk-scan`.

3. Repetir dry run:

   ```bash
   set BASE_URL=https://ivan-reseller-backend-production.up.railway.app
   set INTERNAL_RUN_SECRET=<tu secreto>
   cd backend && npm run phase54:cleanup
   ```

---

## Step 3 — Classification rubric (when response is available)

| `classification` | Severity | Meaning |
|------------------|----------|---------|
| `UNSHIPPABLE` | **CRITICAL** | Supplier/SKU/destination/shipping API failure — must not stay live |
| `UNPROFITABLE` | **HIGH** | Net profit after fees below `PRE_PUBLISH_MIN_NET_PROFIT` / margin ratio |
| `RISKY` | **MEDIUM** | Validated but **shipping used fallback** (`PRE_PUBLISH_SHIPPING_FALLBACK`) — not API line cost |
| `CONFIG` | **SYSTEM** | Missing AliExpress DS token, bad URL, missing marketplace creds, etc. |
| `SAFE` | **OK** | Passes strict checks |

**Metrics to compute after a successful dry run**

- Counts per class from `summary`.
- `% dangerous` = `(scanned - summary.SAFE) / scanned * 100` (treat `CONFIG` as dangerous for ops).

**Root causes (historical loss alignment)**

- Incorrect shipping: often **`RISKY`** (fallback) or **`UNPROFITABLE`** if underestimated.
- No ship to country / invalid SKU: **`UNSHIPPABLE`**.
- Stock invalid at purchase time: **`UNSHIPPABLE`** (no in-stock SKU for destination).

---

## Step 4 — Decision engine

| Condition | Action |
|-----------|--------|
| `summary.UNSHIPPABLE > 0` | **MUST CLEAN** — run real cleanup with `autoUnpublishUnshippable: true` |
| `summary.UNPROFITABLE > 0` | **RECOMMENDED CLEAN** — set `autoUnpublishUnprofitable: true` or fix prices then re-scan |
| `summary.RISKY > 0` | Review / reprice / refresh supplier data; flags already written if `writeFlags: true` |
| `summary.CONFIG > 0` | Fix credentials before trusting automation |

---

## Step 5 — Real cleanup (operator — after successful dry run)

Use the same endpoint with:

```json
{
  "dryRun": false,
  "autoUnpublishUnshippable": true,
  "autoUnpublishUnprofitable": true,
  "writeFlags": true
}
```

**Script (recommended):**

```bash
cd backend
set INTERNAL_RUN_SECRET=your_secret
set BASE_URL=http://localhost:4000
npm run phase54:cleanup
npm run phase54:cleanup:execute
```

PowerShell:

```powershell
$env:INTERNAL_RUN_SECRET = "<secret>"
$env:BASE_URL = "https://your-app.up.railway.app"
cd backend
npm run phase54:cleanup
npm run phase54:cleanup:execute
```

---

## Step 6 — Marketplace consistency

After unpublish, DB rows for closed listings are removed by the scan helper; verify on each channel:

- **eBay:** item ended / not buyable.
- **Mercado Libre:** listing closed.
- **Amazon:** SKU inactive/deleted.

If DB and marketplace diverge, run (authenticated):

`POST /api/publisher/listings/run-reconciliation-audit`

---

## Steps 7–8 — Readiness & real profit (JWT required)

These endpoints **require `authenticate`** — not callable with internal secret only.

- `GET /api/system/readiness-report` — database, redis, bullmq, marketplaceApi, supplierApi.
- `GET /api/finance/real-profit?days=30` — summary / orders / products.

Use Control Center or `Authorization: Bearer <JWT>` after login.

---

## Appendix — Problematic listings

*Empty this run (no API response).*  
After a successful dry run, paste `dangerous[]` from JSON here or attach `phase54-dry-run.json`.

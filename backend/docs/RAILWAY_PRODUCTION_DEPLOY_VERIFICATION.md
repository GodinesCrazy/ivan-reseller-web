# Railway production deploy verification

## Critical: Root Directory

In Railway dashboard → Backend service → **Settings** → **Root Directory** must be set to **`backend`**.  
If Root Directory is empty or wrong, the build runs in repo root and will fail or run the wrong app.

## Build & start (Railway must use)

- **Build command:** `npm install && npm run build`
- **Start command:** `npm run start` (or `npm run start:with-migrations` if you use backend/railway.json)

Do **not** use `ts-node` or `src/server.ts`. Production must run `node dist/server.js`.

## If deploy "still the same" (cache)

1. Railway → your Backend service → **Deployments** → open latest deploy.
2. **Redeploy** (three dots or "Redeploy").
3. Optionally enable **Clear build cache** before redeploy so the next build is clean.

## Environment variables (Railway)

- `NODE_ENV=production`
- `PORT=4000` (or Railway-assigned PORT)
- All required API keys (DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, etc.)

### Variables recomendadas en producción (checklist por servicio)

Cualquier servicio Node que use la misma base Postgres (mismo `DATABASE_URL`) debe limitar su pool para no saturar `max_connections`:

| Servicio                 | Variable                    | Valor típico | Notas |
|--------------------------|-----------------------------|--------------|-------|
| ivan-reseller-backend   | `PRISMA_CONNECTION_LIMIT`   | `8` o `10`   | API principal. Ver [backend/src/config/database.ts](backend/src/config/database.ts). |
| Workers / scrapers       | `PRISMA_CONNECTION_LIMIT`   | `6`–`8`      | Si comparten la misma Postgres, definir en cada uno. |

- Sin esta variable, cada proceso abre un pool por defecto (p. ej. ~10 conexiones); la suma de todos los servicios puede superar el límite de Postgres y provocar "too many clients already".
- No aplica a URLs de Prisma Accelerate (se ignoran en el código). Ver también la sección **Deploy fails: too many clients** más abajo.

## Post-deploy verification

### 1. Boot log

Railway logs should show:

```
[PRODUCTION] Backend version: <ISO timestamp>
```

### 2. Workflow config (no 400)

- **PUT** `https://ivanreseller.com/api/workflow/config` ? must return **HTTP 200**
- **GET** `https://ivanreseller.com/api/workflow/config/test` ? expected body includes `workflowMode: "automatic"` (or current mode), **not HTTP 400**

### 3. Autopilot status

- **GET** `https://ivanreseller.com/api/autopilot/status` (with auth) ? must include `workflowMode: "automatic"` and `running` as applicable

### Success criteria

- Railway backend logs: `[PRODUCTION] Backend version: <timestamp>`
- Logs: `[WORKFLOW CONFIG] CONFIG SAVED SUCCESSFULLY` when saving config
- **HTTP 200** for PUT `/api/workflow/config`
- Autopilot accepts automatic mode

## Deploy fails: `FATAL: sorry, too many clients already` (Prisma migrate)

PostgreSQL has a fixed `max_connections`. During a Railway deploy, **preDeploy** runs migrations while the **previous** container may still be running and holding pool slots — migrate can fail until those connections drop.

**In-repo fix:** Migrations run at **container start** via `node scripts/railway-start-production.js` (not preDeploy), so `prisma migrate deploy` uses the same private network as the app. The migrate step retries on “too many clients” (`scripts/railway-migrate-deploy.js`). Healthcheck timeout is 720s to allow long retry windows. Tune with `MIGRATE_RETRY_DELAY_SEC`, `MIGRATE_MAX_ATTEMPTS`.

**If it still fails after several minutes:**

1. Railway → **Postgres** service → **Restart** (frees all connections), then **Redeploy** the backend once.
2. Set **`PRISMA_CONNECTION_LIMIT=8`** (or `10`) on **every** Node service that shares that `DATABASE_URL` (main API, workers, etc.) so total app pools stay under Postgres limits.
3. Reduce duplicate services or replicas if several backends attach to the same DB.

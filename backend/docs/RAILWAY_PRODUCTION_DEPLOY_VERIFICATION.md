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

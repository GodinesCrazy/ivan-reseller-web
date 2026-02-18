# Railway production deploy verification

## Build & start (Railway must use)

- **Build command:** `npm install && npm run build`
- **Start command:** `npm run start`

Do **not** use `ts-node` or `src/server.ts`. Production must run `node dist/server.js`.

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

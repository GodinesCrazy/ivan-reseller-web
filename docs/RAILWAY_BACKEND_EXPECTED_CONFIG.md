# RAILWAY BACKEND — EXPECTED CONFIGURATION
**Date**: 2026-03-31  
**Evidence-based from repo analysis**

---

## Configuración correcta esperada para `ivan-reseller-backend`

| Campo | Valor correcto | Evidencia |
|-------|---------------|-----------|
| **Service Type** | Web Service | Expone endpoints HTTP públicos; requiere public networking |
| **Root Directory** | `backend` | `backend/package.json` contiene los scripts de build/start; `backend/railway.json` define la config del servicio |
| **Build Command** | `npm ci && npm run build` | `backend/railway.json`: `"buildCommand": "npm ci && npm run build"` = `rimraf dist && prisma generate && tsc -p tsconfig.json` |
| **Start Command** | `node dist/server-bootstrap.js` | `backend/railway.json`: `"startCommand": "node dist/server-bootstrap.js"` y `backend/package.json`: `"start": "node dist/server-bootstrap.js"` |
| **Healthcheck Path** | `/health` | `backend/railway.json`: `"healthcheckPath": "/health"` — server-bootstrap responde 200 en `/health` en <100ms |
| **Healthcheck Timeout** | `720` segundos | `backend/railway.json`: `"healthcheckTimeout": 720` — build tarda ~120s, nixpacks.toml original tenía 120s (insuficiente para cold start completo) |
| **PORT manual** | ❌ NO DEFINIR | Railway inyecta `PORT` automáticamente. `server-bootstrap.ts` usa `process.env.PORT`. Si se define `PORT=3000` manualmente, puede conflictuar con el PORT asignado por Railway |
| **Public Networking** | ✅ Habilitado | Necesario para acceso externo al backend API |

---

## Conflicto detectado: `railway.toml` en raíz vs `backend/railway.json`

**Railway usa el primer archivo de configuración que encuentra:**

| Archivo | Ubicación | Start Command | Healthcheck Timeout |
|---------|-----------|---------------|---------------------|
| `railway.toml` | `/` (raíz del repo) | `npm run start` | 720s |
| `nixpacks.toml` | `backend/` | `npm run start` | 120s ⚠️ |
| `railway.json` | `backend/` | `node dist/server-bootstrap.js` | 720s |

**Si Root Directory = `backend`**: Railway usará `backend/nixpacks.toml` para el build y `backend/railway.json` para deploy config.

**Si Root Directory = `/` (raíz)**: Railway verá el `railway.toml` raíz pero no encontrará `package.json` → build falla.

**Riesgo crítico**: Si Root Directory NO está seteado a `backend` en el Dashboard, el build fallará porque no hay `package.json` en la raíz del repo (solo en `backend/`).

---

## Variables de entorno críticas para arranque

| Variable | Requerida para arranque | Impacto si falta |
|----------|------------------------|-----------------|
| `DATABASE_URL` | ⚠️ Graceful degradation | Servidor arranca pero DB queries fallan; `/health` 200, `/ready` 503 |
| `REDIS_URL` | ⚠️ Sin crash | Si falta → MockRedis. Si es `localhost` en Railway → ECONNREFUSED (no fatal) |
| `JWT_SECRET` | ⚠️ Sin crash | Servidor arranca, pero auth fallará — logea warning |
| `ENCRYPTION_KEY` | ⚠️ Usa JWT_SECRET como fallback | Puede pasar; si JWT_SECRET también falta → throw |
| `NODE_ENV` | Recomendado `production` | Sin esto, se usa `development` mode |
| `PORT` | ❌ NO DEFINIR | Railway lo inyecta automáticamente |

---

## Causa raíz más probable del CRASHED 2/2

**Hipótesis #1 (más probable)**: `REDIS_URL` en Railway apunta a `localhost:6379` → BullMQ workers intentan conectar → retry storm → process eventloop bloqueado → healthcheck timeout → Railway marca CRASHED.

**Hipótesis #2**: Root Directory no configurado como `backend` → build puede compilar desde raíz sin `package.json` correcto → start command falla.

**Hipótesis #3**: `PORT` variable definida manualmente con valor fijo → conflicto con PORT asignado dinámicamente por Railway → server-bootstrap falla al hacer `server.listen()` → `process.exit(1)`.

**Evidencia del log** (`p32-controlled-publish-output.txt`):
```
❌ Redis error: AggregateError [ECONNREFUSED]: connect ECONNREFUSED ::1:6379
```
Confirma que en producción, Redis está intentando conectar a `localhost` (::1:6379), que no existe en Railway.

---

## Release Command (Prisma migrations)

Railway soporta **Release Command** para ejecutar migraciones ANTES de que el nuevo deployment tome tráfico:
```
node scripts/railway-migrate-deploy.js
```
Si esto no está configurado, las migraciones corren DENTRO del startup de `server.ts` (línea 307: `execAsync('npx prisma migrate deploy')`), lo que puede añadir 30-60s al tiempo de arranque y causar healthcheck timeout si el timeout es < 720s.

**Recomendación**: Verificar si el Release Command está configurado en Railway. Si no, el nixpacks.toml con `timeout = 120` puede ser insuficiente.

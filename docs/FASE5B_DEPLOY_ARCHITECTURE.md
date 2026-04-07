# Decisión Final de Arquitectura de Despliegue
**Fecha:** 2026-04-06  
**Fase:** 5B — Cierre pre-compra controlada

---

## Arquitectura Elegida: Vercel (Frontend) + Railway (Backend)

### Evidencia en el repositorio

| Archivo | Contenido | Evidencia |
|---|---|---|
| `frontend/vercel.json` | Rewrites `/api/*` → Railway backend | Sí — URL hardcodeada al backend Railway |
| `frontend/railway.json` | Config alternativa para deploy frontend en Railway | Existe pero no es la topología principal |
| `railway.toml` (root) | Backend config (build + start + healthcheck) | Sí — apunta al backend Node |

La topología Vercel + Railway ya estaba **implementada y validada** en el repo.  
No se tomó la decisión "por inercia" — el `vercel.json` con el rewrite confirma que fue una decisión explícita.

---

## Topología final

```
Browser
  │
  ├── GET /, /products, /orders, ...
  │     → Vercel CDN (React SPA)
  │
  └── XHR /api/*
        → Vercel rewrite rule
              → Railway Backend (Node/Express :4000)
                    ├── PostgreSQL (Railway)
                    └── Redis (Railway)
```

---

## Por qué Vercel + Railway (y no Railway completo)

| Criterio | Vercel + Railway | Railway completo |
|---|---|---|
| Deploy frontend | CDN global, CI/CD en push | Necesita `npm run start` (vite preview) |
| Routing SPA | Rewrite `/(.*) → /index.html` incluido en vercel.json | Necesita config custom en railway.json |
| Cold start | Frontend nunca duerme (CDN) | Frontend puede dormir si servicio separado |
| Variables de entorno | `VITE_API_URL` no requerida — proxy transparente vía `/api` | Requiere `VITE_API_URL` hardcodeado |
| Costo | Plan Free de Vercel suficiente para SPA estática | Gasta créditos Railway para frontend estático |
| Operación | Simpler — un clic en Vercel = deploy frontend | Requiere mantener 2 servicios en Railway |

**Conclusión:** Vercel es el lugar correcto para el frontend. Railway es el lugar correcto para el backend stateful.

---

## Variables de entorno requeridas

### Backend (Railway)
```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
ML_CLIENT_ID=...
ML_CLIENT_SECRET=...
ML_ACCESS_TOKEN=...
ML_REFRESH_TOKEN=...
ML_USER_ID=...
ALIEXPRESS_API_KEY=...
NODE_ENV=production
PORT=4000
```

### Frontend (Vercel)
No requiere `VITE_API_URL` — el proxy `/api/*` en `vercel.json` lo maneja transparentemente.  
Si algún día cambia la URL del backend, editar `vercel.json`:
```json
"destination": "https://ivan-reseller-backend-production.up.railway.app/api/:path*"
```

---

## Scripts de build/start

### Backend (`railway.toml`)
```toml
[build]
buildCommand = "npm ci && npm run build"   # npx prisma generate + tsc

[deploy]
startCommand = "npm run start"             # node dist/server.js
healthcheckPath = "/health"
healthcheckTimeout = 720
```

### Frontend (`vercel.json`)
```json
"buildCommand": "npm run build"    # vite build → dist/
"outputDirectory": "dist"
```

---

## Estado de Railway migrate
El archivo `scripts/railway-migrate-deploy.js` debe ejecutarse como **Release Command** en Railway antes de start:
```
node scripts/railway-migrate-deploy.js
```
Verificar que esté configurado en el servicio Railway (Release Command, no Build Command).

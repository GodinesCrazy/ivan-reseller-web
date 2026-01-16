# 📊 Production Audit Baseline

**Fecha:** 2025-12-23  
**Commit:** `dc1d91630e8e099154d220cb60f651cae2209c57`  
**Mensaje:** `fix(backend): add /api/help route registration`

---

## 🛠️ Comandos del Repositorio

### Root
- `sync-docs`: `node scripts/sync_help_docs.mjs`

### Backend (`backend/`)
- `dev`: `tsx watch src/server.ts`
- `build`: `tsc --skipLibCheck && npx prisma generate`
- `start`: `node dist/server.js`
- `start:prod`: `node dist/server.js`
- `lint`: `eslint src --ext .ts`
- `type-check`: `tsc --noEmit`
- `test`: `jest`

### Frontend (`frontend/`)
- `dev`: `npm run sync-docs && vite`
- `build`: `npm run sync-docs && vite build`
- `preview`: `vite preview`
- `lint`: `eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0`
- `type-check`: `tsc --noEmit`
- `test`: `vitest`

---

## ✅ Resultados de Build

### Backend Build
- **Estado:** ✅ Exitoso
- **Comando:** `cd backend && npm run build`
- **Resultado:** Compilación TypeScript exitosa, Prisma generate OK

### Frontend Build
- **Estado:** ✅ Exitoso
- **Comando:** `cd frontend && npm run build`
- **Resultado:** `✓ built in 19.73s`
- **Sincronización docs:** 7 archivos sincronizados, 0 errores

---

## 🌐 Servicios Externos y Entornos

### Producción
- **Backend:** Railway (`https://ivan-reseller-web-production.up.railway.app`)
- **Frontend:** Vercel (`https://www.ivanreseller.com`, `https://ivanreseller.com`)
- **Base de Datos:** PostgreSQL (Railway)
- **Cache/Queue:** Redis (Railway)

### Desarrollo
- **Backend:** `http://localhost:3000`
- **Frontend:** `http://localhost:5173`

---

## 📋 Variables de Entorno Detectadas

### Backend (Críticas)
- `NODE_ENV` - Entorno (development/production/test)
- `PORT` - Puerto del servidor (default: 3000)
- `DATABASE_URL` - URL de conexión PostgreSQL
- `REDIS_URL` - URL de conexión Redis
- `JWT_SECRET` - Secret para JWT (min 32 chars)
- `JWT_EXPIRES_IN` - Expiración JWT (default: 7d)
- `JWT_REFRESH_EXPIRES_IN` - Expiración refresh token (default: 30d)
- `ENCRYPTION_KEY` - Clave de encriptación (min 32 chars, fallback a JWT_SECRET)
- `CORS_ORIGIN` / `CORS_ORIGINS` - Orígenes permitidos (CSV)
- `FRONTEND_URL` - URL del frontend (fallback para CORS)
- `API_URL` - URL pública del backend
- `LOG_LEVEL` - Nivel de logging (error/warn/info/debug)

### Backend (Opcionales - APIs Externas)
- `EBAY_APP_ID`, `EBAY_DEV_ID`, `EBAY_CERT_ID`
- `MERCADOLIBRE_CLIENT_ID`, `MERCADOLIBRE_CLIENT_SECRET`
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT`
- `GROQ_API_KEY`
- `SCRAPERAPI_KEY`

### Backend (Feature Flags)
- `API_HEALTHCHECK_ENABLED` (true/false)
- `SCRAPER_BRIDGE_ENABLED` (true/false, default: true)
- `SCRAPER_BRIDGE_URL`
- `ALIEXPRESS_DATA_SOURCE` (api/scrape, default: api)
- `ALIEXPRESS_AUTH_MONITOR_ENABLED` (true/false)
- `ALLOW_BROWSER_AUTOMATION` (true/false)
- `AUTO_PURCHASE_ENABLED` (true/false)
- `RATE_LIMIT_ENABLED` (true/false, default: true)
- `WEBHOOK_VERIFY_SIGNATURE` (true/false, default: true)

### Frontend
- `VITE_API_URL` - URL base del backend API
- `VITE_LOG_LEVEL` - Nivel de logging (warn/info/debug)
- `VITE_ENABLE_INVESTOR_DOCS` - Feature flag para docs de inversionistas (true/false)

---

## 📁 Estructura del Repositorio

```
ivan-reseller-web/
├── backend/          # Node.js + Express + TypeScript
├── frontend/         # React + Vite + TypeScript
├── docs/             # Documentación
├── scripts/          # Scripts de utilidad
└── package.json      # Root package.json
```

---

## 🔍 Archivos Clave

### Backend Entry Points
- `backend/src/server.ts` - Entry point principal
- `backend/src/app.ts` - Configuración Express + middleware
- `backend/src/config/env.ts` - Validación de variables de entorno

### Frontend Entry Points
- `frontend/src/main.tsx` - Entry point React
- `frontend/src/App.tsx` - Router principal
- `frontend/src/config/runtime.ts` - Configuración runtime (API_BASE_URL)

### Documentación
- `docs/SETUP_LOCAL.md` - Setup local
- `docs/DEPLOYMENT_RAILWAY.md` - Deployment Railway
- `docs/SECURITY.md` - Seguridad
- `docs/TROUBLESHOOTING.md` - Troubleshooting
- `docs/ARCHITECTURE.md` - Arquitectura
- `docs/USER_GUIDE.md` - Guía usuario
- `docs/ADMIN_GUIDE.md` - Guía admin
- `docs/CHANGELOG.md` - Changelog

---

## ✅ Estado Inicial

- **Builds:** ✅ Exitosos (FE + BE)
- **Lint:** ✅ Sin errores detectados
- **Documentación:** ✅ Completa (9 enterprise docs + 2 investor docs + 12 API docs)
- **Help In-App:** ✅ Funcionando
- **CORS:** ✅ Configurado y hardened
- **Auth:** ✅ JWT + cookies httpOnly
- **Rate Limiting:** ✅ Implementado
- **Error Handling:** ✅ Centralizado con correlation ID

---

**Última actualización:** 2025-12-23  
**Auditor:** Sistema automatizado


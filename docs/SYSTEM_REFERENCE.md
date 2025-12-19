# System Reference - Ivan Reseller Web
**Última actualización:** 2025-12-18  
**Versión:** 1.0.0  
**Estado:** Producción (Railway)

---

## Tabla de Contenidos

1. [Arquitectura del Sistema](#1-arquitectura-del-sistema)
2. [Entry Points y URLs](#2-entry-points-y-urls)
3. [Railway Deployment](#3-railway-deployment)
4. [Variables de Entorno](#4-variables-de-entorno)
5. [Feature Flags](#5-feature-flags)
6. [Dependencias Externas](#6-dependencias-externas)
7. [Runbook de Incidentes](#7-runbook-de-incidentes)

---

## 1. Arquitectura del Sistema

### 1.1 Componentes Principales

**Backend (Node.js + Express + TypeScript)**
- **Ubicación:** `backend/`
- **Entry Point:** `backend/src/server.ts`
- **Framework:** Express.js
- **ORM:** Prisma (PostgreSQL)
- **Cache:** Redis (opcional)
- **Jobs/Queues:** BullMQ (async tasks)
- **WebSocket:** Socket.IO (notificaciones realtime)

**Frontend (React + TypeScript + Vite)**
- **Ubicación:** `frontend/`
- **Framework:** React 18
- **Build Tool:** Vite
- **Estado:** Context API + React Query
- **Deployment:** Servicio separado en Railway (o CDN)

**Base de Datos**
- **Tipo:** PostgreSQL
- **ORM:** Prisma
- **Migrations:** Prisma Migrate
- **Ubicación:** Railway PostgreSQL service

**Cache/Queue**
- **Redis:** Opcional, para cache distribuido y queues
- **BullMQ:** Colas de trabajos asíncronos

### 1.2 Flujo de Arranque (Backend)

```
1. server.ts importa app.ts
2. validateEncryptionKey() - SÍNCRONO (puede throw Error)
3. httpServer.listen(PORT, '0.0.0.0') - INMEDIATO (línea 355)
4. Bootstrap en background (async):
   - runMigrations() (con retry)
   - connectWithRetry() (DB)
   - redis.ping() (Redis, opcional)
   - ensureAdminUser()
   - Inicializaciones de servicios pesados (lazy)
```

**Orden de Middlewares (app.ts):**
1. Helmet (security headers)
2. CORS
3. Cookie Parser
4. Correlation ID
5. Security Headers
6. Response Time
7. Rate Limiting (global para /api)
8. Body Parser
9. Compression
10. Request Logger
11. Routes (health/ready primero, luego API)

---

## 2. Entry Points y URLs

### 2.1 Producción (Railway)

**Backend:**
- **URL Pública:** https://ivan-reseller-web-production.up.railway.app
- **URL Privada (internal):** ivan-reseller-web.railway.internal
- **Puerto:** 3000 (asignado por Railway via `PORT` env var)
- **Root Directory:** `/backend`

**Frontend:**
- **URL Pública:** https://www.ivanreseller.com
- **Deployment:** Servicio separado (ver docs/FRONTEND_RAILWAY_DEPLOY_TODO_HUMAN.md)

### 2.2 Endpoints Críticos

**Health Checks:**
- `GET /health` - Liveness probe (siempre 200, rápido)
- `GET /ready` - Readiness probe (200 si DB ready, 503 si no)

**API Base:**
- `GET /api/*` - Todas las rutas API requieren autenticación (excepto /api/auth/login)

**Swagger (solo dev o si ENABLE_SWAGGER=true):**
- `GET /api-docs` - Documentación Swagger UI

---

## 3. Railway Deployment

### 3.1 Servicio Backend

**Configuración:**
- **Service Name:** `ivan-reseller-web`
- **Repository:** GitHub `GodinesCrazy/ivan-reseller-web`
- **Branch:** `main` (producción)
- **Root Directory:** `/backend`
- **Build Command:** `npm run build` (según nixpacks.toml)
- **Start Command:** `sh ./start.sh` (nixpacks) o `npm run start:with-migrations` (Procfile)

**Nixpacks (backend/nixpacks.toml):**
- Detecta automáticamente Node.js 20
- Instala dependencias: `npm install`
- Genera Prisma Client: `npx prisma generate`
- Descarga Chromium para Puppeteer
- Build: `npm run build`
- Start: `sh ./start.sh`

**Procfile (backend/Procfile):**
- `web: npm run start:with-migrations`

### 3.2 Health Checks en Railway

Railway usa automáticamente:
- **Liveness:** `GET /health` (debe responder 200)
- **Readiness:** `GET /ready` (debe responder 200 cuando listo)

**Configuración recomendada:**
- Health check path: `/health`
- Timeout: 10s
- Interval: 30s

### 3.3 Variables de Entorno en Railway

**Obligatorias (sin estas, el servicio no arranca):**
- `DATABASE_URL` - URL completa de PostgreSQL
- `JWT_SECRET` - String >= 32 caracteres
- `ENCRYPTION_KEY` - String >= 32 caracteres (puede ser igual a JWT_SECRET)

**Importantes:**
- `CORS_ORIGIN` - Origen permitido (ej: `https://www.ivanreseller.com`)
- `NODE_ENV` - `production`
- `PORT` - Railway lo asigna automáticamente (NO configurar manualmente)

**Opcionales (con defaults):**
- Ver sección 4 (Variables de Entorno)

---

## 4. Variables de Entorno

### 4.1 Obligatorias

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `DATABASE_URL` | string | - | URL completa PostgreSQL (formato: `postgresql://user:pass@host:port/db`) |
| `JWT_SECRET` | string (>=32) | - | Secret para firmar tokens JWT |
| `ENCRYPTION_KEY` | string (>=32) | JWT_SECRET | Clave para encriptar credenciales en DB |

### 4.2 Importantes

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `NODE_ENV` | enum | `development` | `development`, `production`, `test` |
| `PORT` | number | `3000` | Puerto del servidor (Railway lo asigna) |
| `CORS_ORIGIN` | string | `http://localhost:5173` | Origen permitido (separar múltiples con coma) |
| `API_URL` | URL | `http://localhost:3000` | URL base de la API (usado por frontend) |
| `LOG_LEVEL` | enum | `info` | `error`, `warn`, `info`, `debug` |

### 4.3 Base de Datos y Cache

| Variable | Tipo | Default | Descripción |
|----------|------|---------|-------------|
| `DATABASE_URL` | string | - | URL PostgreSQL (Railway genera automáticamente) |
| `DATABASE_PUBLIC_URL` | string | - | URL pública PostgreSQL (alternativa) |
| `REDIS_URL` | string | `redis://localhost:6379` | URL Redis (opcional) |

### 4.4 Feature Flags (Test/Production)

| Variable | Tipo | Default (Prod) | Default (Test) | Descripción |
|----------|------|----------------|----------------|-------------|
| `FX_AUTO_REFRESH_ENABLED` | boolean | `true` | `false` | Auto-refresh de tasas FX en constructor |
| `USAGE_TRACKING_ENABLED` | boolean | `true` | `false` | Tracking de uso de credenciales |
| `AUTOMATION_ENGINE_ENABLED` | boolean | `true` | `false` | Motor de automatización |
| `API_HEALTHCHECK_ENABLED` | boolean | `false` | `false` | Health checks de APIs externas |
| `API_HEALTHCHECK_MODE` | enum | `async` | - | `sync` o `async` (async previene SIGSEGV) |
| `API_HEALTHCHECK_INTERVAL_MS` | number | `900000` (15min) | - | Intervalo entre health checks |
| `SCRAPER_BRIDGE_ENABLED` | boolean | `true` | - | Usar Scraper Bridge en lugar de Puppeteer |
| `SCRAPER_BRIDGE_URL` | URL | - | - | URL del Scraper Bridge service |
| `WEBHOOK_VERIFY_SIGNATURE` | boolean | `true` | - | Validar firma HMAC en webhooks |
| `WEBHOOK_VERIFY_SIGNATURE_EBAY` | boolean | - | - | Override para eBay |
| `WEBHOOK_VERIFY_SIGNATURE_MERCADOLIBRE` | boolean | - | - | Override para MercadoLibre |
| `WEBHOOK_VERIFY_SIGNATURE_AMAZON` | boolean | - | - | Override para Amazon |
| `AUTO_PURCHASE_ENABLED` | boolean | `false` | `false` | Habilitar compras automáticas |
| `AUTO_PURCHASE_DRY_RUN` | boolean | `false` | - | Modo dry-run (no ejecuta compras reales) |
| `AUTO_PURCHASE_MODE` | enum | `sandbox` | - | `sandbox` o `production` |
| `RATE_LIMIT_ENABLED` | boolean | `true` | - | Habilitar rate limiting |

### 4.5 APIs Externas (Opcionales)

**eBay:**
- `EBAY_APP_ID`, `EBAY_DEV_ID`, `EBAY_CERT_ID` (legacy)
- `EBAY_SANDBOX_APP_ID`, `EBAY_SANDBOX_DEV_ID`, `EBAY_SANDBOX_CERT_ID`
- `EBAY_PRODUCTION_APP_ID`, `EBAY_PRODUCTION_DEV_ID`, `EBAY_PRODUCTION_CERT_ID`

**MercadoLibre:**
- `MERCADOLIBRE_CLIENT_ID`, `MERCADOLIBRE_CLIENT_SECRET` (legacy)
- `MERCADOLIBRE_SANDBOX_CLIENT_ID`, `MERCADOLIBRE_SANDBOX_CLIENT_SECRET`
- `MERCADOLIBRE_PRODUCTION_CLIENT_ID`, `MERCADOLIBRE_PRODUCTION_CLIENT_SECRET`

**Amazon:**
- Configurado vía API Credentials en DB (no env vars)

**PayPal:**
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT` (legacy)
- `PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET`
- `PAYPAL_PRODUCTION_CLIENT_ID`, `PAYPAL_PRODUCTION_CLIENT_SECRET`

**Groq:**
- `GROQ_API_KEY`

**ScraperAPI:**
- `SCRAPERAPI_KEY`

**AliExpress:**
- `ALIEXPRESS_EMAIL`, `ALIEXPRESS_PASSWORD` (legacy, Puppeteer)
- `ALIEXPRESS_AFFILIATE_APP_KEY`, `ALIEXPRESS_AFFILIATE_APP_SECRET` (Affiliate API)
- `ALIEXPRESS_DROPSHIPPING_APP_KEY`, `ALIEXPRESS_DROPSHIPPING_APP_SECRET` (Dropshipping API)

**FX (Exchange Rates):**
- `FX_BASE_CURRENCY` (default: `USD`)
- `FX_PROVIDER_ENABLED` (default: `true`)
- `FX_PROVIDER_URL` (default: `https://open.er-api.com/v6/latest/{base}`)
- `EXCHANGERATE_API_KEY` o `FX_API_KEY` (opcional, para exchangerate-api.com)

**Email:**
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `EMAIL_SECURE`

---

## 5. Feature Flags

### 5.1 Flags de Test (deshabilitan side-effects)

Estas flags se setean automáticamente a `false` cuando `NODE_ENV=test`:

- `FX_AUTO_REFRESH_ENABLED=false` - Previene HTTP requests en constructor de FXService
- `USAGE_TRACKING_ENABLED=false` - Previene setInterval en SecureCredentialManager
- `AUTOMATION_ENGINE_ENABLED=false` - Previene setInterval en AutomatedBusinessService

**Uso:** Se setean en `backend/src/__tests__/setup.ts` ANTES de cualquier import.

### 5.2 Flags de Producción

**API Health Checks:**
- `API_HEALTHCHECK_ENABLED=false` (default) - Deshabilitado por defecto para evitar SIGSEGV
- `API_HEALTHCHECK_MODE=async` (default) - Usa BullMQ async (recomendado)
- `API_HEALTHCHECK_INTERVAL_MS=900000` (15 min default)

**Scraper:**
- `SCRAPER_BRIDGE_ENABLED=true` (default) - Usar Scraper Bridge si está disponible
- `SCRAPER_BRIDGE_URL` - URL del servicio Scraper Bridge
- `SCRAPER_FALLBACK_TO_STEALTH=true` (default) - Fallback a Puppeteer si bridge falla

**Webhooks:**
- `WEBHOOK_VERIFY_SIGNATURE=true` (default) - Validar firma HMAC
- `WEBHOOK_ALLOW_INVALID_SIGNATURE=false` (default) - Solo dev, permite webhooks sin firma

**Auto-Purchase:**
- `AUTO_PURCHASE_ENABLED=false` (default) - **CRÍTICO: debe estar OFF por defecto**
- `AUTO_PURCHASE_DRY_RUN=false` (default) - Modo dry-run
- `AUTO_PURCHASE_DAILY_LIMIT=1000` (default) - Límite diario $1000
- `AUTO_PURCHASE_MONTHLY_LIMIT=10000` (default) - Límite mensual $10k
- `AUTO_PURCHASE_MAX_PER_ORDER=500` (default) - Máximo por orden $500

**Rate Limiting:**
- `RATE_LIMIT_ENABLED=true` (default)
- `RATE_LIMIT_DEFAULT=200` (requests por 15 min)
- `RATE_LIMIT_ADMIN=1000`
- `RATE_LIMIT_LOGIN=5` (intentos por 15 min)
- `RATE_LIMIT_WINDOW_MS=900000` (15 minutos)

---

## 6. Dependencias Externas

### 6.1 APIs de Marketplaces

**eBay:**
- **Tipo:** OAuth 2.0 + REST API
- **Riesgo:** ALTO (requiere OAuth token válido)
- **Sandbox:** Disponible
- **Endpoints críticos:** `/api/marketplace/publish`, `/api/webhooks/ebay`

**MercadoLibre:**
- **Tipo:** OAuth 2.0 + REST API
- **Riesgo:** ALTO (requiere OAuth token válido)
- **Sandbox:** Disponible
- **Endpoints críticos:** `/api/marketplace/publish`, `/api/webhooks/mercadolibre`

**Amazon SP-API:**
- **Tipo:** LWA (Login with Amazon) + SP-API
- **Riesgo:** ALTO (requiere refresh token válido)
- **Sandbox:** Disponible
- **Endpoints críticos:** `/api/amazon/*`, `/api/webhooks/amazon`

### 6.2 APIs de Scraping

**ScraperAPI:**
- **Tipo:** HTTP API con API key
- **Riesgo:** MEDIO (fallback a Puppeteer disponible)
- **Costo:** Por request
- **Uso:** Scraping de AliExpress

**Scraper Bridge (interno):**
- **Tipo:** Servicio separado (Python)
- **Riesgo:** BAJO (opcional, fallback a Puppeteer)
- **URL:** Configurado via `SCRAPER_BRIDGE_URL`

**Puppeteer (fallback):**
- **Tipo:** Headless Chrome
- **Riesgo:** MEDIO (puede fallar por CAPTCHA)
- **Uso:** Scraping directo cuando bridge no está disponible

### 6.3 APIs de Pago

**PayPal:**
- **Tipo:** REST API con OAuth
- **Riesgo:** ALTO (requiere credenciales válidas)
- **Sandbox:** Disponible
- **Uso:** Payouts de comisiones

### 6.4 APIs de AI/ML

**Groq:**
- **Tipo:** HTTP API con API key
- **Riesgo:** BAJO (opcional, solo para sugerencias AI)
- **Uso:** Análisis de oportunidades y mejoras de productos

### 6.5 FX (Exchange Rates)

**open.er-api.com (default):**
- **Tipo:** HTTP API pública (sin auth)
- **Riesgo:** BAJO (fallback a rates seed si falla)
- **Límite:** Rate limiting implícito

**exchangerate-api.com (con API key):**
- **Tipo:** HTTP API con API key
- **Riesgo:** BAJO
- **Config:** `EXCHANGERATE_API_KEY` o `FX_API_KEY`

---

## 7. Runbook de Incidentes

### 7.1 502 "Application failed to respond" en /health

**Síntomas:**
- Railway Edge responde 502
- Logs muestran "ERR_HTTP_HEADERS_SENT"
- Stack trace apunta a `response-time.middleware.js` o `request-logger.middleware.js`

**Causa Raíz:**
- Middlewares intentan setear headers después de que `res.end()` ya fue llamado
- Múltiples wrappers de `res.end` causan doble finalización

**Fix Aplicado:**
1. `response-time.middleware.ts`: Usa eventos `finish` y setea headers ANTES del primer write
2. `request-logger.middleware.ts`: Usa eventos `finish` y `close` (no intercepta res.end)
3. `server.ts`: Handler de `unhandledRejection` ignora `ERR_HTTP_HEADERS_SENT` (no fatal)

**Verificación:**
```powershell
# Desde local
curl.exe --max-time 10 https://ivan-reseller-web-production.up.railway.app/health
# Debe retornar 200 con JSON

curl.exe --max-time 10 https://ivan-reseller-web-production.up.railway.app/ready
# Debe retornar 200 (si DB ready) o 503 (si no), pero siempre responde rápido
```

**Qué mirar en Railway Dashboard:**
1. Deployments ? Último deploy ? View logs
2. Buscar "ERR_HTTP_HEADERS_SENT" (no debe aparecer)
3. Buscar "UNHANDLED REJECTION" (solo debe aparecer para errores reales, no headers)
4. Verificar que /health responde en <2s

### 7.2 Timeout en /ready

**Síntomas:**
- /ready tarda >10s o timeout
- Railway marca servicio como unhealthy

**Causas posibles:**
1. DB connection timeout (migraciones colgadas)
2. Redis ping timeout (si Redis no está disponible)
3. Lógica pesada en /ready (prohibido)

**Fix:**
- /ready tiene timeouts explícitos:
  - DB check: 2s max
  - Redis check: 1s max
- Usa estado global (`__isDatabaseReady`) cuando está disponible (más rápido)

**Verificación:**
```powershell
# Debe responder rápido (<2s) incluso si DB está caída
curl.exe --max-time 5 https://ivan-reseller-web-production.up.railway.app/ready
```

### 7.3 Backend no arranca

**Síntomas:**
- Railway muestra "Application failed to respond"
- No hay logs de arranque

**Checklist:**
1. Verificar `DATABASE_URL` está configurada (Railway Dashboard ? Variables)
2. Verificar `JWT_SECRET` y `ENCRYPTION_KEY` >= 32 caracteres
3. Verificar logs de arranque (Deployments ? View logs)
4. Buscar errores de migración (Prisma)
5. Verificar que `PORT` no esté hardcodeado (Railway lo asigna)

**Comandos de diagnóstico:**
```powershell
# Verificar que Railway tiene las variables
# (requiere Railway CLI o dashboard manual)

# Verificar build local
cd backend
npm run build
# Debe pasar sin errores TypeScript críticos
```

### 7.4 Tests colgados (open handles)

**Síntomas:**
- `npm test` no termina
- Jest muestra "Jest has detected the following X open handles"

**Causas comunes:**
1. FXService.refreshRates() en constructor (TLSWRAP)
2. SecureCredentialManager.startUsageTracking() (Timeout)
3. AutomatedBusinessService.startAutomationEngine() (Timeout)

**Fix:**
- Flags `FX_AUTO_REFRESH_ENABLED=false`, `USAGE_TRACKING_ENABLED=false`, `AUTOMATION_ENGINE_ENABLED=false` en test env
- Lazy initialization de servicios

**Verificación:**
```powershell
cd backend
npx jest --runInBand --detectOpenHandles --testTimeout=30000
# Debe terminar sin "open handles"
```

---

## 8. Comandos Útiles

### 8.1 Local Development

```powershell
# Backend
cd backend
npm ci
npm run build
npm run dev

# Frontend
cd frontend
npm ci
npm run dev
```

### 8.2 Tests

```powershell
# Backend tests
cd backend
npm test -- --runInBand

# Integration tests (requiere DB)
npm test -- --testPathPattern=integration
```

### 8.3 Producción (Railway)

```powershell
# Verificar health
curl.exe --max-time 10 https://ivan-reseller-web-production.up.railway.app/health

# Verificar ready
curl.exe --max-time 10 https://ivan-reseller-web-production.up.railway.app/ready

# Login (ejemplo)
curl.exe -X POST https://ivan-reseller-web-production.up.railway.app/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"username\":\"admin\",\"password\":\"admin123\"}'
```

---

## 9. Troubleshooting Común

### 9.1 "Cannot set headers after they are sent"

**Causa:** Middleware intenta modificar headers después de `res.end()`

**Fix:** Usar eventos `finish` en lugar de interceptar `res.end`

**Archivos afectados:**
- `backend/src/middleware/response-time.middleware.ts`
- `backend/src/middleware/request-logger.middleware.ts`

### 9.2 Prisma EPERM en Windows

**Causa:** Múltiples procesos intentan regenerar Prisma Client concurrentemente

**Fix:**
```powershell
# Detener procesos node
taskkill /F /IM node.exe

# Limpiar y regenerar
cd backend
rmdir /S /Q node_modules\.prisma
npx prisma generate
```

### 9.3 Tests colgados

**Causa:** Side-effects en constructores de servicios

**Fix:** Flags de test deshabilitan auto-start de servicios pesados

---

## 10. Contacto y Soporte

**Documentación adicional:**
- `docs/API_ENDPOINTS.md` - Inventario completo de endpoints
- `docs/LIVE_QA_RAILWAY_RUNBOOK.md` - Runbook de QA en producción
- `docs/RAILWAY_DEPLOY_STEPS.md` - Pasos de deploy

**Logs:**
- Railway Dashboard ? Service ? Deployments ? View logs
- Buscar por correlation ID para rastrear requests

---

**Última revisión:** 2025-12-18  
**Mantenido por:** SRE Team

# ⚙️ FASE 4: MATRIZ DE CONFIGURACIÓN (ENV VARIABLES)

**Fecha:** 2025-01-28  
**Tipo:** Matriz Completa de Variables de Entorno  
**Estado:** ✅ COMPLETADO

---

## 📋 ÍNDICE

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Backend - Variables Requeridas](#backend---variables-requeridas)
3. [Backend - Variables Opcionales](#backend---variables-opcionales)
4. [Frontend - Variables Requeridas](#frontend---variables-requeridas)
5. [Frontend - Variables Opcionales](#frontend---variables-opcionales)
6. [Variables por Categoría](#variables-por-categoría)

---

## 📊 RESUMEN EJECUTIVO

### Totales

| Categoría | Backend | Frontend | Total |
|-----------|---------|----------|-------|
| Requeridas | 3 | 1 | 4 |
| Opcionales (recomendadas) | 11 | 0 | 11 |
| Opcionales (APIs externas) | 14+ | 0 | 14+ |
| Feature Flags | 15+ | 1 | 16+ |
| **TOTAL** | **43+** | **2** | **45+** |

### Variables Críticas (Falla si faltan)

1. **DATABASE_URL** (backend) - PostgreSQL connection string
2. **JWT_SECRET** (backend) - Secret para JWT (min 32 chars)
3. **ENCRYPTION_KEY** (backend) - Key para encriptar credenciales (min 32 chars, fallback a JWT_SECRET)
4. **VITE_API_URL** (frontend) - URL del backend API (solo producción)

---

## 🔧 BACKEND - VARIABLES REQUERIDAS

### 1. DATABASE_URL

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `DATABASE_URL` |
| **Requerida** | ✅ Sí (crítica) |
| **Tipo** | String (URL) |
| **Formato** | `postgresql://user:password@host:port/database` |
| **Alternativas** | `DATABASE_PUBLIC_URL`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `DATABASE_PRISMA_URL`, `PGDATABASE`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_URL_POOLING` |
| **Default** | Ninguno (falla si falta) |
| **Validación** | Debe empezar con `postgresql://` o `postgres://` |
| **Uso** | Prisma ORM, conexión a PostgreSQL |
| **Dónde se usa** | `backend/src/config/env.ts`, `backend/src/config/database.ts` |
| **Ejemplo** | `postgresql://postgres:password@postgres.railway.internal:5432/postgres` |
| **Notas** | Railway puede usar diferentes nombres; el código busca automáticamente |

---

### 2. JWT_SECRET

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `JWT_SECRET` |
| **Requerida** | ✅ Sí (crítica) |
| **Tipo** | String |
| **Longitud mínima** | 32 caracteres |
| **Default** | Ninguno (falla si falta) |
| **Validación** | Min 32 caracteres |
| **Uso** | Firmar y verificar JWT tokens |
| **Dónde se usa** | `backend/src/config/env.ts`, `backend/src/middleware/auth.middleware.ts` |
| **Ejemplo** | Generar con: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| **Notas** | También se usa como fallback para ENCRYPTION_KEY si no está configurada |

---

### 3. ENCRYPTION_KEY

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `ENCRYPTION_KEY` |
| **Requerida** | ⚠️ Condicional (fallback a JWT_SECRET) |
| **Tipo** | String |
| **Longitud mínima** | 32 caracteres |
| **Default** | Usa JWT_SECRET si no está configurada |
| **Validación** | Min 32 caracteres (o JWT_SECRET debe tener 32+) |
| **Uso** | Encriptar credenciales de API almacenadas |
| **Dónde se usa** | `backend/src/config/env.ts`, `backend/src/services/security.service.ts` |
| **Ejemplo** | Generar con: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| **Notas** | Si no está configurada, usa JWT_SECRET como fallback (ambos deben tener 32+ chars) |

---

## 🔧 BACKEND - VARIABLES OPCIONALES (RECOMENDADAS)

### 4. NODE_ENV

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `NODE_ENV` |
| **Requerida** | ❌ No |
| **Tipo** | Enum: `'development'` \| `'production'` \| `'test'` |
| **Default** | `'development'` |
| **Uso** | Determina ambiente (afecta logging, errores, etc.) |
| **Ejemplo** | `production` |

---

### 5. PORT

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `PORT` |
| **Requerida** | ❌ No |
| **Tipo** | String (número) |
| **Default** | `'3000'` |
| **Uso** | Puerto donde escucha el servidor |
| **Ejemplo** | `3000` |
| **Notas** | Railway asigna automáticamente el puerto (PORT variable) |

---

### 6. API_URL

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `API_URL` |
| **Requerida** | ❌ No |
| **Tipo** | String (URL) |
| **Default** | `'http://localhost:3000'` |
| **Uso** | URL pública del API (usado en logs, swagger, etc.) |
| **Ejemplo** | `https://api.ivanreseller.com` o `https://ivan-reseller-web-production.up.railway.app` |

---

### 7. FRONTEND_URL

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `FRONTEND_URL` |
| **Requerida** | ❌ No |
| **Tipo** | String (URL) |
| **Default** | Ninguno |
| **Uso** | URL del frontend (usado como fallback para CORS, links en emails, etc.) |
| **Ejemplo** | `https://www.ivanreseller.com` |

---

### 8. CORS_ORIGIN / CORS_ORIGINS

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `CORS_ORIGIN` (singular) o `CORS_ORIGINS` (plural, prioridad) |
| **Requerida** | ❌ No (pero recomendada) |
| **Tipo** | String (comma-separated URLs) |
| **Default** | `'http://localhost:5173'` |
| **Uso** | Orígenes permitidos para CORS |
| **Ejemplo** | `https://www.ivanreseller.com,https://ivanreseller.com` |
| **Notas** | `CORS_ORIGINS` tiene prioridad sobre `CORS_ORIGIN`. El código agrega automáticamente fallbacks de producción (`ivanreseller.com`) |

---

### 9. REDIS_URL

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `REDIS_URL` |
| **Requerida** | ❌ No |
| **Tipo** | String (URL) |
| **Alternativas** | `REDISCLOUD_URL`, `REDIS_TLS_URL` |
| **Default** | `'redis://localhost:6379'` |
| **Validación** | Debe empezar con `redis://` o `rediss://` |
| **Uso** | Cache distribuido, sessions, BullMQ jobs |
| **Ejemplo** | `redis://redis.railway.internal:6379` o `rediss://redis.railway.internal:6379` |
| **Notas** | Sistema funciona sin Redis, pero sin cache y sin jobs en background |

---

### 10. JWT_EXPIRES_IN

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `JWT_EXPIRES_IN` |
| **Requerida** | ❌ No |
| **Tipo** | String (duration) |
| **Default** | `'7d'` |
| **Uso** | Tiempo de expiración de JWT access tokens |
| **Ejemplo** | `'7d'`, `'1h'`, `'30m'` |

---

### 11. JWT_REFRESH_EXPIRES_IN

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `JWT_REFRESH_EXPIRES_IN` |
| **Requerida** | ❌ No |
| **Tipo** | String (duration) |
| **Default** | `'30d'` |
| **Uso** | Tiempo de expiración de JWT refresh tokens |
| **Ejemplo** | `'30d'`, `'90d'` |

---

### 12. LOG_LEVEL

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `LOG_LEVEL` |
| **Requerida** | ❌ No |
| **Tipo** | Enum: `'error'` \| `'warn'` \| `'info'` \| `'debug'` |
| **Default** | `'info'` |
| **Uso** | Nivel de logging (Winston) |
| **Ejemplo** | `'info'` (producción), `'debug'` (desarrollo) |

---

## 🔧 BACKEND - VARIABLES OPCIONALES (APIS EXTERNAS)

### Marketplaces

| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| `EBAY_APP_ID` | ❌ | - | eBay App ID |
| `EBAY_DEV_ID` | ❌ | - | eBay Dev ID |
| `EBAY_CERT_ID` | ❌ | - | eBay Cert ID |
| `MERCADOLIBRE_CLIENT_ID` | ❌ | - | MercadoLibre Client ID |
| `MERCADOLIBRE_CLIENT_SECRET` | ❌ | - | MercadoLibre Client Secret |
| `PAYPAL_CLIENT_ID` | ❌ | - | PayPal Client ID |
| `PAYPAL_CLIENT_SECRET` | ❌ | - | PayPal Client Secret |
| `PAYPAL_ENVIRONMENT` | ❌ | `'sandbox'` | PayPal environment: `'sandbox'` o `'production'` |

### APIs de Servicios

| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| `GROQ_API_KEY` | ❌ | - | Groq API key (para IA) |
| `SCRAPERAPI_KEY` | ❌ | - | ScraperAPI key |

**Nota:** Estas variables se almacenan típicamente en la base de datos (encriptadas) a través de la UI de configuración de APIs, no como variables de entorno del servidor. Las variables de entorno solo se usan como fallback o para credenciales globales del sistema.

---

## 🔧 BACKEND - FEATURE FLAGS Y CONFIGURACIÓN AVANZADA

### API Health Check

| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| `API_HEALTHCHECK_ENABLED` | ❌ | `'false'` | Habilitar health checks de APIs externas |
| `API_HEALTHCHECK_MODE` | ❌ | `'async'` | Modo: `'sync'` o `'async'` |
| `API_HEALTHCHECK_INTERVAL_MS` | ❌ | `900000` (15 min) | Intervalo de health checks en ms |

### Scraper Bridge

| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| `SCRAPER_BRIDGE_URL` | ❌ | - | URL del scraper bridge service |
| `SCRAPER_BRIDGE_ENABLED` | ❌ | `'true'` | Habilitar scraper bridge |
| `SCRAPER_FALLBACK_TO_STEALTH` | ❌ | `'true'` | Fallback a stealth scraping si bridge falla |

### Webhook Signature Validation

| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| `WEBHOOK_VERIFY_SIGNATURE` | ❌ | `'true'` | Verificar firmas de webhooks |
| `WEBHOOK_VERIFY_SIGNATURE_EBAY` | ❌ | `'true'` | Verificar firmas de eBay webhooks |
| `WEBHOOK_VERIFY_SIGNATURE_MERCADOLIBRE` | ❌ | `'true'` | Verificar firmas de MercadoLibre webhooks |
| `WEBHOOK_VERIFY_SIGNATURE_AMAZON` | ❌ | `'true'` | Verificar firmas de Amazon webhooks |
| `WEBHOOK_SECRET_EBAY` | ❌ | - | Secret para verificar webhooks de eBay |
| `WEBHOOK_SECRET_MERCADOLIBRE` | ❌ | - | Secret para verificar webhooks de MercadoLibre |
| `WEBHOOK_SECRET_AMAZON` | ❌ | - | Secret para verificar webhooks de Amazon |
| `WEBHOOK_ALLOW_INVALID_SIGNATURE` | ❌ | `'false'` | Permitir webhooks sin firma válida (solo dev) |

### Auto-Purchase Guardrails

| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| `AUTO_PURCHASE_ENABLED` | ❌ | `'false'` | Habilitar compra automática |
| `AUTO_PURCHASE_MODE` | ❌ | `'sandbox'` | Modo: `'sandbox'` o `'production'` |
| `AUTO_PURCHASE_DRY_RUN` | ❌ | `'false'` | Modo dry-run (no realizar compras reales) |
| `AUTO_PURCHASE_DAILY_LIMIT` | ❌ | `1000` | Límite diario en USD |
| `AUTO_PURCHASE_MONTHLY_LIMIT` | ❌ | `10000` | Límite mensual en USD |
| `AUTO_PURCHASE_MAX_PER_ORDER` | ❌ | `500` | Máximo por orden en USD |

### Rate Limiting

| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| `RATE_LIMIT_ENABLED` | ❌ | `'true'` | Habilitar rate limiting |
| `RATE_LIMIT_DEFAULT` | ❌ | `200` | Requests por 15 min (usuarios normales) |
| `RATE_LIMIT_ADMIN` | ❌ | `1000` | Requests por 15 min (ADMIN) |
| `RATE_LIMIT_LOGIN` | ❌ | `5` | Intentos de login por 15 min |
| `RATE_LIMIT_WINDOW_MS` | ❌ | `900000` (15 min) | Ventana de tiempo en ms |

### AliExpress Configuration

| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| `ALIEXPRESS_DATA_SOURCE` | ❌ | `'api'` | Fuente de datos: `'api'` o `'scrape'` |
| `ALIEXPRESS_AUTH_MONITOR_ENABLED` | ❌ | `'false'` | Habilitar monitor de autenticación AliExpress |
| `ALLOW_BROWSER_AUTOMATION` | ❌ | `'false'` | Permitir automatización con navegador (Puppeteer) |

---

## 🎨 FRONTEND - VARIABLES REQUERIDAS

### 1. VITE_API_URL

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `VITE_API_URL` |
| **Requerida** | ✅ Sí (en producción) |
| **Tipo** | String (URL) |
| **Default** | `'http://localhost:3000'` (solo en desarrollo) |
| **Validación** | Debe empezar con `http://` o `https://` |
| **Uso** | URL base del backend API |
| **Dónde se usa** | `frontend/src/config/runtime.ts`, `frontend/src/services/api.ts` |
| **Ejemplo** | `https://ivan-reseller-web-production.up.railway.app` |
| **Notas** | En producción, falla temprano si no está configurada |

---

## 🎨 FRONTEND - VARIABLES OPCIONALES

### 1. VITE_LOG_LEVEL

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `VITE_LOG_LEVEL` |
| **Requerida** | ❌ No |
| **Tipo** | String |
| **Default** | `'warn'` |
| **Uso** | Nivel de logging del frontend |
| **Ejemplo** | `'warn'`, `'info'`, `'debug'` |

---

### 2. VITE_ENABLE_INVESTOR_DOCS

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `VITE_ENABLE_INVESTOR_DOCS` |
| **Requerida** | ❌ No |
| **Tipo** | Boolean (string: `'true'` o `'false'`) |
| **Default** | `'false'` |
| **Uso** | Feature flag para habilitar documentación de inversionistas |
| **Ejemplo** | `'true'` |

---

## 📊 VARIABLES POR CATEGORÍA

### 🔴 Críticas (Falla si faltan)

1. `DATABASE_URL` (backend)
2. `JWT_SECRET` (backend, min 32 chars)
3. `ENCRYPTION_KEY` (backend, min 32 chars, o JWT_SECRET con 32+ chars)
4. `VITE_API_URL` (frontend, solo producción)

### 🟡 Recomendadas (Sistema funciona pero con limitaciones)

1. `NODE_ENV` (backend)
2. `PORT` (backend)
3. `API_URL` (backend)
4. `FRONTEND_URL` (backend)
5. `CORS_ORIGIN` / `CORS_ORIGINS` (backend)
6. `REDIS_URL` (backend)
7. `LOG_LEVEL` (backend)

### 🟢 Opcionales (Feature flags y APIs externas)

- Feature flags (API_HEALTHCHECK_*, SCRAPER_BRIDGE_*, WEBHOOK_*, AUTO_PURCHASE_*, RATE_LIMIT_*, ALIEXPRESS_*, etc.)
- APIs externas (EBAY_*, MERCADOLIBRE_*, PAYPAL_*, GROQ_API_KEY, SCRAPERAPI_KEY, etc.)

---

## 🔐 SECRETS Y VALIDACIÓN

### Secrets Críticos

1. **DATABASE_URL** - Contiene credenciales de PostgreSQL
2. **JWT_SECRET** - Secret para JWT (32+ chars)
3. **ENCRYPTION_KEY** - Key para encriptar credenciales (32+ chars)
4. **REDIS_URL** - Puede contener contraseña
5. **API Keys** - Todas las keys de APIs externas (se almacenan encriptadas en DB)

### Validación de Arranque

El backend valida variables críticas al arranque:
- `DATABASE_URL` - Debe ser URL válida (postgresql://...)
- `JWT_SECRET` - Min 32 caracteres
- `ENCRYPTION_KEY` - Min 32 caracteres (o usa JWT_SECRET como fallback)

Si falta alguna crítica, el servidor **falla temprano** con mensaje claro.

---

## 📍 DÓNDE CONFIGURAR

### Railway (Backend)

1. Railway Dashboard → `ivan-reseller-web` → Variables
2. Agregar todas las variables requeridas
3. Para `DATABASE_URL`, copiar desde Postgres service → Variables → DATABASE_URL

### Vercel (Frontend)

1. Vercel Dashboard → Project → Settings → Environment Variables
2. Agregar `VITE_API_URL` (y otras si aplican)
3. Configurar para Production, Preview, Development según corresponda

---

## 📝 EJEMPLO DE CONFIGURACIÓN MÍNIMA

### Backend (Railway)

```env
# Críticas
DATABASE_URL=postgresql://postgres:password@postgres.railway.internal:5432/postgres
JWT_SECRET=your-super-secret-jwt-key-min-32-characters-long-please
ENCRYPTION_KEY=your-super-secret-encryption-key-min-32-chars

# Recomendadas
NODE_ENV=production
PORT=3000
API_URL=https://ivan-reseller-web-production.up.railway.app
FRONTEND_URL=https://www.ivanreseller.com
CORS_ORIGINS=https://www.ivanreseller.com,https://ivanreseller.com
LOG_LEVEL=info

# Opcional pero recomendado
REDIS_URL=redis://redis.railway.internal:6379
```

### Frontend (Vercel)

```env
# Crítica (producción)
VITE_API_URL=https://ivan-reseller-web-production.up.railway.app

# Opcional
VITE_LOG_LEVEL=warn
```

---

**Última actualización:** 2025-01-28  
**Próxima fase:** FASE 5 - Observabilidad (RUNBOOK.md, RELEASE_CHECKLIST.md)


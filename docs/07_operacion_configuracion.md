# ?? Guía de Configuración y Operación - Ivan Reseller

**Versión:** 1.0.0  
**Última actualización:** 2025-01-23

---

## ?? Índice

1. [Instalación](#instalación)
2. [Variables de Entorno](#variables-de-entorno)
3. [Ejecución](#ejecución)
4. [Troubleshooting](#troubleshooting)

---

## ?? Instalación

### Prerrequisitos

- **Node.js** 20+ 
- **npm** 9+
- **PostgreSQL** 16+ (o Railway managed)
- **Redis** (opcional pero recomendado)

### Instalación Local

#### Backend

```bash
cd backend
npm install
cp .env.example .env
# Editar .env con tus credenciales
npx prisma generate
npx prisma migrate dev
npm run dev
```

#### Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Editar .env con VITE_API_URL
npm run dev
```

**Evidencia:** `backend/package.json`, `frontend/package.json`

---

## ?? Variables de Entorno

### Tabla Completa de Variables

#### Variables Obligatorias

| Variable | Descripción | Ejemplo | Evidencia |
|----------|-------------|---------|-----------|
| `NODE_ENV` | Entorno (development/production/test) | `production` | `backend/src/config/env.ts:241` |
| `PORT` | Puerto del servidor | `3000` | `backend/src/config/env.ts:242` |
| `DATABASE_URL` | URL de PostgreSQL | `postgresql://user:pass@host:5432/db` | `backend/src/config/env.ts:248` |
| `JWT_SECRET` | Secreto para JWT (mínimo 32 caracteres) | `a1b2c3...` | `backend/src/config/env.ts:250` |
| `CORS_ORIGIN` | Orígenes permitidos | `https://ivanreseller.com` | `backend/src/config/env.ts:253` |

#### Variables Opcionales (con defaults)

| Variable | Default | Descripción | Evidencia |
|----------|---------|-------------|-----------|
| `REDIS_URL` | `redis://localhost:6379` | URL de Redis | `backend/src/config/env.ts:238` |
| `API_URL` | `http://localhost:3000` | URL de la API | `backend/src/config/env.ts:245` |
| `FRONTEND_URL` | - | URL del frontend | `backend/src/config/env.ts:246` |
| `JWT_EXPIRES_IN` | `7d` | Expiración de JWT | `backend/src/config/env.ts:251` |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Expiración de refresh token | `backend/src/config/env.ts:252` |
| `LOG_LEVEL` | `info` | Nivel de logging | `backend/src/config/env.ts:254` |

#### Variables de APIs Externas (Opcionales)

| Variable | Descripción | Evidencia |
|----------|-------------|-----------|
| `EBAY_APP_ID` | eBay App ID | `backend/src/config/env.ts:257` |
| `EBAY_DEV_ID` | eBay Dev ID | `backend/src/config/env.ts:258` |
| `EBAY_CERT_ID` | eBay Cert ID | `backend/src/config/env.ts:259` |
| `MERCADOLIBRE_CLIENT_ID` | MercadoLibre Client ID | `backend/src/config/env.ts:260` |
| `MERCADOLIBRE_CLIENT_SECRET` | MercadoLibre Client Secret | `backend/src/config/env.ts:261` |
| `PAYPAL_CLIENT_ID` | PayPal Client ID | `backend/src/config/env.ts:262` |
| `PAYPAL_CLIENT_SECRET` | PayPal Client Secret | `backend/src/config/env.ts:263` |
| `PAYPAL_ENVIRONMENT` | PayPal environment (sandbox/production) | `backend/src/config/env.ts:264` |
| `GROQ_API_KEY` | GROQ AI API Key | `backend/src/config/env.ts:265` |
| `SCRAPERAPI_KEY` | ScraperAPI Key | `backend/src/config/env.ts:266` |
| `ALIEXPRESS_APP_KEY` | AliExpress App Key | `backend/src/config/env.ts:309` |
| `ALIEXPRESS_APP_SECRET` | AliExpress App Secret | `backend/src/config/env.ts:310` |

#### Variables de Configuración Avanzada

| Variable | Default | Descripción | Evidencia |
|----------|---------|-------------|-----------|
| `SAFE_BOOT` | `true` en producción | Modo seguro de arranque | `backend/src/config/env.ts:244` |
| `FORCE_ROUTING_OK` | `true` | Servidor mínimo para routing | `backend/src/minimal-server.ts:15` |
| `AUTO_PURCHASE_ENABLED` | `false` | Habilitar compra automática | `backend/src/config/env.ts:289` |
| `AUTO_PURCHASE_MODE` | `sandbox` | Modo de compra (sandbox/production) | `backend/src/config/env.ts:290` |
| `ALIEXPRESS_DATA_SOURCE` | `api` | Fuente de datos (api/scrape) | `backend/src/config/env.ts:304` |
| `DISABLE_BROWSER_AUTOMATION` | `true` en producción | Deshabilitar Puppeteer | `backend/src/config/env.ts:329` |

**Evidencia completa:** `backend/src/config/env.ts:240-336`

---

## ?? Ejecución

### Desarrollo

#### Backend

```bash
cd backend
npm run dev
```

**Puerto:** `http://localhost:3000`  
**Hot reload:** Activado

#### Frontend

```bash
cd frontend
npm run dev
```

**Puerto:** `http://localhost:5173`  
**Hot reload:** Activado

### Producción

#### Build

```bash
# Backend
cd backend
npm run build
npm start

# Frontend
cd frontend
npm run build
# Deploy a Vercel o servidor estático
```

**Evidencia:** `backend/package.json:10`, `frontend/package.json:8`

---

## ?? Troubleshooting

### Error: DATABASE_URL no encontrada

**Síntoma:** `? ERROR: DATABASE_URL no encontrada`

**Solución:**
1. Verificar que `DATABASE_URL` está en variables de entorno
2. En Railway: Copiar `DATABASE_URL` desde servicio Postgres
3. Verificar formato: `postgresql://user:pass@host:5432/db`

**Evidencia:** `backend/src/config/env.ts:7-148`

### Error: JWT_SECRET muy corto

**Síntoma:** `? ERROR CRÍTICO: JWT_SECRET no está configurado o es muy corto`

**Solución:**
1. Generar nuevo JWT_SECRET:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Configurar en variables de entorno (mínimo 32 caracteres)

**Evidencia:** `backend/src/server.ts:59-82`

### Error: Redis no disponible

**Síntoma:** `??  WARNING: Redis not available - scheduled tasks disabled`

**Solución:**
1. Redis es opcional pero recomendado
2. Configurar `REDIS_URL` si se requiere colas
3. Sistema funciona sin Redis pero sin colas

**Evidencia:** `backend/src/config/redis.ts`

### Error: 502 Application failed to respond

**Síntoma:** Railway retorna 502

**Solución:**
1. Verificar que `FORCE_ROUTING_OK=true` (temporal)
2. Verificar logs en Railway
3. Ejecutar script de validación: `backend/scripts/ps-p0-minimal-routing.ps1`

**Evidencia:** `docs/P0_RAILWAY_ROUTING_FIX.md`

### Error: CORS bloqueado

**Síntoma:** `Access-Control-Allow-Origin` error en frontend

**Solución:**
1. Verificar `CORS_ORIGIN` incluye URL del frontend
2. Formato: `https://ivanreseller.com,https://www.ivanreseller.com`
3. Sin espacios, separados por coma

**Evidencia:** `backend/src/app.ts:248-279`

---

**Próximos pasos:** Ver [Documentación Técnica](./08_tecnico.md) para detalles de implementación.

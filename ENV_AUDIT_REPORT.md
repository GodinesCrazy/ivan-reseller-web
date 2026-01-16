# 🔍 AUDITORÍA TÉCNICA: VARIABLES DE ENTORNO - IVAN RESELLER WEB

**Fecha:** 2025-01-11  
**Auditor:** Sistema de Auditoría Automática  
**Objetivo:** Identificar EXACTAMENTE qué variables de entorno necesita este repositorio para funcionar en producción (Railway) y cuáles credenciales se gestionan por UI y se guardan en BD (cifradas)

---

## 1. RESUMEN EJECUTIVO

Este repositorio es un SaaS multi-tenant de dropshipping/reselling que integra múltiples marketplaces (eBay, Amazon, MercadoLibre, AliExpress). El sistema tiene:

- **Backend:** Node.js/Express con TypeScript, desplegado en Railway
- **Frontend:** React/Vite, desplegado en Vercel o Railway
- **Base de Datos:** PostgreSQL (Railway)
- **Cache:** Redis (Railway)
- **Autenticación:** JWT con cookies httpOnly (fallback a Bearer token)
- **Cifrado:** AES-256-GCM para credenciales almacenadas en BD

**Hallazgos críticos:**
- ✅ Sistema bien estructurado con validación de env vars usando Zod
- ⚠️ **ENCRYPTION_KEY** es CRÍTICA pero puede usar JWT_SECRET como fallback (mínimo 32 caracteres)
- ⚠️ **CORS_ORIGIN** debe incluir TODAS las URLs del frontend (formato: string separado por comas, sin espacios extra)
- ⚠️ **VITE_API_URL** debe configurarse en el frontend (Vercel/Railway) - es la ÚNICA variable obligatoria del frontend
- ⚠️ **API_URL** solo se usa en backend (Swagger/docs), NO en frontend
- ⚠️ AliExpress tiene 3 modos: API Affiliate (UI/BD), API Dropshipping (UI/BD), y scraping con credenciales (UI/BD)
- ✅ Frontend detectado: `VITE_API_URL` (obligatoria), `VITE_LOG_LEVEL` (opcional), `VITE_GROQ_API_KEY` (definida pero no usada)

---

## 2. ARQUITECTURA DETECTADA

### 2.1 Componentes del Sistema

| Componente | Tecnología | Ubicación | Entry Point |
|------------|-----------|-----------|-------------|
| **Backend** | Node.js/Express/TypeScript | `backend/src/server.ts` | `npm run start:with-migrations` |
| **Frontend** | React/Vite | `frontend/src` | `npm run build` → servido estático |
| **Base de Datos** | PostgreSQL (Prisma ORM) | Railway | `DATABASE_URL` |
| **Cache** | Redis | Railway | `REDIS_URL` |
| **Worker/Jobs** | In-process (scheduled-tasks.service) | Mismo proceso backend | N/A |

### 2.2 Flujo de Inicialización

```
1. server.ts → validateEncryptionKey() [SÍNCRONO, puede hacer exit]
2. httpServer.listen(PORT, '0.0.0.0') [INMEDIATO]
3. Bootstrap async:
   - runMigrations()
   - connectWithRetry() (DB)
   - redis.ping() (Redis)
   - ensureAdminUser()
   - Inicializaciones de servicios
```

### 2.3 Configuración de Variables

- **Backend:** `backend/src/config/env.ts` (Zod schema)
- **Frontend:** `frontend/src/services/api.ts` (VITE_API_URL)
- **Validación:** Zod schema con mensajes de error claros
- **Fallbacks:** Algunas variables tienen valores por defecto (ver tabla)

---

## 3. TABLA COMPLETA DE VARIABLES DETECTADAS

### 3.1 Variables OBLIGATORIAS (Backend)

| Variable | Ubicación | Componente | Obligatoria | Valor por Defecto | Síntoma si Falta | Server-Only | Notas |
|----------|-----------|------------|-------------|-------------------|------------------|--------------|-------|
| `NODE_ENV` | `env.ts:229` | Backend | ✅ | `development` | Comportamiento incorrecto | ✅ | `development`/`production`/`test` |
| `PORT` | `env.ts:230` | Backend | ✅ | `3000` | Servidor no inicia | ✅ | Railway lo asigna automáticamente |
| `DATABASE_URL` | `env.ts:232` | Backend | ✅ | ❌ | **CRASH al iniciar** | ✅ | Busca múltiples nombres: `DATABASE_URL`, `DATABASE_PUBLIC_URL`, `POSTGRES_URL`, etc. |
| `JWT_SECRET` | `env.ts:234` | Backend | ✅ | ❌ | **CRASH al iniciar** | ✅ | Mínimo 32 caracteres. Usado también como fallback de ENCRYPTION_KEY |
| `ENCRYPTION_KEY` | `env.ts:312` | Backend | ⚠️ | `JWT_SECRET` (fallback) | **CRASH si JWT_SECRET también falta** | ✅ | Mínimo 32 caracteres. Si no existe, usa JWT_SECRET |
| `CORS_ORIGIN` | `env.ts:237`, `app.ts:94` | Backend | ✅ | `http://localhost:5173` | **CORS bloquea requests del frontend** | ✅ | **Formato:** String separado por comas. El código hace `split(',')`, `trim()` y `filter()` de cada origen. Ejemplo: `https://www.ivanreseller.com,https://ivanreseller.com` |
| `API_URL` | `env.ts:231`, `swagger.ts:23` | Backend | ✅ | `http://localhost:3000` | URLs incorrectas en Swagger/docs | ✅ | **Solo Backend:** Usado en Swagger UI (`swagger.ts:23`) y scripts de testing. **NO se usa en frontend** (frontend usa `VITE_API_URL`). URL base del backend (ej: `https://api.ivanreseller.com`) |

### 3.2 Variables OPCIONALES (Backend - Infraestructura)

| Variable | Ubicación | Componente | Obligatoria | Valor por Defecto | Síntoma si Falta | Server-Only | Notas |
|----------|-----------|------------|-------------|-------------------|------------------|--------------|-------|
| `REDIS_URL` | `env.ts:233` | Backend | ⚠️ | `redis://localhost:6379` | Sin cache distribuido | ✅ | Busca: `REDIS_URL`, `REDISCLOUD_URL`, `REDIS_TLS_URL` |
| `JWT_EXPIRES_IN` | `env.ts:235` | Backend | ❌ | `7d` | Tokens expiran en 7 días | ✅ | Formato: `7d`, `1h`, etc. |
| `JWT_REFRESH_EXPIRES_IN` | `env.ts:236` | Backend | ❌ | `30d` | Refresh tokens expiran en 30 días | ✅ | Formato: `30d`, `1w`, etc. |
| `LOG_LEVEL` | `env.ts:238` | Backend | ❌ | `info` | Logs en nivel info | ✅ | `error`/`warn`/`info`/`debug` |
| `FRONTEND_URL` | `auth.routes.ts:48` | Backend | ❌ | `CORS_ORIGIN.split(',')[0]` | URLs incorrectas en emails | ✅ | Usado para construir URLs en emails/redirects |

### 3.3 Variables OPCIONALES (Backend - APIs Externas)

| Variable | Ubicación | Componente | Obligatoria | Valor por Defecto | Síntoma si Falta | Server-Only | Notas |
|----------|-----------|------------|-------------|-------------------|------------------|--------------|-------|
| `EBAY_APP_ID` | `env.ts:241` | Backend | ❌ | ❌ | eBay API no funciona (usa credenciales de BD) | ✅ | Solo si se usan credenciales globales |
| `EBAY_DEV_ID` | `env.ts:242` | Backend | ❌ | ❌ | eBay API no funciona (usa credenciales de BD) | ✅ | Solo si se usan credenciales globales |
| `EBAY_CERT_ID` | `env.ts:243` | Backend | ❌ | ❌ | eBay API no funciona (usa credenciales de BD) | ✅ | Solo si se usan credenciales globales |
| `MERCADOLIBRE_CLIENT_ID` | `env.ts:244` | Backend | ❌ | ❌ | MercadoLibre OAuth no funciona (usa credenciales de BD) | ✅ | Solo si se usan credenciales globales |
| `MERCADOLIBRE_CLIENT_SECRET` | `env.ts:245` | Backend | ❌ | ❌ | MercadoLibre OAuth no funciona (usa credenciales de BD) | ✅ | Solo si se usan credenciales globales |
| `PAYPAL_CLIENT_ID` | `env.ts:246` | Backend | ❌ | ❌ | PayPal no funciona (usa credenciales de BD) | ✅ | Solo si se usan credenciales globales |
| `PAYPAL_CLIENT_SECRET` | `env.ts:247` | Backend | ❌ | ❌ | PayPal no funciona (usa credenciales de BD) | ✅ | Solo si se usan credenciales globales |
| `PAYPAL_ENVIRONMENT` | `env.ts:248` | Backend | ❌ | `sandbox` | PayPal usa sandbox | ✅ | `sandbox`/`production` |
| `GROQ_API_KEY` | `env.ts:249` | Backend | ❌ | ❌ | IA no funciona (usa credenciales de BD) | ✅ | Solo si se usan credenciales globales |
| `SCRAPERAPI_KEY` | `env.ts:250` | Backend | ❌ | ❌ | Scraping fallback no funciona (usa credenciales de BD) | ✅ | Solo si se usan credenciales globales |

### 3.4 Variables OPCIONALES (Backend - Feature Flags)

| Variable | Ubicación | Componente | Obligatoria | Valor por Defecto | Síntoma si Falta | Server-Only | Notas |
|----------|-----------|------------|-------------|-------------------|------------------|--------------|-------|
| `API_HEALTHCHECK_ENABLED` | `env.ts:253` | Backend | ❌ | `false` | No se monitorean APIs | ✅ | `true`/`false` |
| `API_HEALTHCHECK_MODE` | `env.ts:254` | Backend | ❌ | `async` | Health checks asíncronos | ✅ | `sync`/`async` |
| `API_HEALTHCHECK_INTERVAL_MS` | `env.ts:255` | Backend | ❌ | `900000` (15 min) | Intervalo de 15 min | ✅ | Milisegundos |
| `SCRAPER_BRIDGE_URL` | `env.ts:258` | Backend | ❌ | ❌ | No se usa bridge Python | ✅ | URL del servicio bridge (opcional) |
| `SCRAPER_BRIDGE_ENABLED` | `env.ts:259` | Backend | ❌ | `true` | Bridge deshabilitado | ✅ | `true`/`false` |
| `SCRAPER_FALLBACK_TO_STEALTH` | `env.ts:260` | Backend | ❌ | `true` | No fallback a stealth | ✅ | `true`/`false` |
| `WEBHOOK_VERIFY_SIGNATURE` | `env.ts:263` | Backend | ❌ | `true` | Verificación deshabilitada | ✅ | `true`/`false` |
| `WEBHOOK_VERIFY_SIGNATURE_EBAY` | `env.ts:264` | Backend | ❌ | `true` | Verificación deshabilitada | ✅ | `true`/`false` |
| `WEBHOOK_VERIFY_SIGNATURE_MERCADOLIBRE` | `env.ts:265` | Backend | ❌ | `true` | Verificación deshabilitada | ✅ | `true`/`false` |
| `WEBHOOK_VERIFY_SIGNATURE_AMAZON` | `env.ts:266` | Backend | ❌ | `true` | Verificación deshabilitada | ✅ | `true`/`false` |
| `WEBHOOK_SECRET_EBAY` | `env.ts:267` | Backend | ❌ | ❌ | Webhooks eBay rechazados | ✅ | Secret para verificar webhooks |
| `WEBHOOK_SECRET_MERCADOLIBRE` | `env.ts:268` | Backend | ❌ | ❌ | Webhooks MercadoLibre rechazados | ✅ | Secret para verificar webhooks |
| `WEBHOOK_SECRET_AMAZON` | `env.ts:269` | Backend | ❌ | ❌ | Webhooks Amazon rechazados | ✅ | Secret para verificar webhooks |
| `WEBHOOK_ALLOW_INVALID_SIGNATURE` | `env.ts:270` | Backend | ❌ | `false` | Solo en dev | ✅ | `true`/`false` (solo desarrollo) |
| `AUTO_PURCHASE_ENABLED` | `env.ts:273` | Backend | ❌ | `false` | Auto-compra deshabilitada | ✅ | `true`/`false` |
| `AUTO_PURCHASE_MODE` | `env.ts:274` | Backend | ❌ | `sandbox` | Auto-compra en sandbox | ✅ | `sandbox`/`production` |
| `AUTO_PURCHASE_DRY_RUN` | `env.ts:275` | Backend | ❌ | `false` | Auto-compra real | ✅ | `true`/`false` |
| `AUTO_PURCHASE_DAILY_LIMIT` | `env.ts:276` | Backend | ❌ | `1000` | Límite diario $1000 | ✅ | Dólares |
| `AUTO_PURCHASE_MONTHLY_LIMIT` | `env.ts:277` | Backend | ❌ | `10000` | Límite mensual $10k | ✅ | Dólares |
| `AUTO_PURCHASE_MAX_PER_ORDER` | `env.ts:278` | Backend | ❌ | `500` | Máximo $500 por orden | ✅ | Dólares |
| `RATE_LIMIT_ENABLED` | `env.ts:281` | Backend | ❌ | `true` | Rate limiting deshabilitado | ✅ | `true`/`false` |
| `RATE_LIMIT_DEFAULT` | `env.ts:282` | Backend | ❌ | `200` | 200 requests/15min | ✅ | Requests por ventana |
| `RATE_LIMIT_ADMIN` | `env.ts:283` | Backend | ❌ | `1000` | 1000 requests/15min | ✅ | Requests por ventana |
| `RATE_LIMIT_LOGIN` | `env.ts:284` | Backend | ❌ | `5` | 5 intentos/15min | ✅ | Intentos por ventana |
| `RATE_LIMIT_WINDOW_MS` | `env.ts:285` | Backend | ❌ | `900000` (15 min) | Ventana de 15 min | ✅ | Milisegundos |
| `ALIEXPRESS_DATA_SOURCE` | `env.ts:288` | Backend | ❌ | `api` | Modo API-first | ✅ | `api`/`scrape` |
| `ALIEXPRESS_AUTH_MONITOR_ENABLED` | `env.ts:289` | Backend | ❌ | `false` | Monitor deshabilitado | ✅ | `true`/`false` |
| `ALLOW_BROWSER_AUTOMATION` | `env.ts:290` | Backend | ❌ | `false` | Scraping deshabilitado | ✅ | `true`/`false` |

### 3.5 Variables OPCIONALES (Backend - Servicios Adicionales)

| Variable | Ubicación | Componente | Obligatoria | Valor por Defecto | Síntoma si Falta | Server-Only | Notas |
|----------|-----------|------------|-------------|-------------------|------------------|--------------|-------|
| `EMAIL_ENABLED` | `notification.service.ts:237` | Backend | ❌ | `false` | Emails deshabilitados | ✅ | `true`/`false` |
| `SMTP_HOST` | `notification.service.ts:246` | Backend | ❌ | `smtp.gmail.com` | Emails no funcionan | ✅ | Host SMTP |
| `SMTP_PORT` | `notification.service.ts:247` | Backend | ❌ | `587` | Emails no funcionan | ✅ | Puerto SMTP |
| `SMTP_SECURE` | `notification.service.ts:248` | Backend | ❌ | `false` | Emails sin TLS | ✅ | `true`/`false` |
| `SMTP_USER` | `notification.service.ts:250` | Backend | ❌ | ❌ | Emails no funcionan | ✅ | Usuario SMTP |
| `SMTP_PASS` | `notification.service.ts:251` | Backend | ❌ | ❌ | Emails no funcionan | ✅ | Contraseña SMTP |
| `SMTP_FROM` | `notification.service.ts:303` | Backend | ❌ | `noreply@ivanreseller.com` | From incorrecto | ✅ | Email remitente |
| `EMAIL_HOST` | `api-availability.service.ts:1702` | Backend | ❌ | ❌ | Alias de SMTP_HOST | ✅ | Alias |
| `EMAIL_PORT` | `api-availability.service.ts:1703` | Backend | ❌ | ❌ | Alias de SMTP_PORT | ✅ | Alias |
| `EMAIL_USER` | `api-availability.service.ts:1704` | Backend | ❌ | ❌ | Alias de SMTP_USER | ✅ | Alias |
| `EMAIL_PASSWORD` | `api-availability.service.ts:1705` | Backend | ❌ | ❌ | Alias de SMTP_PASS | ✅ | Alias |
| `EMAIL_FROM` | `api-availability.service.ts:1706` | Backend | ❌ | ❌ | Alias de SMTP_FROM | ✅ | Alias |
| `EMAIL_FROM_NAME` | `api-availability.service.ts:1707` | Backend | ❌ | ❌ | Nombre del remitente | ✅ | Nombre |
| `EMAIL_SECURE` | `api-availability.service.ts:1708` | Backend | ❌ | ❌ | Alias de SMTP_SECURE | ✅ | Alias |
| `TWILIO_ACCOUNT_SID` | `api-availability.service.ts:1839` | Backend | ❌ | ❌ | SMS no funciona | ✅ | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | `api-availability.service.ts:1840` | Backend | ❌ | ❌ | SMS no funciona | ✅ | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | `api-availability.service.ts:1841` | Backend | ❌ | ❌ | SMS no funciona | ✅ | Número de teléfono |
| `TWILIO_WHATSAPP_NUMBER` | `api-availability.service.ts:1842` | Backend | ❌ | ❌ | WhatsApp no funciona | ✅ | Número WhatsApp |
| `SLACK_WEBHOOK_URL` | `api-availability.service.ts:1969` | Backend | ❌ | ❌ | Slack no funciona | ✅ | Webhook URL |
| `SLACK_BOT_TOKEN` | `api-availability.service.ts:1970` | Backend | ❌ | ❌ | Slack no funciona | ✅ | Bot Token |
| `SLACK_CHANNEL` | `api-availability.service.ts:1971` | Backend | ❌ | `#ivan-reseller` | Canal por defecto | ✅ | Canal Slack |
| `OPENAI_API_KEY` | `api-availability.service.ts:2095` | Backend | ❌ | ❌ | OpenAI no funciona | ✅ | API Key OpenAI |
| `OPENAI_ORGANIZATION` | `api-availability.service.ts:2096` | Backend | ❌ | ❌ | Org opcional | ✅ | Org ID |
| `OPENAI_MODEL` | `api-availability.service.ts:2097` | Backend | ❌ | ❌ | Modelo por defecto | ✅ | Modelo a usar |
| `FX_BASE_CURRENCY` | `fx.service.ts:16` | Backend | ❌ | `USD` | Base USD | ✅ | Moneda base |
| `FX_PROVIDER_ENABLED` | `fx.service.ts:19` | Backend | ❌ | `true` | FX habilitado | ✅ | `true`/`false` |
| `FX_PROVIDER_URL` | `fx.service.ts:20` | Backend | ❌ | `https://open.er-api.com/v6/latest/{base}` | URL del proveedor | ✅ | URL con placeholder |
| `FX_PROVIDER_SYMBOLS` | `fx.service.ts:21` | Backend | ❌ | ❌ | Todos los símbolos | ✅ | Símbolos separados por comas |
| `EXCHANGERATE_API_KEY` | `fx.service.ts:21` | Backend | ❌ | ❌ | Sin API key | ✅ | API Key para exchangerate-api |
| `FX_API_KEY` | `fx.service.ts:21` | Backend | ❌ | ❌ | Alias de EXCHANGERATE_API_KEY | ✅ | Alias |
| `FX_AUTO_REFRESH_ENABLED` | `fx.service.ts:36` | Backend | ❌ | `true` | Auto-refresh habilitado | ✅ | `true`/`false` |
| `FX_REFRESH_CRON` | `scheduled-tasks.service.ts:270` | Backend | ❌ | `0 1 * * *` | Refresh a la 1 AM | ✅ | Cron expression |
| `FX_SEED_RATES` | `fx.service.ts:50` | Backend | ❌ | ❌ | Sin rates iniciales | ✅ | JSON string |
| `WORKING_CAPITAL_BUFFER` | `auto-purchase-guardrails.service.ts:163` | Backend | ❌ | `0.20` | Buffer 20% | ✅ | Decimal (0.20 = 20%) |
| `MIN_OPPORTUNITY_MARGIN` | `opportunity-finder.service.ts:79` | Backend | ❌ | `0.10` | Margen mínimo 10% | ✅ | Decimal |
| `OPPORTUNITY_DUPLICATE_THRESHOLD` | `opportunity-finder.service.ts:80` | Backend | ❌ | `0.85` | Threshold 85% | ✅ | Decimal |
| `MIN_SEARCH_VOLUME` | `opportunity-finder.service.ts:82` | Backend | ❌ | `100` | Volumen mínimo 100 | ✅ | Número |
| `MIN_TREND_CONFIDENCE` | `opportunity-finder.service.ts:83` | Backend | ❌ | `30` | Confianza 30% | ✅ | Porcentaje |
| `MAX_TIME_TO_FIRST_SALE` | `opportunity-finder.service.ts:84` | Backend | ❌ | `60` | 60 días | ✅ | Días |
| `MAX_BREAK_EVEN_TIME` | `opportunity-finder.service.ts:85` | Backend | ❌ | `90` | 90 días | ✅ | Días |
| `MIN_CONVERSION_RATE` | `scheduled-tasks.service.ts:1109` | Backend | ❌ | `0.5` | Tasa 0.5% | ✅ | Decimal |
| `MAX_DAYS_WITHOUT_SALES` | `scheduled-tasks.service.ts:1126` | Backend | ❌ | `60` | 60 días | ✅ | Días |
| `ALIEXPRESS_REFRESH_INTERVAL_MS` | `ali-auth-monitor.service.ts:16` | Backend | ❌ | `1800000` (30 min) | Refresh cada 30 min | ✅ | Milisegundos |
| `ALIEXPRESS_COOKIE_WARNING_HOURS` | `ali-auth-monitor.service.ts:19` | Backend | ❌ | `48` | Warning a las 48h | ✅ | Horas |
| `ALIEXPRESS_COOKIE_CRITICAL_HOURS` | `ali-auth-monitor.service.ts:20` | Backend | ❌ | `6` | Crítico a las 6h | ✅ | Horas |
| `ALIEXPRESS_COOKIE_WARNING_COOLDOWN_HOURS` | `ali-auth-monitor.service.ts:21` | Backend | ❌ | `12` | Cooldown 12h | ✅ | Horas |
| `ALIEXPRESS_COOKIE_EXPIRED_COOLDOWN_HOURS` | `ali-auth-monitor.service.ts:22` | Backend | ❌ | `6` | Cooldown 6h | ✅ | Horas |
| `ALIEXPRESS_LOGIN_URL` | `ali-auth-monitor.service.ts:27` | Backend | ❌ | `https://www.aliexpress.com/` | URL de login | ✅ | URL |
| `PUPPETEER_EXECUTABLE_PATH` | `server.ts:301` | Backend | ❌ | ❌ | Auto-detecta Chromium | ✅ | Ruta a Chromium |
| `CHROMIUM_PATH` | `server.ts:301` | Backend | ❌ | ❌ | Alias de PUPPETEER_EXECUTABLE_PATH | ✅ | Alias |
| `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` | `server.ts:304` | Backend | ❌ | ❌ | Descarga Chromium | ✅ | `true`/`false` |
| `ENABLE_SWAGGER` | `app.ts:415` | Backend | ❌ | ❌ | Swagger deshabilitado en prod | ✅ | `true` para habilitar |
| `RAILWAY_GIT_COMMIT_SHA` | `version-header.middleware.ts:22` | Backend | ❌ | ❌ | Sin commit SHA | ✅ | Auto-set por Railway |
| `GIT_SHA` | `version-header.middleware.ts:23` | Backend | ❌ | ❌ | Sin commit SHA | ✅ | Fallback |
| `VERCEL_GIT_COMMIT_SHA` | `version-header.middleware.ts:24` | Backend | ❌ | ❌ | Sin commit SHA | ✅ | Auto-set por Vercel |
| `BUILD_TIME` | `version-header.middleware.ts:28` | Backend | ❌ | ❌ | Sin build time | ✅ | Timestamp |
| `RAILWAY_BUILD_TIME` | `version-header.middleware.ts:29` | Backend | ❌ | ❌ | Sin build time | ✅ | Auto-set por Railway |
| `SKIP_ENCRYPTION_KEY_VALIDATION` | `env.ts:350` | Backend | ❌ | ❌ | Validación habilitada | ✅ | Solo para tests |

### 3.6 Variables OBLIGATORIAS (Frontend)

| Variable | Ubicación | Componente | Obligatoria | Valor por Defecto | Síntoma si Falta | Client-Exposed | Notas |
|----------|-----------|------------|-------------|-------------------|------------------|---------------|-------|
| `VITE_API_URL` | `frontend/src/services/api.ts:4` | Frontend | ✅ | `http://localhost:3000` | **Requests van a localhost** | ✅ | **CRÍTICO:** Debe ser la URL del backend en producción. Usada en: `api.ts`, `APISettings.tsx:434`, `useNotifications.ts:51,153`, `SystemLogs.tsx:32` |

### 3.7 Variables Opcionales (Frontend)

| Variable | Ubicación | Componente | Obligatoria | Valor por Defecto | Síntoma si Falta | Client-Exposed | Notas |
|----------|-----------|------------|-------------|-------------------|------------------|---------------|-------|
| `VITE_LOG_LEVEL` | `frontend/src/utils/logger.ts:21` | Frontend | ❌ | `debug` (dev) / `warn` (prod) | Usa nivel por defecto | ✅ | Controla nivel de logging en frontend: `debug`, `info`, `warn`, `error`, `silent` |
| `VITE_GROQ_API_KEY` | `frontend/src/vite-env.d.ts:5` | Frontend | ❌ | ❌ | No se usa actualmente | ✅ | **NOTA:** Definida en tipos pero NO se usa en el código. Probablemente legacy o futuro uso. |

---

## 4. SEPARACIÓN: RAILWAY ENV VARS vs UI/BD

### 4.1 Variables que VAN en Railway (Env Vars Globales)

Estas variables son **configuración del sistema** y deben estar en Railway:

#### ✅ OBLIGATORIAS:
- `NODE_ENV=production`
- `PORT` (Railway lo asigna automáticamente)
- `DATABASE_URL` (debe venir del servicio PostgreSQL de Railway)
- `REDIS_URL` (debe venir del servicio Redis de Railway)
- `JWT_SECRET` (mínimo 32 caracteres, generar con: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `ENCRYPTION_KEY` (mínimo 32 caracteres, puede ser igual a JWT_SECRET)
- `CORS_ORIGIN` (separar múltiples URLs por comas: `https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app`)
- `API_URL` (URL base del backend: `https://ivan-reseller-web-production.up.railway.app`)
- `FRONTEND_URL` (opcional, URL del frontend para emails: `https://www.ivanreseller.com`)

#### ⚙️ OPCIONALES (Feature Flags):
- `ALIEXPRESS_DATA_SOURCE=api` o `scrape`
- `ALLOW_BROWSER_AUTOMATION=false` (o `true` si se permite scraping)
- `SCRAPER_BRIDGE_ENABLED=true`
- `AUTO_PURCHASE_ENABLED=false`
- `RATE_LIMIT_ENABLED=true`
- `API_HEALTHCHECK_ENABLED=false`
- `WEBHOOK_VERIFY_SIGNATURE=true`
- Y todas las demás feature flags listadas en la sección 3.4

#### 📧 OPCIONALES (Servicios):
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (si se usan emails)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (si se usan SMS)
- `SLACK_WEBHOOK_URL` (si se usan notificaciones Slack)
- `OPENAI_API_KEY` (si se usa OpenAI)
- `EXCHANGERATE_API_KEY` (si se usa API de exchange rates)

### 4.2 Variables que SE INGRESAN EN UI y SE GUARDAN EN BD (Cifradas)

Estas credenciales son **por usuario** y se ingresan desde la web, se cifran con AES-256-GCM usando `ENCRYPTION_KEY`, y se guardan en la tabla `ApiCredential`:

#### 🔐 eBay:
- `appId` (EBAY_APP_ID)
- `devId` (EBAY_DEV_ID)
- `certId` (EBAY_CERT_ID)
- `authToken` (EBAY_AUTH_TOKEN) - obtenido vía OAuth
- `redirectUri` (EBAY_REDIRECT_URI)

**Flujo:** Usuario ingresa credenciales en Settings → API Settings → eBay. Se guardan cifradas en BD.

#### 🔐 Amazon:
- `clientId` (AMAZON_CLIENT_ID)
- `clientSecret` (AMAZON_CLIENT_SECRET)
- `refreshToken` (AMAZON_REFRESH_TOKEN) - obtenido vía OAuth
- `awsAccessKeyId` (AWS_ACCESS_KEY_ID)
- `awsSecretAccessKey` (AWS_SECRET_ACCESS_KEY)
- `awsSessionToken` (AWS_SESSION_TOKEN) - opcional
- `region` (AMAZON_REGION)

**Flujo:** Usuario ingresa credenciales en Settings → API Settings → Amazon. Se guardan cifradas en BD.

#### 🔐 MercadoLibre:
- `clientId` (MERCADOLIBRE_CLIENT_ID)
- `clientSecret` (MERCADOLIBRE_CLIENT_SECRET)
- `redirectUri` (MERCADOLIBRE_REDIRECT_URI)

**Flujo:** Usuario ingresa credenciales en Settings → API Settings → MercadoLibre. OAuth se maneja automáticamente. Se guardan cifradas en BD.

#### 🔐 PayPal:
- `clientId` (PAYPAL_CLIENT_ID)
- `clientSecret` (PAYPAL_CLIENT_SECRET)
- `environment` (PAYPAL_ENVIRONMENT: `sandbox`/`production`)

**Flujo:** Usuario ingresa credenciales en Settings → API Settings → PayPal. Se guardan cifradas en BD.

#### 🔐 AliExpress - Auto-Purchase (Puppeteer):
- `email` (ALIEXPRESS_EMAIL)
- `password` (ALIEXPRESS_PASSWORD)
- `twoFactorEnabled` (ALIEXPRESS_2FA_ENABLED)
- `twoFactorSecret` (ALIEXPRESS_2FA_SECRET) - opcional, para TOTP

**Flujo:** Usuario ingresa credenciales de su cuenta de AliExpress en Settings → API Settings → AliExpress Auto-Purchase. Se guardan cifradas en BD. Se usan para automatización con Puppeteer.

#### 🔐 AliExpress - Affiliate API:
- `appKey` (ALIEXPRESS_AFFILIATE_APP_KEY)
- `appSecret` (ALIEXPRESS_AFFILIATE_APP_SECRET)
- `trackingId` (ALIEXPRESS_AFFILIATE_TRACKING_ID) - opcional
- `sandbox` (ALIEXPRESS_AFFILIATE_SANDBOX: `true`/`false`)

**Flujo:** Usuario ingresa credenciales de AliExpress Affiliate Portal en Settings → API Settings → AliExpress Affiliate API. Se guardan cifradas en BD. Se usan para la API oficial de AliExpress.

#### 🔐 AliExpress - Dropshipping API:
- `appKey` (ALIEXPRESS_DROPSHIPPING_APP_KEY)
- `appSecret` (ALIEXPRESS_DROPSHIPPING_APP_SECRET)
- `accessToken` (ALIEXPRESS_DROPSHIPPING_ACCESS_TOKEN) - obtenido vía OAuth
- `refreshToken` (ALIEXPRESS_DROPSHIPPING_REFRESH_TOKEN) - opcional
- `userId` (ALIEXPRESS_DROPSHIPPING_USER_ID) - opcional
- `sandbox` (ALIEXPRESS_DROPSHIPPING_SANDBOX: `true`/`false`)

**Flujo:** Usuario ingresa credenciales de AliExpress Dropshipping API en Settings → API Settings → AliExpress Dropshipping API. OAuth se maneja automáticamente. Se guardan cifradas en BD.

#### 🔐 Otros Servicios:
- **GROQ:** `apiKey` (GROQ_API_KEY)
- **ScraperAPI:** `apiKey` (SCRAPERAPI_KEY)
- **ZenRows:** `apiKey` (ZENROWS_API_KEY)
- **2Captcha:** `apiKey` (CAPTCHA_2CAPTCHA_KEY)
- **SerpAPI/Google Trends:** `apiKey` (SERP_API_KEY o GOOGLE_TRENDS_API_KEY)
- **Stripe:** `publicKey`, `secretKey`, `webhookSecret`, `sandbox`
- **Email (alternativo):** `host`, `port`, `user`, `password`, `from`
- **Twilio (alternativo):** `accountSid`, `authToken`, `phoneNumber`, `whatsappNumber`
- **Slack (alternativo):** `webhookUrl`, `botToken`, `channel`
- **OpenAI (alternativo):** `apiKey`, `organization`, `model`

**Flujo:** Todas estas credenciales se ingresan en Settings → API Settings y se guardan cifradas en BD.

### 4.3 Cómo Funciona el Cifrado

1. **Clave de Cifrado:** `ENCRYPTION_KEY` (o `JWT_SECRET` como fallback) se usa para generar una clave AES-256-GCM
2. **Algoritmo:** AES-256-GCM (autenticado, previene tampering)
3. **Almacenamiento:** Tabla `ApiCredential` en PostgreSQL:
   ```prisma
   model ApiCredential {
     id            Int       @id @default(autoincrement())
     userId        Int
     apiName       String    // "ebay", "amazon", "aliexpress-affiliate", etc.
     environment   String    // "sandbox" o "production"
     credentials   String    // JSON encriptado con AES-256-GCM (base64)
     isActive      Boolean   @default(true)
     updatedAt     DateTime  @updatedAt
   }
   ```
4. **Desencriptación:** Se desencripta automáticamente cuando se accede a las credenciales vía `CredentialsManager.getCredentials()`

---

## 5. CHECKLIST RAILWAY PRODUCCIÓN (BACKEND)

### 5.1 Variables OBLIGATORIAS (Mínimo para funcionar)

```env
# ✅ OBLIGATORIAS - Sin estas el sistema NO inicia
NODE_ENV=production
PORT=3000  # Railway lo asigna automáticamente, pero puedes fijarlo
DATABASE_URL=postgresql://user:pass@host:5432/db  # Debe venir del servicio PostgreSQL
JWT_SECRET=CHANGEME_GENERATE_32_CHAR_MINIMUM_SECRET  # Mínimo 32 caracteres (generar con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=CHANGEME_GENERATE_32_CHAR_MINIMUM_SECRET  # Mínimo 32 caracteres (puede ser igual a JWT_SECRET)
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app  # String separado por comas (sin espacios extra)
API_URL=https://ivan-reseller-web-production.up.railway.app  # Solo usado en backend (Swagger/docs)
```

### 5.2 Variables RECOMENDADAS

```env
# ⚙️ RECOMENDADAS - Mejoran la funcionalidad
REDIS_URL=redis://default:pass@host:6379  # Debe venir del servicio Redis
FRONTEND_URL=https://www.ivanreseller.com  # Para emails/redirects
LOG_LEVEL=info  # error, warn, info, debug
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
```

### 5.3 Variables OPCIONALES (Feature Flags)

```env
# 🎛️ FEATURE FLAGS - Configurar según necesidades
ALIEXPRESS_DATA_SOURCE=api  # api o scrape
ALLOW_BROWSER_AUTOMATION=false  # true si se permite scraping
SCRAPER_BRIDGE_ENABLED=true
AUTO_PURCHASE_ENABLED=false
RATE_LIMIT_ENABLED=true
API_HEALTHCHECK_ENABLED=false
WEBHOOK_VERIFY_SIGNATURE=true
```

### 5.4 Variables OPCIONALES (Servicios Externos)

```env
# 📧 EMAIL (Opcional)
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=CHANGEME
SMTP_PASS=CHANGEME
SMTP_FROM=noreply@ivanreseller.com

# 📱 SMS (Opcional)
TWILIO_ACCOUNT_SID=CHANGEME
TWILIO_AUTH_TOKEN=CHANGEME
TWILIO_PHONE_NUMBER=CHANGEME

# 🔔 SLACK (Opcional)
SLACK_WEBHOOK_URL=CHANGEME
SLACK_BOT_TOKEN=CHANGEME
SLACK_CHANNEL=#ivan-reseller

# 🤖 AI (Opcional)
OPENAI_API_KEY=CHANGEME
GROQ_API_KEY=CHANGEME

# 💱 EXCHANGE RATES (Opcional)
EXCHANGERATE_API_KEY=CHANGEME
```

### 5.5 Checklist de Verificación Railway (Backend)

- [ ] `NODE_ENV=production` configurado
- [ ] `DATABASE_URL` copiada desde servicio PostgreSQL (usar URL interna si está en Railway)
- [ ] `REDIS_URL` copiada desde servicio Redis (usar URL interna si está en Railway)
- [ ] `JWT_SECRET` generado (mínimo 32 caracteres)
- [ ] `ENCRYPTION_KEY` configurado (mínimo 32 caracteres, puede ser igual a JWT_SECRET)
- [ ] `CORS_ORIGIN` incluye TODAS las URLs del frontend (separadas por comas, sin espacios extra)
- [ ] `API_URL` apunta a la URL correcta del backend (solo usado en Swagger/docs)
- [ ] `FRONTEND_URL` configurado (opcional pero recomendado)
- [ ] Feature flags configurados según necesidades
- [ ] Servicios externos configurados si se usan (email, SMS, etc.)

---

## 5B. CHECKLIST FRONTEND BUILD ENV (VERCEL/RAILWAY)

### 5B.1 Variables OBLIGATORIAS (Frontend)

```env
# ✅ OBLIGATORIA - Sin esta el frontend hace requests a localhost
VITE_API_URL=https://ivan-reseller-web-production.up.railway.app  # URL del backend
```

### 5B.2 Variables OPCIONALES (Frontend)

```env
# ⚙️ OPCIONAL - Controla nivel de logging en frontend
VITE_LOG_LEVEL=warn  # debug, info, warn, error, silent (default: debug en dev, warn en prod)
```

### 5B.3 Variables Definidas pero NO Usadas (Frontend)

```env
# ⚠️ NOTA: Esta variable está definida en vite-env.d.ts pero NO se usa en el código
# Probablemente legacy o para uso futuro
VITE_GROQ_API_KEY=CHANGEME  # NO se usa actualmente
```

### 5B.4 Checklist de Verificación Frontend (Vercel/Railway)

- [ ] `VITE_API_URL` configurada y apunta a la URL correcta del backend
- [ ] `VITE_LOG_LEVEL` configurada (opcional, recomendado: `warn` en producción)
- [ ] Verificar que el build incluye la variable (en Vercel: Settings → Environment Variables → Production)
- [ ] Probar que las requests van a la URL correcta (verificar en Network tab del navegador)

---

## 6. ALIEXPRESS: VARIABLES Y FLUJO REAL

### 6.1 Resumen: AliExpress tiene 3 Modos de Operación

1. **AliExpress Affiliate API (Portals API)** - API oficial para extraer datos
2. **AliExpress Dropshipping API** - API oficial para compras automatizadas
3. **Scraping con Puppeteer** - Automatización de navegador (fallback)

### 6.2 Variables de Entorno Relacionadas con AliExpress

| Variable | Tipo | Dónde se Configura | Obligatoria | Notas |
|----------|------|-------------------|-------------|-------|
| `ALIEXPRESS_DATA_SOURCE` | Env Var (Railway) | Railway Dashboard | ❌ | `api` (prioriza API) o `scrape` (prioriza scraping) |
| `ALLOW_BROWSER_AUTOMATION` | Env Var (Railway) | Railway Dashboard | ❌ | `true` para permitir scraping, `false` para deshabilitar |
| `ALIEXPRESS_AUTH_MONITOR_ENABLED` | Env Var (Railway) | Railway Dashboard | ❌ | `true` para monitorear sesiones de AliExpress |
| `ALIEXPRESS_REFRESH_INTERVAL_MS` | Env Var (Railway) | Railway Dashboard | ❌ | Intervalo de refresh (default: 30 min) |
| `ALIEXPRESS_COOKIE_WARNING_HOURS` | Env Var (Railway) | Railway Dashboard | ❌ | Horas antes de warning (default: 48) |
| `ALIEXPRESS_COOKIE_CRITICAL_HOURS` | Env Var (Railway) | Railway Dashboard | ❌ | Horas antes de crítico (default: 6) |
| `ALIEXPRESS_LOGIN_URL` | Env Var (Railway) | Railway Dashboard | ❌ | URL de login (default: `https://www.aliexpress.com/`) |

### 6.3 Credenciales de AliExpress (Se Ingresan en UI/BD)

#### 🔐 AliExpress Auto-Purchase (Puppeteer):
**Dónde se configura:** Settings → API Settings → AliExpress Auto-Purchase

**Campos:**
- `email` (ALIEXPRESS_EMAIL) - Email/username de AliExpress
- `password` (ALIEXPRESS_PASSWORD) - Contraseña de AliExpress
- `twoFactorEnabled` (ALIEXPRESS_2FA_ENABLED) - `true`/`false`
- `twoFactorSecret` (ALIEXPRESS_2FA_SECRET) - Secret TOTP (opcional)

**Uso:** Se usan para automatización con Puppeteer cuando `ALLOW_BROWSER_AUTOMATION=true` y `ALIEXPRESS_DATA_SOURCE=scrape`.

**Almacenamiento:** Tabla `ApiCredential` con `apiName='aliexpress'`, cifradas con AES-256-GCM.

#### 🔐 AliExpress Affiliate API:
**Dónde se configura:** Settings → API Settings → AliExpress Affiliate API

**Campos:**
- `appKey` (ALIEXPRESS_AFFILIATE_APP_KEY) - App Key del Affiliate Portal
- `appSecret` (ALIEXPRESS_AFFILIATE_APP_SECRET) - App Secret del Affiliate Portal
- `trackingId` (ALIEXPRESS_AFFILIATE_TRACKING_ID) - Tracking ID (opcional)
- `sandbox` (ALIEXPRESS_AFFILIATE_SANDBOX) - `true`/`false`

**Uso:** Se usan para la API oficial de AliExpress (Portals API) para extraer datos de productos, precios, imágenes.

**Almacenamiento:** Tabla `ApiCredential` con `apiName='aliexpress-affiliate'`, cifradas con AES-256-GCM.

**Endpoint:** `https://gw.api.taobao.com/router/rest` (legacy) o `https://api-sg.aliexpress.com/sync` (nuevo)

#### 🔐 AliExpress Dropshipping API:
**Dónde se configura:** Settings → API Settings → AliExpress Dropshipping API

**Campos:**
- `appKey` (ALIEXPRESS_DROPSHIPPING_APP_KEY) - App Key del Dropshipping API
- `appSecret` (ALIEXPRESS_DROPSHIPPING_APP_SECRET) - App Secret del Dropshipping API
- `accessToken` (ALIEXPRESS_DROPSHIPPING_ACCESS_TOKEN) - Obtenido vía OAuth
- `refreshToken` (ALIEXPRESS_DROPSHIPPING_REFRESH_TOKEN) - Opcional
- `userId` (ALIEXPRESS_DROPSHIPPING_USER_ID) - Opcional
- `sandbox` (ALIEXPRESS_DROPSHIPPING_SANDBOX) - `true`/`false`

**Uso:** Se usan para la API oficial de AliExpress Dropshipping para compras automatizadas.

**Almacenamiento:** Tabla `ApiCredential` con `apiName='aliexpress-dropshipping'`, cifradas con AES-256-GCM.

### 6.4 Flujo de Prioridad (Cómo Decide el Sistema)

El sistema intenta usar las APIs en este orden:

1. **Si `ALIEXPRESS_DATA_SOURCE=api`:**
   - ✅ Intenta AliExpress Affiliate API (si hay credenciales en BD)
   - ❌ Si falla o no hay credenciales, **NO** usa scraping (requiere `ALLOW_BROWSER_AUTOMATION=true`)
   - ⚠️ Si `ALLOW_BROWSER_AUTOMATION=false`, muestra error: "API credentials required"

2. **Si `ALIEXPRESS_DATA_SOURCE=scrape`:**
   - ✅ Intenta AliExpress Affiliate API primero (si hay credenciales)
   - ✅ Si falla, usa scraping nativo (Puppeteer) con credenciales de Auto-Purchase
   - ⚠️ Si `ALLOW_BROWSER_AUTOMATION=false`, muestra error: "Browser automation disabled"

3. **Si no hay `ALIEXPRESS_DATA_SOURCE` (default: `api`):**
   - ✅ Intenta AliExpress Affiliate API primero
   - ❌ Si falla, **NO** usa scraping a menos que `ALLOW_BROWSER_AUTOMATION=true`

### 6.5 ALIEXPRESS: Fuente de Verdad

**✅ CONCLUSIÓN:**

- **Variables de Entorno (Railway):** Solo flags de configuración (`ALIEXPRESS_DATA_SOURCE`, `ALLOW_BROWSER_AUTOMATION`, `ALIEXPRESS_AUTH_MONITOR_ENABLED`, `ALIEXPRESS_REFRESH_INTERVAL_MS`, `ALIEXPRESS_COOKIE_WARNING_HOURS`, `ALIEXPRESS_COOKIE_CRITICAL_HOURS`, `ALIEXPRESS_COOKIE_WARNING_COOLDOWN_HOURS`, `ALIEXPRESS_COOKIE_EXPIRED_COOLDOWN_HOURS`, `ALIEXPRESS_LOGIN_URL`)
- **Credenciales (UI/BD):** TODAS las credenciales (Affiliate API, Dropshipping API, Auto-Purchase) se ingresan desde la web y se guardan cifradas en BD
- **NO hay credenciales de AliExpress en Railway env vars** (excepto si se usan credenciales globales, pero el diseño actual es por usuario)

---

## 7. LOGIN / 401 / "NETWORK ERROR": DIAGNÓSTICO

### 7.1 Flujo de Autenticación

1. **Frontend:** Usuario ingresa credenciales en `/login`
2. **Request:** `POST /api/auth/login` con `{ username, password }`
3. **Backend:** Valida credenciales, genera JWT, establece cookies httpOnly
4. **Response:** Devuelve token en body (fallback) + cookies (preferido)
5. **Frontend:** Guarda token en localStorage (fallback) o usa cookies
6. **Requests subsecuentes:** Envía cookies automáticamente (o Authorization header si no hay cookies)

### 7.2 Endpoint `/api/auth/me`

**Ruta:** `GET /api/auth/me`  
**Middleware:** `authenticate` (verifica JWT)  
**Respuesta 401:** Normal si no hay token válido

### 7.3 Confirmación: Formato de CORS_ORIGIN

**Código Real (backend/src/app.ts líneas 94-96):**
```typescript
const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);
```

**Formato Esperado:**
- **Tipo:** String único separado por comas
- **Ejemplo:** `https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app`
- **Procesamiento:** El código hace `split(',')`, luego `trim()` de cada origen, y filtra los vacíos
- **Nota:** No usar espacios alrededor de las comas (aunque el `trim()` los elimina, es mejor práctica no incluirlos)

### 7.4 Confirmación: Uso de API_URL

**Backend:**
- **Ubicación:** `backend/src/config/env.ts:231` (definición), `backend/src/config/swagger.ts:23` (uso)
- **Uso:** Solo en Swagger UI para mostrar la URL del servidor en la documentación
- **Scripts:** También usado en scripts de testing (`test-end-to-end-completo.js`, `monitor-production-errors.js`, etc.)

**Frontend:**
- **NO se usa `API_URL` en el frontend**
- **Frontend usa:** `VITE_API_URL` (definida en `frontend/src/services/api.ts:4`)

**Conclusión:** `API_URL` es solo para backend (Swagger/docs). Frontend debe usar `VITE_API_URL`.

### 7.5 Hipótesis Ordenadas por Probabilidad

#### 🔴 HIPÓTESIS 1: CORS_ORIGIN Incorrecto (MÁS PROBABLE)

**Síntoma:** Frontend muestra "Network Error" o CORS bloquea requests

**Causa:** `CORS_ORIGIN` en Railway no incluye la URL del frontend

**Formato Esperado (Código Real):**
```typescript
// backend/src/app.ts líneas 94-96
const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);
```
**Formato:** String único separado por comas. Ejemplo: `https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app`

**Cómo Confirmar:**
```bash
# Desde el frontend (consola del navegador):
fetch('https://ivan-reseller-web-production.up.railway.app/api/auth/me', {
  credentials: 'include'
})
.then(r => r.json())
.catch(e => console.error('CORS Error:', e))
```

**Solución:**
1. Ve a Railway Dashboard → `ivan-reseller-web` → Variables
2. Busca `CORS_ORIGIN`
3. Agrega la URL del frontend (separada por comas, sin espacios extra):
   ```
   https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app
   ```
4. Guarda y espera el redeploy

**Verificación:**
```bash
# Verificar que CORS permite el origin:
curl -H "Origin: https://www.ivanreseller.com" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://ivan-reseller-web-production.up.railway.app/api/auth/me \
     -v
```

#### 🟠 HIPÓTESIS 2: VITE_API_URL Incorrecto (MUY PROBABLE)

**Síntoma:** Frontend hace requests a `http://localhost:3000` en lugar del backend real

**Causa:** `VITE_API_URL` no está configurada en Vercel/Railway (frontend)

**Cómo Confirmar:**
```javascript
// En consola del navegador:
console.log('API URL:', import.meta.env.VITE_API_URL)
// Debe mostrar: https://ivan-reseller-web-production.up.railway.app
// Si muestra: http://localhost:3000 → PROBLEMA
```

**Solución:**
1. **Si frontend está en Vercel:**
   - Ve a Vercel Dashboard → Tu proyecto → Settings → Environment Variables
   - Agrega: `VITE_API_URL = https://ivan-reseller-web-production.up.railway.app`
   - Haz un nuevo deploy

2. **Si frontend está en Railway:**
   - Ve a Railway Dashboard → Servicio frontend → Variables
   - Agrega: `VITE_API_URL = https://ivan-reseller-web-production.up.railway.app`
   - Guarda y espera el redeploy

**Verificación:**
- Abre la consola del navegador (F12)
- Ve a Network tab
- Intenta hacer login
- Verifica que las requests vayan a la URL correcta del backend

#### 🟡 HIPÓTESIS 3: Cookies Cross-Domain No Funcionan (PROBABLE)

**Síntoma:** Login funciona pero `/api/auth/me` devuelve 401

**Causa:** Cookies httpOnly no se envían en requests cross-domain (backend en Railway, frontend en otro dominio)

**Cómo Confirmar:**
```javascript
// En consola del navegador después de login:
console.log('Cookies:', document.cookie)
// Si está vacío → cookies no se establecieron o no se envían
```

**Solución:**
El código ya maneja esto con fallback a Bearer token:
- Si cookies no funcionan, el frontend usa `Authorization: Bearer <token>` del localStorage
- Verificar que el interceptor de axios en `frontend/src/services/api.ts` esté funcionando

**Verificación:**
```bash
# Verificar que el backend establece cookies correctamente:
curl -X POST https://ivan-reseller-web-production.up.railway.app/api/auth/login \
     -H "Content-Type: application/json" \
     -H "Origin: https://www.ivanreseller.com" \
     -d '{"username":"admin","password":"admin123"}' \
     -v
# Buscar en headers: Set-Cookie: token=...
```

#### 🟢 HIPÓTESIS 4: Secure/SameSite en Producción (POSIBLE)

**Síntoma:** Cookies se establecen pero no se envían en requests subsecuentes

**Causa:** `sameSite: 'none'` requiere `secure: true` (HTTPS)

**Cómo Confirmar:**
```javascript
// En consola del navegador:
fetch('https://ivan-reseller-web-production.up.railway.app/api/auth/me', {
  credentials: 'include'
})
.then(r => {
  console.log('Response:', r.status)
  // Si es 401 → cookies no se enviaron
})
```

**Solución:**
El código ya maneja esto:
- `secure: true` si la petición es HTTPS
- `sameSite: 'none'` para cross-domain
- Verificar que el backend detecta HTTPS correctamente (`req.protocol` o `x-forwarded-proto`)

#### 🔵 HIPÓTESIS 5: Proxy/Rewrites Incorrectos (MENOS PROBABLE)

**Síntoma:** Requests van a la URL incorrecta

**Causa:** Configuración de proxy en Vite o rewrites en Vercel

**Cómo Confirmar:**
- Revisar `frontend/vite.config.ts` (solo afecta dev)
- Revisar `vercel.json` si existe (solo afecta Vercel)

**Solución:**
- En producción, no se usan proxies (el frontend hace requests directos a `VITE_API_URL`)
- Verificar que `VITE_API_URL` esté correctamente configurada

### 7.4 Comandos de Diagnóstico

#### Verificar CORS:
```bash
curl -H "Origin: https://www.ivanreseller.com" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://ivan-reseller-web-production.up.railway.app/api/auth/me \
     -v
```

**Respuesta esperada:**
```
< HTTP/1.1 204 No Content
< Access-Control-Allow-Origin: https://www.ivanreseller.com
< Access-Control-Allow-Credentials: true
< Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
```

#### Verificar Login:
```bash
curl -X POST https://ivan-reseller-web-production.up.railway.app/api/auth/login \
     -H "Content-Type: application/json" \
     -H "Origin: https://www.ivanreseller.com" \
     -d '{"username":"admin","password":"admin123"}' \
     -v \
     -c cookies.txt
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {...},
    "token": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

**Headers esperados:**
```
Set-Cookie: token=eyJ...; HttpOnly; Secure; SameSite=None; Path=/
Set-Cookie: refreshToken=eyJ...; HttpOnly; Secure; SameSite=None; Path=/
Access-Control-Allow-Origin: https://www.ivanreseller.com
Access-Control-Allow-Credentials: true
```

#### Verificar /api/auth/me con Token:
```bash
# Usar el token del login anterior:
curl -X GET https://ivan-reseller-web-production.up.railway.app/api/auth/me \
     -H "Authorization: Bearer eyJ..." \
     -H "Origin: https://www.ivanreseller.com" \
     -v
```

**Respuesta esperada:**
```json
{
  "success": true,
  "data": {
    "user": {...}
  }
}
```

#### Verificar /api/auth/me con Cookies:
```bash
# Usar las cookies del login anterior:
curl -X GET https://ivan-reseller-web-production.up.railway.app/api/auth/me \
     -b cookies.txt \
     -H "Origin: https://www.ivanreseller.com" \
     -v
```

**Respuesta esperada:** Misma que arriba

### 7.5 Checklist de Diagnóstico

- [ ] `CORS_ORIGIN` incluye la URL del frontend
- [ ] `VITE_API_URL` está configurada en el frontend (Vercel/Railway)
- [ ] Requests del frontend van a la URL correcta del backend (verificar en Network tab)
- [ ] Cookies se establecen después del login (verificar en Application → Cookies)
- [ ] Cookies se envían en requests subsecuentes (verificar en Network tab → Request Headers)
- [ ] Token se guarda en localStorage como fallback (verificar en Application → Local Storage)
- [ ] Authorization header se envía si no hay cookies (verificar en Network tab → Request Headers)

---

## 8. ACCIONES RECOMENDADAS (PASOS CONCRETOS, MÍNIMO RIESGO)

### 8.1 Acciones Inmediatas (Críticas)

1. **Verificar Variables Obligatorias en Railway:**
   - [ ] `NODE_ENV=production`
   - [ ] `DATABASE_URL` (copiada desde servicio PostgreSQL)
   - [ ] `REDIS_URL` (copiada desde servicio Redis, si se usa)
   - [ ] `JWT_SECRET` (mínimo 32 caracteres)
   - [ ] `ENCRYPTION_KEY` (mínimo 32 caracteres, puede ser igual a JWT_SECRET)
   - [ ] `CORS_ORIGIN` (incluir TODAS las URLs del frontend, separadas por comas)
   - [ ] `API_URL` (URL base del backend)

2. **Verificar Variables del Frontend:**
   - [ ] `VITE_API_URL` configurada en Vercel/Railway (frontend)

3. **Probar Login End-to-End:**
   - [ ] Abrir frontend en navegador
   - [ ] Abrir consola (F12)
   - [ ] Intentar login
   - [ ] Verificar que no hay errores de CORS
   - [ ] Verificar que las requests van a la URL correcta del backend
   - [ ] Verificar que el login es exitoso
   - [ ] Verificar que `/api/auth/me` funciona después del login

### 8.2 Acciones Recomendadas (Mejoras)

1. **Crear `.env.example` en la raíz del repo:**
   - Incluir todas las variables documentadas
   - Usar placeholders (`CHANGEME`, `YOUR_VALUE_HERE`)
   - Separar por secciones (obligatorias, opcionales, feature flags)

2. **Documentar Flujo de Credenciales:**
   - Actualizar README con explicación de cómo se guardan credenciales
   - Explicar diferencia entre env vars y credenciales en BD

3. **Mejorar Mensajes de Error:**
   - Si `CORS_ORIGIN` está mal configurado, mostrar mensaje claro en logs
   - Si `VITE_API_URL` no está configurada, mostrar warning en frontend

### 8.3 Acciones Opcionales (Futuro)

1. **Validación de Variables al Iniciar:**
   - Ya existe validación con Zod, pero se puede mejorar con mensajes más claros

2. **Health Check Endpoint Mejorado:**
   - Incluir verificación de variables críticas en `/health`
   - Incluir verificación de CORS en `/health`

3. **Documentación de Feature Flags:**
   - Crear documento explicando cada feature flag y cuándo usarla

---

## 9. ANEXOS

### 9.1 Comandos Útiles

#### Generar JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Generar ENCRYPTION_KEY:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Verificar Variables en Railway (CLI):
```bash
railway variables
```

#### Verificar Variables en Vercel (CLI):
```bash
vercel env ls
```

#### Probar CORS:
```bash
curl -H "Origin: https://www.ivanreseller.com" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     https://ivan-reseller-web-production.up.railway.app/api/auth/me \
     -v
```

#### Probar Login:
```bash
curl -X POST https://ivan-reseller-web-production.up.railway.app/api/auth/login \
     -H "Content-Type: application/json" \
     -H "Origin: https://www.ivanreseller.com" \
     -d '{"username":"admin","password":"admin123"}' \
     -v
```

### 9.2 Rutas de Archivos Relevantes

**Backend:**
- **Configuración de Env Vars:** `backend/src/config/env.ts` (líneas 228-291: schema Zod)
- **Validación de Encriptación:** `backend/src/server.ts:25-42` (validateEncryptionKey)
- **CORS:** `backend/src/app.ts:93-160` (configuración CORS con split de CORS_ORIGIN en línea 94)
- **Autenticación:** `backend/src/api/routes/auth.routes.ts` (login, /me, etc.)
- **Cifrado de Credenciales:** `backend/src/services/credentials-manager.service.ts` (AES-256-GCM)
- **Swagger (API_URL):** `backend/src/config/swagger.ts:23` (uso de API_URL)

**Frontend:**
- **Frontend API Client:** `frontend/src/services/api.ts:4` (VITE_API_URL)
- **Logger (VITE_LOG_LEVEL):** `frontend/src/utils/logger.ts:21`
- **Vite Config:** `frontend/vite.config.ts` (proxy en dev, build estático en prod)
- **Type Definitions:** `frontend/src/vite-env.d.ts:4-5` (VITE_API_URL, VITE_GROQ_API_KEY)
- **Uso de VITE_API_URL:** 
  - `frontend/src/services/api.ts:4` (axios baseURL)
  - `frontend/src/pages/APISettings.tsx:434` (socket.io)
  - `frontend/src/hooks/useNotifications.ts:51,153` (socket.io y fetch)
  - `frontend/src/pages/SystemLogs.tsx:32` (fetch)

### 9.3 Referencias a Documentación

- **Guía de Variables:** `GUIA_VARIABLES_ENTORNO.md`
- **Configuración Railway:** `CONFIGURACION_RAILWAY_COMPLETA.md`
- **Configuración AliExpress:** `GUIA_CREDENCIALES_ALIEXPRESS.md`
- **Runbook QA:** `docs/LIVE_QA_RAILWAY_RUNBOOK.md`

---

## 10. CONCLUSIÓN

Este sistema tiene una arquitectura bien estructurada con separación clara entre:
- **Variables de entorno globales (Railway):** Configuración del sistema, feature flags, servicios externos
- **Credenciales por usuario (UI/BD):** Todas las credenciales de APIs se ingresan desde la web y se guardan cifradas en BD

**Puntos críticos:**
1. ✅ `ENCRYPTION_KEY` es obligatoria (o `JWT_SECRET` como fallback, mínimo 32 caracteres)
2. ✅ `CORS_ORIGIN` debe incluir TODAS las URLs del frontend (formato: string separado por comas, código: `backend/src/app.ts:94-96`)
3. ✅ `VITE_API_URL` debe configurarse en el frontend (única variable obligatoria del frontend)
4. ✅ `API_URL` solo se usa en backend (Swagger/docs), NO en frontend
5. ✅ AliExpress tiene 3 modos, todos con credenciales en BD (no en env vars)
6. ✅ Frontend: `VITE_API_URL` (obligatoria), `VITE_LOG_LEVEL` (opcional), `VITE_GROQ_API_KEY` (definida pero no usada)

**Próximos pasos:**
1. Verificar todas las variables obligatorias en Railway
2. Verificar `VITE_API_URL` en el frontend
3. Probar login end-to-end
4. Crear/actualizar `.env.example`

---

**Fin del Reporte**


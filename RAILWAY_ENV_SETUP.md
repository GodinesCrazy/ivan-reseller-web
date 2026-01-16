# 🚂 GUÍA: Configuración de Variables de Entorno en Railway (Backend)

**Fecha:** 2025-01-11  
**Objetivo:** Configurar todas las variables de entorno necesarias para el backend en Railway  
**Fuente:** Basado en `ENV_AUDIT_REPORT.md` y análisis del código real

---

## 📋 ÍNDICE

1. [Variables Obligatorias](#1-variables-obligatorias)
2. [Variables Recomendadas](#2-variables-recomendadas)
3. [Feature Flags](#3-feature-flags)
4. [Servicios Externos (Opcionales)](#4-servicios-externos-opcionales)
5. [Configuración de CORS_ORIGIN](#5-configuración-de-cors_origin)
6. [Puerto (PORT) en Railway](#6-puerto-port-en-railway)
7. [Qué va en Railway vs UI/BD](#7-qué-va-en-railway-vs-uibd)
8. [Checklist de Verificación Post-Deploy](#8-checklist-de-verificación-post-deploy)

---

## 1. VARIABLES OBLIGATORIAS

**⚠️ CRÍTICO:** Sin estas variables, el sistema **NO inicia** o **CRASHEA** al arrancar.

### 1.1 NODE_ENV

**Propósito:** Define el entorno de ejecución (development/production/test)

**Valor:**
```env
NODE_ENV=production
```

**Dónde se usa:**
- `backend/src/config/env.ts:229` (validación Zod: `z.enum(['development', 'production', 'test'])`)
- `backend/src/server.ts:44` (validación de encriptación)
- `backend/src/app.ts:87` (security headers)
- Múltiples lugares para detectar si es producción

**Ejemplo seguro:**
```env
NODE_ENV=production
```

**Nota:** En Railway, siempre debe ser `production` para producción.

---

### 1.2 PORT

**Propósito:** Puerto donde el servidor escucha conexiones

**Valor:**
```env
PORT=3000
```

**Dónde se usa:**
- `backend/src/config/env.ts:230` (default: `'3000'`)
- `backend/src/server.ts:19` (`const PORT = parseInt(env.PORT, 10)`)
- `backend/src/server.ts:368` (`httpServer.listen(PORT, '0.0.0.0', ...)`)

**Ejemplo seguro:**
```env
PORT=3000
```

**⚠️ IMPORTANTE:** Ver sección [6. Puerto (PORT) en Railway](#6-puerto-port-en-railway) para recomendación sobre si setearlo o dejarlo a Railway.

---

### 1.3 DATABASE_URL

**Propósito:** URL de conexión a PostgreSQL (Prisma)

**Valor:**
```env
DATABASE_URL=postgresql://user:password@host:port/database
```

**Dónde se usa:**
- `backend/src/config/env.ts:232` (validación Zod)
- `backend/src/config/env.ts:7-148` (función `getDatabaseUrl()` busca múltiples nombres)
- `backend/src/config/database.ts` (Prisma Client)

**Ejemplo seguro (enmascarado):**
```env
DATABASE_URL=postgresql://postgres:abc...xyz@postgres.railway.internal:5432/railway
```

**Cómo obtenerla en Railway:**
1. Ve a Railway Dashboard → Tu proyecto
2. Click en el servicio **PostgreSQL**
3. Ve a la pestaña **"Variables"**
4. Busca `DATABASE_URL` (interna) o `DATABASE_PUBLIC_URL` (pública)
5. Click en el ícono del ojo 👁️ para VER el valor
6. Click en copiar 📋
7. Ve a **ivan-reseller-web** → **Variables**
8. Agrega o edita `DATABASE_URL`
9. Pega el valor completo

**⚠️ RECOMENDACIÓN:** Usa `DATABASE_URL` (interna) si ambos servicios están en Railway. La URL interna es más rápida y no consume ancho de banda externo.

**Búsqueda automática:** El código busca estos nombres en orden:
- `DATABASE_URL` (prioridad 1)
- `DATABASE_PUBLIC_URL` (prioridad 2)
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `DATABASE_PRISMA_URL`
- `PGDATABASE`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_URL_POOLING`

---

### 1.4 JWT_SECRET

**Propósito:** Clave secreta para firmar tokens JWT (autenticación)

**Valor:**
```env
JWT_SECRET=CHANGEME_GENERATE_32_CHAR_MINIMUM_SECRET
```

**Dónde se usa:**
- `backend/src/config/env.ts:234` (validación: mínimo 32 caracteres)
- `backend/src/services/auth.service.ts:178` (firma de tokens)
- `backend/src/middleware/auth.middleware.ts:153` (verificación de tokens)
- `backend/src/server.ts:27` (fallback para ENCRYPTION_KEY)

**Ejemplo seguro (enmascarado):**
```env
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

**Cómo generarlo:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**⚠️ CRÍTICO:** Mínimo 32 caracteres. Si no cumple, el sistema CRASHEA al iniciar.

---

### 1.5 ENCRYPTION_KEY

**Propósito:** Clave para cifrar credenciales almacenadas en BD (AES-256-GCM)

**Valor:**
```env
ENCRYPTION_KEY=CHANGEME_GENERATE_32_CHAR_MINIMUM_SECRET
```

**Dónde se usa:**
- `backend/src/config/env.ts:312` (validación, fallback a JWT_SECRET)
- `backend/src/server.ts:26` (validación al iniciar)
- `backend/src/services/credentials-manager.service.ts:68-81` (cifrado/descifrado)
- `backend/src/services/security.service.ts:148` (cifrado alternativo)

**Ejemplo seguro (enmascarado):**
```env
ENCRYPTION_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

**Cómo generarlo:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**⚠️ IMPORTANTE:**
- Mínimo 32 caracteres
- Si no existe, el sistema usa `JWT_SECRET` como fallback
- Puede ser igual a `JWT_SECRET` (recomendado para simplicidad)
- Si ambos faltan, el sistema CRASHEA al iniciar

---

### 1.6 CORS_ORIGIN

**Propósito:** Orígenes permitidos para CORS (Cross-Origin Resource Sharing)

**Valor:**
```env
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app
```

**Dónde se usa:**
- `backend/src/config/env.ts:237` (default: `'http://localhost:5173'`)
- `backend/src/app.ts:94-96` (parsing: `split(',').map(trim).filter()`)
- `backend/src/app.ts:112-160` (configuración CORS)

**Ejemplo seguro:**
```env
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app
```

**⚠️ CRÍTICO:** Ver sección [5. Configuración de CORS_ORIGIN](#5-configuración-de-cors_origin) para formato exacto y ejemplos.

---

### 1.7 API_URL

**Propósito:** URL base del backend (usado en Swagger/docs y scripts de testing)

**Valor:**
```env
API_URL=https://ivan-reseller-web-production.up.railway.app
```

**Dónde se usa:**
- `backend/src/config/env.ts:231` (default: `'http://localhost:3000'`)
- `backend/src/config/swagger.ts:23` (Swagger UI: `process.env.API_URL || 'http://localhost:3001'`)
- Scripts de testing (`test-end-to-end-completo.js`, `monitor-production-errors.js`, etc.)

**Ejemplo seguro:**
```env
API_URL=https://ivan-reseller-web-production.up.railway.app
```

**⚠️ NOTA:** Esta variable **NO se usa en el frontend**. El frontend usa `VITE_API_URL` (ver `FRONTEND_BUILD_ENV.md`).

---

## 2. VARIABLES RECOMENDADAS

Estas variables mejoran la funcionalidad pero no son estrictamente obligatorias.

### 2.1 REDIS_URL

**Propósito:** URL de conexión a Redis (cache distribuido)

**Valor:**
```env
REDIS_URL=redis://default:password@host:port
```

**Dónde se usa:**
- `backend/src/config/env.ts:233` (default: `'redis://localhost:6379'`)
- `backend/src/config/env.ts:163-214` (función `getRedisUrl()` busca múltiples nombres)
- `backend/src/config/redis.ts` (cliente Redis)

**Ejemplo seguro (enmascarado):**
```env
REDIS_URL=redis://default:abc...xyz@redis.railway.internal:6379
```

**Cómo obtenerla en Railway:**
1. Ve a Railway Dashboard → Tu proyecto
2. Click en el servicio **Redis**
3. Ve a la pestaña **"Variables"**
4. Busca `REDIS_URL`
5. Click en el ícono del ojo 👁️ para VER el valor
6. Click en copiar 📋
7. Ve a **ivan-reseller-web** → **Variables**
8. Agrega o edita `REDIS_URL`
9. Pega el valor completo

**Búsqueda automática:** El código busca estos nombres en orden:
- `REDIS_URL` (prioridad 1)
- `REDISCLOUD_URL`
- `REDIS_TLS_URL`

**⚠️ NOTA:** Si no se configura, el sistema funciona pero sin cache distribuido (usa localhost por defecto).

---

### 2.2 FRONTEND_URL

**Propósito:** URL del frontend (usado en emails, redirects, etc.)

**Valor:**
```env
FRONTEND_URL=https://www.ivanreseller.com
```

**Dónde se usa:**
- `backend/src/api/routes/auth.routes.ts:48` (fallback: `CORS_ORIGIN.split(',')[0]`)
- `backend/src/services/admin.service.ts:126` (URLs de acceso)
- `backend/src/api/routes/admin.routes.ts:336` (URLs de acceso)

**Ejemplo seguro:**
```env
FRONTEND_URL=https://www.ivanreseller.com
```

**⚠️ NOTA:** Si no se configura, el sistema usa el primer valor de `CORS_ORIGIN` como fallback.

---

### 2.3 JWT_EXPIRES_IN

**Propósito:** Tiempo de expiración del token JWT

**Valor:**
```env
JWT_EXPIRES_IN=7d
```

**Dónde se usa:**
- `backend/src/config/env.ts:235` (default: `'7d'`)
- `backend/src/services/auth.service.ts:178` (firma de tokens)

**Ejemplo seguro:**
```env
JWT_EXPIRES_IN=7d
```

**Formatos válidos:** `7d`, `1h`, `30m`, `1w`, etc.

---

### 2.4 JWT_REFRESH_EXPIRES_IN

**Propósito:** Tiempo de expiración del refresh token

**Valor:**
```env
JWT_REFRESH_EXPIRES_IN=30d
```

**Dónde se usa:**
- `backend/src/config/env.ts:236` (default: `'30d'`)
- `backend/src/services/auth.service.ts:159` (generación de refresh tokens)

**Ejemplo seguro:**
```env
JWT_REFRESH_EXPIRES_IN=30d
```

---

### 2.5 LOG_LEVEL

**Propósito:** Nivel de logging del backend

**Valor:**
```env
LOG_LEVEL=info
```

**Dónde se usa:**
- `backend/src/config/env.ts:238` (validación: `z.enum(['error', 'warn', 'info', 'debug'])`)
- `backend/src/config/logger.ts` (configuración del logger)

**Ejemplo seguro:**
```env
LOG_LEVEL=info
```

**Valores válidos:** `error`, `warn`, `info`, `debug`

---

## 3. FEATURE FLAGS

Estas variables controlan funcionalidades específicas del sistema.

### 3.1 ALIEXPRESS_DATA_SOURCE

**Propósito:** Modo de obtención de datos de AliExpress

**Valor:**
```env
ALIEXPRESS_DATA_SOURCE=api
```

**Dónde se usa:**
- `backend/src/config/env.ts:288` (default: `'api'`, transforma a `'api' | 'scrape'`)
- `backend/src/services/advanced-scraper.service.ts:1082` (decisión de usar API vs scraping)

**Valores válidos:**
- `api` - Prioriza API oficial de AliExpress (requiere credenciales en BD)
- `scrape` - Prioriza scraping nativo (requiere `ALLOW_BROWSER_AUTOMATION=true`)

**Ejemplo seguro:**
```env
ALIEXPRESS_DATA_SOURCE=api
```

---

### 3.2 ALLOW_BROWSER_AUTOMATION

**Propósito:** Permitir automatización de navegador (Puppeteer) para scraping

**Valor:**
```env
ALLOW_BROWSER_AUTOMATION=false
```

**Dónde se usa:**
- `backend/src/config/env.ts:290` (default: `false`, transforma a boolean)
- `backend/src/services/advanced-scraper.service.ts:1109` (verificación antes de scraping)

**Valores válidos:**
- `true` - Permite scraping con Puppeteer
- `false` - Deshabilita scraping (solo API)

**Ejemplo seguro:**
```env
ALLOW_BROWSER_AUTOMATION=false
```

**⚠️ NOTA:** Si `ALIEXPRESS_DATA_SOURCE=api` y no hay credenciales de API en BD, el sistema mostrará error si `ALLOW_BROWSER_AUTOMATION=false`.

---

### 3.3 SCRAPER_BRIDGE_ENABLED

**Propósito:** Habilitar bridge de scraping Python (servicio externo)

**Valor:**
```env
SCRAPER_BRIDGE_ENABLED=true
```

**Dónde se usa:**
- `backend/src/config/env.ts:259` (default: `true`, transforma a boolean)
- `backend/src/services/scraper-bridge.service.ts` (verificación de disponibilidad)

**Valores válidos:**
- `true` - Intenta usar bridge Python si está disponible
- `false` - No intenta usar bridge

**Ejemplo seguro:**
```env
SCRAPER_BRIDGE_ENABLED=true
```

---

### 3.4 AUTO_PURCHASE_ENABLED

**Propósito:** Habilitar auto-compra automatizada

**Valor:**
```env
AUTO_PURCHASE_ENABLED=false
```

**Dónde se usa:**
- `backend/src/config/env.ts:273` (default: `false`, transforma a boolean)
- `backend/src/services/auto-purchase-guardrails.service.ts` (verificación de límites)

**Valores válidos:**
- `true` - Habilita auto-compra (requiere configuración adicional)
- `false` - Deshabilita auto-compra

**Ejemplo seguro:**
```env
AUTO_PURCHASE_ENABLED=false
```

---

### 3.5 RATE_LIMIT_ENABLED

**Propósito:** Habilitar rate limiting (protección contra abuso)

**Valor:**
```env
RATE_LIMIT_ENABLED=true
```

**Dónde se usa:**
- `backend/src/config/env.ts:281` (default: `true`, transforma a boolean)
- `backend/src/middleware/rate-limit.middleware.ts` (aplicación de límites)

**Valores válidos:**
- `true` - Habilita rate limiting (recomendado)
- `false` - Deshabilita rate limiting

**Ejemplo seguro:**
```env
RATE_LIMIT_ENABLED=true
```

---

### 3.6 Otras Feature Flags

Para una lista completa de todas las feature flags, consulta `ENV_AUDIT_REPORT.md` sección 3.4.

---

## 4. SERVICIOS EXTERNOS (OPCIONALES)

Estas variables solo son necesarias si usas servicios externos específicos.

### 4.1 Email (SMTP)

**Variables:**
```env
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=CHANGEME
SMTP_PASS=CHANGEME
SMTP_FROM=noreply@ivanreseller.com
```

**Dónde se usan:**
- `backend/src/services/notification.service.ts:237-303` (configuración SMTP)
- `backend/src/services/api-availability.service.ts:1694-1708` (verificación de disponibilidad)

**Ejemplo seguro (enmascarado):**
```env
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=abc...xyz
SMTP_FROM=noreply@ivanreseller.com
```

---

### 4.2 SMS (Twilio)

**Variables:**
```env
TWILIO_ACCOUNT_SID=CHANGEME
TWILIO_AUTH_TOKEN=CHANGEME
TWILIO_PHONE_NUMBER=CHANGEME
```

**Dónde se usan:**
- `backend/src/services/api-availability.service.ts:1832-1842` (configuración Twilio)

---

### 4.3 Slack

**Variables:**
```env
SLACK_WEBHOOK_URL=CHANGEME
SLACK_BOT_TOKEN=CHANGEME
SLACK_CHANNEL=#ivan-reseller
```

**Dónde se usan:**
- `backend/src/services/api-availability.service.ts:1963-1971` (configuración Slack)

---

### 4.4 AI (OpenAI/GROQ)

**Variables:**
```env
OPENAI_API_KEY=CHANGEME
GROQ_API_KEY=CHANGEME
```

**Dónde se usan:**
- `backend/src/services/api-availability.service.ts:2090-2097` (configuración OpenAI)
- `backend/src/services/scraping.service.ts:64` (GROQ para generación de contenido)

**⚠️ NOTA:** Estas variables son opcionales. El sistema está diseñado para que las credenciales de APIs se ingresen desde la UI y se guarden cifradas en BD (ver sección 7).

---

## 5. CONFIGURACIÓN DE CORS_ORIGIN

### 5.1 Formato Esperado

**Código Real (backend/src/app.ts líneas 94-96):**
```typescript
const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);
```

**Formato:**
- **Tipo:** String único separado por comas
- **Sin espacios:** Aunque el código hace `trim()`, es mejor práctica no incluirlos
- **Sin trailing slashes:** No incluir `/` al final de las URLs

### 5.2 Ejemplos Correctos

**Un solo dominio:**
```env
CORS_ORIGIN=https://www.ivanreseller.com
```

**Múltiples dominios (sin espacios):**
```env
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app
```

**Con subdominios:**
```env
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com,https://app.ivanreseller.com,https://admin.ivanreseller.com
```

**Con Vercel preview:**
```env
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app,https://ivan-reseller-web-*.vercel.app
```

**⚠️ NOTA:** El código NO soporta wildcards como `*.vercel.app`. Debes listar cada dominio explícitamente.

### 5.3 Ejemplos Incorrectos

**❌ Con espacios:**
```env
CORS_ORIGIN=https://www.ivanreseller.com, https://ivanreseller.com
```

**❌ Con trailing slashes:**
```env
CORS_ORIGIN=https://www.ivanreseller.com/,https://ivanreseller.com/
```

**❌ Con wildcards (no soportado):**
```env
CORS_ORIGIN=https://*.ivanreseller.com
```

### 5.4 Cómo Configurarlo en Railway

1. Ve a Railway Dashboard → Tu proyecto → **ivan-reseller-web**
2. Click en **"Variables"**
3. Busca `CORS_ORIGIN` o crea una nueva
4. Pega el valor completo (sin espacios extra):
   ```
   https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app
   ```
5. Click **"Save"**
6. Railway se redesplegará automáticamente

---

## 6. PUERTO (PORT) EN RAILWAY

### 6.1 Recomendación

**✅ DEJAR QUE RAILWAY LO ASIGNE AUTOMÁTICAMENTE**

Railway asigna automáticamente el puerto a través de la variable `PORT` cuando el servicio inicia. No es necesario (ni recomendado) setearlo manualmente.

### 6.2 Cómo Funciona

**Código Real (backend/src/server.ts líneas 19 y 368):**
```typescript
const PORT = parseInt(env.PORT, 10);
// ...
httpServer.listen(PORT, '0.0.0.0', () => {
  // ...
});
```

**Railway:**
- Railway inyecta automáticamente `PORT` cuando el servicio inicia
- El valor es dinámico y puede cambiar entre deployments
- El código lee `env.PORT` (que viene de `process.env.PORT`)

### 6.3 Cuándo Setearlo Manualmente

**Solo si:**
- Necesitas un puerto específico por alguna razón
- Estás debuggeando problemas de conexión
- Railway no está asignando el puerto correctamente (raro)

**Ejemplo:**
```env
PORT=3000
```

**⚠️ NOTA:** Si seteas `PORT` manualmente, asegúrate de que no entre en conflicto con otros servicios en Railway.

---

## 7. QUÉ VA EN RAILWAY VS UI/BD

### 7.1 Variables de Entorno (Railway)

**Van en Railway:**
- Configuración del sistema (`NODE_ENV`, `PORT`, `LOG_LEVEL`)
- URLs de servicios (`DATABASE_URL`, `REDIS_URL`, `API_URL`, `FRONTEND_URL`)
- Secrets globales (`JWT_SECRET`, `ENCRYPTION_KEY`)
- CORS (`CORS_ORIGIN`)
- Feature flags (`ALIEXPRESS_DATA_SOURCE`, `ALLOW_BROWSER_AUTOMATION`, etc.)
- Servicios externos opcionales (`SMTP_*`, `TWILIO_*`, `SLACK_*`, etc.)

### 7.2 Credenciales de APIs (UI/BD)

**NO van en Railway. Se ingresan desde la UI y se guardan cifradas en BD:**

**Modelo de Base de Datos (ApiCredential):**
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

**Flujo:**
1. Usuario ingresa credenciales en **Settings → API Settings** (desde la web)
2. Backend cifra las credenciales con `ENCRYPTION_KEY` (AES-256-GCM)
3. Se guardan en la tabla `ApiCredential` (PostgreSQL)
4. Se desencriptan automáticamente cuando se acceden vía `CredentialsManager.getCredentials()`

**APIs que se configuran desde UI/BD:**
- eBay (appId, devId, certId, authToken)
- Amazon (clientId, clientSecret, refreshToken, awsAccessKeyId, etc.)
- MercadoLibre (clientId, clientSecret)
- PayPal (clientId, clientSecret)
- AliExpress Auto-Purchase (email, password, 2FA)
- AliExpress Affiliate API (appKey, appSecret, trackingId)
- AliExpress Dropshipping API (appKey, appSecret, accessToken)
- GROQ, ScraperAPI, ZenRows, 2Captcha, etc.

**Referencia:** Ver `ENV_AUDIT_REPORT.md` sección 4.2 para lista completa.

---

## 8. CHECKLIST DE VERIFICACIÓN POST-DEPLOY

### 8.1 Verificación Básica (curl)

**1. Health Check:**
```bash
curl https://ivan-reseller-web-production.up.railway.app/health
```

**Respuesta esperada:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-11T12:00:00.000Z",
  "environment": "production"
}
```

**2. Readiness Check:**
```bash
curl https://ivan-reseller-web-production.up.railway.app/ready
```

**Respuesta esperada:**
```json
{
  "status": "ready",
  "database": true,
  "redis": true
}
```

**3. CORS Check:**
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

**4. Login Test:**
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

### 8.2 Verificación en Consola del Navegador

**1. Abrir Frontend:**
- Abre `https://www.ivanreseller.com` (o tu URL de frontend)
- Abre consola del navegador (F12)

**2. Verificar CORS:**
```javascript
fetch('https://ivan-reseller-web-production.up.railway.app/api/auth/me', {
  credentials: 'include'
})
.then(r => {
  console.log('CORS OK:', r.status);
  return r.json();
})
.catch(e => console.error('CORS Error:', e));
```

**3. Verificar Variables (si tienes acceso a logs de Railway):**
- Ve a Railway Dashboard → **ivan-reseller-web** → **Deployments** → **Logs**
- Busca mensajes como:
  - `✅ Encryption key validated (length: XX characters)`
  - `✅ DATABASE_URL configurada desde variable alternativa`
  - `✅ REDIS_URL configurada desde variable alternativa`
  - `CORS: Checking origin` (debe mostrar tus dominios)

### 8.3 Checklist Completo

- [ ] `NODE_ENV=production` configurado
- [ ] `DATABASE_URL` copiada desde servicio PostgreSQL (usar URL interna si está en Railway)
- [ ] `REDIS_URL` copiada desde servicio Redis (usar URL interna si está en Railway)
- [ ] `JWT_SECRET` generado (mínimo 32 caracteres)
- [ ] `ENCRYPTION_KEY` configurado (mínimo 32 caracteres, puede ser igual a JWT_SECRET)
- [ ] `CORS_ORIGIN` incluye TODAS las URLs del frontend (separadas por comas, sin espacios extra)
- [ ] `API_URL` apunta a la URL correcta del backend
- [ ] `FRONTEND_URL` configurado (opcional pero recomendado)
- [ ] Feature flags configurados según necesidades
- [ ] Servicios externos configurados si se usan (email, SMS, etc.)
- [ ] Health check responde correctamente (`/health`)
- [ ] Readiness check responde correctamente (`/ready`)
- [ ] CORS permite requests del frontend
- [ ] Login funciona end-to-end

---

## 📚 REFERENCIAS

- **Reporte Completo:** `ENV_AUDIT_REPORT.md`
- **Configuración Frontend:** `FRONTEND_BUILD_ENV.md`
- **Guía AliExpress:** `GUIA_CREDENCIALES_ALIEXPRESS.md`
- **Runbook QA:** `docs/LIVE_QA_RAILWAY_RUNBOOK.md`

---

**Fin del Documento**


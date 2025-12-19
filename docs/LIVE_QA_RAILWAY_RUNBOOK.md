# Live QA Railway Runbook - Ivan Reseller Web
**Fecha:** 2025-12-18  
**Objetivo:** Diagnóstico y pruebas end-to-end en producción (Railway)  
**URL Backend:** https://ivan-reseller-web-production.up.railway.app  
**URL Frontend:** https://www.ivanreseller.com

---

## Tabla de Contenidos

1. [Mapa Real del Sistema](#1-mapa-real-del-sistema)
2. [Tabla de Endpoints Reales](#2-tabla-de-endpoints-reales)
3. [Variables de Entorno + Feature Flags](#3-variables-de-entorno--feature-flags)
4. [Checklist de Prueba Manual E2E](#4-checklist-de-prueba-manual-e2e)
5. [Diagnóstico del Timeout /health](#5-diagnóstico-del-timeout-health)
6. [Evidencia y Comandos Exactos](#6-evidencia-y-comandos-exactos)
7. [Resumen para el Usuario](#7-resumen-para-el-usuario)

---

## 1. Mapa Real del Sistema

### 1.1 Entry Points Backend

**Archivo principal:** `backend/src/server.ts`

**Flujo de arranque:**
1. Importa `app` desde `backend/src/app.ts`
2. Crea `httpServer = http.createServer(app)`
3. **CRÍTICO:** `httpServer.listen(PORT, '0.0.0.0', callback)` se ejecuta **ANTES** de inicializaciones pesadas
4. PORT se obtiene de `env.PORT` (Railway lo define automáticamente)
5. Bind a `0.0.0.0` permite conexiones externas

**Orden de inicialización (server.ts):**
```
1. validateEncryptionKey() - SÍNCRONO, puede hacer process.exit(1)
2. httpServer.listen() - INMEDIATO (línea 355)
3. Bootstrap en background (async):
   - runMigrations()
   - connectWithRetry() (DB)
   - redis.ping() (Redis)
   - ensureAdminUser()
   - Inicializaciones de servicios pesados
```

**Archivo de rutas:** `backend/src/app.ts`
- Express app se crea en línea 66
- Middlewares se configuran (líneas 75-191)
- **Health endpoints ANTES de rutas API** (líneas 205-316)
- Rutas API se registran después (líneas 319-371)

### 1.2 Frontend Configuration

**Archivo de configuración API:** `frontend/src/services/api.ts`
- `VITE_API_URL` (env var) o default `http://localhost:3000`
- Base URL se limpia de trailing slashes
- `withCredentials: true` para cookies httpOnly

**Vite config:** `frontend/vite.config.ts`
- Dev server proxy: `/api` ? `http://localhost:3000`
- Build: estático, sin proxy (usa `VITE_API_URL`)

**Estrategia de deploy:**
- **Frontend:** Servicio separado en Railway (root `/frontend`)
- **Backend:** Servicio principal (root `/backend`)
- Frontend NO se sirve desde backend (no hay `express.static` en app.ts)

### 1.3 Railway Configuration

**Root Directory:** `/backend` (según configuración Railway)

**Build Command:** `npm run build` (según nixpacks.toml)
- Ejecuta: `tsc --skipLibCheck && npx prisma generate`

**Start Command:** `sh ./start.sh` (según nixpacks.toml) o `npm run start:with-migrations` (según Procfile)
- `start:with-migrations`: `npx prisma migrate deploy && node dist/server.js`

**PORT:** Railway asigna automáticamente (variable `PORT`)

**Variables críticas en Railway:**
- `DATABASE_URL` - Debe venir del servicio PostgreSQL
- `JWT_SECRET` - >= 32 caracteres
- `ENCRYPTION_KEY` - >= 32 caracteres (o usa JWT_SECRET como fallback)
- `CORS_ORIGIN` - Origen del frontend (ej: `https://www.ivanreseller.com`)

---

## 2. Tabla de Endpoints Reales

### Endpoints de Health (CRÍTICOS)

| Método | Ruta | Archivo | Middleware | Qué hace | Dependencias | Riesgos |
|--------|------|---------|------------|-----------|--------------|---------|
| GET | `/health` | `app.ts:205` | Ninguno (antes de auth) | Liveness probe - proceso vivo | Ninguna (solo memory stats) | **BAJO** - import dinámico de memory-monitor |
| GET | `/ready` | `app.ts:236` | Ninguno (antes de auth) | Readiness probe - puede servir tráfico | DB (timeout 2s), Redis (timeout 1s, opcional) | **MEDIO** - puede colgarse si DB timeout no funciona |

### Endpoints de Autenticación

| Método | Ruta | Archivo | Middleware | Qué hace | Dependencias | Riesgos |
|--------|------|---------|------------|-----------|--------------|---------|
| POST | `/api/auth/register` | `auth.routes.ts:26` | Rate limit (login) | Registro público (deshabilitado) | DB (crear user) | **BAJO** |
| POST | `/api/auth/login` | `auth.routes.ts:38` | Rate limit (5 req/15min) | Login con username/password | DB (buscar user, bcrypt) | **BAJO** |
| GET | `/api/auth/me` | `auth.routes.ts:186` | `authenticate` | Obtener usuario actual | DB (buscar user) | **BAJO** |
| POST | `/api/auth/refresh` | `auth.routes.ts:234` | Ninguno | Refresh token | JWT verify | **BAJO** |
| POST | `/api/auth/logout` | `auth.routes.ts:366` | `authenticate` | Logout | Ninguna | **BAJO** |

### Endpoints de API Credentials

| Método | Ruta | Archivo | Middleware | Qué hace | Dependencias | Riesgos |
|--------|------|---------|-----------|-----------|--------------|---------|
| GET | `/api/credentials/status` | `api-credentials.routes.ts:102` | `authenticate` | Estado de todas las APIs | DB (credentials), Redis (cache) | **MEDIO** - puede llamar a servicios externos |
| GET | `/api/credentials/:apiName` | `api-credentials.routes.ts:395` | `authenticate` | Obtener credenciales de API | DB (credentials cifradas) | **BAJO** |
| POST | `/api/credentials` | `api-credentials.routes.ts:478` | `authenticate` | Guardar/actualizar credenciales | DB (guardar cifrado), validación | **BAJO** |
| POST | `/api/credentials/:apiName/test` | `api-credentials.routes.ts:1063` | `authenticate` | Probar conexión de API | APIs externas (eBay/Amazon/ML) | **ALTO** - puede colgarse si API externa no responde |

### Endpoints de Productos

| Método | Ruta | Archivo | Middleware | Qué hace | Dependencias | Riesgos |
|--------|------|---------|-----------|-----------|--------------|---------|
| GET | `/api/products` | `products.routes.ts` | `authenticate` | Listar productos | DB | **BAJO** |
| POST | `/api/products` | `products.routes.ts` | `authenticate` | Crear producto | DB, scraping (opcional) | **MEDIO** - scraping puede colgarse |
| GET | `/api/products/:id` | `products.routes.ts` | `authenticate` | Obtener producto | DB | **BAJO** |

### Endpoints de Oportunidades

| Método | Ruta | Archivo | Middleware | Qué hace | Dependencias | Riesgos |
|--------|------|---------|-----------|-----------|--------------|---------|
| GET | `/api/opportunities` | `opportunities.routes.ts` | `authenticate` | Buscar oportunidades | DB, scraping, APIs externas | **ALTO** - operación pesada |
| POST | `/api/opportunities/analyze` | `opportunities.routes.ts` | `authenticate` | Analizar oportunidad | AI (Groq), scraping | **ALTO** - puede colgarse |

### Endpoints de Marketplace

| Método | Ruta | Archivo | Middleware | Qué hace | Dependencias | Riesgos |
|--------|------|---------|-----------|-----------|--------------|---------|
| POST | `/api/marketplace/publish` | `marketplace.routes.ts` | `authenticate` | Publicar producto | APIs externas (eBay/Amazon/ML) | **ALTO** - puede colgarse |
| GET | `/api/marketplace/listings` | `marketplace.routes.ts` | `authenticate` | Listar publicaciones | DB, APIs externas | **MEDIO** |

### Endpoints de Webhooks

| Método | Ruta | Archivo | Middleware | Qué hace | Dependencias | Riesgos |
|--------|------|---------|-----------|-----------|--------------|---------|
| POST | `/api/webhooks/ebay` | `webhooks.routes.ts` | `webhookSignature` (HMAC) | Webhook eBay | DB (crear Sale), validación firma | **BAJO** |
| POST | `/api/webhooks/mercadolibre` | `webhooks.routes.ts` | `webhookSignature` (HMAC) | Webhook MercadoLibre | DB (crear Sale) | **BAJO** |
| POST | `/api/webhooks/amazon` | `webhooks.routes.ts` | `webhookSignature` (HMAC) | Webhook Amazon | DB (crear Sale) | **BAJO** |

### Endpoints de Sistema

| Método | Ruta | Archivo | Middleware | Qué hace | Dependencias | Riesgos |
|--------|------|---------|-----------|-----------|--------------|---------|
| GET | `/api/system/health/detailed` | `system.routes.ts:22` | `authenticate` | Health detallado | DB, scraper bridge | **MEDIO** - puede colgarse si scraper no responde |

### Side-Effects al Importar Módulos

**Servicios que inician timers/requests en constructor:**

1. **FXService** (`fx.service.ts:32-42`)
   - **Problema:** Llama `refreshRates()` en constructor (HTTP request)
   - **Fix aplicado:** Lazy initialization con Proxy, flag `FX_AUTO_REFRESH_ENABLED`
   - **Estado:** ? Corregido (no inicia en test)

2. **SecureCredentialManager** (`security.service.ts:89`)
   - **Problema:** Llama `startUsageTracking()` en constructor (setInterval)
   - **Fix aplicado:** Gateado por `USAGE_TRACKING_ENABLED`
   - **Estado:** ? Corregido (no inicia en test)

3. **AutomatedBusinessService** (`automated-business.service.ts:113`)
   - **Problema:** Llama `startAutomationEngine()` en constructor (setInterval x2)
   - **Fix aplicado:** Gateado por `AUTOMATION_ENGINE_ENABLED`
   - **Estado:** ? Corregido (no inicia en test)

**Instanciaciones en top-level:**
- `fxService` - ? Corregido (lazy Proxy)
- `secureCredentialManager` - ?? Verificar dónde se instancia
- `automatedBusinessSystem` - ?? Verificar dónde se instancia

---

## 3. Variables de Entorno + Feature Flags

### 3.1 Variables Críticas (Requeridas)

| Variable | Requerido | Default | En Test | En Prod | Impacto si falta | Dónde se usa |
|----------|-----------|---------|---------|---------|-------------------|--------------|
| `DATABASE_URL` | ? SÍ | - | Test DB o mock | Railway Postgres | **CRÍTICO** - server no arranca | `env.ts:232`, Prisma |
| `JWT_SECRET` | ? SÍ | - | `test-jwt-secret-key-32-chars-minimum-required` | >= 32 chars | **CRÍTICO** - auth no funciona | `env.ts:234`, auth middleware |
| `ENCRYPTION_KEY` | ? SÍ* | JWT_SECRET fallback | `test-encryption-key-32-chars-minimum-required` | >= 32 chars | **CRÍTICO** - credenciales no se cifran | `env.ts:307`, credentials-manager |
| `PORT` | ? SÍ | `3000` | `3000` | Railway asigna | Server no escucha | `env.ts:230`, server.ts:18 |
| `NODE_ENV` | ?? Recomendado | `development` | `test` | `production` | Comportamiento incorrecto | Todo el código |
| `CORS_ORIGIN` | ?? Recomendado | `http://localhost:5173` | `http://localhost:5173` | Frontend URL | CORS bloquea requests | `env.ts:237`, app.ts:94 |

*ENCRYPTION_KEY: Si no existe, usa JWT_SECRET como fallback (env.ts:314)

### 3.2 Variables Opcionales (con defaults)

| Variable | Default | En Test | En Prod | Impacto | Dónde se usa |
|----------|---------|---------|---------|---------|--------------|
| `REDIS_URL` | `redis://localhost:6379` | Mock/deshabilitado | Railway Redis | Cache distribuido deshabilitado | `env.ts:226`, redis config |
| `JWT_EXPIRES_IN` | `7d` | `7d` | `7d` | Tokens expiran más rápido/lento | `env.ts:235` |
| `LOG_LEVEL` | `info` | `info` | `info` | Más/menos logs | `env.ts:238`, logger |
| `API_URL` | `http://localhost:3000` | `http://localhost:3000` | Backend URL | Frontend no conecta | `env.ts:231` |

### 3.3 Feature Flags (Test vs Prod)

| Flag | Default Prod | Default Test | Impacto | Dónde se usa |
|------|--------------|-------------|---------|--------------|
| `FX_AUTO_REFRESH_ENABLED` | `true` | `false` | FX no refresca tasas automáticamente | `fx.service.ts:32` |
| `USAGE_TRACKING_ENABLED` | `true` | `false` | No trackea uso de credenciales | `security.service.ts:89` |
| `AUTOMATION_ENGINE_ENABLED` | `true` | `false` | Motor de automatización no inicia | `automated-business.service.ts:113` |
| `API_HEALTHCHECK_ENABLED` | `false` | `false` | Health checks de APIs externas deshabilitados | `api-health-monitor.service.ts` |
| `API_HEALTHCHECK_MODE` | `async` | `async` | Modo async previene SIGSEGV | `api-health-monitor.service.ts` |
| `SCRAPER_BRIDGE_ENABLED` | `true` | `false` | Scraper bridge no se usa | `scraper-bridge.service.ts` |
| `AUTO_PURCHASE_ENABLED` | `false` | `false` | Auto-compra deshabilitada | `auto-purchase-guardrails.service.ts` |
| `WEBHOOK_VERIFY_SIGNATURE` | `true` | `true` | Webhooks requieren firma válida | `webhook-signature.middleware.ts` |
| `RATE_LIMIT_ENABLED` | `true` | `true` | Rate limiting activo | `rate-limit.middleware.ts` |

### 3.4 Railway Recommended Environment Variables

**CRÍTICAS (obligatorias):**
```
DATABASE_URL=<valor desde PostgreSQL service>
JWT_SECRET=<string >= 32 caracteres>
ENCRYPTION_KEY=<string >= 32 caracteres, o dejar vacío para usar JWT_SECRET>
NODE_ENV=production
PORT=<Railway asigna automáticamente>
```

**IMPORTANTES:**
```
CORS_ORIGIN=https://www.ivanreseller.com
LOG_LEVEL=info
```

**OPCIONALES (con defaults seguros):**
```
REDIS_URL=<valor desde Redis service, o dejar vacío>
API_HEALTHCHECK_ENABLED=false
API_HEALTHCHECK_MODE=async
SCRAPER_BRIDGE_URL=<si aplica>
SCRAPER_BRIDGE_ENABLED=true
AUTO_PURCHASE_ENABLED=false
WEBHOOK_VERIFY_SIGNATURE=true
RATE_LIMIT_ENABLED=true
```

**NOTA:** NO incluir valores aquí. Configurar en Railway Dashboard ? Variables.

---

## 4. Checklist de Prueba Manual E2E

### A) Backend Reachability

**Objetivo:** Verificar que backend responde HTTP

**Comandos Windows (PowerShell):**
```powershell
$base = "https://ivan-reseller-web-production.up.railway.app"

# Health check
try {
    $r = Invoke-WebRequest -Uri "$base/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "Status: $($r.StatusCode)"
    Write-Host "Content: $($r.Content)"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}

# Ready check
try {
    $r = Invoke-WebRequest -Uri "$base/ready" -UseBasicParsing -TimeoutSec 5
    Write-Host "Status: $($r.StatusCode)"
    Write-Host "Content: $($r.Content)"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
```

**Alternativa con curl.exe:**
```powershell
curl.exe --max-time 5 https://ivan-reseller-web-production.up.railway.app/health
curl.exe --max-time 5 https://ivan-reseller-web-production.up.railway.app/ready
```

**Qué debería pasar:**
- `/health` ? 200 OK, JSON con `status: "healthy"`
- `/ready` ? 200 OK si DB conectada, 503 si no

**Qué medir:**
- Tiempo de respuesta (< 2s para /health, < 3s para /ready)
- Status code
- Contenido JSON

**Qué copiar:**
- Status code
- Tiempo de respuesta
- JSON response (sin secretos)

**Cómo reproducir fallos:**
- Si timeout: verificar Railway logs (Deployments ? View logs)
- Si 503 en /ready: verificar DATABASE_URL en Railway Variables

### B) Frontend Load + Console Errors

**URL:** https://www.ivanreseller.com/login

**Pasos:**
1. Abrir navegador (Chrome/Firefox)
2. Abrir DevTools (F12)
3. Ir a Console tab
4. Navegar a https://www.ivanreseller.com/login
5. Esperar carga completa

**Qué debería pasar:**
- Página carga sin errores fatales
- No hay errores 404 de assets
- No hay errores CORS
- Console muestra logs normales (no errors rojos)

**Qué medir:**
- Tiempo de carga inicial
- Errores en Console
- Errores en Network tab (4xx, 5xx)

**Qué copiar:**
- Screenshot de Console (solo errores, sin secretos)
- Network requests fallidos (status code + URL)

**Cómo reproducir fallos:**
- Si CORS error: verificar `CORS_ORIGIN` en Railway incluye `https://www.ivanreseller.com`
- Si 404 assets: verificar que frontend está desplegado correctamente

### C) Auth Register/Login + Validación JWT

**Paso C1: Intentar Register (debe fallar - deshabilitado)**
```powershell
$body = @{
    username = "testuser_$(Get-Random)"
    email = "test_$(Get-Random)@test.com"
    password = "Test123456!"
} | ConvertTo-Json

Invoke-WebRequest -Uri "https://ivan-reseller-web-production.up.railway.app/api/auth/register" `
    -Method POST `
    -Body $body `
    -ContentType "application/json" `
    -UseBasicParsing
```

**Qué debería pasar:**
- Status 403
- Message: "Public registration is disabled"

**Paso C2: Login con usuario admin (si existe)**
```powershell
$body = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

$r = Invoke-WebRequest -Uri "https://ivan-reseller-web-production.up.railway.app/api/auth/login" `
    -Method POST `
    -Body $body `
    -ContentType "application/json" `
    -UseBasicParsing `
    -SessionVariable session

# Extraer token de cookie o response
$token = $r.Content | ConvertFrom-Json | Select-Object -ExpandProperty token
```

**Qué debería pasar:**
- Status 200
- Response con `success: true`, `user`, `token`
- Cookie `token` establecida (httpOnly)

**Paso C3: Validar JWT con /api/auth/me**
```powershell
Invoke-WebRequest -Uri "https://ivan-reseller-web-production.up.railway.app/api/auth/me" `
    -Headers @{ "Authorization" = "Bearer $token" } `
    -UseBasicParsing `
    -WebSession $session
```

**Qué debería pasar:**
- Status 200
- Response con datos del usuario

**Qué medir:**
- Tiempo de login (< 1s)
- Token válido
- Cookie establecida

**Qué copiar:**
- Status codes
- Response times
- Errores (sin tokens completos)

### D) API Settings: Guardar Credenciales + Verificar Estado

**Paso D1: Obtener estado de APIs**
```powershell
$headers = @{
    "Authorization" = "Bearer $token"
}

$r = Invoke-WebRequest -Uri "https://ivan-reseller-web-production.up.railway.app/api/credentials/status" `
    -Headers $headers `
    -UseBasicParsing `
    -WebSession $session

$status = $r.Content | ConvertFrom-Json
$status.data.apis | Select-Object apiName, isConfigured, isAvailable, status
```

**Qué debería pasar:**
- Status 200
- Array de APIs con estados coherentes
- `isConfigured: false` si no hay credenciales (correcto)

**Paso D2: Guardar credenciales (sandbox si aplica)**
```powershell
$body = @{
    apiName = "groq"
    environment = "production"
    credentials = @{
        apiKey = "test-key-masked"
    }
    isActive = $true
} | ConvertTo-Json

Invoke-WebRequest -Uri "https://ivan-reseller-web-production.up.railway.app/api/credentials" `
    -Method POST `
    -Headers $headers `
    -Body $body `
    -ContentType "application/json" `
    -UseBasicParsing `
    -WebSession $session
```

**Qué debería pasar:**
- Status 200/201
- Credenciales guardadas cifradas en DB

**Qué medir:**
- Estado antes/después de guardar
- Coherencia de estados

**Qué copiar:**
- Lista de APIs y estados (sin valores de credenciales)
- Errores de validación (si aplica)

### E) Crear Producto (Modo Mock/Sandbox)

**Paso E1: Crear producto manual**
```powershell
$body = @{
    title = "Test Product"
    description = "Test description"
    sourceUrl = "https://www.aliexpress.com/item/test"
    sourcePrice = 10.50
    suggestedPrice = 25.00
    currency = "USD"
} | ConvertTo-Json

Invoke-WebRequest -Uri "https://ivan-reseller-web-production.up.railway.app/api/products" `
    -Method POST `
    -Headers $headers `
    -Body $body `
    -ContentType "application/json" `
    -UseBasicParsing `
    -WebSession $session
```

**Qué debería pasar:**
- Status 201
- Producto creado con estado `PENDING`

**Qué medir:**
- Tiempo de creación
- Estado del producto

### F) Oportunidades + Análisis

**Paso F1: Buscar oportunidades**
```powershell
$body = @{
    query = "laptop"
    maxResults = 5
} | ConvertTo-Json

Invoke-WebRequest -Uri "https://ivan-reseller-web-production.up.railway.app/api/opportunities" `
    -Method GET `
    -Headers $headers `
    -UseBasicParsing `
    -WebSession $session
```

**Qué debería pasar:**
- Status 200
- Array de oportunidades (puede estar vacío si no hay scraping configurado)

**Qué medir:**
- Tiempo de respuesta (puede ser lento si hace scraping real)
- Cantidad de resultados

### G) Publicación Marketplace (Sandbox si existe)

**Paso G1: Publicar producto (requiere credenciales)**
```powershell
$body = @{
    productId = <ID del producto creado>
    marketplace = "ebay"
    environment = "sandbox"
} | ConvertTo-Json

Invoke-WebRequest -Uri "https://ivan-reseller-web-production.up.railway.app/api/marketplace/publish" `
    -Method POST `
    -Headers $headers `
    -Body $body `
    -ContentType "application/json" `
    -UseBasicParsing `
    -WebSession $session
```

**Qué debería pasar:**
- Si hay credenciales: Status 201, listing creado
- Si NO hay credenciales: Status 400/401, error claro

**Qué medir:**
- Tiempo de publicación
- Estado del listing

### H) Simular Webhook Firmado

**Paso H1: Webhook sin firma (debe rechazar)**
```powershell
$body = @{
    orderId = "TEST-123"
    amount = 100.00
} | ConvertTo-Json

Invoke-WebRequest -Uri "https://ivan-reseller-web-production.up.railway.app/api/webhooks/ebay" `
    -Method POST `
    -Body $body `
    -ContentType "application/json" `
    -UseBasicParsing
```

**Qué debería pasar:**
- Status 401/403
- Message: "Invalid signature" o similar

**Paso H2: Webhook con firma válida (requiere WEBHOOK_SECRET_EBAY)**
```powershell
# Calcular HMAC SHA256
$secret = "<WEBHOOK_SECRET_EBAY>"
$payload = $body
$signature = [System.Convert]::ToBase64String(
    [System.Security.Cryptography.HMACSHA256]::new(
        [System.Text.Encoding]::UTF8.GetBytes($secret)
    ).ComputeHash([System.Text.Encoding]::UTF8.GetBytes($payload))
)

$headers = @{
    "X-Ebay-Signature" = $signature
}

Invoke-WebRequest -Uri "https://ivan-reseller-web-production.up.railway.app/api/webhooks/ebay" `
    -Method POST `
    -Headers $headers `
    -Body $body `
    -ContentType "application/json" `
    -UseBasicParsing
```

**Qué debería pasar:**
- Status 200/201
- Sale creado en DB
- Comisión calculada

**Qué medir:**
- Validación de firma funciona
- Sale creado correctamente

### I) Ventas + Comisiones

**Paso I1: Listar ventas**
```powershell
Invoke-WebRequest -Uri "https://ivan-reseller-web-production.up.railway.app/api/sales" `
    -Headers $headers `
    -UseBasicParsing `
    -WebSession $session
```

**Paso I2: Listar comisiones**
```powershell
Invoke-WebRequest -Uri "https://ivan-reseller-web-production.up.railway.app/api/commissions" `
    -Headers $headers `
    -UseBasicParsing `
    -WebSession $session
```

**Qué debería pasar:**
- Status 200
- Array de ventas/comisiones

### J) Socket.IO Reconexión

**Paso J1: Conectar WebSocket**
- Abrir frontend en navegador
- Abrir DevTools ? Network ? WS
- Verificar conexión Socket.IO establecida

**Paso J2: Simular desconexión**
- Cerrar pesta?a
- Reabrir
- Verificar reconexión automática

**Qué debería pasar:**
- Conexión establecida
- Reconexión automática después de desconexión

---

## 5. Diagnóstico del Timeout /health

### 5.1 Análisis del Endpoint /health

**Ubicación:** `backend/src/app.ts:205-222`

**Código actual:**
```typescript
app.get('/health', async (_req: Request, res: Response) => {
  const { getMemoryStatsFormatted, checkMemoryHealth } = await import('./utils/memory-monitor');
  const memoryStats = getMemoryStatsFormatted();
  const memoryHealth = checkMemoryHealth();
  
  res.status(200).json({...});
});
```

**Posibles bloqueos:**
1. **Import dinámico de memory-monitor** - Puede colgarse si el módulo tiene side-effects
2. **Orden de registro** - `/health` está ANTES de middlewares pesados (? correcto)
3. **No hay await bloqueante** - ? Correcto

### 5.2 Análisis del Orden de Inicialización

**server.ts - Orden real:**
```
1. validateEncryptionKey() - SÍNCRONO, puede exit(1)
2. httpServer.listen() - INMEDIATO (línea 355)
3. Bootstrap async (background):
   - runMigrations() - puede colgarse
   - connectWithRetry() - puede colgarse si DB no responde
   - redis.ping() - puede colgarse si Redis no responde
```

**Problema potencial:**
- Si `validateEncryptionKey()` hace `process.exit(1)`, el server nunca llega a `listen()`
- Si hay un `await` bloqueante ANTES de `listen()`, el server no escucha

### 5.3 Side-Effects al Importar app.ts

**Stack de imports:**
```
app.ts
  ? import routes (auth.routes, products.routes, etc.)
    ? routes import services
      ? services pueden instanciar singletons
        ? singletons pueden hacer HTTP/DB en constructor
```

**Servicios problemáticos (ya corregidos):**
- ? FXService - Lazy init
- ? SecureCredentialManager - Gateado por flag
- ? AutomatedBusinessService - Gateado por flag

**Verificar:**
- ?Hay otros servicios que se instancian en top-level?
- ?Hay imports que hacen DB/HTTP en top-level?

### 5.4 Plan de Aislamiento (Sin Romper Producción)

**Opción 1: Health Ultra-Rápido (Sin Dependencias)**
- Crear `/health` que solo retorne `{ status: "ok" }` sin imports pesados
- Mover health detallado a `/health/detailed` (requiere auth)

**Cambios necesarios:**
- `app.ts:205` - Simplificar `/health` a respuesta inmediata
- `app.ts` - Agregar `/health/detailed` con lógica actual

**Opción 2: Mover Inicializaciones Post-Listen**
- Ya implementado: bootstrap corre en background después de `listen()`
- Verificar que no hay `await` bloqueante antes de `listen()`

**Cambios necesarios:**
- Verificar `server.ts:350` - NO debe haber `await` antes de línea 355

**Opción 3: Instrumentación con Logs**
- Agregar logs con timestamps en cada milestone
- Leer logs en Railway para identificar dónde se cuelga

**Logs actuales:**
- `logMilestone()` ya existe en server.ts
- Verificar que se ejecutan correctamente

### 5.5 Cómo Leer Logs en Railway

**Pasos:**
1. Railway Dashboard ? Proyecto `ivan-reseller-web`
2. Service `ivan-reseller-web` ? Deployments
3. Click en deployment más reciente
4. Click en "View logs" o "Logs"
5. Buscar milestones:
   - `BEFORE_LISTEN`
   - `LISTEN_CALLBACK`
   - `Bootstrap: Running database migrations`
   - `Bootstrap: Connecting to database`

**Qué buscar:**
- Si `BEFORE_LISTEN` aparece pero no `LISTEN_CALLBACK` ? server no está escuchando
- Si `LISTEN_CALLBACK` aparece pero `/health` no responde ? problema de routing/middleware
- Si hay errores de DB/Redis antes de `LISTEN_CALLBACK` ? inicialización bloqueante

### 5.6 Comandos de Diagnóstico

**Desde local (si Railway CLI disponible):**
```bash
railway logs --service ivan-reseller-web
```

**Desde Railway Dashboard:**
- Deployments ? Latest ? View logs
- Filtrar por "error", "BEFORE_LISTEN", "LISTEN_CALLBACK"

**Test de conectividad:**
```powershell
Test-NetConnection -ComputerName ivan-reseller-web-production.up.railway.app -Port 443
nslookup ivan-reseller-web-production.up.railway.app
```

---

## 6. Evidencia y Comandos Exactos

### 6.1 Comandos PowerShell (Windows)

**Health Check:**
```powershell
$base = "https://ivan-reseller-web-production.up.railway.app"
Invoke-WebRequest -Uri "$base/health" -UseBasicParsing -TimeoutSec 5
```

**Ready Check:**
```powershell
Invoke-WebRequest -Uri "$base/ready" -UseBasicParsing -TimeoutSec 5
```

**Test de Conectividad:**
```powershell
Test-NetConnection -ComputerName ivan-reseller-web-production.up.railway.app -Port 443
```

**DNS Lookup:**
```powershell
nslookup ivan-reseller-web-production.up.railway.app
```

### 6.2 Comandos npm Scripts

**Backend:**
```bash
cd backend
npm ci                    # Instalar dependencias
npm run build             # Build TypeScript
npm run start:prod        # Iniciar servidor
npm test                  # Ejecutar tests
```

**Frontend:**
```bash
cd frontend
npm ci                    # Instalar dependencias
npm run build             # Build producción
npm run preview           # Preview build local
```

### 6.3 Ver Logs Railway

**Dashboard:**
1. https://railway.app ? Proyecto
2. Service `ivan-reseller-web` ? Deployments
3. Latest deployment ? "View logs"

**Filtrar por:**
- "error"
- "BEFORE_LISTEN"
- "LISTEN_CALLBACK"
- "Database"
- "Redis"

### 6.4 Ver Variables Railway

**Dashboard:**
1. Railway ? Proyecto ? Service `ivan-reseller-web`
2. Settings ? Variables
3. Verificar:
   - `DATABASE_URL` (debe empezar con `postgresql://`)
   - `JWT_SECRET` (>= 32 caracteres)
   - `ENCRYPTION_KEY` (>= 32 caracteres, o vacío para usar JWT_SECRET)
   - `CORS_ORIGIN` (debe incluir frontend URL)

---

## 7. Resumen para el Usuario

### 7.1 5 Datos que Debes Capturar en Vivo

1. **Network Tab (Browser DevTools)**
   - Requests a `/health` y `/ready`
   - Status codes
   - Tiempos de respuesta
   - Errores CORS

2. **Console (Browser DevTools)**
   - Errores JavaScript
   - Errores de conexión API
   - Warnings

3. **Railway Logs**
   - Últimos 300 líneas del deployment
   - Buscar: "BEFORE_LISTEN", "LISTEN_CALLBACK", errores
   - Timestamps de cada milestone

4. **Status Codes**
   - `/health` ? debe ser 200
   - `/ready` ? 200 (listo) o 503 (no listo)
   - `/api/auth/login` ? 200 (éxito) o 401 (fallo)

5. **Tiempos**
   - Tiempo hasta `LISTEN_CALLBACK` (debe ser < 5s)
   - Tiempo de respuesta `/health` (debe ser < 2s)
   - Tiempo de respuesta `/ready` (debe ser < 3s)

### 7.2 Checklist Rápido de Diagnóstico

**Si /health no responde:**
- [ ] Verificar Railway logs - ?llega a `LISTEN_CALLBACK`?
- [ ] Verificar que PORT está configurado
- [ ] Verificar que no hay `process.exit()` antes de listen
- [ ] Verificar DNS: `nslookup ivan-reseller-web-production.up.railway.app`
- [ ] Verificar puerto: `Test-NetConnection -Port 443`

**Si /ready retorna 503:**
- [ ] Verificar DATABASE_URL en Railway Variables
- [ ] Verificar que PostgreSQL service está activo
- [ ] Verificar logs de conexión DB
- [ ] Verificar que migraciones se ejecutaron

**Si frontend no carga:**
- [ ] Verificar que frontend está desplegado (servicio separado)
- [ ] Verificar CORS_ORIGIN incluye frontend URL
- [ ] Verificar Console para errores CORS
- [ ] Verificar Network tab para requests fallidos

### 7.3 Archivos Clave para Revisar

**Backend:**
- `backend/src/server.ts` - Entry point, orden de inicialización
- `backend/src/app.ts` - Rutas y middlewares
- `backend/src/config/env.ts` - Variables de entorno
- `backend/src/__tests__/setup.ts` - Configuración de tests

**Frontend:**
- `frontend/src/services/api.ts` - Configuración API base URL
- `frontend/vite.config.ts` - Build y proxy config

**Railway:**
- `backend/nixpacks.toml` - Build configuration
- `backend/Procfile` - Start command

---

## 8. Próximos Pasos de Diagnóstico

### 8.1 Si /health Timeout Persiste

1. **Verificar que server.ts no tiene await antes de listen:**
   - Buscar en `server.ts` líneas 1-354
   - NO debe haber `await` antes de línea 355

2. **Verificar que app.ts se carga sin bloquear:**
   - Agregar log al inicio de `app.ts`: `console.log('app.ts loaded')`
   - Verificar que aparece en logs antes de `BEFORE_LISTEN`

3. **Simplificar /health temporalmente:**
   - Cambiar a respuesta inmediata sin imports
   - Si funciona ? problema está en `memory-monitor` import
   - Si no funciona ? problema está en routing/middleware

4. **Verificar middlewares no bloquean:**
   - Comentar middlewares pesados temporalmente
   - Probar /health
   - Ir agregando middlewares uno por uno

### 8.2 Cambios Recomendados (Sin Implementar Aún)

**Cambio 1: Health Ultra-Rápido**
- Archivo: `backend/src/app.ts:205`
- Cambio: Remover import dinámico, respuesta inmediata
- Riesgo: Bajo (solo afecta endpoint de health)

**Cambio 2: Verificar No Hay Awaits Antes de Listen**
- Archivo: `backend/src/server.ts:328-354`
- Verificar: NO hay `await` antes de línea 355
- Riesgo: Bajo (solo verificación)

**Cambio 3: Instrumentación Adicional**
- Archivo: `backend/src/server.ts`
- Cambio: Agregar más `logMilestone()` calls
- Riesgo: Bajo (solo logging)

---

**Documento generado:** 2025-12-18  
**Última actualización:** Basado en análisis de código real del repo

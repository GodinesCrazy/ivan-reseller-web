# ?? Railway Backend Deployment - Guía Completa

**Versión:** 1.0.0  
**Última actualización:** 2025-01-23

---

## ?? Índice

1. [Contexto](#contexto)
2. [Tarea A: Crear Servicio Backend en Railway](#tarea-a-crear-servicio-backend-en-railway)
3. [Tarea B: Configurar Variables de Entorno](#tarea-b-configurar-variables-de-entorno)
4. [Tarea C: Obtener Dominio y Validar](#tarea-c-obtener-dominio-y-validar)
5. [Tarea D: Configurar Frontend](#tarea-d-configurar-frontend)
6. [Tarea E: Validar Login](#tarea-e-validar-login)
7. [Tarea F: Validar AliExpress API](#tarea-f-validar-aliexpress-api)
8. [Checklist Final](#checklist-final)

---

## ?? Contexto

**Situación Actual:**
- Repo: `https://github.com/GodinesCrazy/ivan-reseller-web.git` (monorepo)
- Frontend desplegado en Railway: `ivan-reseller-web`
- Backend NO desplegado ? Endpoints `/api/*` dan 502 Bad Gateway
- Redis y PostgreSQL ya existen en Railway

**Objetivo:**
- Desplegar backend como servicio separado en Railway
- Conectar frontend al backend
- Validar autenticación y endpoints

---

## ? Tarea A: Crear Servicio Backend en Railway

### Paso 1: Crear Nuevo Servicio

1. Ve a [Railway Dashboard](https://railway.app)
2. Selecciona tu proyecto (o crea uno nuevo)
3. Click en **"+ New"** ? **"GitHub Repo"**
4. Selecciona el repo: `GodinesCrazy/ivan-reseller-web`
5. Railway detectará el monorepo automáticamente

### Paso 2: Configurar Root Directory

1. En el servicio recién creado, ve a **"Settings"**
2. Busca **"Root Directory"**
3. Configura: `backend`
4. Guarda cambios

### Paso 3: Configurar Build y Start Commands

**Ubicación:** Settings ? Deploy

**Build Command:**
```bash
npm ci && npx prisma generate && npm run build
```

**Start Command:**
```bash
npm start
```

**Evidencia:**
- `backend/package.json:8` ? `"build": "tsc --skipLibCheck && npx prisma generate"`
- `backend/package.json:10` ? `"start": "node dist/server.js"`
- `railway.json:5-6` ? Ya configurado correctamente

### Paso 4: Verificar Configuración

Railway debería detectar automáticamente:
- **Framework:** Node.js
- **Build Command:** (el que configuraste arriba)
- **Start Command:** (el que configuraste arriba)

**Nota:** Railway también puede usar `nixpacks.toml` si existe (ya existe en `backend/nixpacks.toml`).

---

## ? Tarea B: Configurar Variables de Entorno

### Variables Críticas (Obligatorias)

Ve a Railway ? Tu servicio backend ? **"Variables"**

#### 1. `DATABASE_URL`
**Valor:** URL de PostgreSQL de Railway  
**Cómo obtener:**
1. Ve a tu servicio PostgreSQL en Railway
2. Click en **"Variables"**
3. Copia el valor de `DATABASE_URL`
4. Pégala en el backend service ? Variables

**Formato:** `postgresql://user:password@host:port/dbname`

---

#### 2. `JWT_SECRET`
**Valor:** String aleatorio de mínimo 32 caracteres  
**Generar:**
```bash
# En terminal local:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Ejemplo:** `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6`

**?? IMPORTANTE:** Guarda este valor de forma segura. Si lo cambias, todos los tokens existentes se invalidarán.

---

#### 3. `ENCRYPTION_KEY`
**Valor:** String aleatorio de mínimo 32 caracteres (puede ser diferente de JWT_SECRET)  
**Generar:**
```bash
# En terminal local:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Ejemplo:** `z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0f9e8d7c6b5a4`

---

#### 4. `NODE_ENV`
**Valor:** `production`

---

#### 5. `PORT`
**Valor:** Railway lo inyecta automáticamente  
**Acción:** NO configurar manualmente (Railway lo maneja)

---

### Variables de CORS y URLs

#### 6. `CORS_ORIGIN`
**Valor:** `https://ivanreseller.com`  
**Descripción:** Origen permitido para CORS

---

#### 7. `FRONTEND_URL`
**Valor:** `https://ivanreseller.com`  
**Descripción:** URL del frontend (para redirects, emails, etc.)

---

#### 8. `API_URL` (Opcional)
**Valor:** Se generará automáticamente después del deploy  
**Formato:** `https://<servicio-backend>.up.railway.app`  
**Descripción:** URL pública del backend (se usará para configurar frontend)

---

### Variables de Redis (Opcional)

#### 9. `REDIS_URL`
**Valor:** URL de Redis de Railway  
**Cómo obtener:**
1. Ve a tu servicio Redis en Railway
2. Click en **"Variables"**
3. Copia el valor de `REDIS_URL`
4. Pégala en el backend service ? Variables

**Si no está configurado:**
- El servidor arranca normalmente
- BullMQ workers se desactivan automáticamente
- Scheduled tasks se desactivan automáticamente
- Express sigue funcionando

---

### Variables de AliExpress (Si aplica)

#### 10. `ALIEXPRESS_DATA_SOURCE`
**Valor:** `api` (recomendado) o `scrape`  
**Default:** `api`

---

#### 11. `ALIEXPRESS_APP_KEY` (Opcional)
**Valor:** App Key de AliExpress Affiliate API  
**Nota:** También se puede configurar desde la UI en Settings ? API Settings

---

#### 12. `ALIEXPRESS_APP_SECRET` (Opcional)
**Valor:** App Secret de AliExpress Affiliate API  
**Nota:** También se puede configurar desde la UI en Settings ? API Settings

---

### Variables NO Recomendadas

**NO configurar:**
- ? `FORCE_ROUTING_OK` - Eliminar si existe
- ?? `SAFE_BOOT` - Solo `false` o eliminar (default es `false`)

---

### Resumen de Variables Backend

| Variable | Requerido | Ejemplo | Notas |
|----------|-----------|---------|-------|
| `DATABASE_URL` | ? SÍ | `postgresql://...` | De PostgreSQL service |
| `JWT_SECRET` | ? SÍ | `a1b2c3...` (32+ chars) | Generar aleatorio |
| `ENCRYPTION_KEY` | ? SÍ | `z9y8x7...` (32+ chars) | Generar aleatorio |
| `NODE_ENV` | ? SÍ | `production` | |
| `PORT` | ? SÍ | (Railway lo inyecta) | NO configurar |
| `CORS_ORIGIN` | ? SÍ | `https://ivanreseller.com` | |
| `FRONTEND_URL` | ? SÍ | `https://ivanreseller.com` | |
| `REDIS_URL` | ? NO | `redis://...` | Opcional (de Redis service) |
| `ALIEXPRESS_DATA_SOURCE` | ? NO | `api` | Default: `api` |
| `ALIEXPRESS_APP_KEY` | ? NO | (de AliExpress) | Opcional |
| `ALIEXPRESS_APP_SECRET` | ? NO | (de AliExpress) | Opcional |

---

## ? Tarea C: Obtener Dominio y Validar

### Paso 1: Obtener Dominio Railway del Backend

1. Ve a Railway ? Tu servicio backend
2. Click en **"Settings"** ? **"Networking"**
3. Click en **"Generate Domain"** (si no existe)
4. Copia el dominio generado (ej: `ivan-reseller-backend-production.up.railway.app`)

**Guardar este dominio:** Lo necesitarás para configurar el frontend.

---

### Paso 2: Probar Endpoint /health

**URL:** `https://<tu-dominio-backend>.up.railway.app/health`

**Comando:**
```bash
curl https://ivan-reseller-backend-production.up.railway.app/health
```

**Respuesta esperada (200 OK):**
```json
{
  "ok": true,
  "status": "healthy",
  "timestamp": "2025-01-23T...",
  "pid": 123,
  "uptime": 123.456
}
```

**Si retorna 502:**
- Espera 1-2 minutos (Railway está desplegando)
- Revisa logs en Railway ? Deployments ? Latest ? View Logs
- Busca errores de compilación o variables faltantes

---

### Paso 3: Probar Endpoint /api/auth/me (sin token)

**URL:** `https://<tu-dominio-backend>.up.railway.app/api/auth/me`

**Comando:**
```bash
curl https://ivan-reseller-backend-production.up.railway.app/api/auth/me
```

**Respuesta esperada (401 Unauthorized):**
```json
{
  "success": false,
  "error": "Authentication required"
}
```

**? Si retorna 401:** Backend funciona correctamente  
**? Si retorna 502:** Backend no está desplegado o no responde

---

## ? Tarea D: Configurar Frontend

### Opción 1: Usar Proxy de Vercel (Recomendado)

**Si el frontend está en Vercel:**

1. Ve a Vercel Dashboard ? Tu proyecto
2. Click en **"Settings"** ? **"Environment Variables"**
3. **NO configurar** `VITE_API_URL` (el frontend usa `/api` por defecto en producción)

4. Ve a **"Settings"** ? **"Rewrites"** (o edita `vercel.json`)
5. Asegúrate de que existe este rewrite:
```json
{
  "source": "/api/:path*",
  "destination": "https://<tu-dominio-backend>.up.railway.app/api/:path*"
}
```

**Evidencia:** `vercel.json` ya tiene esta configuración (línea ~15)

---

### Opción 2: Configurar VITE_API_URL (Si frontend está en Railway)

**Si el frontend está en Railway (no Vercel):**

1. Ve a Railway ? Servicio frontend (`ivan-reseller-web`)
2. Click en **"Variables"**
3. A?ade variable:
   - **Key:** `VITE_API_URL`
   - **Value:** `https://<tu-dominio-backend>.up.railway.app`
4. Redeploy el frontend

**Nota:** El frontend en `runtime.ts` usa `/api` en producción por defecto. Si necesitas usar URL absoluta, modifica `frontend/src/config/runtime.ts:23-39`.

---

### Redeploy Frontend

**Vercel:**
- Push a GitHub ? Vercel redeploy automáticamente

**Railway:**
- Railway ? Frontend service ? **"Deployments"** ? **"Redeploy"**

---

## ? Tarea E: Validar Login

### Paso 1: Probar Login en Frontend

1. Abre `https://ivanreseller.com/login`
2. Credenciales por defecto:
   - Usuario: `admin`
   - Contrase?a: `admin123`
3. Click en **"Iniciar Sesión"**

**? Si funciona:** Deberías ver el dashboard  
**? Si falla con 502:** Verificar que el proxy de Vercel esté configurado correctamente

---

### Paso 2: Obtener Token JWT

**Opción A: Desde localStorage (Chrome DevTools)**

1. Abre Chrome DevTools (F12)
2. Ve a **"Application"** ? **"Local Storage"** ? `https://ivanreseller.com`
3. Busca la key `token` o `authToken`
4. Copia el valor (es el JWT token)

**Opción B: Desde Cookies**

1. Abre Chrome DevTools (F12)
2. Ve a **"Application"** ? **"Cookies"** ? `https://ivanreseller.com`
3. Busca la cookie `token`
4. Copia el valor

**Opción C: Desde Network Tab**

1. Abre Chrome DevTools (F12)
2. Ve a **"Network"**
3. Haz login
4. Busca la request a `/api/auth/login`
5. En la respuesta, busca el campo `token`

---

### Paso 3: Probar /api/auth/me con Token

**Comando:**
```bash
curl -H "Authorization: Bearer <TU_TOKEN_JWT>" \
  https://ivan-reseller-backend-production.up.railway.app/api/auth/me
```

**Respuesta esperada (200 OK):**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@ivanreseller.com",
    "role": "ADMIN"
  }
}
```

---

## ? Tarea F: Validar AliExpress API

### Paso 1: Probar Endpoint Debug

**URL:** `https://<tu-dominio-backend>.up.railway.app/api/debug/aliexpress/test-search?query=test`

**Comando:**
```bash
curl -H "Authorization: Bearer <TU_TOKEN_JWT>" \
  "https://ivan-reseller-backend-production.up.railway.app/api/debug/aliexpress/test-search?query=test"
```

---

### Paso 2: Interpretar Respuesta

#### Caso A: `status: "ok"` (API funciona)

```json
{
  "status": "ok",
  "items": 5,
  "duration": "1234ms",
  "environment": "production",
  "firstProduct": {
    "title": "Wireless Earbuds...",
    "price": 12.99,
    "currency": "USD"
  }
}
```

**? Acción:** API de AliExpress funciona correctamente. No se necesita configuración adicional.

---

#### Caso B: `code: "NO_CREDENTIALS"` (Faltan credenciales)

```json
{
  "status": "error",
  "code": "NO_CREDENTIALS",
  "message": "AliExpress Affiliate API credentials not found"
}
```

**? Acción:** Configurar credenciales de AliExpress:

**Opción 1: Desde la UI (Recomendado)**
1. Login en `https://ivanreseller.com`
2. Ve a **Settings** ? **API Settings** ? **AliExpress Affiliate API**
3. Configura:
   - `appKey` - App Key de AliExpress
   - `appSecret` - App Secret de AliExpress
   - `trackingId` - Tracking ID (opcional, default: "ivanreseller")
4. Guarda

**Opción 2: Desde Variables de Entorno**
1. Railway ? Backend service ? Variables
2. A?ade:
   - `ALIEXPRESS_APP_KEY` = (tu app key)
   - `ALIEXPRESS_APP_SECRET` = (tu app secret)
3. Redeploy backend

**Opción 3: Flujo OAuth (Si aplica)**
1. Ve a `https://ivanreseller.com/settings/api-settings`
2. Busca **AliExpress Affiliate API**
3. Click en **"Authorize"** o **"Connect"**
4. Sigue el flujo OAuth de AliExpress

---

#### Caso C: `code: "AUTH_ERROR"` (Credenciales inválidas)

```json
{
  "status": "error",
  "code": "AUTH_ERROR",
  "message": "AliExpress API authentication error (401)"
}
```

**? Acción:**
1. Verificar que `ALIEXPRESS_APP_KEY` y `ALIEXPRESS_APP_SECRET` sean correctos
2. Verificar que las credenciales no hayan expirado
3. Re-autorizar en AliExpress Developer Portal si es necesario

---

#### Caso D: `code: "TIMEOUT"` o `code: "NETWORK_ERROR"`

**? Acción:**
- Verificar conectividad a `https://gw.api.taobao.com/router/rest`
- Revisar logs del backend en Railway
- El sistema hará fallback a scraping automáticamente

---

## ? Checklist Final

### Backend Deployment

- [ ] Servicio backend creado en Railway
- [ ] Root Directory configurado: `backend`
- [ ] Build Command: `npm ci && npx prisma generate && npm run build`
- [ ] Start Command: `npm start`
- [ ] Variables configuradas:
  - [ ] `DATABASE_URL` (de PostgreSQL)
  - [ ] `JWT_SECRET` (32+ chars)
  - [ ] `ENCRYPTION_KEY` (32+ chars)
  - [ ] `NODE_ENV=production`
  - [ ] `CORS_ORIGIN=https://ivanreseller.com`
  - [ ] `FRONTEND_URL=https://ivanreseller.com`
  - [ ] `REDIS_URL` (opcional, de Redis)
- [ ] Dominio Railway obtenido: `https://<servicio>.up.railway.app`
- [ ] `/health` responde 200 OK
- [ ] `/api/auth/me` responde 401 (sin token) o 200 (con token)

---

### Frontend Configuration

- [ ] Proxy de Vercel configurado (si frontend en Vercel):
  - [ ] Rewrite `/api/:path*` ? `https://<backend-domain>/api/:path*`
- [ ] O `VITE_API_URL` configurado (si frontend en Railway):
  - [ ] Variable `VITE_API_URL=https://<backend-domain>`
- [ ] Frontend redeployado

---

### Validación Funcional

- [ ] Login funciona en `https://ivanreseller.com/login`
- [ ] Token JWT obtenido (localStorage o cookies)
- [ ] `/api/auth/me` funciona con token
- [ ] `/api/debug/aliexpress/test-search` funciona con token
- [ ] Si `NO_CREDENTIALS`: Credenciales de AliExpress configuradas
- [ ] Si `status: "ok"`: API de AliExpress funciona

---

## ?? Troubleshooting

### Error: 502 Bad Gateway

**Causas posibles:**
1. Backend no está desplegado
2. Backend crasheó al iniciar
3. Variables de entorno faltantes (`JWT_SECRET`, `DATABASE_URL`)
4. Puerto incorrecto (Railway debe inyectar `PORT` automáticamente)

**Solución:**
1. Revisar logs en Railway ? Deployments ? Latest ? View Logs
2. Buscar errores de compilación o variables faltantes
3. Verificar que `PORT` no esté configurado manualmente (Railway lo inyecta)

---

### Error: CORS

**Causa:** `CORS_ORIGIN` no está configurado o es incorrecto

**Solución:**
1. Railway ? Backend ? Variables
2. Verificar `CORS_ORIGIN=https://ivanreseller.com`
3. Redeploy backend

---

### Error: Database connection failed

**Causa:** `DATABASE_URL` incorrecta o PostgreSQL no accesible

**Solución:**
1. Verificar que `DATABASE_URL` sea correcta (de PostgreSQL service)
2. Verificar que PostgreSQL esté corriendo en Railway
3. Verificar que el backend tenga acceso a PostgreSQL (mismo proyecto Railway)

---

### Error: JWT_SECRET too short

**Causa:** `JWT_SECRET` tiene menos de 32 caracteres

**Solución:**
1. Generar nuevo secret (32+ caracteres)
2. Railway ? Backend ? Variables ? Actualizar `JWT_SECRET`
3. **?? ADVERTENCIA:** Todos los tokens existentes se invalidarán
4. Redeploy backend

---

## ?? Archivos de Configuración

### Backend

- `backend/package.json` - Scripts de build y start
- `backend/nixpacks.toml` - Configuración de build para Railway
- `backend/Procfile` - Comando de start (Heroku/Railway)
- `railway.json` - Configuración de Railway (rootDirectory, buildCommand, startCommand)

### Frontend

- `frontend/src/config/runtime.ts` - Configuración de API URL
- `vercel.json` - Rewrites para proxy de API (si frontend en Vercel)

---

## ?? Resultado Esperado

Después de completar todas las tareas:

1. ? Backend desplegado en Railway: `https://<backend>.up.railway.app`
2. ? Frontend conectado al backend (proxy o `VITE_API_URL`)
3. ? Login funciona: `https://ivanreseller.com/login`
4. ? Autenticación funciona: `/api/auth/me` retorna usuario
5. ? Debug AliExpress funciona: `/api/debug/aliexpress/test-search`
6. ? API de AliExpress configurada (si aplica)

---

**Evidencia:** `backend/package.json`, `railway.json`, `backend/nixpacks.toml`, `frontend/src/config/runtime.ts`, `vercel.json`

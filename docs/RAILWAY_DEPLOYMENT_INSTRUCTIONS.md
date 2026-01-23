# ?? Railway Backend Deployment - Instrucciones Exactas

**Versión:** 1.0.0  
**Última actualización:** 2025-01-23

---

## ?? IMPORTANTE: Leer Antes de Empezar

Este documento contiene instrucciones **EXACTAS** paso a paso para desplegar el backend en Railway.

**Tiempo estimado:** 15-20 minutos

---

## ?? Paso 1: Crear Servicio Backend en Railway

### 1.1 Acceder a Railway

1. Abre [Railway Dashboard](https://railway.app)
2. Inicia sesión con tu cuenta
3. Selecciona el proyecto donde está tu frontend (o crea uno nuevo)

---

### 1.2 Crear Nuevo Servicio desde GitHub

1. Click en **"+ New"** (botón verde en la esquina superior derecha)
2. Selecciona **"GitHub Repo"**
3. Si es la primera vez, autoriza Railway a acceder a tu GitHub
4. Busca y selecciona: `GodinesCrazy/ivan-reseller-web`
5. Click en **"Deploy Now"**

**Railway detectará automáticamente que es un monorepo.**

---

### 1.3 Configurar Root Directory

1. En el servicio recién creado, click en **"Settings"** (icono de engranaje)
2. Scroll hasta **"Root Directory"**
3. En el campo, escribe: `backend`
4. Click en **"Save"** o presiona Enter

**Verificación:** Railway debería mostrar que el root directory es `backend`

---

### 1.4 Configurar Build Command

1. En Settings, scroll hasta **"Deploy"** o **"Build & Deploy"**
2. Busca **"Build Command"**
3. Si está vacío o tiene un valor diferente, escribe:
   ```
   npm ci && npx prisma generate && npm run build
   ```
4. Click en **"Save"**

**Evidencia:** `backend/package.json:8` ? `"build": "tsc --skipLibCheck && npx prisma generate"`

---

### 1.5 Configurar Start Command

1. En la misma sección, busca **"Start Command"**
2. Si está vacío o tiene un valor diferente, escribe:
   ```
   npm start
   ```
3. Click en **"Save"**

**Evidencia:** `backend/package.json:10` ? `"start": "node dist/server.js"`

---

### 1.6 Verificar Configuración

Railway debería mostrar:
- **Framework:** Node.js (detectado automáticamente)
- **Root Directory:** `backend`
- **Build Command:** `npm ci && npx prisma generate && npm run build`
- **Start Command:** `npm start`

**Si Railway usa `nixpacks.toml`:** No hay problema, ya está configurado en `backend/nixpacks.toml`

---

## ?? Paso 2: Configurar Variables de Entorno

### 2.1 Acceder a Variables

1. En el servicio backend, click en **"Variables"** (tab en la parte superior)
2. Verás una lista de variables (puede estar vacía inicialmente)

---

### 2.2 Obtener DATABASE_URL de PostgreSQL

1. En Railway Dashboard, busca tu servicio **PostgreSQL**
2. Click en el servicio PostgreSQL
3. Click en **"Variables"** (tab)
4. Busca la variable `DATABASE_URL`
5. Click en el **ojo ???** para ver el valor (o click en el valor para copiar)
6. **IMPORTANTE:** Copia TODO el valor (debe empezar con `postgresql://`)
7. Vuelve al servicio backend ? Variables
8. Click en **"+ New Variable"**
9. **Key:** `DATABASE_URL`
10. **Value:** Pega el valor copiado
11. Click en **"Add"**

**Formato esperado:** `postgresql://user:password@host:port/dbname`

---

### 2.3 Generar JWT_SECRET

**En tu terminal local:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Ejemplo de salida:**
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

**En Railway:**
1. Backend service ? Variables ? "+ New Variable"
2. **Key:** `JWT_SECRET`
3. **Value:** Pega el valor generado (debe tener 32+ caracteres)
4. Click en **"Add"**

**?? IMPORTANTE:** Guarda este valor de forma segura. Si lo cambias, todos los tokens existentes se invalidarán.

---

### 2.4 Generar ENCRYPTION_KEY

**En tu terminal local:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Genera un valor DIFERENTE al JWT_SECRET.**

**En Railway:**
1. Backend service ? Variables ? "+ New Variable"
2. **Key:** `ENCRYPTION_KEY`
3. **Value:** Pega el valor generado (debe tener 32+ caracteres)
4. Click en **"Add"**

---

### 2.5 Configurar NODE_ENV

1. Backend service ? Variables ? "+ New Variable"
2. **Key:** `NODE_ENV`
3. **Value:** `production`
4. Click en **"Add"**

---

### 2.6 Configurar CORS_ORIGIN

1. Backend service ? Variables ? "+ New Variable"
2. **Key:** `CORS_ORIGIN`
3. **Value:** `https://ivanreseller.com`
4. Click en **"Add"**

---

### 2.7 Configurar FRONTEND_URL

1. Backend service ? Variables ? "+ New Variable"
2. **Key:** `FRONTEND_URL`
3. **Value:** `https://ivanreseller.com`
4. Click en **"Add"**

---

### 2.8 Configurar REDIS_URL (Opcional)

**Si tienes Redis en Railway:**

1. Ve a tu servicio **Redis** en Railway
2. Click en **"Variables"**
3. Busca `REDIS_URL`
4. Copia el valor
5. Vuelve al backend ? Variables ? "+ New Variable"
6. **Key:** `REDIS_URL`
7. **Value:** Pega el valor copiado
8. Click en **"Add"**

**Si NO tienes Redis:**
- No configures esta variable
- El servidor arrancará sin Redis
- BullMQ workers se desactivarán automáticamente
- Express seguirá funcionando normalmente

---

### 2.9 Eliminar Variables Problemáticas

**Buscar y ELIMINAR (si existen):**

1. `FORCE_ROUTING_OK` ? Click en "Delete" o "Remove"
2. `SAFE_BOOT` ? Si existe y es `true`, cambiarlo a `false` o eliminarlo

---

### 2.10 Resumen de Variables Configuradas

Deberías tener estas variables:

- ? `DATABASE_URL` = `postgresql://...`
- ? `JWT_SECRET` = `a1b2c3...` (32+ chars)
- ? `ENCRYPTION_KEY` = `z9y8x7...` (32+ chars)
- ? `NODE_ENV` = `production`
- ? `CORS_ORIGIN` = `https://ivanreseller.com`
- ? `FRONTEND_URL` = `https://ivanreseller.com`
- ?? `REDIS_URL` = `redis://...` (opcional)
- ? `FORCE_ROUTING_OK` = (eliminada)
- ? `SAFE_BOOT` = `false` o (eliminada)

---

## ?? Paso 3: Obtener Dominio y Validar

### 3.1 Generar Dominio Railway

1. En el servicio backend, click en **"Settings"**
2. Scroll hasta **"Networking"** o **"Domains"**
3. Si no hay dominio, click en **"Generate Domain"**
4. Railway generará un dominio como: `ivan-reseller-backend-production-xxxx.up.railway.app`
5. **Copia este dominio completo** (lo necesitarás después)

**Ejemplo:** `https://ivan-reseller-backend-production-1234.up.railway.app`

---

### 3.2 Esperar Primer Deploy

1. Railway debería estar haciendo el primer deploy automáticamente
2. Ve a **"Deployments"** (tab)
3. Espera a que el deploy termine (puede tardar 2-5 minutos)
4. Verifica que el status sea **"SUCCESS"** (verde)

**Si falla:**
- Click en el deployment ? **"View Logs"**
- Busca errores de compilación o variables faltantes
- Corrige y Railway redeployará automáticamente

---

### 3.3 Probar Endpoint /health

**En tu terminal:**

```bash
curl https://<TU_DOMINIO_BACKEND>.up.railway.app/health
```

**Reemplaza `<TU_DOMINIO_BACKEND>` con el dominio que copiaste.**

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
- Espera 1-2 minutos más (Railway puede estar aún desplegando)
- Revisa logs en Railway ? Deployments ? Latest ? View Logs

---

### 3.4 Probar Endpoint /api/auth/me (sin token)

**En tu terminal:**

```bash
curl https://<TU_DOMINIO_BACKEND>.up.railway.app/api/auth/me
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

## ?? Paso 4: Actualizar Frontend (Vercel)

### 4.1 Editar vercel.json

**Si el frontend está en Vercel:**

1. En tu editor local, abre `vercel.json`
2. Busca la línea 10 (aproximadamente):
   ```json
   "destination": "https://ivan-reseller-web-production.up.railway.app/health"
   ```
3. Reemplaza `ivan-reseller-web-production.up.railway.app` con tu nuevo dominio backend
4. Busca la línea 14:
   ```json
   "destination": "https://ivan-reseller-web-production.up.railway.app/ready"
   ```
5. Reemplaza con tu nuevo dominio backend
6. Busca la línea 18:
   ```json
   "destination": "https://ivan-reseller-web-production.up.railway.app/api/:path*"
   ```
7. Reemplaza con tu nuevo dominio backend

**Ejemplo (después de cambios):**
```json
{
  "rewrites": [
    {
      "source": "/health",
      "destination": "https://ivan-reseller-backend-production-1234.up.railway.app/health"
    },
    {
      "source": "/ready",
      "destination": "https://ivan-reseller-backend-production-1234.up.railway.app/ready"
    },
    {
      "source": "/api/:path*",
      "destination": "https://ivan-reseller-backend-production-1234.up.railway.app/api/:path*"
    }
  ]
}
```

---

### 4.2 Commit y Push

```bash
git add vercel.json
git commit -m "fix: update Vercel proxy to point to new backend service"
git push origin main
```

**Vercel redeployará automáticamente** cuando detecte el push.

---

### 4.3 Si Frontend está en Railway (no Vercel)

1. Railway ? Frontend service (`ivan-reseller-web`)
2. Click en **"Variables"**
3. Click en **"+ New Variable"**
4. **Key:** `VITE_API_URL`
5. **Value:** `https://<TU_DOMINIO_BACKEND>.up.railway.app`
6. Click en **"Add"**
7. Ve a **"Deployments"** ? **"Redeploy"**

---

## ?? Paso 5: Validar Login

### 5.1 Probar Login en Frontend

1. Abre `https://ivanreseller.com/login`
2. Credenciales:
   - **Usuario:** `admin`
   - **Contrase?a:** `admin123`
3. Click en **"Iniciar Sesión"**

**? Si funciona:** Deberías ver el dashboard  
**? Si falla con 502:** Verificar que `vercel.json` esté actualizado y Vercel haya redeployado

---

### 5.2 Obtener Token JWT

**Opción A: Desde Chrome DevTools**

1. Abre Chrome DevTools (F12)
2. Ve a **"Application"** ? **"Local Storage"** ? `https://ivanreseller.com`
3. Busca la key `token` o `authToken`
4. Copia el valor (es el JWT token)

**Opción B: Desde Network Tab**

1. Abre Chrome DevTools (F12)
2. Ve a **"Network"**
3. Haz login
4. Busca la request a `/api/auth/login`
5. Click en la request ? **"Response"**
6. Busca el campo `token` en el JSON
7. Copia el valor

---

### 5.3 Probar /api/auth/me con Token

**En tu terminal:**

```bash
curl -H "Authorization: Bearer <TU_TOKEN_JWT>" \
  https://<TU_DOMINIO_BACKEND>.up.railway.app/api/auth/me
```

**Reemplaza:**
- `<TU_TOKEN_JWT>` con el token que copiaste
- `<TU_DOMINIO_BACKEND>` con tu dominio backend

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

## ?? Paso 6: Validar AliExpress API

### 6.1 Probar Endpoint Debug

**En tu terminal:**

```bash
curl -H "Authorization: Bearer <TU_TOKEN_JWT>" \
  "https://<TU_DOMINIO_BACKEND>.up.railway.app/api/debug/aliexpress/test-search?query=test"
```

**Reemplaza:**
- `<TU_TOKEN_JWT>` con tu token
- `<TU_DOMINIO_BACKEND>` con tu dominio backend

---

### 6.2 Interpretar Respuesta

#### Caso A: `status: "ok"` ?

```json
{
  "status": "ok",
  "items": 5,
  "duration": "1234ms",
  "firstProduct": {
    "title": "Wireless Earbuds...",
    "price": 12.99
  }
}
```

**? Acción:** API funciona correctamente. No se necesita configuración adicional.

---

#### Caso B: `code: "NO_CREDENTIALS"` ??

```json
{
  "status": "error",
  "code": "NO_CREDENTIALS",
  "message": "AliExpress Affiliate API credentials not found"
}
```

**? Acción:** Configurar credenciales:

1. Login en `https://ivanreseller.com`
2. Ve a **Settings** ? **API Settings** ? **AliExpress Affiliate API**
3. Configura:
   - `appKey` - App Key de AliExpress
   - `appSecret` - App Secret de AliExpress
   - `trackingId` - Tracking ID (opcional)
4. Guarda
5. Vuelve a probar el endpoint debug

---

#### Caso C: `code: "AUTH_ERROR"` ?

```json
{
  "status": "error",
  "code": "AUTH_ERROR",
  "message": "AliExpress API authentication error (401)"
}
```

**? Acción:**
1. Verificar que `appKey` y `appSecret` sean correctos
2. Verificar que las credenciales no hayan expirado
3. Re-autorizar en AliExpress Developer Portal

---

## ? Checklist Final de Validación

### Backend

- [ ] Servicio backend creado en Railway
- [ ] Root Directory: `backend`
- [ ] Build Command: `npm ci && npx prisma generate && npm run build`
- [ ] Start Command: `npm start`
- [ ] Variables configuradas (ver lista arriba)
- [ ] Dominio obtenido: `https://<backend>.up.railway.app`
- [ ] `/health` responde 200 OK
- [ ] `/api/auth/me` responde 401 (sin token) o 200 (con token)

---

### Frontend

- [ ] `vercel.json` actualizado con nuevo dominio backend (si en Vercel)
- [ ] O `VITE_API_URL` configurado (si en Railway)
- [ ] Frontend redeployado

---

### Funcionalidad

- [ ] Login funciona: `https://ivanreseller.com/login`
- [ ] Token JWT obtenido
- [ ] `/api/auth/me` funciona con token
- [ ] `/api/debug/aliexpress/test-search` funciona con token
- [ ] Credenciales de AliExpress configuradas (si aplica)

---

## ?? Resultado Esperado

Después de completar todos los pasos:

1. ? Backend desplegado: `https://<backend>.up.railway.app`
2. ? Frontend conectado al backend
3. ? Login funciona: `https://ivanreseller.com/login`
4. ? Autenticación funciona: `/api/auth/me` retorna usuario
5. ? Debug AliExpress funciona: `/api/debug/aliexpress/test-search`
6. ? API de AliExpress configurada (si aplica)

---

## ?? Soporte

Si encuentras problemas:

1. Revisa logs en Railway ? Deployments ? Latest ? View Logs
2. Verifica que todas las variables estén configuradas
3. Verifica que el dominio backend sea correcto en `vercel.json`
4. Consulta `docs/RAILWAY_DEPLOYMENT_BACKEND.md` para troubleshooting detallado

---

**Ver también:**
- `docs/RAILWAY_DEPLOYMENT_BACKEND.md` - Documentación completa
- `docs/RAILWAY_DEPLOYMENT_CHECKLIST.md` - Checklist ejecutivo
- `docs/RAILWAY_ENV_VARS.md` - Variables de entorno

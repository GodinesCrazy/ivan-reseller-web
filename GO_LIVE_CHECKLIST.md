# ✅ GO-LIVE CHECKLIST: Railway + Vercel

**Fecha:** 2025-01-11  
**Objetivo:** Dejar el sistema listo para producción con Railway (backend) + Vercel (frontend)  
**Fuente:** Basado en `ENV_AUDIT_REPORT.md`, `RAILWAY_ENV_SETUP.md`, `FRONTEND_BUILD_ENV.md`

---

## 📋 ÍNDICE

1. [Pre-requisitos](#1-pre-requisitos)
2. [Railway - Backend](#2-railway---backend)
3. [Vercel - Frontend](#3-vercel---frontend)
4. [Pruebas GO](#4-pruebas-go)
5. [Errores Típicos y Fixes](#5-errores-típicos-y-fixes)
6. [Checklist Final](#6-checklist-final)

---

## 1. PRE-REQUISITOS

Antes de empezar, asegúrate de tener:

- [ ] Cuenta en Railway (https://railway.app)
- [ ] Cuenta en Vercel (https://vercel.com)
- [ ] Repositorio conectado a Railway y Vercel
- [ ] Acceso a Railway Dashboard y Vercel Dashboard
- [ ] Servicios creados en Railway:
  - [ ] `ivan-reseller-web` (Backend)
  - [ ] `PostgreSQL` (Base de datos)
  - [ ] `Redis` (Cache, opcional pero recomendado)

---

## 2. RAILWAY - BACKEND

### 2.1 Variables Obligatorias

**⚠️ CRÍTICO:** Sin estas variables, el sistema **NO inicia**.

#### Paso 1: Obtener DATABASE_URL

1. Ve a Railway Dashboard → Tu proyecto
2. Click en el servicio **PostgreSQL**
3. Ve a la pestaña **"Variables"**
4. Busca `DATABASE_URL` (interna) o `DATABASE_PUBLIC_URL` (pública)
5. Click en el ícono del ojo 👁️ para VER el valor
6. Click en copiar 📋
7. Ve a **ivan-reseller-web** → **Variables**
8. Agrega o edita `DATABASE_URL`
9. Pega el valor completo

**Formato esperado:**
```
postgresql://postgres:abc...xyz@postgres.railway.internal:5432/railway
```

**✅ Verificar:** El valor debe empezar con `postgresql://` o `postgres://`

#### Paso 2: Obtener REDIS_URL (Opcional pero Recomendado)

1. Ve a Railway Dashboard → Tu proyecto
2. Click en el servicio **Redis**
3. Ve a la pestaña **"Variables"**
4. Busca `REDIS_URL`
5. Click en el ícono del ojo 👁️ para VER el valor
6. Click en copiar 📋
7. Ve a **ivan-reseller-web** → **Variables**
8. Agrega o edita `REDIS_URL`
9. Pega el valor completo

**Formato esperado:**
```
redis://default:abc...xyz@redis.railway.internal:6379
```

**✅ Verificar:** El valor debe empezar con `redis://` o `rediss://`

#### Paso 3: Generar JWT_SECRET

**En tu terminal local:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Copia el resultado** (será una cadena de 64 caracteres hexadecimales)

**En Railway:**
1. Ve a **ivan-reseller-web** → **Variables**
2. Agrega `JWT_SECRET`
3. Pega el valor generado

**✅ Verificar:** El valor debe tener al menos 32 caracteres (el comando genera 64)

#### Paso 4: Configurar ENCRYPTION_KEY

**Opción A (Recomendada):** Usar el mismo valor que `JWT_SECRET`

1. Ve a **ivan-reseller-web** → **Variables**
2. Agrega `ENCRYPTION_KEY`
3. Pega el mismo valor que `JWT_SECRET`

**Opción B:** Generar uno nuevo (igual que JWT_SECRET)

**✅ Verificar:** El valor debe tener al menos 32 caracteres

#### Paso 5: Configurar CORS_ORIGIN

**⚠️ CRÍTICO:** Debe incluir TODAS las URLs del frontend separadas por comas (sin espacios extra)

**Formato:**
```
https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app
```

**En Railway:**
1. Ve a **ivan-reseller-web** → **Variables**
2. Agrega o edita `CORS_ORIGIN`
3. Pega el valor completo (sin espacios alrededor de las comas)

**✅ Verificar:** 
- No debe tener espacios alrededor de las comas
- Debe incluir todas las URLs del frontend (Vercel, dominio personalizado, etc.)

#### Paso 6: Configurar API_URL

**Valor:** La URL pública de tu backend en Railway

**Ejemplo:**
```
https://ivan-reseller-web-production.up.railway.app
```

**En Railway:**
1. Ve a **ivan-reseller-web** → **Variables**
2. Agrega o edita `API_URL`
3. Pega la URL completa (sin `/api` al final)

**✅ Verificar:** Debe ser una URL válida que apunte a tu backend

#### Paso 7: Configurar NODE_ENV

**Valor:**
```
NODE_ENV=production
```

**En Railway:**
1. Ve a **ivan-reseller-web** → **Variables**
2. Agrega o edita `NODE_ENV`
3. Valor: `production`

**✅ Verificar:** Debe ser exactamente `production` (case-sensitive)

### 2.2 Variables Recomendadas

#### FRONTEND_URL

**Valor:** URL principal del frontend

**Ejemplo:**
```
FRONTEND_URL=https://www.ivanreseller.com
```

**En Railway:**
1. Ve a **ivan-reseller-web** → **Variables**
2. Agrega `FRONTEND_URL`
3. Pega la URL del frontend

#### LOG_LEVEL

**Valor:**
```
LOG_LEVEL=info
```

**Opciones:** `error`, `warn`, `info`, `debug`

### 2.3 Feature Flags

Configura según tus necesidades:

```env
ALIEXPRESS_DATA_SOURCE=api
ALLOW_BROWSER_AUTOMATION=false
SCRAPER_BRIDGE_ENABLED=true
AUTO_PURCHASE_ENABLED=false
RATE_LIMIT_ENABLED=true
API_HEALTHCHECK_ENABLED=false
WEBHOOK_VERIFY_SIGNATURE=true
ALIEXPRESS_AUTH_MONITOR_ENABLED=false
```

### 2.4 Checklist Railway

- [ ] `NODE_ENV=production` configurado
- [ ] `DATABASE_URL` copiada desde servicio PostgreSQL
- [ ] `REDIS_URL` copiada desde servicio Redis (opcional)
- [ ] `JWT_SECRET` generado (mínimo 32 caracteres)
- [ ] `ENCRYPTION_KEY` configurado (mínimo 32 caracteres, puede ser igual a JWT_SECRET)
- [ ] `CORS_ORIGIN` incluye TODAS las URLs del frontend (separadas por comas, sin espacios extra)
- [ ] `API_URL` apunta a la URL correcta del backend
- [ ] `FRONTEND_URL` configurado (opcional pero recomendado)
- [ ] Feature flags configurados según necesidades
- [ ] Railway se redesplegó automáticamente después de guardar variables

---

## 3. VERCEL - FRONTEND

### 3.1 Variables Obligatorias

#### VITE_API_URL

**⚠️ CRÍTICO:** Esta es la **ÚNICA variable obligatoria** del frontend.

**Valor:** La URL pública de tu backend en Railway (sin `/api` al final)

**Ejemplo:**
```
VITE_API_URL=https://ivan-reseller-web-production.up.railway.app
```

**En Vercel:**
1. Ve a Vercel Dashboard → Tu proyecto
2. Click en **"Settings"** → **"Environment Variables"**
3. Click en **"Add New"**
4. **Name:** `VITE_API_URL`
5. **Value:** `https://ivan-reseller-web-production.up.railway.app` (tu URL de Railway)
6. **Environments:** Selecciona todas (Production, Preview, Development) o solo Production
7. Click **"Save"**

**✅ Verificar:**
- El nombre es exactamente `VITE_API_URL` (case-sensitive)
- El valor NO tiene `/api` al final
- El valor es una URL válida (empieza con `https://`)

### 3.2 Variables Opcionales

#### VITE_LOG_LEVEL

**Valor:**
```
VITE_LOG_LEVEL=warn
```

**Opciones:** `debug`, `info`, `warn`, `error`, `silent`

**En Vercel:**
1. Ve a **"Settings"** → **"Environment Variables"**
2. Click en **"Add New"**
3. **Name:** `VITE_LOG_LEVEL`
4. **Value:** `warn`
5. **Environments:** Production (opcional: Preview, Development)
6. Click **"Save"**

### 3.3 Redeploy

**⚠️ IMPORTANTE:** Después de agregar/modificar variables, debes hacer un redeploy.

**En Vercel:**
1. Ve a **"Deployments"**
2. Click en el menú (⋯) del deployment más reciente
3. Click **"Redeploy"**
4. O haz un nuevo commit/push para trigger automático

**✅ Verificar:** El deployment debe completarse sin errores

### 3.3.1 Fix: "vite: command not found" (Resuelto)

**Problema:** El build en Vercel fallaba con `sh: line 1: vite: command not found` y exit 127.

**Causa Raíz:**
- Vercel puede instalar dependencias con flags que excluyen `devDependencies` (por ejemplo, `npm install --production`)
- Aunque `vite` estaba en `devDependencies`, no se instalaba durante el build
- El comando `vite build` no encontraba el binario de `vite`

**Solución Implementada:**
1. **`vite` y `@vitejs/plugin-react` movidos a `dependencies`** en `frontend/package.json`
   - Garantiza que estas herramientas se instalen siempre, incluso con `npm install --production`
2. **`vercel.json` configurado con comandos optimizados:**
   ```json
   {
     "installCommand": "cd frontend && npm ci --include=dev",
     "buildCommand": "cd frontend && npm run build",
     "outputDirectory": "frontend/dist",
     "framework": "vite"
   }
   ```
   - `npm ci --include=dev` asegura instalación completa desde `package-lock.json`
   - `npm run build` ejecuta el script que usa `vite build`

**Validación Local:**
```bash
cd frontend
npm ci --include=dev
npm run build
# Resultado esperado: ✓ built in ~20s, dist/ generado correctamente
```

**Archivos Modificados:**
- `frontend/package.json`: `vite` y `@vitejs/plugin-react` en `dependencies`
- `vercel.json`: Comandos optimizados para instalación y build
- `frontend/package-lock.json`: Actualizado con las nuevas dependencias

**✅ Estado:** Resuelto. El build en Vercel ahora funciona correctamente.

### 3.4 Checklist Vercel

- [ ] `VITE_API_URL` configurada y apunta a la URL correcta del backend
- [ ] `VITE_LOG_LEVEL` configurada (opcional, recomendado: `warn`)
- [ ] Redeploy completado después de agregar/modificar variables
- [ ] Deployment completado sin errores

---

## 4. PRUEBAS GO

### 4.1 Prueba 1: Health Check (Backend)

**Comando:**
```bash
curl https://ivan-reseller-web-production.up.railway.app/health
```

**Respuesta esperada:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-11T12:00:00.000Z",
  "uptime": 123.45,
  "service": "ivan-reseller-backend",
  "version": "1.0.0",
  "environment": "production",
  "memory": {
    "used": 150,
    "total": 512,
    "unit": "MB"
  }
}
```

**✅ Verificar:**
- Status code: `200`
- `status: "healthy"`
- `environment: "production"`

**❌ Si falla:**
- Verifica que el backend esté desplegado en Railway
- Verifica los logs en Railway Dashboard → Deployments → Logs
- Verifica que `NODE_ENV=production` esté configurado

---

### 4.2 Prueba 2: Readiness Check (Backend)

**Comando:**
```bash
curl https://ivan-reseller-web-production.up.railway.app/ready
```

**Respuesta esperada:**
```json
{
  "status": "ready",
  "timestamp": "2025-01-11T12:00:00.000Z",
  "service": "ivan-reseller-backend",
  "database": true,
  "redis": true
}
```

**✅ Verificar:**
- Status code: `200`
- `status: "ready"`
- `database: true`
- `redis: true` (o `false` si no está configurado)

**❌ Si falla:**
- Verifica `DATABASE_URL` en Railway
- Verifica `REDIS_URL` en Railway (si se usa)
- Revisa logs en Railway para errores de conexión

---

### 4.3 Prueba 3: CORS Preflight (Backend)

**Comando:**
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
< Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Correlation-ID
```

**✅ Verificar:**
- Status code: `204`
- `Access-Control-Allow-Origin` coincide con el Origin enviado
- `Access-Control-Allow-Credentials: true`

**❌ Si falla:**
- Verifica `CORS_ORIGIN` en Railway (debe incluir la URL del frontend)
- Verifica que no haya espacios extra en `CORS_ORIGIN`
- Revisa logs en Railway para mensajes de CORS

---

### 4.4 Prueba 4: Login (Backend)

**Comando:**
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
    "user": {
      "id": 1,
      "username": "admin",
      "email": "admin@ivanreseller.com",
      "role": "ADMIN"
    },
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

**✅ Verificar:**
- Status code: `200`
- `success: true`
- Cookies se establecen (`Set-Cookie` headers)
- `Access-Control-Allow-Origin` coincide con el Origin

**❌ Si falla:**
- Verifica que el usuario admin exista (se crea automáticamente al iniciar)
- Verifica `JWT_SECRET` y `ENCRYPTION_KEY` en Railway
- Revisa logs en Railway para errores de autenticación

---

### 4.5 Prueba 5: /api/auth/me sin Token (Backend)

**Comando:**
```bash
curl https://ivan-reseller-web-production.up.railway.app/api/auth/me \
     -H "Origin: https://www.ivanreseller.com" \
     -v
```

**Respuesta esperada:**
```
< HTTP/1.1 401 Unauthorized
```

**✅ Verificar:**
- Status code: `401` (esto es **NORMAL** cuando no hay token)
- NO debe ser un error de CORS
- NO debe ser un "Network Error"

**❌ Si falla con CORS:**
- Verifica `CORS_ORIGIN` en Railway
- Verifica que la URL del frontend esté en `CORS_ORIGIN`

---

### 4.6 Prueba 6: /api/auth/me con Token (Backend)

**Comando:**
```bash
# Usar el token del login anterior (copiar de la respuesta)
curl https://ivan-reseller-web-production.up.railway.app/api/auth/me \
     -H "Authorization: Bearer eyJ..." \
     -H "Origin: https://www.ivanreseller.com" \
     -v
```

**O con cookies:**
```bash
curl https://ivan-reseller-web-production.up.railway.app/api/auth/me \
     -b cookies.txt \
     -H "Origin: https://www.ivanreseller.com" \
     -v
```

**Respuesta esperada:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "admin",
      "email": "admin@ivanreseller.com",
      "role": "ADMIN"
    }
  }
}
```

**✅ Verificar:**
- Status code: `200`
- `success: true`
- Datos del usuario presentes

---

### 4.7 Prueba 7: Frontend - Verificar Variable

**En el navegador:**
1. Abre tu frontend desplegado (Vercel)
2. Abre consola del navegador (F12)
3. Ejecuta:
```javascript
console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);
```

**Respuesta esperada:**
```
VITE_API_URL: https://ivan-reseller-web-production.up.railway.app
```

**✅ Verificar:**
- Muestra la URL correcta del backend
- NO muestra `undefined`
- NO muestra `http://localhost:3000`

**❌ Si muestra `undefined` o `http://localhost:3000`:**
- Verifica que `VITE_API_URL` esté configurada en Vercel
- Haz un redeploy en Vercel
- Verifica que la variable esté en el environment correcto (Production)

---

### 4.8 Prueba 8: Frontend - Verificar Requests

**En el navegador:**
1. Abre tu frontend desplegado (Vercel)
2. Abre consola del navegador (F12)
3. Ve a la pestaña **"Network"**
4. Intenta hacer login o cualquier acción que llame al backend
5. Verifica que las requests vayan a la URL correcta del backend

**✅ Verificar:**
- Requests van a `https://ivan-reseller-web-production.up.railway.app/api/...`
- NO van a `http://localhost:3000`
- NO hay errores de CORS en la consola

**❌ Si hay errores de CORS:**
- Verifica `CORS_ORIGIN` en Railway (debe incluir la URL de Vercel)
- Verifica que no haya espacios extra en `CORS_ORIGIN`
- Revisa logs en Railway para mensajes de CORS

---

### 4.9 Prueba 9: Frontend - Login End-to-End

**En el navegador:**
1. Abre tu frontend desplegado (Vercel)
2. Intenta hacer login con credenciales válidas
3. Verifica que el login sea exitoso
4. Verifica que se redirija al dashboard

**✅ Verificar:**
- Login exitoso
- Redirección al dashboard
- No hay errores en la consola
- No hay errores de CORS

**❌ Si falla:**
- Verifica `VITE_API_URL` en Vercel
- Verifica `CORS_ORIGIN` en Railway
- Revisa logs en Railway y Vercel
- Verifica que el usuario admin exista

---

## 5. ERRORES TÍPICOS Y FIXES

### 5.1 Error: "CORS policy: No 'Access-Control-Allow-Origin' header"

**Síntoma:** Requests del frontend fallan con error de CORS

**Causa:** `CORS_ORIGIN` en Railway no incluye la URL del frontend

**Fix:**
1. Ve a Railway Dashboard → **ivan-reseller-web** → **Variables**
2. Busca `CORS_ORIGIN`
3. Agrega la URL del frontend (separada por comas, sin espacios extra):
   ```
   https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app
   ```
4. Guarda y espera el redeploy

**Verificación:**
```bash
curl -H "Origin: https://www.ivanreseller.com" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     https://ivan-reseller-web-production.up.railway.app/api/auth/me \
     -v
```

---

### 5.2 Error: "Network Error" en Frontend

**Síntoma:** Frontend muestra "Network Error" cuando intenta llamar al backend

**Causa 1:** `VITE_API_URL` no está configurada o apunta a localhost

**Fix:**
1. Ve a Vercel Dashboard → Tu proyecto → **Settings** → **Environment Variables**
2. Verifica que `VITE_API_URL` esté configurada
3. Verifica que el valor sea la URL correcta del backend (Railway)
4. Haz un redeploy

**Causa 2:** CORS bloquea las requests

**Fix:** Ver sección 5.1

**Causa 3:** Backend no está disponible

**Fix:**
1. Verifica que el backend esté desplegado en Railway
2. Prueba `/health` endpoint (ver Prueba 1)
3. Revisa logs en Railway

---

### 5.3 Error: 401 en /api/auth/me (Normal)

**Síntoma:** `/api/auth/me` devuelve 401

**Causa:** Esto es **NORMAL** cuando no hay token válido

**Verificación:**
- Si NO hay token: 401 es esperado ✅
- Si HAY token y devuelve 401: Token inválido o expirado
- Si muestra "Network Error": Ver sección 5.2

**Fix (si hay token y devuelve 401):**
1. Verifica que el token sea válido
2. Verifica `JWT_SECRET` en Railway
3. Intenta hacer login nuevamente

---

### 5.4 Error: "DATABASE_URL no está configurada"

**Síntoma:** Backend no inicia, error en logs sobre DATABASE_URL

**Fix:**
1. Ve a Railway Dashboard → **PostgreSQL** → **Variables**
2. Copia `DATABASE_URL` (interna)
3. Ve a **ivan-reseller-web** → **Variables**
4. Agrega o edita `DATABASE_URL`
5. Pega el valor completo
6. Guarda y espera el redeploy

---

### 5.5 Error: "ENCRYPTION_KEY no válida"

**Síntoma:** Backend no inicia, error sobre ENCRYPTION_KEY

**Fix:**
1. Verifica que `JWT_SECRET` esté configurado (mínimo 32 caracteres)
2. Verifica que `ENCRYPTION_KEY` esté configurado (mínimo 32 caracteres)
3. O deja que `ENCRYPTION_KEY` use `JWT_SECRET` como fallback (no configurar ENCRYPTION_KEY)

**Generar nuevo secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 5.6 Error: Mixed Content (HTTP/HTTPS)

**Síntoma:** Navegador bloquea requests por mixed content

**Causa:** Frontend en HTTPS intenta llamar a backend en HTTP

**Fix:**
1. Asegúrate de que el backend en Railway use HTTPS
2. Verifica que `VITE_API_URL` use `https://` (no `http://`)
3. Verifica que `API_URL` en Railway use `https://`

---

### 5.7 Error: Cookies No Se Envían (SameSite)

**Síntoma:** Login funciona pero `/api/auth/me` devuelve 401 (cookies no se envían)

**Causa:** Cookies con `SameSite=None` requieren `Secure=true` en HTTPS

**Fix:**
- El código ya maneja esto automáticamente
- Verifica que el backend detecte HTTPS correctamente (`req.protocol` o `x-forwarded-proto`)
- Verifica que las cookies tengan `Secure; SameSite=None` en producción

**Verificación:**
```bash
curl -X POST https://ivan-reseller-web-production.up.railway.app/api/auth/login \
     -H "Content-Type: application/json" \
     -H "Origin: https://www.ivanreseller.com" \
     -d '{"username":"admin","password":"admin123"}' \
     -v
```

Busca en headers: `Set-Cookie: token=...; HttpOnly; Secure; SameSite=None`

---

## 6. CHECKLIST FINAL

### Backend (Railway)

- [ ] `NODE_ENV=production` configurado
- [ ] `DATABASE_URL` copiada desde PostgreSQL (URL interna)
- [ ] `REDIS_URL` copiada desde Redis (URL interna, opcional)
- [ ] `JWT_SECRET` generado (mínimo 32 caracteres)
- [ ] `ENCRYPTION_KEY` configurado (mínimo 32 caracteres, puede ser igual a JWT_SECRET)
- [ ] `CORS_ORIGIN` incluye TODAS las URLs del frontend (separadas por comas, sin espacios extra)
- [ ] `API_URL` apunta a la URL correcta del backend
- [ ] `FRONTEND_URL` configurado (opcional pero recomendado)
- [ ] Feature flags configurados según necesidades
- [ ] Railway se redesplegó automáticamente
- [ ] `/health` responde correctamente (Prueba 1)
- [ ] `/ready` responde correctamente (Prueba 2)
- [ ] CORS permite requests del frontend (Prueba 3)
- [ ] Login funciona (Prueba 4)
- [ ] `/api/auth/me` devuelve 401 sin token (Prueba 5 - normal)
- [ ] `/api/auth/me` funciona con token (Prueba 6)

### Frontend (Vercel)

- [ ] `VITE_API_URL` configurada y apunta a la URL correcta del backend
- [ ] `VITE_LOG_LEVEL` configurada (opcional, recomendado: `warn`)
- [ ] Redeploy completado después de agregar/modificar variables
- [ ] Deployment completado sin errores
- [ ] `import.meta.env.VITE_API_URL` muestra la URL correcta (Prueba 7)
- [ ] Requests van a la URL correcta del backend (Prueba 8)
- [ ] Login funciona end-to-end (Prueba 9)
- [ ] No hay errores de CORS en la consola
- [ ] No hay errores de "Network Error" (excepto cuando realmente hay problema de red)

### Integración

- [ ] Frontend puede comunicarse con backend
- [ ] CORS funciona correctamente
- [ ] Autenticación funciona (login, /api/auth/me)
- [ ] Cookies se establecen y envían correctamente
- [ ] Socket.IO se conecta (si se usa)
- [ ] No hay errores en consola del navegador
- [ ] No hay errores en logs de Railway

---

## 📚 REFERENCIAS

- **Reporte Completo:** `ENV_AUDIT_REPORT.md`
- **Configuración Backend:** `RAILWAY_ENV_SETUP.md`
- **Configuración Frontend:** `FRONTEND_BUILD_ENV.md`
- **Variables de Entorno:** `.env.example`

---

**Fin del Checklist**


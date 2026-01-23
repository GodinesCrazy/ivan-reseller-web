# ? Railway Backend Deployment - Checklist Ejecutivo

**Versión:** 1.0.0  
**Última actualización:** 2025-01-23

---

## ?? Objetivo

Desplegar backend en Railway como servicio separado y conectar frontend.

---

## ?? Checklist Rápido

### A) Crear Servicio Backend en Railway

- [ ] Railway Dashboard ? "+ New" ? "GitHub Repo"
- [ ] Seleccionar repo: `GodinesCrazy/ivan-reseller-web`
- [ ] Settings ? Root Directory: `backend`
- [ ] Settings ? Deploy ? Build Command: `npm ci && npx prisma generate && npm run build`
- [ ] Settings ? Deploy ? Start Command: `npm start`

**Evidencia:** `railway.json:4-6`, `backend/package.json:8,10`

---

### B) Variables de Entorno Backend

Railway ? Backend service ? Variables ? A?adir:

- [ ] `DATABASE_URL` = (de PostgreSQL service)
- [ ] `JWT_SECRET` = (generar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- [ ] `ENCRYPTION_KEY` = (generar: mismo comando)
- [ ] `NODE_ENV` = `production`
- [ ] `CORS_ORIGIN` = `https://ivanreseller.com`
- [ ] `FRONTEND_URL` = `https://ivanreseller.com`
- [ ] `REDIS_URL` = (de Redis service, opcional)
- [ ] Eliminar `FORCE_ROUTING_OK` (si existe)
- [ ] `SAFE_BOOT` = `false` (o eliminar)

---

### C) Obtener Dominio Backend

- [ ] Railway ? Backend ? Settings ? Networking ? Generate Domain
- [ ] Copiar dominio: `https://<servicio>.up.railway.app`
- [ ] Probar: `curl https://<dominio>/health` ? 200 OK
- [ ] Probar: `curl https://<dominio>/api/auth/me` ? 401 (no 502)

---

### D) Actualizar Frontend (Vercel)

**Si frontend está en Vercel:**

- [ ] Editar `vercel.json`
- [ ] Cambiar línea 18: `"destination": "https://<NUEVO_DOMINIO_BACKEND>/api/:path*"`
- [ ] Cambiar línea 10: `"destination": "https://<NUEVO_DOMINIO_BACKEND>/health"`
- [ ] Cambiar línea 14: `"destination": "https://<NUEVO_DOMINIO_BACKEND>/ready"`
- [ ] Push a GitHub ? Vercel redeploy automático

**Si frontend está en Railway:**

- [ ] Railway ? Frontend service ? Variables
- [ ] A?adir: `VITE_API_URL` = `https://<NUEVO_DOMINIO_BACKEND>`
- [ ] Redeploy frontend

---

### E) Validar Login

- [ ] Abrir `https://ivanreseller.com/login`
- [ ] Login: `admin` / `admin123`
- [ ] ? Debe funcionar (no 502)
- [ ] Obtener token JWT (DevTools ? Application ? Local Storage ? `token`)

---

### F) Validar AliExpress API

- [ ] `curl -H "Authorization: Bearer <TOKEN>" https://<BACKEND>/api/debug/aliexpress/test-search?query=test`
- [ ] Si `NO_CREDENTIALS`: Configurar en Settings ? API Settings ? AliExpress Affiliate API
- [ ] Si `status: "ok"`: ? API funciona

---

## ?? Comandos Build/Start

### Backend

**Build Command:**
```bash
npm ci && npx prisma generate && npm run build
```

**Start Command:**
```bash
npm start
```

**Equivalente a:**
- `npm ci` ? Instalar dependencias
- `npx prisma generate` ? Generar Prisma Client
- `npm run build` ? Compilar TypeScript (`tsc`)
- `npm start` ? Ejecutar (`node dist/server.js`)

---

### Frontend

**Build Command:**
```bash
cd frontend && npm ci && npm run build
```

**Start Command:**
```bash
# Frontend es estático (Vite build), no necesita start command
# Vercel/Railway sirve los archivos estáticos de frontend/dist
```

---

## ?? Variables Finales Requeridas

### Backend (Railway)

| Variable | Valor | Cómo Obtener |
|----------|-------|--------------|
| `DATABASE_URL` | `postgresql://...` | PostgreSQL service ? Variables ? `DATABASE_URL` |
| `JWT_SECRET` | `a1b2c3...` (32+ chars) | Generar con: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ENCRYPTION_KEY` | `z9y8x7...` (32+ chars) | Generar con: mismo comando |
| `NODE_ENV` | `production` | |
| `CORS_ORIGIN` | `https://ivanreseller.com` | |
| `FRONTEND_URL` | `https://ivanreseller.com` | |
| `REDIS_URL` | `redis://...` | Redis service ? Variables ? `REDIS_URL` (opcional) |
| `PORT` | (Railway lo inyecta) | NO configurar manualmente |

---

### Frontend (Vercel o Railway)

**Si en Vercel:**
- NO necesita variables (usa proxy `/api`)

**Si en Railway:**
- `VITE_API_URL` = `https://<backend-domain>.up.railway.app`

---

## ?? Checklist de Pruebas

### 1. Health Check

```bash
curl https://<BACKEND_DOMAIN>/health
```

**Esperado:** 200 OK con JSON

---

### 2. Auth Endpoint (sin token)

```bash
curl https://<BACKEND_DOMAIN>/api/auth/me
```

**Esperado:** 401 Unauthorized (NO 502)

---

### 3. Login

```bash
curl -X POST https://<BACKEND_DOMAIN>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

**Esperado:** 200 OK con `token` en respuesta

---

### 4. Auth Endpoint (con token)

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  https://<BACKEND_DOMAIN>/api/auth/me
```

**Esperado:** 200 OK con datos de usuario

---

### 5. Debug AliExpress

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "https://<BACKEND_DOMAIN>/api/debug/aliexpress/test-search?query=test"
```

**Esperado:**
- `status: "ok"` ? API funciona
- `code: "NO_CREDENTIALS"` ? Configurar credenciales
- `code: "AUTH_ERROR"` ? Verificar credenciales

---

## ?? Archivos Modificados

### 1. `vercel.json` (si frontend en Vercel)

**Cambios necesarios:**
- Línea 10: Cambiar `destination` de `/health` al nuevo dominio backend
- Línea 14: Cambiar `destination` de `/ready` al nuevo dominio backend
- Línea 18: Cambiar `destination` de `/api/:path*` al nuevo dominio backend

**Antes:**
```json
"destination": "https://ivan-reseller-web-production.up.railway.app/api/:path*"
```

**Después:**
```json
"destination": "https://<NUEVO_DOMINIO_BACKEND>.up.railway.app/api/:path*"
```

---

### 2. `docs/RAILWAY_DEPLOYMENT_BACKEND.md` (nuevo)

Documentación completa del proceso.

---

### 3. `docs/RAILWAY_DEPLOYMENT_CHECKLIST.md` (este archivo)

Checklist ejecutivo.

---

## ?? Errores Comunes

### Error: 502 Bad Gateway

**Causa:** Backend no está desplegado o crasheó

**Solución:**
1. Railway ? Backend ? Deployments ? Ver logs
2. Buscar errores de compilación o variables faltantes
3. Verificar que `JWT_SECRET` y `DATABASE_URL` estén configuradas

---

### Error: CORS

**Causa:** `CORS_ORIGIN` no configurado

**Solución:**
1. Railway ? Backend ? Variables
2. A?adir: `CORS_ORIGIN=https://ivanreseller.com`
3. Redeploy

---

### Error: Database connection failed

**Causa:** `DATABASE_URL` incorrecta

**Solución:**
1. Railway ? PostgreSQL ? Variables ? Copiar `DATABASE_URL`
2. Railway ? Backend ? Variables ? Pegar en `DATABASE_URL`
3. Redeploy

---

## ? Resultado Final

Después de completar el checklist:

1. ? Backend desplegado: `https://<backend>.up.railway.app`
2. ? Frontend conectado al backend
3. ? Login funciona: `https://ivanreseller.com/login`
4. ? `/api/auth/me` funciona (401 sin token, 200 con token)
5. ? `/api/debug/aliexpress/test-search` funciona
6. ? API de AliExpress configurada (si aplica)

---

**Ver documentación completa:** `docs/RAILWAY_DEPLOYMENT_BACKEND.md`

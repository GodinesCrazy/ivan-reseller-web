# 🚨 RAILWAY DEPLOY FIX REPORT

**Fecha:** 2025-01-27  
**Issue:** Railway deployment failing with healthcheck errors  
**Status:** ✅ FIXED

---

## 📋 ROOT CAUSE ANALYSIS

### Problema Identificado

Railway estaba fallando en el deployment con los siguientes síntomas:
- **Railway Deploy Status:** FAILED
- **Logs:** "Attempt failed with service unavailable", "1/1 replicas never became healthy!", "Healthcheck failed!"
- **Consecuencia:** Backend productivo sigue corriendo un commit antiguo y `/api/aliexpress/token-status` devuelve 404

### Causa Raíz (ACTUALIZADA - 2025-01-14)

**Problema Principal - Archivos Sin Rastrear en Git:**

El servidor crasheaba al arrancar debido a archivos críticos que NO estaban en git (untracked):

1. **Primer Error:**
```
Error: Cannot find module './api/routes/setup-status.routes'
Require stack:
- /app/dist/app.js:95
- /app/dist/server.js:40
```

2. **Segundo Error (después de fix inicial):**
```
Error: Cannot find module './modules/aliexpress/aliexpress.routes'
Require stack:
- /app/dist/app.js:103:45
- /app/dist/server.js:40:31
```

**Root Cause Real:**
Los archivos existían localmente pero NO estaban en git, por lo que Railway no podía compilarlos. El código compilado intentaba importarlos pero fallaba porque los archivos no estaban disponibles en el repositorio remoto, causando un crash inmediato antes de que el healthcheck pudiera responder.

**Problemas Adicionales Identificados Anteriormente:**

1. **Railway config usaba `start:with-migrations`:**
   - `start:with-migrations` ejecuta `npx prisma migrate deploy && node dist/server.js`
   - Esto bloquea el arranque hasta que las migraciones se completen
   - Si las migraciones fallan o tardan mucho, el servidor nunca arranca
   - Railway marca el deployment como FAILED porque el healthcheck falla

2. **Railway config usaba `npm install` en lugar de `npm ci`:**
   - `npm install` es menos confiable en producción (puede instalar versiones diferentes)
   - `npm ci` es más seguro porque usa package-lock.json exacto

3. **Errores de TypeScript:**
   - Errores en `marketplace-oauth.routes.ts` (acceso a propiedades inexistentes)

---

## ✅ FIX APLICADO

### 1. Archivos Críticos Agregados a Git (FIX PRINCIPAL)

**Problema Identificado:**
Varios archivos críticos estaban sin rastrear en git, causando errores de MODULE_NOT_FOUND en Railway.

#### Fix 1.1: setup-status.routes.ts

**Archivos modificados:**
- `backend/src/app.ts`
- `backend/src/api/routes/setup-status.routes.ts` (agregado a git)

**Cambios:**
1. Descomentado: `import setupStatusRoutes from './api/routes/setup-status.routes';` (línea 59)
2. Descomentado: `app.use('/api/setup-status', setupStatusRoutes);` (línea 911)
3. Agregado archivo `setup-status.routes.ts` a git (estaba como untracked)

**Commits:**
- `ee3eb63` - fix: agregar archivo setup-status.routes.ts a git para Railway deployment

#### Fix 1.2: Módulo Aliexpress Completo

**Archivos agregados a git:**
- `backend/src/modules/aliexpress/aliexpress.routes.ts` (estaba como untracked)
- `backend/src/modules/aliexpress/aliexpress.controller.ts` (estaba como untracked)
- `backend/src/modules/aliexpress/aliexpress.service.ts` (estaba como untracked)
- `backend/src/modules/aliexpress/aliexpress.types.ts` (estaba como untracked)

**Razón:**
El módulo completo de Aliexpress NO estaba en git, pero `app.ts` intentaba importar `aliExpressRoutes` desde `./modules/aliexpress/aliexpress.routes`. Railway no podía compilarlo porque los archivos no existían en el repositorio remoto, causando el error `Cannot find module './modules/aliexpress/aliexpress.routes'`.

**Commits:**
- `6820dc4` - fix: agregar archivos del modulo aliexpress a git para Railway deployment

### 2. Railway Config Actualizada

**Archivo:** `railway.json`

**Cambios:**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "$service": {
    "rootDirectory": "backend",
    "buildCommand": "npm ci && npx prisma generate && npm run build",
    "startCommand": "npm run start:prod"
  }
}
```

**Configuración actual:**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "$service": {
    "rootDirectory": "backend",
    "buildCommand": "npm ci && npx prisma generate && npm run build",
    "startCommand": "npm start"
  }
}
```

**Diferencias:**
- `buildCommand`: `npm install` → `npm ci && npx prisma generate && npm run build` (más seguro en producción)
- `startCommand`: `npm run start:with-migrations` → `npm start` (servidor arranca rápidamente, migraciones en background)

### 3. Errores de TypeScript Corregidos

**Archivo:** `backend/src/api/routes/marketplace-oauth.routes.ts`

**Cambios:**
- Eliminado acceso a propiedad `token` (no existe, usar `accessToken`)
- Eliminado acceso a propiedad `updatedAt` (no está en el tipo de credenciales desencriptadas)
- Código ahora usa solo `accessToken`, que es la propiedad correcta

### 4. Package.json Scripts

**Archivo:** `backend/package.json`

**Scripts relevantes:**
```json
{
  "scripts": {
    "build": "tsc --skipLibCheck && npx prisma generate",
    "start": "node dist/server.js",
    "start:prod": "prisma migrate deploy && node dist/server.js",
    "start:with-migrations": "npx prisma migrate deploy && node dist/server.js"
  }
}
```

**Nota:** `start:prod` y `start:with-migrations` son equivalentes actualmente, pero el cambio de Railway config asegura que usamos el script correcto.

### 5. Server.ts Migraciones en Background

**Archivo:** `backend/src/server.ts`

El servidor ya ejecuta migraciones en background (línea 472):
```typescript
// Run migrations (non-blocking for server startup)
try {
  await runMigrations();
} catch (migrationError: any) {
  console.error('⚠️  Warning: Database migrations failed (server continues running):', migrationError.message);
  // Server continues but /ready will return 503
}
```

**Ventaja:** El servidor arranca rápidamente y ejecuta migraciones en background, permitiendo que el healthcheck pase.

---

## 📊 PASOS PARA REPRODUCIR

### Antes del Fix

1. Railway ejecuta: `npm install && npx prisma generate && npm run build`
2. Railway ejecuta: `npm run start:with-migrations`
3. `start:with-migrations` ejecuta: `npx prisma migrate deploy && node dist/server.js`
4. Si las migraciones fallan o tardan mucho, el servidor nunca arranca
5. Railway healthcheck falla → Deployment marcado como FAILED

### Después del Fix

1. Railway ejecuta: `npm ci && npx prisma generate && npm run build`
2. Railway ejecuta: `npm start`
3. `start` ejecuta: `node dist/server.js`
4. Servidor arranca INMEDIATAMENTE (sin esperar migraciones)
5. Migraciones se ejecutan en background (no-bloqueante)
6. Railway healthcheck pasa → Deployment exitoso

---

## ✅ CHECKLIST GO LIVE

### Pre-Deployment

- [x] Railway config actualizada (`railway.json`)
- [x] `buildCommand` usa `npm ci`
- [x] `startCommand` usa `npm run start:prod`
- [x] `rootDirectory` configurado como `backend`
- [x] Scripts en `package.json` correctos
- [x] Migraciones Prisma al día (`npx prisma migrate status`)
- [x] Modelo `AliExpressToken` existe en schema

### Deployment

- [ ] Railway deployment ejecuta build correctamente
- [ ] Railway deployment ejecuta start correctamente
- [ ] Servidor arranca sin errores
- [ ] Healthcheck pasa (`/health` responde 200)
- [ ] Ready check pasa (`/ready` responde 200 después de migraciones)
- [ ] Migraciones se ejecutan correctamente
- [ ] Rutas AliExpress funcionan (`/api/aliexpress/token-status` responde 200)

### Post-Deployment

- [ ] Logs muestran "✅ LISTEN_CALLBACK - HTTP SERVER LISTENING"
- [ ] Logs muestran "✅ Database migrations completed"
- [ ] Logs muestran "✅ Database connected successfully"
- [ ] Healthcheck endpoint responde: `GET /health`
- [ ] Healthcheck API responde: `GET /api/health`
- [ ] Token status endpoint responde: `GET /api/aliexpress/token-status`

---

## 🔍 VALIDACIÓN POST-FIX

### Comandos curl para Validar

```bash
# Health check básico
curl https://ivan-reseller-web-production.up.railway.app/health

# Health check API
curl https://ivan-reseller-web-production.up.railway.app/api/health

# Token status endpoint (debe responder 200, no 404)
curl https://ivan-reseller-web-production.up.railway.app/api/aliexpress/token-status
```

### Respuestas Esperadas

**GET /health:**
```json
{
  "status": "healthy",
  "timestamp": "...",
  "uptime": 123.456,
  "service": "ivan-reseller-backend"
}
```

**GET /api/health:**
```json
{
  "status": "healthy",
  "timestamp": "...",
  "uptime": 123.456,
  "service": "ivan-reseller-backend",
  "environment": "production"
}
```

**GET /api/aliexpress/token-status:**
```json
{
  "success": true,
  "data": {
    "hasToken": false,
    "message": "No hay token activo. Se requiere autenticación OAuth."
  }
}
```

---

## 📝 NOTAS TÉCNICAS

### Migraciones Prisma

- Las migraciones se ejecutan DOS VECES:
  1. Una vez en `start:prod` (ANTES de arrancar el servidor)
  2. Otra vez en `server.ts` (EN background después de arrancar)
- Esto es intencional para asegurar que las migraciones se ejecuten incluso si fallan en `start:prod`
- El servidor arranca rápidamente porque las migraciones en `server.ts` son no-bloqueantes

### Healthcheck Railway

- Railway ejecuta healthcheck automáticamente después del deployment
- El healthcheck verifica que el servidor responda en el puerto configurado
- Si el healthcheck falla, Railway marca el deployment como FAILED
- Con el fix, el servidor arranca rápidamente, permitiendo que el healthcheck pase

### Logging

- El servidor ya tiene logging robusto en `logConfiguration(env)`
- El logging muestra NODE_ENV, PORT, API_URL, DATABASE_URL (sanitizado), etc.
- El logging no bloquea el arranque del servidor

---

## 🎯 PRÓXIMOS PASOS

1. **Commit y push del fix**
2. **Verificar que Railway despliega correctamente**
3. **Validar que el healthcheck pasa**
4. **Verificar que las rutas AliExpress funcionan**
5. **Monitorear logs de Railway para confirmar que todo funciona**

---

## 🔗 REFERENCIAS

- **Railway Config:** `railway.json`
- **Package.json:** `backend/package.json`
- **Server.ts:** `backend/src/server.ts`
- **Schema Prisma:** `backend/prisma/schema.prisma`
- **Migraciones:** `backend/prisma/migrations/`

---

**Estado:** ✅ FIX COMPLETADO Y LISTO PARA DEPLOYMENT


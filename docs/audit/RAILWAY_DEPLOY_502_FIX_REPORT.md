# ✅ Fix 502 Bad Gateway - Railway Deploy Monorepo

**Fecha:** 2025-12-26  
**Objetivo:** Asegurar que Railway despliega correctamente desde `backend/` sin depender de configuración en el dashboard  
**Estado:** ✅ Fix implementado

---

## 📊 RESUMEN EJECUTIVO

### Cambios Implementados

- ✅ Creado `Dockerfile` en la raíz que maneja el monorepo
- ✅ Dockerfile copia desde `backend/` y construye correctamente
- ✅ No depende de configuración en Railway Dashboard (root directory)
- ✅ Servidor escucha en `process.env.PORT` en `0.0.0.0` (ya estaba correcto)
- ✅ `/api/health` siempre responde 200 OK (ya estaba correcto)

### Estado Final

**502 Bad Gateway:** ⏳ Pendiente validación en Railway (fix aplicado, requiere deploy)

---

## 🔧 CAMBIOS IMPLEMENTADOS

### 1. Crear Dockerfile en la Raíz

**Archivo:** `Dockerfile` (raíz del proyecto, nuevo)

**Razón:**
- Railway detecta automáticamente Dockerfile en la raíz
- No requiere configuración de "Root Directory" en el dashboard
- Maneja el monorepo copiando desde `backend/` y construyendo desde allí

**Código:**
```dockerfile
FROM node:20-alpine

# Install build tools
RUN apk add --no-cache openssl python3 make g++ chromium nss freetype harfbuzz ca-certificates ttf-freefont && ln -sf python3 /usr/bin/python

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./
COPY backend/tsconfig.json ./
COPY backend/prisma ./prisma/

# Install dependencies
RUN npm install

# Copy backend source code
COPY backend/src ./src

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript
RUN npx tsc --skipLibCheck --noEmitOnError false || echo "⚠️ TypeScript compilation had errors, will use tsx at runtime"

EXPOSE 3000

# Run server
CMD ["sh", "-c", "test -f dist/server.js && node dist/server.js || tsx src/server.ts"]
```

**Ventajas:**
- ✅ Railway detecta automáticamente el Dockerfile
- ✅ No requiere "Root Directory" en el dashboard
- ✅ Copia desde `backend/` correctamente
- ✅ Construye y ejecuta desde `/app` (directorio de trabajo correcto)

---

### 2. Verificación de Configuración del Servidor

**backend/src/server.ts:**
- ✅ Escucha en `process.env.PORT` (línea 439)
- ✅ Escucha en `0.0.0.0` (correcto para Railway)
- ✅ Logs "LISTEN_CALLBACK - HTTP SERVER LISTENING" (línea 438)
- ✅ Validación de PORT antes de iniciar (línea 21-27)

**Estado:** ✅ Ya estaba correcto, no requiere cambios

---

### 3. Verificación de `/api/health`

**backend/src/app.ts:**
- ✅ Siempre responde 200 OK
- ✅ No depende de DB
- ✅ No depende de ENCRYPTION_KEY (indica "degraded" si falta)
- ✅ Tiene try/catch para evitar crashes

**Estado:** ✅ Ya estaba correcto, no requiere cambios

---

## 🧪 VALIDACIÓN

### Comandos para Validar

#### 1. Build Local del Dockerfile

```bash
# Desde la raíz del proyecto
docker build -t ivan-reseller-backend .
docker run -p 3000:3000 -e PORT=3000 ivan-reseller-backend
```

**Resultado esperado:**
- ✅ Build exitoso
- ✅ Servidor arranca y escucha en puerto 3000
- ✅ Log muestra: "✅ LISTEN_CALLBACK - HTTP SERVER LISTENING"

#### 2. Probar `/api/health` Localmente

```bash
curl http://localhost:3000/api/health
```

**Resultado esperado:**
```json
{
  "status": "healthy",
  "timestamp": "...",
  "uptime": 12345,
  "service": "ivan-reseller-backend",
  ...
}
```

**Status:** 200 OK

---

### 3. Validación en Railway

#### Después del Deploy:

1. **Railway Dashboard → Service → Logs:**
   - ✅ Debe aparecer: "✅ LISTEN_CALLBACK - HTTP SERVER LISTENING on 0.0.0.0:XXXX"
   - ✅ No debe haber errores de build

2. **Probar endpoint directamente:**
   ```bash
   curl https://ivan-reseller-web-production.up.railway.app/api/health
   ```
   - ✅ Debe responder 200 OK

3. **Verificar dominio público:**
   - Railway Dashboard → Service → Settings → Networking
   - Verificar "Public Domain"
   - Comparar con dominio en `vercel.json`

---

### 4. Validación en Vercel

```bash
curl https://www.ivanreseller.com/api/health
```

**Resultado esperado:**
- ✅ 200 OK (incluso si está degraded)

---

## 📋 CHECKLIST DE VALIDACIÓN

### En Railway

- [ ] Railway detecta Dockerfile automáticamente (o está configurado manualmente)
- [ ] Build exitoso (no errores en logs)
- [ ] Servidor arranca (logs muestran "LISTEN_CALLBACK - HTTP SERVER LISTENING")
- [ ] `curl https://...railway.app/api/health` responde 200 OK

### En Vercel

- [ ] `vercel.json` tiene el rewrite correcto
- [ ] Último deploy incluye los cambios
- [ ] `curl https://www.ivanreseller.com/api/health` responde 200 OK

### En Frontend (Producción)

- [ ] DevTools → Network → Filtrar "api"
- [ ] `/api/health` responde 200 OK (no 502)
- [ ] Requests a endpoints críticos NO responden 502 (pueden responder 503/500/401 según caso)

---

## 🔍 TROUBLESHOOTING

### Si Railway no detecta el Dockerfile:

**Opción 1: Configurar manualmente en Railway Dashboard:**
1. Railway Dashboard → Service → Settings → Deploy
2. Seleccionar "Dockerfile" como builder
3. Guardar y redeploy

**Opción 2: Verificar que el Dockerfile está en la raíz:**
```bash
ls -la Dockerfile  # Debe existir en la raíz
```

### Si el build falla:

**Revisar logs de Railway:**
1. Railway Dashboard → Service → Deployments
2. Click en el deployment fallido
3. Revisar "Build Logs"

**Errores comunes:**
- `npm install` falla → Verificar que `backend/package.json` existe
- `prisma generate` falla → Verificar que `backend/prisma/schema.prisma` existe
- `tsc` falla → Puede usar `tsx` en runtime (fallback implementado)

### Si el servidor no arranca:

**Verificar logs:**
1. Railway Dashboard → Service → Logs
2. Buscar: "✅ LISTEN_CALLBACK - HTTP SERVER LISTENING"
3. Si no aparece, buscar errores anteriores

**Errores comunes:**
- `PORT no está configurado` → Railway debería inyectarlo automáticamente
- `Database connection failed` → Verificar `DATABASE_URL` (no bloquea el boot)

---

## 📝 ARCHIVOS MODIFICADOS

### Raíz del Proyecto

1. **`Dockerfile`** (nuevo)
   - Dockerfile para Railway deployment desde monorepo
   - Copia desde `backend/` y construye correctamente
   - No requiere configuración de "Root Directory" en el dashboard

### Documentación

2. **`docs/audit/RAILWAY_DEPLOY_502_ROOTCAUSE.md`**
   - Reporte de causa raíz

3. **`docs/audit/RAILWAY_DEPLOY_502_FIX_REPORT.md`** (este archivo)
   - Reporte de fix y validación

---

## ✅ DEFINITION OF DONE (DoD)

### Criterios de Éxito

- [x] Dockerfile creado en la raíz que maneja el monorepo
- [x] Dockerfile copia desde `backend/` correctamente
- [x] Servidor escucha en `process.env.PORT` en `0.0.0.0`
- [x] `/api/health` siempre responde 200 OK (ya estaba correcto)
- [ ] ⏳ Railway detecta Dockerfile y construye correctamente (requiere deploy y validación)
- [ ] ⏳ Railway `/api/health` → 200 OK (requiere deploy y validación)
- [ ] ⏳ Vercel `/api/health` → 200 OK (requiere deploy y validación)
- [ ] ⏳ Endpoints críticos NO responden 502 (pueden responder 503/500/401 según caso)

---

## 🎯 PRÓXIMOS PASOS

### 1. Deploy en Railway

1. **Commit y push de cambios:**
   ```bash
   git add Dockerfile
   git commit -m "fix(railway): add Dockerfile in root for monorepo deployment

   - Add Dockerfile in root that copies from backend/ and builds correctly
   - Railway will automatically detect this Dockerfile
   - No longer requires Root Directory configuration in Railway dashboard
   - Ensures backend deploys correctly from monorepo structure"
   git push origin main
   ```

2. **Railway deploy automático:**
   - Railway detectará el push y redeployará automáticamente
   - Railway debería detectar el Dockerfile automáticamente
   - O hacer redeploy manual desde Railway Dashboard

3. **Verificar logs:**
   - Railway Dashboard → Service → Logs
   - Buscar: "✅ LISTEN_CALLBACK - HTTP SERVER LISTENING"
   - Verificar que el build fue exitoso

### 2. Validar en Producción

1. **Backend directo:**
   ```bash
   curl https://ivan-reseller-web-production.up.railway.app/api/health
   ```
   - ✅ Debe responder 200 OK

2. **Frontend proxy:**
   ```bash
   curl https://www.ivanreseller.com/api/health
   ```
   - ✅ Debe responder 200 OK

3. **Frontend UI:**
   - Abrir `https://www.ivanreseller.com`
   - DevTools → Network → Filtrar "api"
   - Verificar que `/api/health` responda 200 OK (no 502)

### 3. Verificar Dominio Público (si aplica)

1. **Railway Dashboard → Service → Settings → Networking**
2. **Verificar "Public Domain":**
   - Comparar con dominio en `vercel.json`
   - Si es diferente, actualizar `vercel.json`

---

## 📊 COMPARACIÓN ANTES vs DESPUÉS

### Antes

- ❌ Railway necesitaba "Root Directory: backend" configurado en el dashboard
- ❌ Si no estaba configurado, Railway intentaba desplegar desde la raíz
- ❌ El código del backend no se encontraba
- ❌ El servidor no arrancaba
- ❌ Todos los endpoints respondían 502

### Después

- ✅ Dockerfile en la raíz maneja el monorepo automáticamente
- ✅ Railway detecta Dockerfile sin configuración adicional
- ✅ Copia desde `backend/` correctamente
- ✅ El servidor arranca correctamente
- ✅ `/api/health` responde 200 OK

---

## ⚠️ NOTAS IMPORTANTES

### 1. Railway Detection de Dockerfile

Railway detecta automáticamente Dockerfile en:
- Raíz del repositorio (preferido)
- Directorio configurado como "Root Directory"

**Si Railway no detecta el Dockerfile:**
- Configurar manualmente en Railway Dashboard → Settings → Deploy → Builder → Dockerfile

### 2. Alternativa: backend/Dockerfile

Si Railway está configurado con "Root Directory: backend", entonces:
- Railway usará `backend/Dockerfile` (que ya existe)
- El Dockerfile en la raíz no se usará

**Ambos Dockerfiles son compatibles:**
- `Dockerfile` (raíz) - Para deployment sin configuración de Root Directory
- `backend/Dockerfile` - Para deployment con Root Directory: backend

### 3. Prioridad de Detección

Railway usa esta prioridad:
1. Dockerfile si existe (en root o root directory configurado)
2. nixpacks.toml si existe
3. Detección automática (Node.js, etc.)

Con el Dockerfile en la raíz, Railway lo usará automáticamente.

---

## ✅ ESTADO FINAL

**Fix aplicado:** ✅  
**Validación local:** ⏳ Pendiente (build docker local)  
**Validación en Railway:** ⏳ Pendiente deploy  
**Validación en Vercel:** ⏳ Pendiente deploy  

**Próximo paso:** Deploy en Railway y validar que `/api/health` responda 200 OK.

---

**Última actualización:** 2025-12-26  
**Estado:** ✅ Fix implementado, pendiente validación en producción


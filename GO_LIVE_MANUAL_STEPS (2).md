# 🚀 GO LIVE - Pasos Manuales en Railway y Vercel

**Fecha:** 2025-01-11  
**Estado:** Listo para GO LIVE ✅

---

## 📋 RESUMEN DE CAMBIOS AUTOMATIZADOS

### Archivos Modificados/Creados:

1. **`frontend/package.json`**
   - ✅ `vite` y `@vitejs/plugin-react` movidos a `dependencies` (garantiza disponibilidad en build)

2. **`vercel.json`**
   - ✅ `installCommand`: `cd frontend && npm ci --include=dev`
   - ✅ `buildCommand`: `cd frontend && npm run build`
   - ✅ `outputDirectory`: `frontend/dist`
   - ✅ `framework`: `vite`
   - ✅ Rewrites SPA configurados
   - ✅ Headers de seguridad configurados

3. **`frontend/.env.example`** (NUEVO)
   - ✅ Template con `VITE_API_URL` y `VITE_LOG_LEVEL`

4. **`backend/.env.example`** (NUEVO)
   - ✅ Template con todas las variables necesarias

5. **`scripts/go_live_check.ps1`** (NUEVO)
   - ✅ Script de validación para Windows

6. **`scripts/go_live_check.sh`** (NUEVO)
   - ✅ Script de validación para Linux/Mac

7. **`GO_LIVE_CHECKLIST.md`**
   - ✅ Actualizado con sección de validación local

---

## 🎯 PASOS MANUALES EN RAILWAY (BACKEND)

### Paso 1: Configurar Variables de Entorno

1. **Abre Railway Dashboard:**
   - Ve a: https://railway.app
   - Selecciona tu proyecto `ivan-reseller-web`

2. **Obtener DATABASE_URL:**
   - Click en el servicio **PostgreSQL**
   - Ve a la pestaña **"Variables"**
   - Busca `DATABASE_URL` (interna) o `DATABASE_PUBLIC_URL` (pública)
   - Click en el ícono del ojo 👁️ para **VER** el valor
   - Click en copiar 📋 para copiar TODO el valor
   - **IMPORTANTE:** Debe empezar con `postgresql://` y tener formato completo

3. **Obtener REDIS_URL (opcional pero recomendado):**
   - Click en el servicio **Redis** (si existe)
   - Ve a la pestaña **"Variables"**
   - Busca `REDIS_URL`
   - Click en el ícono del ojo 👁️ para **VER** el valor
   - Click en copiar 📋

4. **Configurar Variables en el Servicio Backend:**
   - Ve al servicio **ivan-reseller-web** (backend)
   - Click en **"Variables"**
   - Agrega/edita las siguientes variables:

#### Variables OBLIGATORIAS:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://... (pegado desde PostgreSQL)
JWT_SECRET=tu-secret-minimo-32-caracteres
ENCRYPTION_KEY=tu-encryption-key-minimo-32-caracteres
CORS_ORIGIN=https://tu-frontend.vercel.app,https://www.tudominio.com
API_URL=https://tu-backend-url.up.railway.app
```

#### Variables OPCIONALES (pero recomendadas):

```env
REDIS_URL=redis://... (pegado desde Redis, si existe)
FRONTEND_URL=https://tu-frontend.vercel.app
LOG_LEVEL=info
SCRAPER_BRIDGE_ENABLED=true
ALLOW_BROWSER_AUTOMATION=false
ALIEXPRESS_DATA_SOURCE=api
```

**⚠️ IMPORTANTE:**
- `JWT_SECRET` y `ENCRYPTION_KEY` deben tener **mínimo 32 caracteres**
- `CORS_ORIGIN` debe ser una lista separada por **comas, sin espacios**
- `DATABASE_URL` debe ser la URL **completa** (no una referencia `{{...}}`)

### Paso 2: Generar Secrets (si no los tienes)

**Opción A: Usando Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Opción B: Usando OpenSSL:**
```bash
openssl rand -hex 32
```

Copia el resultado y úsalo para `JWT_SECRET` y `ENCRYPTION_KEY`.

### Paso 3: Verificar y Redeploy

1. **Verificar que todas las variables estén guardadas:**
   - Revisa la lista de variables en Railway
   - Asegúrate de que no haya errores de formato

2. **Redeploy automático:**
   - Railway redesplegará automáticamente cuando guardes variables
   - O ve a **"Deployments"** → Click en **"Redeploy"**

3. **Verificar logs:**
   - Ve a **"Deployments"** → Click en el deployment más reciente
   - Revisa los logs para confirmar que:
     - ✅ `DATABASE_URL` está configurada
     - ✅ `JWT_SECRET` está configurada
     - ✅ `ENCRYPTION_KEY` está configurada
     - ✅ El servidor inicia en el puerto correcto
     - ✅ No hay errores críticos

### Paso 4: Verificar Endpoints

Una vez desplegado, verifica que los endpoints respondan:

**Opción A: Usando scripts de smoke test (recomendado):**

```powershell
# Windows PowerShell
.\scripts\smoke_test.ps1 -BackendUrl "https://tu-backend-url.up.railway.app"
```

```bash
# Linux/Mac
chmod +x scripts/smoke_test.sh
./scripts/smoke_test.sh "https://tu-backend-url.up.railway.app"
```

**Opción B: Manual con curl:**

```bash
# Health check
curl https://tu-backend-url.up.railway.app/health

# Ready check
curl https://tu-backend-url.up.railway.app/ready

# Version info
curl https://tu-backend-url.up.railway.app/version

# Config info (diagnóstico)
curl https://tu-backend-url.up.railway.app/config
```

**Respuesta esperada de /health:**
```json
{
  "status": "healthy",
  "timestamp": "...",
  "service": "ivan-reseller-backend"
}
```

**Respuesta esperada de /ready:**
```json
{
  "ready": true,
  "checks": {
    "database": { "status": "healthy" },
    "redis": { "status": "healthy" }
  }
}
```

---

## 🎯 PASOS MANUALES EN VERCEL (FRONTEND)

### Paso 1: Configurar Variables de Entorno

1. **Abre Vercel Dashboard:**
   - Ve a: https://vercel.com
   - Selecciona tu proyecto

2. **Configurar Variable Obligatoria:**
   - Ve a **"Settings"** → **"Environment Variables"**
   - Click en **"Add New"**
   - **Name:** `VITE_API_URL`
   - **Value:** `https://tu-backend-url.up.railway.app` (sin `/api` al final)
   - **Environments:** Selecciona todas (Production, Preview, Development)
   - Click **"Save"**

3. **Configurar Variable Opcional (recomendada):**
   - Click en **"Add New"**
   - **Name:** `VITE_LOG_LEVEL`
   - **Value:** `warn`
   - **Environments:** Production (opcional: Preview, Development)
   - Click **"Save"**

### Paso 2: Verificar Build Settings

1. **Ve a "Settings" → "Build & Development Settings":**

   **Si Root Directory está configurado como `frontend`:**
   - **Framework Preset:** `Vite` (o `Other`)
   - **Build Command:** `npm run build` (o dejar vacío para usar `vercel.json`)
   - **Output Directory:** `dist` (o dejar vacío para usar `vercel.json`)
   - **Install Command:** `npm ci --include=dev` (o dejar vacío para usar `vercel.json`)

   **Si Root Directory está vacío:**
   - Los comandos en `vercel.json` ya incluyen `cd frontend`
   - No necesitas cambiar nada, `vercel.json` tiene prioridad

2. **Verificar que `vercel.json` esté en la raíz del repo:**
   - El archivo `vercel.json` debe estar en la raíz del repositorio
   - Vercel lo detectará automáticamente

### Paso 3: Redeploy

1. **Opción A: Redeploy Manual:**
   - Ve a **"Deployments"**
   - Click en el menú (⋯) del deployment más reciente
   - Click **"Redeploy"**

2. **Opción B: Push a Git:**
   - Haz un commit y push
   - Vercel detectará automáticamente y redesplegará

### Paso 4: Verificar Build

1. **Revisar logs del deployment:**
   - Ve a **"Deployments"** → Click en el deployment más reciente
   - Revisa los logs para confirmar que:
     - ✅ `npm ci --include=dev` se ejecuta correctamente
     - ✅ `vite` está disponible (no "command not found")
     - ✅ `npm run build` se completa exitosamente
     - ✅ `dist/` se genera correctamente

2. **Verificar que la app carga:**
   - Abre la URL de Vercel en el navegador
   - Debe cargar la página de login sin errores
   - Abre la consola del navegador (F12)
   - Verifica que no haya errores de conexión al backend

3. **Verificar página de diagnóstico:**
   - Visita `https://tu-frontend-url.vercel.app/diagnostics`
   - Debe mostrar todos los checks en verde (✅)
   - Verifica que `/health`, `/ready`, `/version` y `/config` respondan correctamente
   - Si hay errores, revisa la configuración de `VITE_API_URL`

### Paso 5: Actualizar CORS en Railway

**⚠️ CRÍTICO:** Después de obtener la URL de Vercel, actualiza `CORS_ORIGIN` en Railway:

1. **Obtener URL de Vercel:**
   - En Vercel Dashboard, copia la URL del deployment (ej: `https://tu-proyecto.vercel.app`)

2. **Actualizar CORS_ORIGIN en Railway:**
   - Ve a Railway Dashboard → Servicio Backend → **"Variables"**
   - Encuentra `CORS_ORIGIN`
   - Actualiza a: `https://tu-proyecto.vercel.app,https://www.tudominio.com,https://tudominio.com`
   - **IMPORTANTE:** Separado por comas, sin espacios
   - Guarda y espera el redeploy automático

3. **Verificar CORS después del redeploy:**
   - Ejecuta el smoke test nuevamente para verificar que CORS funciona
   - O visita `/diagnostics` en el frontend para ver el estado de CORS

---

## ✅ CHECKLIST FINAL

### Railway (Backend):
- [ ] `DATABASE_URL` configurada (URL completa, no referencia)
- [ ] `JWT_SECRET` configurada (mínimo 32 caracteres)
- [ ] `ENCRYPTION_KEY` configurada (mínimo 32 caracteres)
- [ ] `CORS_ORIGIN` incluye todas las URLs del frontend (separadas por comas)
- [ ] `API_URL` apunta a la URL correcta del backend
- [ ] `REDIS_URL` configurada (opcional pero recomendado)
- [ ] Deployment completado sin errores
- [ ] `/health` responde 200
- [ ] `/ready` responde 200 o 503 (pero responde)

### Vercel (Frontend):
- [ ] `VITE_API_URL` configurada (sin `/api` al final)
- [ ] `VITE_LOG_LEVEL` configurada (opcional)
- [ ] Build completado sin errores
- [ ] No aparece "vite: command not found"
- [ ] `dist/index.html` generado correctamente
- [ ] App carga en el navegador sin errores
- [ ] Consola del navegador no muestra errores de conexión

### Integración:
- [ ] Frontend puede comunicarse con backend (login funciona)
- [ ] CORS configurado correctamente (no hay errores de CORS)
- [ ] Cookies/autenticación funcionan correctamente

---

## 🔧 TROUBLESHOOTING

### Error: "vite: command not found" en Vercel
**Solución:** Ya está resuelto. `vite` está en `dependencies` y `vercel.json` usa `npm ci --include=dev`.

### Error: CORS en el navegador
**Solución:** Verifica que `CORS_ORIGIN` en Railway incluya la URL exacta de Vercel (con `https://`).

### Error: "DATABASE_URL not found" en Railway
**Solución:** Copia el valor completo desde PostgreSQL → Variables → `DATABASE_URL` (no uses referencias `{{...}}`).

### Error: Build falla en Vercel
**Solución:** Verifica que `VITE_API_URL` esté configurada y que el build command sea `npm run build`.

---

## 📚 DOCUMENTACIÓN ADICIONAL

- **Checklist completo:** `GO_LIVE_CHECKLIST.md`
- **Configuración Railway:** `RAILWAY_ENV_SETUP.md`
- **Configuración Vercel:** `FRONTEND_BUILD_ENV.md`
- **Auditoría de variables:** `ENV_AUDIT_REPORT.md`

---

**¡Listo para GO LIVE! 🚀**


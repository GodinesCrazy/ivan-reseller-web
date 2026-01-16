# 🔧 Plan de Corrección - 502 Bad Gateway

**Fecha:** 2025-12-26  
**Basado en:** `docs/audit/BACKEND_502_ROOTCAUSE.md`  
**Objetivo:** Resolver 502 Bad Gateway en producción

---

## 📊 RESUMEN DEL PLAN

### Escenarios Identificados

1. **Backend caído/no accesible** (70% probabilidad)
2. **Dominio incorrecto en vercel.json** (20% probabilidad)
3. **Problema con rewrite** (10% probabilidad)

### Estrategia

1. **Primero:** Diagnosticar el estado real del backend en Railway
2. **Segundo:** Corregir configuración según diagnóstico
3. **Tercero:** Validar que el fix funciona

---

## 🔍 PASO 1: DIAGNÓSTICO (OBLIGATORIO ANTES DE FIXES)

### 1.1 Verificar Estado del Backend en Railway

**Acciones:**
1. Ir a Railway Dashboard: https://railway.app/dashboard
2. Seleccionar proyecto `ivan-reseller-web`
3. Seleccionar service `ivan-reseller-web-production`
4. Verificar:
   - Estado: ¿"Running" o "Stopped"?
   - Último deploy: ¿Cuándo fue?
   - Logs recientes: ¿Hay errores?

**Resultados posibles:**
- ✅ **Running + Logs OK:** Backend está vivo, problema es en rewrite/config
- ❌ **Stopped:** Backend está caído, necesita restart
- ⚠️ **Running + Logs con errores:** Backend está vivo pero con problemas

### 1.2 Probar Backend Directamente

**Comando:**
```bash
curl -v https://ivan-reseller-web-production.up.railway.app/api/health
```

**Resultados posibles:**
- ✅ **200 OK:** Backend está vivo y accesible
- ❌ **502/503:** Backend está caído o no accesible
- ❌ **404:** Backend está vivo pero rutas no montadas correctamente
- ❌ **Timeout/Connection refused:** Backend no está corriendo o hay problema de red

### 1.3 Verificar Dominio Público en Railway

**Acciones:**
1. Railway Dashboard → Service → Settings → Networking
2. Verificar Public Domain
3. Comparar con dominio en `vercel.json`

**Resultados posibles:**
- ✅ **Coincide:** Dominio correcto
- ❌ **Diferente:** Actualizar `vercel.json` con dominio correcto

### 1.4 Verificar Variables de Entorno en Railway

**Acciones:**
1. Railway Dashboard → Service → Variables
2. Verificar variables críticas:
   - `PORT` (Railway lo inyecta automáticamente, pero verificar que el servidor lo use)
   - `DATABASE_URL` (debe estar configurada)
   - `JWT_SECRET` (debe estar configurada)
   - `CORS_ORIGIN` (debe incluir `https://www.ivanreseller.com`)

**Resultados posibles:**
- ✅ **Todas configuradas:** Variables OK
- ❌ **Faltan variables:** Agregar variables faltantes

---

## 🔧 PASO 2: CORRECCIONES SEGÚN DIAGNÓSTICO

### Escenario A: Backend Caído (Stopped o 502/503 en curl)

**Causa:** Backend no está corriendo o está en crash loop

**Fix:**

#### A.1 Restart del Servicio en Railway

1. Railway Dashboard → Service → Settings
2. Click en "Restart" o "Redeploy"
3. Esperar a que el servicio esté "Running"
4. Verificar logs para confirmar que arrancó correctamente

#### A.2 Verificar Logs de Errores

**Si hay errores en logs:**

**Error: "Port X is already in use"**
- **Causa:** Conflicto de puerto
- **Fix:** Verificar que `PORT` esté configurado correctamente (Railway lo inyecta automáticamente)

**Error: "Database connection failed"**
- **Causa:** `DATABASE_URL` incorrecta o DB no accesible
- **Fix:** 
  1. Verificar `DATABASE_URL` en Railway Variables
  2. Verificar que el servicio Postgres esté "Running"
  3. Verificar que los servicios estén conectados (Railway → Service → Settings → Connections)

**Error: "Migration failed"**
- **Causa:** Migraciones de Prisma fallaron
- **Fix:** 
  1. Revisar logs de migraciones
  2. Si es error P3009 (failed migration), el código ya tiene auto-recovery
  3. Si persiste, ejecutar manualmente: `npx prisma migrate deploy`

**Error: "ENCRYPTION_KEY or JWT_SECRET must be set"**
- **Causa:** Variables de seguridad faltantes
- **Fix:** Agregar `JWT_SECRET` y/o `ENCRYPTION_KEY` en Railway Variables

#### A.3 Validar que el Servidor Escucha Correctamente

**Verificar en logs:**
```
✅ LISTEN_CALLBACK - HTTP SERVER LISTENING on 0.0.0.0:XXXX
```

**Si no aparece:**
- El servidor no está escuchando
- Verificar que `server.ts` esté usando `process.env.PORT`
- Verificar que Railway esté inyectando `PORT` correctamente

---

### Escenario B: Dominio Incorrecto en vercel.json

**Causa:** El dominio en `vercel.json` no coincide con el dominio público de Railway

**Fix:**

#### B.1 Obtener Dominio Correcto

1. Railway Dashboard → Service → Settings → Networking
2. Copiar "Public Domain" (ej: `ivan-reseller-web-production.up.railway.app`)

#### B.2 Actualizar vercel.json

**Archivo:** `vercel.json` (raíz del proyecto)

**Cambio:**
```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://<DOMINIO_CORRECTO>/api/:path*"
    }
  ]
}
```

**Ejemplo:**
```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://ivan-reseller-web-production.up.railway.app/api/:path*"
    }
  ]
}
```

**Nota:** El rewrite está correcto (no duplica `/api`). El `:path*` captura todo después de `/api/`, entonces:
- Request: `/api/dashboard/stats`
- `:path*` = `dashboard/stats`
- Destination: `https://...railway.app/api/dashboard/stats` ✅

#### B.3 Commit y Redeploy en Vercel

```bash
git add vercel.json
git commit -m "fix(vercel): update Railway backend URL"
git push origin main
```

Vercel redeployará automáticamente.

---

### Escenario C: Problema con Rewrite (Menos Probable)

**Causa:** Aunque el rewrite parece correcto, puede haber un problema sutil

**Fix Alternativo (si el rewrite actual no funciona):**

#### C.1 Probar Rewrite Sin `/api` en Destination

**Cambio en `vercel.json`:**
```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://ivan-reseller-web-production.up.railway.app/:path*"
    }
  ]
}
```

**⚠️ ADVERTENCIA:** Esto NO funcionará porque el backend espera rutas con `/api` prefix.

#### C.2 Mantener Rewrite Actual (Recomendado)

El rewrite actual es correcto:
```json
{
  "source": "/api/:path*",
  "destination": "https://...railway.app/api/:path*"
}
```

**Razón:** 
- El backend monta todas las rutas con `/api` prefix
- El rewrite debe preservar el `/api` en el destino

---

## ✅ PASO 3: VALIDACIÓN FINAL

### Checklist de Validación

#### 3.1 Backend Directo

```bash
# Health endpoint
curl https://ivan-reseller-web-production.up.railway.app/api/health

# Resultado esperado: 200 OK
```

#### 3.2 Frontend en Producción

1. Abrir `https://www.ivanreseller.com` en modo incógnito
2. DevTools → Network → Filtrar "api"
3. Hacer login o navegar al Dashboard
4. Verificar:
   - ✅ Requests: `https://www.ivanreseller.com/api/...` (same-origin)
   - ✅ Status: 200 OK (no 502)
   - ✅ Response: JSON válido

#### 3.3 Endpoints Específicos

```bash
# Dashboard stats
curl https://www.ivanreseller.com/api/dashboard/stats

# Products
curl https://www.ivanreseller.com/api/products

# Health
curl https://www.ivanreseller.com/api/health
```

**Resultado esperado:** Todos deben responder 200 OK (o 401 si requieren auth)

---

## 📋 ARCHIVOS A MODIFICAR

### Si es Escenario A (Backend Caído)

**Archivos:** Ninguno (fix es en Railway Dashboard)

**Acciones:**
- Restart servicio en Railway
- Verificar/agregar variables de entorno
- Revisar logs

### Si es Escenario B (Dominio Incorrecto)

**Archivo:** `vercel.json`

**Cambio:**
```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://<DOMINIO_CORRECTO>/api/:path*"
    }
  ]
}
```

### Si es Escenario C (Problema con Rewrite)

**Archivo:** `vercel.json`

**Cambio:** Mantener rewrite actual (ya está correcto)

---

## 🎯 DEFINITION OF DONE (DoD)

### Criterios de Éxito

- [ ] Backend responde 200 OK en `curl https://...railway.app/api/health`
- [ ] Frontend en producción hace requests same-origin a `/api/*`
- [ ] Requests desde frontend responden 200 OK (no 502)
- [ ] Dashboard carga datos correctamente
- [ ] No hay errores CORS en consola
- [ ] Logs de Railway no muestran errores críticos

### Validación en Producción

1. **Backend directo:**
   ```bash
   curl https://ivan-reseller-web-production.up.railway.app/api/health
   # Debe responder: {"status":"healthy",...}
   ```

2. **Frontend proxy:**
   - Abrir `https://www.ivanreseller.com`
   - DevTools → Network → Filtrar "api"
   - Verificar que requests sean same-origin y respondan 200 OK

3. **Endpoints críticos:**
   - `/api/health` → 200 OK
   - `/api/dashboard/stats` → 200 OK (o 401 si requiere auth)
   - `/api/products` → 200 OK (o 401 si requiere auth)

---

## 🔄 FLUJO DE EJECUCIÓN RECOMENDADO

### Orden de Ejecución

1. **Diagnóstico (Paso 1):**
   - Verificar estado del backend en Railway
   - Probar backend directamente con `curl`
   - Verificar dominio público
   - Verificar variables de entorno

2. **Corrección (Paso 2):**
   - Según diagnóstico, aplicar fix correspondiente:
     - Si backend caído → Restart + verificar logs
     - Si dominio incorrecto → Actualizar `vercel.json`
     - Si problema con rewrite → Mantener actual (ya está correcto)

3. **Validación (Paso 3):**
   - Probar backend directo
   - Probar frontend en producción
   - Verificar endpoints críticos

---

## ⚠️ NOTAS IMPORTANTES

### 1. Rewrite de Vercel

El rewrite actual es **correcto**:
```json
{
  "source": "/api/:path*",
  "destination": "https://...railway.app/api/:path*"
}
```

**Explicación:**
- `source: "/api/:path*"` captura `/api/dashboard/stats`
- `:path*` captura `dashboard/stats` (sin `/api/`)
- `destination: "https://...railway.app/api/:path*"` reemplaza `:path*` con `dashboard/stats`
- **Resultado:** `https://...railway.app/api/dashboard/stats` ✅

**NO cambiar a:**
```json
{
  "destination": "https://...railway.app/:path*"  // ❌ Esto quitaría /api
}
```

### 2. Backend Espera Rutas con `/api` Prefix

Todas las rutas están montadas con `/api`:
- `app.use('/api/dashboard', dashboardRoutes)`
- `app.use('/api/products', productRoutes)`
- etc.

Por lo tanto, el rewrite debe preservar `/api` en el destino.

### 3. Railway PORT

Railway inyecta automáticamente `PORT` en las variables de entorno. El servidor debe usar `process.env.PORT` (ya lo hace en `server.ts` línea 19).

---

## 📝 PRÓXIMOS PASOS

1. ✅ Ejecutar diagnóstico (Paso 1)
2. ✅ Aplicar corrección según diagnóstico (Paso 2)
3. ✅ Validar fix (Paso 3)
4. ✅ Documentar resultado en este archivo

---

**Última actualización:** 2025-12-26  
**Estado:** ⏳ Pendiente ejecución de diagnóstico y corrección


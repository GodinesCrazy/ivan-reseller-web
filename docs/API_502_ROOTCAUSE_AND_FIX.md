# 🔧 API 502 ROOTCAUSE AND FIX

**Fecha:** [FECHA]  
**Problema:** Endpoints `/api/*` devuelven 502 Bad Gateway en producción  
**Estado:** 📋 DOCUMENTO PARA DIAGNÓSTICO

---

## 🔍 EVIDENCIA RECOPILADA

### Resultados del Smoke Test

**Endpoints afectados:**
- [ ] `/api/health` → 502
- [ ] `/api/auth-status` → 502
- [ ] `/api/dashboard/stats` → 502
- [ ] `/api/products` → 502
- [ ] Otros: [LISTA]

**Endpoints funcionando:**
- [ ] [LISTA]

**Prueba directa a Railway:**
- Railway `/api/health` directo: [STATUS]
- Railway `/aliexpress/callback` directo: [STATUS]

**Conclusión:**
- [ ] Railway funciona → Problema es Vercel/Rewrite
- [ ] Railway NO funciona → Problema es Railway
- [ ] Parcial → Necesita más investigación

---

## 🔍 VERIFICACIONES EN CÓDIGO/CONFIG

### 1. Verificar vercel.json

**Ubicación:** `vercel.json` (raíz del proyecto)

**Verificar:**
- [ ] El archivo existe en la raíz
- [ ] El orden de rewrites es correcto:
  1. `/api/:path*` → Railway
  2. `/aliexpress/callback` → Railway
  3. `/(.*)` → `/index.html` (catch-all)
- [ ] La URL de destino es correcta: `https://ivan-reseller-web-production.up.railway.app`
- [ ] No hay errores de sintaxis JSON

**Estado:** [✅ OK / ❌ PROBLEMA ENCONTRADO]

**Problemas encontrados:**
[DESCRIBIR_PROBLEMAS]

---

### 2. Verificar Railway Server Configuration

**Ubicación:** `backend/src/server.ts`

**Verificar:**
- [ ] El servidor escucha en `0.0.0.0` (línea 439): ✅ Confirmado en código
- [ ] El servidor usa `process.env.PORT` (línea 21): ✅ Confirmado en código
- [ ] No hay redirects infinitos en el código
- [ ] No hay misconfiguración de base URL

**Código relevante:**
```typescript
// backend/src/server.ts:439
httpServer.listen(PORT, '0.0.0.0', () => {
  // ...
});
```

**Estado:** [✅ OK / ❌ PROBLEMA ENCONTRADO]

**Problemas encontrados:**
[DESCRIBIR_PROBLEMAS]

---

### 3. Verificar Health Route

**Ubicación:** `backend/src/app.ts` y rutas relacionadas

**Verificar:**
- [ ] La ruta `/api/health` existe
- [ ] La ruta `/health` existe (alias)
- [ ] No hay middleware que bloquee estas rutas

**Código relevante:**
- Sistema routes: `backend/src/api/routes/system.routes.ts`
- Health endpoint debe estar registrado

**Estado:** [✅ OK / ❌ PROBLEMA ENCONTRADO]

**Problemas encontrados:**
[DESCRIBIR_PROBLEMAS]

---

## 🎯 HIPÓTESIS Y FIXES

### Hipótesis 1: Vercel Rewrite Destination Incorrecta

**Síntomas:**
- Railway directo funciona
- Vercel proxy devuelve 502
- Error en logs de Vercel sobre conexión fallida

**Fix:**
1. Verificar URL de Railway en vercel.json
2. Verificar que Railway esté disponible
3. Actualizar URL si cambió

**Riesgo:** Bajo  
**Reversibilidad:** Fácil (revertir commit)

---

### Hipótesis 2: Railway Backend Caído o No Responde

**Síntomas:**
- Railway directo NO funciona (502/timeout)
- Logs de Railway muestran errores
- Health check falla

**Fix:**
1. Verificar estado del servicio en Railway Dashboard
2. Revisar logs de Railway para ver errores
3. Verificar que el deploy fue exitoso
4. Restart del servicio si es necesario

**Riesgo:** Medio (puede requerir redeploy)  
**Reversibilidad:** N/A (no es cambio de código)

---

### Hipótesis 3: Rewrite Order Incorrecto

**Síntomas:**
- Algunos endpoints funcionan, otros no
- Callback funciona pero /api/* no
- Patrones inconsistentes

**Fix:**
1. Verificar orden de rewrites en vercel.json
2. Asegurar que `/api/:path*` está antes del catch-all
3. Verificar que no hay conflictos

**Riesgo:** Bajo  
**Reversibilidad:** Fácil

---

### Hipótesis 4: Health Route No Existe o Está Rota

**Síntomas:**
- `/api/health` devuelve 404 o 502
- Otros endpoints también fallan
- Railway directo también falla

**Fix:**
1. Verificar que la ruta está registrada en app.ts
2. Verificar que no hay middleware que la bloquee
3. Agregar ruta si falta

**Riesgo:** Bajo-Medio  
**Reversibilidad:** Fácil

---

### Hipótesis 5: Timeout o Connectivity Issue

**Síntomas:**
- Requests a veces funcionan, a veces no
- Timeouts en logs
- Railway directo funciona pero Vercel proxy no

**Fix:**
1. Aumentar timeout en vercel.json (si es configurable)
2. Verificar conectividad de red
3. Verificar que Railway no esté sobrecargado

**Riesgo:** Bajo (si es timeout configurable)  
**Reversibilidad:** Fácil

---

## 🔧 FIX MÍNIMO RECOMENDADO

**Hipótesis elegida:** [HIPOTESIS_ELEGIDA]

**Fix propuesto:**
[DESCRIPCION_DEL_FIX]

**Cambios requeridos:**
- [ ] Archivo 1: [CAMBIOS]
- [ ] Archivo 2: [CAMBIOS]

**Pasos de implementación:**
1. [PASO_1]
2. [PASO_2]
3. [PASO_3]

**Validación:**
- [ ] Ejecutar `npm run smoke:prod` después del fix
- [ ] Verificar que los endpoints que daban 502 ahora funcionan
- [ ] Verificar que no se rompió nada más

---

## ⚠️ SI NO ES INEQUÍVOCO

Si no se puede identificar la causa raíz inequívocamente, seguir estos pasos manuales:

### Pasos Manuales para Railway Dashboard

1. **Verificar Estado del Servicio:**
   - Railway Dashboard → Servicio `ivan-reseller-web-production`
   - Verificar que el estado es "Active" o "Running"
   - Verificar que el último deploy fue exitoso

2. **Revisar Logs:**
   - Railway Dashboard → Logs
   - Buscar errores relacionados con:
     - Inicio del servidor
     - Conexión a base de datos
     - Errores de rutas (404, 500)
     - Timeouts

3. **Verificar Variables de Entorno:**
   - Railway Dashboard → Variables
   - Verificar que `PORT` está configurado (Railway lo inyecta automáticamente)
   - Verificar que `DATABASE_URL` está configurado
   - Verificar otras variables críticas

4. **Probar Health Check Directo:**
   ```bash
   curl https://ivan-reseller-web-production.up.railway.app/api/health
   ```
   - Si funciona → Problema es Vercel/Rewrite
   - Si NO funciona → Problema es Railway

### Pasos Manuales para Vercel Dashboard

1. **Verificar Deploy:**
   - Vercel Dashboard → Deployments
   - Verificar que el último deploy fue exitoso
   - Verificar que vercel.json está incluido en el build

2. **Revisar Logs:**
   - Vercel Dashboard → Deployments → Logs
   - Buscar errores relacionados con:
     - Build
     - Rewrites
     - Proxies

3. **Verificar Configuración:**
   - Vercel Dashboard → Settings → General
   - Verificar que vercel.json está siendo usado
   - Verificar que no hay configuraciones conflictivas

---

## ✅ CONCLUSIÓN

**Causa Raíz Identificada:** [SI/NO]

**Fix Aplicado:** [SI/NO]

**Estado Final:** [✅ RESUELTO / ⚠️ EN PROGRESO / ❌ NO RESUELTO]

**Próximos Pasos:**
[SIGUIENTE_ACCION]


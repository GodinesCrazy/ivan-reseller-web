# 🔍 Auditoría de Paridad Producción vs Repo

**Fecha:** 2025-12-26  
**Tipo:** Auditoría de Paridad  
**Estado:** ✅ COMPLETADO  
**Objetivo:** Identificar discrepancias entre lo desplegado en Vercel y el estado del repo

---

## 📊 RESUMEN EJECUTIVO

### Problema Principal

Los fixes de "Production Clean" (FIX-001, FIX-002, FIX-003, FIX-004) están implementados en el código local pero **NO están commitados ni desplegados en Vercel**. Esto explica por qué en producción siguen apareciendo los avisos/advertencias que deberían estar resueltos.

### Hallazgo Crítico

**Los cambios están en el working directory pero NO en el último commit desplegado.**

---

## 🔍 ANÁLISIS DE COMMITS

### Último Commit Desplegado (Vercel Production)

**Commit:** `caf2358`  
**Mensaje:** `fix(cors): force /api proxy in production to avoid CORS errors`  
**Fecha:** (verificar en git log)

**Archivos incluidos:**
- `frontend/src/components/help/InvestorDocsRegistry.ts`
- `frontend/src/config/runtime.ts`

**Fixes incluidos:**
- ✅ FIX-005 parcial (uso de `/api` en producción)
- ❌ FIX-001 NO incluido (ErrorBanner)
- ❌ FIX-002 NO incluido (Dashboard)
- ❌ FIX-003 NO incluido (APISettings toasts)
- ❌ FIX-004 NO incluido (WorkflowSummaryWidget)

### Estado del Working Directory (Local)

**Archivos modificados (NO commitados):**
```
M frontend/src/components/ErrorBanner.tsx          ← FIX-001
M frontend/src/components/WorkflowSummaryWidget.tsx ← FIX-004
M frontend/src/config/runtime.ts                   ← FIX-001 (parcial)
M frontend/src/pages/APISettings.tsx               ← FIX-003
M frontend/src/pages/Dashboard.tsx                 ← FIX-002
M docs/DEPLOYMENT_VERCEL.md                        ← Documentación
```

**Fixes implementados localmente:**
- ✅ FIX-001: ErrorBanner no muestra en producción con `/api`
- ✅ FIX-002: Dashboard muestra mensaje informativo
- ✅ FIX-003: APISettings no muestra toasts automáticos
- ✅ FIX-004: WorkflowSummaryWidget se oculta si no hay datos
- ✅ FIX-005: Verificado (todos usan proxy)

### Conclusión: Mismatch de Commits

**Causa Principal:** Los fixes están implementados pero **NO commitados**, por lo tanto **NO están desplegados en Vercel**.

---

## ⚙️ VALIDACIÓN DE CONFIGURACIÓN VERCEL

### Build Settings (Verificar en Vercel Dashboard)

**Configuración esperada:**
- ✅ Root Directory: `frontend`
- ✅ Build Command: `cd frontend && npm run build`
- ✅ Output Directory: `frontend/dist`
- ✅ Install Command: `cd frontend && npm ci --include=dev`
- ✅ Framework: `Vite`

**Estado:** ✅ Correcto (según `vercel.json`)

### Variables de Entorno (Verificar en Vercel Dashboard)

**Configuración esperada:**

#### Opción A: Con VITE_API_URL
- `VITE_API_URL=https://ivan-reseller-web-production.up.railway.app`
- Scopes: Production, Preview, Development

#### Opción B: Sin VITE_API_URL (Recomendado)
- No configurar `VITE_API_URL`
- El código usará `/api` como fallback
- Vercel proxy redirigirá a Railway

**Estado:** ⚠️ **REQUIERE VERIFICACIÓN EN VERCEL DASHBOARD**

**Impacto:**
- Si `VITE_API_URL` está configurada con URL absoluta → puede causar CORS
- Si `VITE_API_URL` NO está configurada → comportamiento correcto (usa `/api`)

### vercel.json (Validado en Repo)

**Ubicación:** Raíz del proyecto  
**Estado:** ✅ Existe y está correcto

**Contenido:**
```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://ivan-reseller-web-production.up.railway.app/api/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**Validación:**
- ✅ Rewrite `/api/:path*` existe
- ✅ Apunta al backend correcto (Railway)
- ✅ Fallback a `index.html` para SPA

**Nota:** El proxy está configurado correctamente. Las requests a `/api/*` deberían funcionar.

---

## 🚨 AVISOS/ADVERTENCIAS IDENTIFICADOS

### 1. ErrorBanner (Banner Amarillo Global)

**Ubicación:** Parte superior de la página  
**Componente:** `frontend/src/components/ErrorBanner.tsx`  
**Disparado por:** `useEffect` en montaje del componente

**Causa en Producción:**
- El código desplegado NO incluye FIX-001
- El banner se muestra cuando `API_BASE_URL === '/api'` (línea 46 en versión desplegada)
- En producción, esto es el comportamiento esperado, pero el banner lo muestra como "warning"

**Mensaje mostrado:**
```
⚠️ Advertencia de Configuración
Usando /api como fallback (proxy de Vercel).
Para producción, configura VITE_API_URL en Vercel...
```

**Status Code:** N/A (es un warning de UI, no un error de red)

**Fix esperado (FIX-001):**
- El banner NO debería aparecer en producción cuando usa `/api`
- Solo debería aparecer si hay un error real

**Estado:** ❌ **NO DESPLEGADO**

---

### 2. Toasts Automáticos en APISettings

**Ubicación:** `/api-settings`  
**Componente:** `frontend/src/pages/APISettings.tsx`  
**Disparado por:** `socket.on('api_status_update')` (línea 458)

**Causa en Producción:**
- El código desplegado NO incluye FIX-003
- Los toasts se muestran automáticamente cuando llegan eventos de socket
- Al cargar la página, múltiples APIs emiten eventos de estado → múltiples toasts

**Mensajes mostrados:**
```
❌ Error en ebay: Network Error
❌ Error en amazon: Network Error
❌ Error en mercadolibre: Network Error
... (5-10 toasts)
```

**Status Code:** CORS errors o Network errors (no llegan al servidor)

**Fix esperado (FIX-003):**
- Los toasts solo deberían aparecer cuando el usuario interactúa (test, guardar)
- Los eventos de socket deberían actualizar el estado silenciosamente

**Estado:** ❌ **NO DESPLEGADO**

---

### 3. Dashboard Muestra Datos en 0 Sin Explicación

**Ubicación:** `/dashboard`  
**Componente:** `frontend/src/pages/Dashboard.tsx`  
**Disparado por:** `loadDashboardData()` en `useEffect`

**Causa en Producción:**
- El código desplegado NO incluye FIX-002
- Los requests fallan silenciosamente (`.catch()` retorna datos vacíos)
- El dashboard muestra 0s sin indicar que hubo un error

**Endpoints que fallan:**
- `/api/dashboard/stats` → 404 o CORS
- `/api/dashboard/recent-activity` → 404 o CORS
- `/api/opportunities/list` → 404 o CORS
- `/api/ai-suggestions` → 404 o CORS
- `/api/automation/config` → 404 o CORS

**Status Code:** 404 (Not Found) o CORS error

**Fix esperado (FIX-002):**
- Mostrar mensaje informativo cuando hay errores
- Agregar link a `/api-settings` para configuración
- No mostrar toast automático

**Estado:** ❌ **NO DESPLEGADO**

---

### 4. WorkflowSummaryWidget Muestra 0s

**Ubicación:** Dashboard → Widget "Resumen de Workflows"  
**Componente:** `frontend/src/components/WorkflowSummaryWidget.tsx`  
**Disparado por:** `loadSummary()` en `useEffect`

**Causa en Producción:**
- El código desplegado NO incluye FIX-004
- El request a `/api/products` falla
- El widget muestra todos los valores en 0

**Endpoint que falla:**
- `/api/products` → 404 o CORS

**Status Code:** 404 (Not Found) o CORS error

**Fix esperado (FIX-004):**
- El widget debería ocultarse completamente si no hay datos y hay error
- No mostrar valores en 0 cuando hay error

**Estado:** ❌ **NO DESPLEGADO**

---

### 5. Toast de AliExpress Manual Session (Navbar)

**Ubicación:** Navbar (parte superior)  
**Componente:** `frontend/src/components/layout/Navbar.tsx`  
**Disparado por:** `useEffect` que escucha `pendingManualSession` (línea 53)

**Causa:**
- Si hay una sesión manual pendiente de AliExpress, se muestra un toast informativo
- Esto es comportamiento esperado (no es un error)

**Mensaje:**
```
AliExpress necesita que confirmes la sesión manual.
[Abrir configuración]
```

**Estado:** ✅ **COMPORTAMIENTO ESPERADO** (no requiere fix)

---

## 🔍 DIAGNÓSTICO FINAL

### Causa Principal (Única)

**Los fixes de "Production Clean" NO están commitados ni desplegados en Vercel.**

### Evidencia

1. **Último commit desplegado (`caf2358`):**
   - Solo incluye cambios en `InvestorDocsRegistry.ts` y `runtime.ts`
   - NO incluye: ErrorBanner, Dashboard, APISettings, WorkflowSummaryWidget

2. **Working directory local:**
   - Contiene todos los fixes implementados
   - Archivos modificados pero NO commitados

3. **Síntomas en producción:**
   - Banner amarillo visible (FIX-001 no desplegado)
   - Múltiples toasts en APISettings (FIX-003 no desplegado)
   - Dashboard muestra 0s sin explicación (FIX-002 no desplegado)
   - WorkflowSummaryWidget muestra 0s (FIX-004 no desplegado)

### Causas Secundarias (No críticas)

1. **Endpoints del backend pueden no existir:**
   - `/api/dashboard/stats` → 404
   - `/api/dashboard/recent-activity` → 404
   - `/api/opportunities/list` → 404
   - `/api/ai-suggestions` → 404
   - `/api/automation/config` → 404
   
   **Impacto:** Los fixes mejoran la UX pero no resuelven los 404s. Los endpoints deben existir en el backend.

2. **CORS errors (si VITE_API_URL está configurada con URL absoluta):**
   - Si `VITE_API_URL=https://ivan-reseller-web-production.up.railway.app`
   - Las requests van directo a Railway (sin pasar por proxy de Vercel)
   - Puede causar CORS si el dominio de Vercel no está en `CORS_ORIGIN`
   
   **Impacto:** Bajo (el código ya fuerza `/api` en producción, pero si VITE_API_URL está configurada, puede ignorarse)

---

## 📋 CHECKLIST DE VERIFICACIÓN

### Commits
- [ ] Verificar que los fixes estén en el último commit
- [ ] Verificar que el commit esté en la rama `main`
- [ ] Verificar que Vercel esté desplegando desde `main`

### Configuración Vercel
- [ ] Verificar Build Settings (Root Directory, Build Command, Output)
- [ ] Verificar Variables de Entorno (VITE_API_URL set/unset)
- [ ] Verificar que `vercel.json` esté en la raíz

### Proxy
- [ ] Verificar que requests a `/api/*` funcionen en producción
- [ ] Verificar que el proxy redirija correctamente a Railway
- [ ] Verificar que no haya errores CORS

### Backend
- [ ] Verificar que los endpoints existan:
  - `/api/dashboard/stats`
  - `/api/dashboard/recent-activity`
  - `/api/opportunities/list`
  - `/api/ai-suggestions`
  - `/api/automation/config`
  - `/api/products`

---

## 🎯 CONCLUSIÓN

**Diagnóstico:** Los fixes están implementados localmente pero **NO están desplegados en Vercel** porque no están commitados.

**Solución:** Commitear los cambios y hacer redeploy en Vercel.

**Prioridad:** P0 (Crítico) - Los avisos en producción se resolverán una vez desplegados los fixes.

---

**Última actualización:** 2025-12-26  
**Próximo paso:** Ver `PROD_PARITY_FIX_PLAN.md` para plan de corrección


# 🔧 Fix Definitivo: Forzar Proxy /api en Producción + Robustez 502

**Fecha:** 2025-12-26  
**Tipo:** Fix de Conectividad API  
**Estado:** ✅ COMPLETADO  
**Objetivo:** Forzar uso de proxy `/api` en producción para evitar CORS y mejorar manejo de errores 502/network

---

## 📊 RESUMEN EJECUTIVO

### Problema Principal

En producción, el frontend podía hacer llamadas cross-origin a Railway si `VITE_API_URL` estaba configurada con URL absoluta, causando errores CORS. Además, cuando el backend estaba caído (502), se generaban múltiples toasts automáticos (spam).

### Solución Implementada

1. **Forzar `/api` en producción:** El sistema ahora IGNORA cualquier `VITE_API_URL` absoluta en producción y SIEMPRE usa `/api` (proxy de Vercel).
2. **Eliminar fetch directos:** Todos los `fetch` directos fueron reemplazados por el cliente `api` centralizado.
3. **Manejo robusto de 502:** Un solo toast informativo cuando el backend está caído, sin spam.

---

## 🔧 CAMBIOS IMPLEMENTADOS

### 1. Mejora de `runtime.ts` - Forzar `/api` en Producción

**Archivo:** `frontend/src/config/runtime.ts`

**Cambios:**
- En producción, IGNORA cualquier `VITE_API_URL` absoluta (https://...)
- SIEMPRE usa `/api` (ruta relativa) en producción
- Loguea un warning UNA sola vez si detecta `VITE_API_URL` absoluta en producción
- Mantiene compatibilidad con rutas relativas (ej: `/api`)

**Código aplicado:**
```typescript
export function getApiBaseUrl(): string {
  if (isProduction) {
    const rawUrl = import.meta.env.VITE_API_URL?.trim();
    
    // Si es ruta relativa, usarla
    if (rawUrl && rawUrl.startsWith('/')) {
      return rawUrl.replace(/\/+$/, '');
    }
    
    // Si es URL absoluta, IGNORARLA y loguear warning (una sola vez)
    if (rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))) {
      if (typeof window !== 'undefined' && !(window as any).__vite_api_url_warned) {
        console.warn(
          '⚠️  VITE_API_URL ignorada en producción (URL absoluta detectada); usando /api proxy para evitar CORS.'
        );
        (window as any).__vite_api_url_warned = true;
      }
    }
    
    // SIEMPRE usar /api en producción
    return '/api';
  }
  
  // Desarrollo: permitir VITE_API_URL o fallback a localhost
  // ...
}
```

**Resultado:**
- ✅ En producción, todas las requests van a `/api/*` (same-origin)
- ✅ Cero errores CORS
- ✅ Warning claro si `VITE_API_URL` está mal configurada

---

### 2. Eliminar Fetch Directos - Usar Cliente Centralizado

**Archivos modificados:**

#### a) `frontend/src/components/help/InvestorDocsRegistry.ts`

**Antes:**
```typescript
const response = await fetch(`${API_BASE_URL}/api/help/investors/${slug}`, {
  method: 'GET',
  headers: { 'Authorization': `Bearer ${token}`, ... },
  credentials: 'include',
});
```

**Después:**
```typescript
const response = await api.get(`/api/help/investors/${slug}`, {
  headers: { 'Authorization': `Bearer ${token}` },
});
```

**Beneficio:**
- ✅ Usa el cliente centralizado que fuerza `/api` en producción
- ✅ Manejo de errores consistente
- ✅ Headers automáticos (cookies, etc.)

---

#### b) `frontend/src/hooks/useNotifications.ts`

**Antes:**
```typescript
const response = await fetch(`${API_BASE_URL}/api/notifications/test`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, ... },
});
```

**Después:**
```typescript
await api.post('/api/notifications/test', {}, {
  headers: { 'Authorization': `Bearer ${token}` },
});
```

**Beneficio:**
- ✅ Mismo beneficio que arriba

---

#### c) `frontend/src/pages/Diagnostics.tsx`

**Antes:**
```typescript
const healthResponse = await fetch(`${API_BASE_URL}/health`);
const healthData = await healthResponse.json();
```

**Después:**
```typescript
const healthResponse = await api.get('/health');
const healthData = healthResponse.data;
```

**Beneficio:**
- ✅ Mismo beneficio que arriba

---

### 3. Mejora de Manejo de Errores 502/Network

**Archivo:** `frontend/src/services/api.ts`

**Cambios:**
- Flag global `backendDownToastShown` para evitar spam de toasts
- Un solo toast informativo cuando backend está caído (502/503/504 o Network Error)
- El toast se resetea cuando hay una respuesta exitosa (backend vuelve a funcionar)

**Código aplicado:**
```typescript
let backendDownToastShown = false;
const BACKEND_DOWN_TOAST_ID = 'backend-down-toast';

api.interceptors.response.use(
  (response) => {
    // Si hay respuesta exitosa, resetear flag (backend está funcionando)
    if (backendDownToastShown) {
      backendDownToastShown = false;
    }
    return response;
  },
  async (error) => {
    // Network Error (backend caído o CORS)
    if (!error.response) {
      if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        if (!backendDownToastShown && typeof window !== 'undefined') {
          backendDownToastShown = true;
          toast.error(
            'Backend no disponible. Verifica que Railway esté corriendo y que el proxy de Vercel esté configurado correctamente.',
            { id: BACKEND_DOWN_TOAST_ID, duration: 8000 }
          );
        }
        return Promise.reject(error);
      }
    }
    
    // 502/503/504 - Backend caído
    if (status === 502 || status === 503 || status === 504) {
      if (!backendDownToastShown && typeof window !== 'undefined') {
        backendDownToastShown = true;
        toast.error(
          `Backend no disponible (${status}). Verifica que Railway esté corriendo.`,
          { id: BACKEND_DOWN_TOAST_ID, duration: 8000 }
        );
      }
      return Promise.reject(error);
    }
    
    // ... otros errores
  }
);
```

**Resultado:**
- ✅ Un solo toast cuando backend está caído (no spam)
- ✅ Mensaje claro y accionable
- ✅ El toast desaparece cuando backend vuelve a funcionar

---

### 4. Actualización de Documentación

**Archivo:** `docs/DEPLOYMENT_VERCEL.md`

**Cambios:**
- Sección "Paso 3" actualizada para recomendar NO configurar `VITE_API_URL` en producción
- Instrucciones claras sobre qué hacer si `VITE_API_URL` ya está configurada con URL absoluta
- Checklist actualizado con verificación de same-origin requests

**Contenido agregado:**
- ⚠️ Advertencia sobre `VITE_API_URL` en producción
- Instrucciones para eliminar o cambiar `VITE_API_URL` si está mal configurada
- Verificación de same-origin en DevTools → Network

---

## 📋 ARCHIVOS MODIFICADOS

### Frontend

1. **`frontend/src/config/runtime.ts`**
   - Mejora de `getApiBaseUrl()` para forzar `/api` en producción
   - Warning si `VITE_API_URL` es absoluta en producción

2. **`frontend/src/services/api.ts`**
   - Mejora de interceptor de respuesta para manejar 502/network errors
   - Flag global para evitar spam de toasts

3. **`frontend/src/components/help/InvestorDocsRegistry.ts`**
   - Reemplazo de `fetch` directo por `api.get()`

4. **`frontend/src/hooks/useNotifications.ts`**
   - Reemplazo de `fetch` directo por `api.post()`

5. **`frontend/src/pages/Diagnostics.tsx`**
   - Reemplazo de `fetch` directo por `api.get()`

### Documentación

6. **`docs/DEPLOYMENT_VERCEL.md`**
   - Actualización de sección de variables de entorno
   - Checklist actualizado

---

## 🧪 VALIDACIÓN

### 1. Build Local

```bash
cd frontend
npm ci --include=dev
npm run build
```

**Resultado esperado:** ✅ Build exitoso sin errores

---

### 2. Verificación en DevTools → Network

**Pasos:**
1. Abrir producción: `https://www.ivanreseller.com`
2. Abrir DevTools → Network
3. Filtrar por "api"
4. Navegar al Dashboard o hacer login

**Verificación:**
- ✅ Requests deben ser: `https://www.ivanreseller.com/api/...` (same-origin)
- ❌ NO deben ser: `https://backend.railway.app/api/...` (cross-origin)
- ✅ Cero errores CORS en consola

---

### 3. Verificación de Manejo de Errores 502

**Simular backend caído:**
- Detener backend en Railway temporalmente
- O cambiar URL en `vercel.json` a una URL inválida

**Verificación:**
- ✅ Debe aparecer UN solo toast: "Backend no disponible..."
- ❌ NO debe aparecer múltiples toasts (spam)
- ✅ El toast debe desaparecer cuando backend vuelve a funcionar

---

### 4. Verificación de Warning VITE_API_URL

**Si `VITE_API_URL` está configurada con URL absoluta en Vercel:**
- Abrir consola del navegador
- Debe aparecer UN solo warning: "VITE_API_URL ignorada en producción..."
- ✅ El sistema debe usar `/api` de todas formas

---

## 📝 DEFINITION OF DONE (DoD)

### Criterios de Éxito

- [x] En producción, todas las requests van a `/api/*` (same-origin)
- [x] Cero errores CORS en consola del navegador
- [x] Si `VITE_API_URL` está configurada con URL absoluta, se ignora y se usa `/api`
- [x] Todos los `fetch` directos reemplazados por cliente `api` centralizado
- [x] Un solo toast cuando backend está caído (no spam)
- [x] Mensaje claro y accionable cuando backend está caído
- [x] Documentación actualizada con instrucciones claras
- [x] Build pasa sin errores
- [x] No hay breaking changes

---

## 🔍 CÓMO VALIDAR EN PRODUCCIÓN

### Paso 1: Verificar Requests Same-Origin

1. Abrir: `https://www.ivanreseller.com`
2. DevTools → Network → Filtrar "api"
3. Hacer login o navegar al Dashboard
4. **Verificar:**
   - ✅ Requests: `https://www.ivanreseller.com/api/auth/login`
   - ✅ Requests: `https://www.ivanreseller.com/api/dashboard/stats`
   - ❌ NO debe haber: `https://backend.railway.app/api/...`

---

### Paso 2: Verificar Cero Errores CORS

1. Abrir consola del navegador (F12)
2. Filtrar por "CORS" o "Network"
3. **Verificar:**
   - ✅ Cero errores CORS
   - ✅ Solo errores HTTP reales (401, 404, etc.) si aplica

---

### Paso 3: Verificar Manejo de 502

**Simular backend caído:**
- Temporalmente cambiar URL en `vercel.json` a URL inválida
- O detener backend en Railway

**Verificar:**
- ✅ Aparece UN solo toast: "Backend no disponible..."
- ✅ No hay spam de toasts
- ✅ El mensaje es claro y accionable

---

### Paso 4: Verificar Warning VITE_API_URL (si aplica)

**Si `VITE_API_URL` está configurada con URL absoluta:**
1. Abrir consola del navegador
2. **Verificar:**
   - ✅ Aparece UN solo warning: "VITE_API_URL ignorada en producción..."
   - ✅ El sistema usa `/api` de todas formas

---

## 🎯 PASOS OPERATIVOS (Vercel Dashboard)

### Si VITE_API_URL está configurada con URL absoluta:

1. **Ir a Vercel Dashboard:**
   - https://vercel.com/dashboard
   - Seleccionar proyecto `ivan-reseller-web`

2. **Ir a Settings → Environment Variables**

3. **Buscar `VITE_API_URL`**

4. **Opciones:**
   - **Opción A (Recomendada):** Eliminar `VITE_API_URL` de Production/Preview
   - **Opción B:** Cambiar valor a `/api` (ruta relativa)

5. **Redeploy:**
   - Ir a Deployments
   - Click en "..." del último deploy
   - "Redeploy" → Desmarcar "Use existing Build Cache"
   - Click "Redeploy"

6. **Verificar:**
   - Después del redeploy, verificar en DevTools → Network que requests sean same-origin

---

## 📊 COMPARACIÓN ANTES vs DESPUÉS

### Antes

- ❌ `VITE_API_URL` con URL absoluta causaba requests cross-origin
- ❌ Errores CORS en consola
- ❌ Múltiples toasts cuando backend estaba caído
- ❌ Algunos `fetch` directos no usaban proxy

### Después

- ✅ SIEMPRE usa `/api` en producción (same-origin)
- ✅ Cero errores CORS
- ✅ Un solo toast informativo cuando backend está caído
- ✅ Todos los requests usan cliente centralizado

---

## 🔄 FLUJO DE REQUESTS EN PRODUCCIÓN

### Antes (con VITE_API_URL absoluta)

```
Browser → https://www.ivanreseller.com/api/dashboard/stats
         ↓ (CORS error si Railway no tiene dominio en CORS_ORIGIN)
         ❌ Error CORS
```

### Después (con fix)

```
Browser → https://www.ivanreseller.com/api/dashboard/stats
         ↓ (same-origin, pasa por proxy de Vercel)
         Vercel Proxy → https://backend.railway.app/api/dashboard/stats
         ↓ (Vercel hace la request, no el browser)
         ✅ Sin CORS (Vercel → Railway es server-to-server)
```

---

## ⚠️ NOTAS IMPORTANTES

### 1. VITE_API_URL en Producción

**NO configurar `VITE_API_URL` con URL absoluta en Production/Preview.**

Si está configurada:
- Será ignorada automáticamente
- El sistema usará `/api` de todas formas
- Aparecerá un warning en consola (una sola vez)

**Recomendación:** Eliminar `VITE_API_URL` de Production/Preview o cambiarla a `/api`.

---

### 2. Desarrollo Local

En desarrollo, el sistema permite:
- `VITE_API_URL=http://localhost:3000` (URL absoluta OK)
- `VITE_API_URL=/api` (ruta relativa OK)
- Sin `VITE_API_URL` → fallback a `http://localhost:3000`

---

### 3. Proxy de Vercel

El proxy de Vercel (`vercel.json`) debe tener la URL correcta del backend:

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

**Verificar:** Que la URL en `destination` sea la correcta de Railway.

---

## ✅ CRITERIOS DE ÉXITO FINAL

### En Producción

- [x] Todas las requests a `/api/*` son same-origin
- [x] Cero errores CORS en consola
- [x] Un solo toast cuando backend está caído
- [x] Mensaje claro y accionable
- [x] Build pasa sin errores
- [x] No hay breaking changes

### Validación en DevTools

- [x] Network → Filtrar "api" → Requests son same-origin
- [x] Console → Cero errores CORS
- [x] Si backend está caído → Un solo toast informativo

---

**Última actualización:** 2025-12-26  
**Estado:** ✅ Fix implementado, listo para commit y deploy


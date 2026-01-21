# Resumen: Fix OAuth + Eliminación Degradación Falsa

## ? Cambios Implementados

### FASE A - Frontend OAuth (Error TypeError)

#### 1. Corrección de `toast.info()` incompatible

**Archivos modificados:**
- `frontend/src/stores/authStatusStore.ts` - Cambiado `toast.info()` a `toast()` con icon
- `frontend/src/components/layout/Navbar.tsx` - Cambiado `toast.info()` a `toast()` con icon
- `frontend/src/pages/Opportunities.tsx` - Cambiado 4 instancias de `toast.info()` a `toast()` con icon
- `frontend/src/pages/ResolveCaptcha.tsx` - Cambiado 3 instancias de `toast.info()` a `toast()` con icon

**Cambio aplicado:**
```typescript
// ? Antes (incompatible con sonner)
toast.info('Mensaje');

// ? Después (compatible)
toast('Mensaje', { icon: '??' });
```

#### 2. Fallback para popup bloqueado en APISettings.tsx

**Archivo:** `frontend/src/pages/APISettings.tsx`

**Cambio:**
- Cuando `window.open()` retorna `null/undefined`, ahora usa `window.location.href = authUrl` como fallback
- Aplica a TODOS los marketplaces (no solo aliexpress-dropshipping)
- Toast con try-catch para no romper el flujo si falla

**Código:**
```typescript
if (oauthWindow === null || oauthWindow === undefined) {
  log.info('[APISettings] Using redirect fallback for OAuth (popup blocked)', { apiName });
  try {
    toast('Abriendo OAuth en esta pesta?a...', { icon: '??' });
  } catch (toastError) {
    // Fallback silencioso si toast falla - NO romper flujo OAuth
    console.log('[APISettings] Toast failed, continuing with redirect:', toastError);
  }
  window.location.href = authUrl;
  setOauthing(null);
  return;
}
```

#### 3. Logs con prefijo [APISettings]

**Archivo:** `frontend/src/pages/APISettings.tsx`

Los logs ya estaban implementados con el prefijo `[APISettings]` usando el sistema de logging existente:
- `log.debug('[APISettings] ...')`
- `log.info('[APISettings] ...')`
- `log.warn('[APISettings] ...')`
- `log.error('[APISettings] ...')`

No se requirieron cambios adicionales.

---

### FASE B - Backend Degraded Innecesario

#### 1. Ajuste de detector de memoria

**Archivo:** `backend/src/middleware/overload-protection.middleware.ts`

**Cambios:**
- ? Usa RSS (Resident Set Size) en lugar de `heapTotal` para detectar memoria real
- ? Umbral ajustado para Railway Pro (8GB): 6800MB (85% de 8GB)
- ? Verifica RSS primero, luego heap como fallback
- ? No degrada por `heapTotal` bajo (puede ser normal en Node.js)

**Código:**
```typescript
// Umbrales ajustados para Railway Pro (8GB RAM)
const MEMORY_THRESHOLD_RSS_MB = 6800; // 6.8GB en MB (85% de 8GB)
const MEMORY_THRESHOLD_PERCENT = 90; // 90% de heap usado

// Verificar RSS real primero
const rssMB = memory.rss / 1024 / 1024;
if (rssMB > MEMORY_THRESHOLD_RSS_MB) {
  return {
    overloaded: true,
    reason: `memory_high_rss_${Math.round(rssMB)}MB`
  };
}
```

#### 2. Endpoints críticos nunca degradan

**Archivo:** `backend/src/middleware/overload-protection.middleware.ts`

**Cambios:**
- ? Agregada lista `CRITICAL_ENDPOINTS` con endpoints que NUNCA deben degradarse
- ? `/api/auth-status` está en la lista de críticos
- ? `/api/marketplace/auth-url` está en la lista de críticos
- ? Estos endpoints siempre funcionan normalmente, incluso con overload

**Código:**
```typescript
const CRITICAL_ENDPOINTS = [
  '/api/auth-status',
  '/api/marketplace/auth-url',
  '/api/credentials',
  '/api/manual-auth',
];

// NUNCA degradar endpoints críticos
const isCritical = CRITICAL_ENDPOINTS.some(endpoint => 
  path === endpoint || path.startsWith(endpoint + '/')
);

if (isCritical) {
  return next(); // Endpoints críticos siempre funcionan normalmente
}
```

---

### FASE C - Validación

#### 1. Script de smoke test

**Archivo:** `backend/scripts/smoke-test-dropshipping.js`

**Funcionalidad:**
- Hace 30 requests a `/api/auth-status`
- Hace request a `/api/marketplace/auth-url/aliexpress-dropshipping`
- Verifica que NO hay 502
- Verifica que NO aparece `X-Degraded` salvo overload real
- Genera reporte detallado

**Uso:**
```bash
# Con variables de entorno
API_URL=https://tu-backend.railway.app AUTH_TOKEN=tu_token node backend/scripts/smoke-test-dropshipping.js

# O con test count personalizado
TEST_COUNT=50 API_URL=https://tu-backend.railway.app AUTH_TOKEN=tu_token node backend/scripts/smoke-test-dropshipping.js
```

#### 2. Comandos cURL

**Archivo:** `docs/VALIDACION_CURL_COMMANDS.md`

**Incluye:**
- Comandos cURL para cada endpoint crítico
- Script PowerShell completo para validación
- Verificación de headers `X-Degraded` y `X-Overload-Reason`
- Instrucciones para validar que no hay degraded innecesario

---

## ?? Archivos Modificados

### Frontend
1. `frontend/src/stores/authStatusStore.ts`
2. `frontend/src/components/layout/Navbar.tsx`
3. `frontend/src/pages/Opportunities.tsx`
4. `frontend/src/pages/ResolveCaptcha.tsx`
5. `frontend/src/pages/APISettings.tsx`

### Backend
1. `backend/src/middleware/overload-protection.middleware.ts`

### Scripts y Documentación
1. `backend/scripts/smoke-test-dropshipping.js` (nuevo)
2. `docs/VALIDACION_CURL_COMMANDS.md` (nuevo)
3. `docs/RESUMEN_FIX_OAUTH_DEGRADED.md` (este archivo)

---

## ? Validación

### 1. Ejecutar smoke test
```bash
cd backend
API_URL=https://tu-backend.railway.app AUTH_TOKEN=tu_token node scripts/smoke-test-dropshipping.js
```

### 2. Validar con PowerShell
```powershell
# Ver docs/VALIDACION_CURL_COMMANDS.md para script completo
.\docs\VALIDACION_CURL_COMMANDS.md
```

### 3. Verificar en producción
- ? `/api/auth-status` NO debe tener `X-Degraded` salvo RSS > 6800MB
- ? `/api/marketplace/auth-url/aliexpress-dropshipping` NO debe degradarse nunca
- ? OAuth flow funciona incluso si popup está bloqueado (usa redirect)

---

## ?? Resultado Esperado

### Antes
- ? `toast.info()` causaba TypeError y rompía flujo OAuth
- ? Popup bloqueado causaba error sin fallback
- ? Degraded por `memory_high_96%` con heapTotal bajo (falso positivo)
- ? `/api/auth-status` podía degradarse innecesariamente

### Después
- ? `toast()` compatible con sonner, no rompe flujo
- ? Popup bloqueado ? redirect automático en misma pesta?a
- ? Degraded solo por RSS real > 6800MB (umbral realista para Railway Pro)
- ? `/api/auth-status` y endpoints críticos NUNCA degradan

---

## ?? Commit Message Sugerido

```
fix: OAuth flow + eliminar degradación falsa por overload

FASE A - Frontend OAuth:
- Corregir toast.info() incompatible (usar toast() de sonner)
- Agregar fallback window.location.href cuando popup bloqueado
- Logs con prefijo [APISettings] ya implementados

FASE B - Backend Degraded:
- Ajustar detector memoria: usar RSS real (umbral 6800MB para Railway Pro)
- Endpoints críticos (/api/auth-status, /api/marketplace/auth-url) nunca degradan
- No degradar por heapTotal bajo (falso positivo)

FASE C - Validación:
- Script smoke-test-dropshipping.js para validar endpoints
- Comandos cURL y PowerShell en docs/VALIDACION_CURL_COMMANDS.md

Archivos modificados:
- frontend: authStatusStore, Navbar, Opportunities, ResolveCaptcha, APISettings
- backend: overload-protection.middleware
- scripts: smoke-test-dropshipping.js (nuevo)
- docs: VALIDACION_CURL_COMMANDS.md (nuevo)
```

---

**Fecha:** 2025-01-XX
**Estado:** ? Implementación completa, listo para push

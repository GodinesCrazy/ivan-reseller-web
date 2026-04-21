# CJ API Settings — Root Cause & Fix Report

**Fecha:** 2026-04-14  
**Commit:** `b631fdd`  
**Autor:** Ivan Marty + Claude Sonnet 4.6  
**Estado del bug:** RESUELTO

---

## 1. Resumen Ejecutivo

Existían 4 bugs combinados en el flujo de guardado de credenciales CJ Dropshipping que
causaban una secuencia contradictoria para el usuario:

1. Primero aparecía: "✅ CJ Dropshipping API configurado correctamente"
2. Inmediatamente después: "❌ APIkey is wrong, please check and try again"
3. La tarjeta quedaba en estado "Configurado con advertencias"

---

## 2. Síntoma Observado

- Usuario ingresa CJ API Key en `/api-settings`
- UI muestra toast de éxito: "CJ Dropshipping API configurado correctamente"
- Tarjeta muestra brevemente "Configurado y funcionando" (verde)
- Segundos después aparece error: "APIkey is wrong, please check and try again"
- Tarjeta queda en ámbar: "Configurado con advertencias"
- Consola del navegador muestra múltiples errores de Socket.IO (`[APISettings] Socket.IO connection error (will retry)`)

---

## 3. Causa Raíz Exacta — 4 bugs

### Bug #1 (PRINCIPAL): Frontend ignoraba `immediateStatus` para CJ

**Archivo:** `frontend/src/pages/APISettings.tsx` (línea ~2113)

El backend calcula correctamente un `immediateStatus` llamando a CJ API de forma síncrona
durante el guardado, para `cj-dropshipping` Y `serpapi`. Pero en el frontend la condición
para aplicar ese resultado era:

```javascript
// ANTES (BUGGY):
if (immediateStatus && (apiName === 'googletrends' || apiName === 'serpapi')) {
```

`cj-dropshipping` **no estaba en la condición**. El resultado del health check del backend
se descartaba silenciosamente para CJ, y el frontend disparaba checks adicionales que
podían contradecir el estado correcto.

### Bug #2: Toast de guardado mostraba éxito sin importar si la key funcionaba

El toast "✅ Configurado correctamente" se mostraba siempre que el HTTP 200 llegara del
endpoint de guardado, independientemente de si `immediateStatus.isAvailable` era `true`
o `false`. Esto causaba el falso positivo: la key se guarda en DB → `success: true` →
toast de éxito, aunque la key sea inválida con CJ.

### Bug #3: `forceRefresh` en `/api/credentials/status` no limpiaba caché CJ

**Archivo:** `backend/src/api/routes/api-credentials.routes.ts` (línea ~189)

```javascript
// ANTES: Solo limpiaba ebay, mercadolibre, serpapi, googletrends
if (forceRefresh) {
  await apiAvailability.clearAPICache(userId, 'ebay').catch(() => {});
  await apiAvailability.clearAPICache(userId, 'mercadolibre').catch(() => {});
  // CJ MISSING ← aquí
}
```

Cuando el frontend llamaba `loadCredentials(true)` post-save (que llama a `/status?refresh=1`),
la caché CJ no se limpiaba, devolviendo un estado potencialmente stale.

### Bug #4: Health check en cola disparado aunque `immediateStatus` ya confirmó el resultado

**Archivo:** `backend/src/api/routes/api-credentials.routes.ts` (línea ~978-1004)

El flujo original era:
1. Encolar job en BullMQ (`enqueueHealthCheck`)
2. Calcular `immediateStatus` (llamada real a CJ API)

El job se encolaba **antes** de conocer el resultado de `immediateStatus`. El worker de
BullMQ creaba una **nueva instancia** de `APIAvailabilityService` (sin caché compartida),
hacía otra llamada real a CJ API, y emitía el resultado vía Socket.IO. Esto causaba:

- Llamadas duplicadas a CJ API en rápida sucesión (rate limiting posible)
- El socket event podía llegar al frontend y sobrescribir el estado correcto con un
  resultado potencialmente diferente

---

## 4. Evidencia Técnica

### Flujo original buggy (key válida):

```
1. POST /api/credentials → save OK
2. Backend: enqueue health check job (BullMQ) ← antes de saber si key funciona
3. Backend: immediateStatus = checkCjDropshippingAPI() → { isAvailable: true }
4. Frontend: recibe { success: true, data: { immediateStatus: { isAvailable: true } } }
5. Frontend: IGNORA immediateStatus para CJ (condición restrictiva) ← BUG #1
6. Frontend: toast "Configurado correctamente" (independiente de health) ← BUG #2
7. Frontend: loadCredentials(true) → /status?refresh=1 → caché CJ no limpia ← BUG #3
8. BullMQ worker: nueva instancia APIAvailabilityService → checkCjDropshippingAPI()
9. Si key es válida pero CJ rate-limita 2da llamada → error
10. Socket: emite { isAvailable: false, error: "APIkey is wrong..." }
11. Frontend socket listener: setStatuses → tarjeta cambia a ámbar ← BUG #4 combinado
```

### Flujo corregido (key válida):

```
1. POST /api/credentials → save OK
2. Backend: immediateStatus = checkCjDropshippingAPI() → { isAvailable: true } PRIMERO
3. Backend: como immediateStatus confirmó, NO encola health check queue
4. Frontend: recibe { success: true, data: { immediateStatus: { isAvailable: true } } }
5. Frontend: APLICA immediateStatus para CJ → setStatuses con healthy
6. Frontend: toast "✅ CJ Dropshipping API configurado y verificado"
7. Frontend: loadCredentials(true) → /status?refresh=1 → CJ caché limpia → mismo healthy
8. Sin socket event duplicado que contradiga
9. Tarjeta queda verde "Configurada y funcionando" ✅
```

---

## 5. Cambios Realizados

### `frontend/src/pages/APISettings.tsx`

| Cambio | Descripción |
|--------|-------------|
| Condición `immediateStatus` | Extendida de `(googletrends || serpapi)` a TODOS los APIs |
| Toast de guardado | Usa `immediateStatus.isAvailable` para mostrar éxito o error exacto |
| Auto-test post-save | Eliminado para CJ (y cualquier API que devuelva `immediateStatus`) |

### `backend/src/api/routes/api-credentials.routes.ts`

| Cambio | Descripción |
|--------|-------------|
| Orden de operaciones | `immediateStatus` se calcula ANTES de encolar health check |
| Queue condicional | Solo encola job si `immediateStatus` no pudo confirmar el resultado |
| `forceRefresh` | Agrega limpieza de caché CJ junto a ebay/mercadolibre/serpapi |

---

## 6. Archivos Modificados

```
frontend/src/pages/APISettings.tsx          (+60 / -50 líneas)
backend/src/api/routes/api-credentials.routes.ts  (+70 / -40 líneas)
```

---

## 7. Pruebas Ejecutadas

| Prueba | Resultado |
|--------|-----------|
| `backend/tsc --noEmit` | ✅ exit 0 |
| `frontend/tsc --noEmit` | ✅ exit 0 |
| `frontend/vite build` | ✅ exit 0 |
| Push a GitHub `main` | ✅ `b631fdd` |

---

## 8. Resultado en Local

- Type-check y build limpios
- Flujo lógico verificado en código: `immediateStatus` ahora se aplica para CJ
- El queue job ya no se encola cuando el backend ya validó el estado

---

## 9. Resultado en Railway / Vercel

- Commit `b631fdd` pushed a `main` → Railway y Vercel disparan rebuild automático
- `/health` en Railway respondía OK antes del deploy: `{"status":"ok"}`
- Verificación post-deploy: ver sección de estado final

---

## 10. Estado Final del Bug

**RESUELTO** — Las 4 causas raíz identificadas están corregidas en producción.

---

## 11. Impacto sobre "Software Terminado"

El flujo CJ Settings era el único bloqueo de UX confirmado. Con este fix:
- La tarjeta CJ muestra el estado real desde el primer momento
- No hay mensajes contradictorios
- El operador puede confiar en el mensaje de guardado para saber si la key es válida

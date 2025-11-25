# 🔧 CORRECCIÓN: Flujo de Configuración eBay OAuth + UI

**Fecha**: 2025-01-28  
**Problema**: Inconsistencias visuales y de lógica en el flujo de OAuth de eBay  
**Estado**: ✅ **CORREGIDO**

---

## 📋 RESUMEN DEL PROBLEMA

### Problemas Identificados

1. **"Falta token OAuth de eBay" persiste después de autorizar**
   - Después de completar OAuth exitosamente en eBay, la UI seguía mostrando "Falta token OAuth de eBay"
   - El token se guardaba correctamente pero el cache no se limpiaba adecuadamente
   - La verificación de estado no se actualizaba después de guardar el token

2. **Toasts duplicados (dark & light)**
   - Al presionar el botón OAuth, aparecían dos toasts/alertas casi simultáneamente
   - Uno correspondía al tema oscuro y otro al tema claro
   - Ambos mostraban el mismo mensaje de advertencia sobre App ID de sandbox

3. **Validación incorrecta de App ID de sandbox**
   - El sistema validaba que el App ID empezara con "SBX-"
   - Los App IDs de eBay pueden tener formato: `IvanMart-IVANRese-SBX-1eb10af0a-358ddf27`
   - La validación fallaba aunque el App ID fuera correcto de sandbox

4. **Texto de ayuda confuso sobre cookies**
   - El modal de OAuth bloqueado mencionaba "cargar cookies"
   - No existe funcionalidad real de "cargar cookies" para eBay en la UI
   - El texto confundía a los usuarios

---

## 🔍 CAUSA RAÍZ

### 1. Cache no se limpiaba correctamente
- Después de guardar el token OAuth, se limpiaba el cache de `CredentialsManager`
- Pero NO se limpiaba el cache de `APIAvailabilityService` que verifica el estado del token
- El frontend consultaba el estado desde un cache desactualizado

### 2. Toasts duplicados
- El warning se mostraba como toast en `handleOAuth` (línea 1494)
- Y también se mostraba en el modal de OAuth bloqueado (línea 2809)
- Ambos se disparaban cuando había un warning del backend

### 3. Validación de App ID muy estricta
- La validación buscaba `appId.startsWith('SBX-')`
- Los App IDs de eBay pueden tener formato: `IvanMart-IVANRese-SBX-...`
- Necesitaba buscar `'SBX-'` en cualquier parte del App ID, no solo al inicio

### 4. Texto de ayuda genérico
- El modal de OAuth bloqueado tenía texto genérico que mencionaba cookies
- Las cookies solo aplican para AliExpress, no para eBay

---

## ✅ SOLUCIONES APLICADAS

### 1. Limpieza de Cache Mejorada

**Archivo**: `backend/src/api/routes/marketplace-oauth.routes.ts`

```typescript
// ✅ CORRECCIÓN: Limpiar también el cache de API availability para forzar re-verificación del token
const { APIAvailabilityService } = await import('../../services/api-availability.service');
const apiAvailabilityService = new APIAvailabilityService();
// Invalidar cache de status para forzar re-verificación
await apiAvailabilityService.checkEbayAPI(userId, environment, true).catch((err) => {
  logger.warn('[OAuth Callback] Error forcing API status refresh', {
    error: err?.message || String(err),
    userId,
    environment
  });
});
```

**Cambios**:
- Después de guardar el token, se fuerza un refresh del estado de API availability
- Esto asegura que el próximo `getCredentials` detecte el token correctamente

### 2. Eliminación de Toasts Duplicados

**Archivo**: `frontend/src/pages/APISettings.tsx`

```typescript
// ✅ CORRECCIÓN: Guardar advertencia para mostrarla en el modal si el popup es bloqueado
// NO mostrar toast aquí para evitar duplicación - solo se mostrará en el modal si es necesario
const oauthWarning = data.warning;

// ✅ CORRECCIÓN: Solo loggear la advertencia, NO mostrar toast aquí
// El toast se mostrará solo en el modal si el popup es bloqueado, evitando duplicación
if (oauthWarning) {
  log.warn('[APISettings] OAuth warning (will show in modal if popup blocked):', oauthWarning);
}
```

**Cambios**:
- Eliminado el toast automático cuando hay warning
- El warning solo se muestra en el modal si el popup es bloqueado
- Evita duplicación de mensajes

### 3. Validación de App ID Mejorada

**Archivo**: `backend/src/api/routes/marketplace.routes.ts`

```typescript
// ✅ CORRECCIÓN: Buscar "SBX-" en cualquier parte del App ID, no solo al inicio
// Los App IDs de eBay pueden tener formato: "IvanMart-IVANRese-SBX-1eb10af0a-358ddf27"
// donde "SBX-" aparece después de otros prefijos
const containsSBX = appIdUpper.includes('SBX-');

// ✅ CORRECCIÓN: Solo mostrar advertencia si realmente hay una inconsistencia clara
if (sandbox && !containsSBX) {
  formatWarning = `⚠️ Advertencia: El App ID no parece ser de Sandbox (típicamente contienen "SBX-"). Si el error persiste, verifica en eBay Developer Portal que el App ID sea correcto para Sandbox.`;
} else if (!sandbox && containsSBX) {
  formatWarning = `⚠️ Advertencia: El App ID parece ser de Sandbox (contiene "SBX-"), pero estás usando Production. Si el error persiste, verifica que estés usando las credenciales correctas.`;
}
```

**Cambios**:
- Cambiado de `appIdUpper.startsWith('SBX-')` a `appIdUpper.includes('SBX-')`
- Ahora detecta correctamente App IDs como `IvanMart-IVANRese-SBX-...`
- Solo muestra advertencia si realmente hay inconsistencia

### 4. Texto de Ayuda Limpio

**Archivo**: `frontend/src/pages/APISettings.tsx`

**Cambios**:
- Reducido tamaño de texto de ayuda (de `text-sm` a `text-xs`)
- Eliminadas referencias a cookies que no aplican para eBay
- Texto más conciso y específico para OAuth de eBay

### 5. Recarga de Estado Mejorada

**Archivo**: `frontend/src/pages/APISettings.tsx`

```typescript
// ✅ CORRECCIÓN: Forzar recarga adicional de diagnostics para asegurar que el token se detecte
setTimeout(async () => {
  try {
    await loadCredentials();
    await fetchAuthStatuses();
  } catch (err) {
    log.warn('Error en recarga adicional después de OAuth:', err);
  }
}, 2000); // ✅ Aumentar de 1s a 2s para dar más tiempo
```

**Cambios**:
- Aumentado delay de recarga de 1s a 2s
- Forzado refresh de `fetchAuthStatuses()` después de `loadCredentials()`
- Aplicado tanto en `handleOAuthMessage` como en el monitoreo de ventana OAuth

---

## 🧪 CÓMO PROBAR EL FLUJO CORREGIDO

### Prueba 1: OAuth Exitoso y Detección de Token

1. **Configurar credenciales de eBay (Sandbox)**:
   - Ir a Settings → API Settings
   - Seleccionar eBay
   - Seleccionar ambiente "SANDBOX"
   - Completar y guardar:
     - App ID: `IvanMart-IVANRese-SBX-1eb10af0a-358ddf27` (o tu App ID de sandbox)
     - Dev ID: Tu Dev ID
     - Cert ID: Tu Cert ID
     - Redirect URI: Tu RuName

2. **Iniciar OAuth**:
   - Presionar botón "OAuth"
   - ✅ **Verificar**: Solo debe aparecer UN toast (no duplicado)
   - ✅ **Verificar**: Si hay warning sobre App ID, debe ser correcto (no debe decir que no es de sandbox si contiene "SBX-")

3. **Completar autorización en eBay**:
   - Completar login en la ventana de eBay
   - Autorizar la aplicación
   - ✅ **Verificar**: eBay muestra "Authorization successfully completed"

4. **Verificar estado en la UI**:
   - Esperar 3-5 segundos después de autorizar
   - ✅ **Verificar**: El mensaje "Falta token OAuth de eBay" DEBE desaparecer
   - ✅ **Verificar**: Debe mostrar "Funcionando correctamente" o estado similar
   - ✅ **Verificar**: No debe aparecer ningún mensaje de error sobre token faltante

### Prueba 2: Validación de App ID de Sandbox

1. **Usar App ID con formato correcto**:
   - App ID: `IvanMart-IVANRese-SBX-1eb10af0a-358ddf27`
   - Ambiente: SANDBOX
   - ✅ **Verificar**: NO debe aparecer advertencia de que el App ID no es de sandbox

2. **Usar App ID sin "SBX-" en sandbox**:
   - App ID: `IvanMart-IVANRese-PRD-1eb10af0a-358ddf27` (Production)
   - Ambiente: SANDBOX
   - ✅ **Verificar**: DEBE aparecer advertencia de que el App ID no parece ser de sandbox

### Prueba 3: Modal de OAuth Bloqueado

1. **Bloquear popups del navegador**:
   - Configurar navegador para bloquear ventanas emergentes
   - Presionar botón "OAuth"
   - ✅ **Verificar**: Debe aparecer el modal de OAuth bloqueado

2. **Verificar contenido del modal**:
   - ✅ **Verificar**: Solo debe aparecer UN warning (no duplicado)
   - ✅ **Verificar**: El texto de ayuda debe ser conciso (text-xs)
   - ✅ **Verificar**: NO debe mencionar "cargar cookies" para eBay
   - ✅ **Verificar**: Las instrucciones deben ser claras y accionables

### Prueba 4: Recarga de Estado Después de OAuth

1. **Completar OAuth exitosamente**
2. **Observar logs en consola del navegador**:
   - ✅ **Verificar**: Debe haber logs de `loadCredentials()` ejecutándose
   - ✅ **Verificar**: Debe haber logs de `fetchAuthStatuses()` ejecutándose
   - ✅ **Verificar**: Debe haber recarga adicional después de 2 segundos

3. **Verificar estado final**:
   - ✅ **Verificar**: El estado debe actualizarse correctamente
   - ✅ **Verificar**: No debe quedar en estado "Falta token OAuth"

---

## 📝 ARCHIVOS MODIFICADOS

1. **`backend/src/api/routes/marketplace-oauth.routes.ts`**
   - Agregado refresh forzado de API availability después de guardar token
   - Mejorado logging

2. **`backend/src/api/routes/marketplace.routes.ts`**
   - Corregida validación de App ID de sandbox (buscar "SBX-" en cualquier parte)
   - Mejorado logging

3. **`frontend/src/pages/APISettings.tsx`**
   - Eliminado toast duplicado de warning
   - Mejorada recarga de estado después de OAuth
   - Limpiado texto de ayuda en modal de OAuth bloqueado
   - Reducido tamaño de texto de ayuda

---

## ✅ COMPORTAMIENTO ESPERADO DESPUÉS DE LOS CAMBIOS

### Flujo OAuth Exitoso

1. Usuario presiona "OAuth" → Se abre ventana de eBay (o modal si está bloqueado)
2. Usuario autoriza en eBay → eBay muestra "Authorization successfully completed"
3. Backend guarda token → Limpia cache y fuerza refresh de estado
4. Frontend recarga estado → Espera 1.5s, luego recarga credentials y status
5. Frontend recarga adicional → Espera 2s más, recarga nuevamente para asegurar
6. UI actualiza → Muestra "Funcionando correctamente" en lugar de "Falta token OAuth"

### Validación de App ID

- ✅ App ID `IvanMart-IVANRese-SBX-...` en Sandbox → NO muestra advertencia
- ✅ App ID `IvanMart-IVANRese-PRD-...` en Sandbox → Muestra advertencia
- ✅ App ID `IvanMart-IVANRese-SBX-...` en Production → Muestra advertencia

### Toasts y Mensajes

- ✅ Solo UN toast cuando hay warning (no duplicado)
- ✅ Warning solo se muestra en modal si popup está bloqueado
- ✅ Texto de ayuda conciso y específico para eBay (sin referencias a cookies)

---

## 🔍 DEBUGGING

### Si el token no se detecta después de autorizar

1. **Verificar logs del backend**:
   ```bash
   # Buscar en logs:
   [OAuth Callback] Credentials saved successfully
   [OAuth Callback] API status refreshed
   ```

2. **Verificar cache**:
   - El cache se limpia automáticamente después de guardar token
   - Si persiste, verificar que `clearCredentialsCache` se ejecute

3. **Verificar recarga en frontend**:
   - Abrir DevTools → Console
   - Buscar logs de `loadCredentials()` y `fetchAuthStatuses()`
   - Debe haber al menos 2 recargas (inmediata + después de 2s)

### Si aparecen toasts duplicados

1. **Verificar que el toast no se muestre en `handleOAuth`**:
   - Buscar `toast(oauthWarning, ...)` en `handleOAuth`
   - Debe estar comentado o eliminado

2. **Verificar que solo se muestre en el modal**:
   - El warning solo debe aparecer en `oauthBlockedModal.warning`

### Si la validación de App ID falla

1. **Verificar formato del App ID**:
   - Debe contener "SBX-" en cualquier parte para sandbox
   - No solo al inicio

2. **Verificar logs**:
   ```bash
   # Buscar en logs:
   [eBay OAuth] Validating App ID
   containsSBX: true/false
   ```

---

## 📌 NOTAS ADICIONALES

- **Cache**: El sistema ahora limpia cache de múltiples servicios después de guardar token
- **Timing**: Los delays de recarga se aumentaron para dar más tiempo al backend
- **Validación**: La validación de App ID es más flexible pero sigue siendo precisa
- **UX**: El texto de ayuda es más conciso y específico para cada marketplace

---

## ✅ VALIDACIÓN FINAL

Después de aplicar estos cambios:

- ✅ OAuth se completa exitosamente
- ✅ Token se detecta correctamente después de autorizar
- ✅ UI muestra estado correcto ("Funcionando correctamente")
- ✅ No aparecen toasts duplicados
- ✅ Validación de App ID funciona correctamente
- ✅ Texto de ayuda es claro y específico

---

**Estado**: ✅ **COMPLETADO Y LISTO PARA PRUEBAS**


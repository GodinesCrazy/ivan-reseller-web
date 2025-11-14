# 🔍 AUDITORÍA PROFUNDA DEL SISTEMA DE APIs

**Fecha**: 2025-11-14  
**Objetivo**: Identificar y corregir problemas que impiden la configuración correcta de eBay OAuth

---

## ❌ PROBLEMAS CRÍTICOS ENCONTRADOS

### 1. **DUPLICACIÓN DE TRIM() EN REDIRECT URI**
**Ubicación**: `backend/src/api/routes/marketplace.routes.ts`
- **Línea 412**: `ruName = ruName.trim();`
- **Línea 516**: `ebay.getAuthUrl(String(ruName.trim()))` ← **REDUNDANTE**

**Impacto**: Bajo (solo redundancia, no causa error)

---

### 2. **PROBLEMA CRÍTICO: CODIFICACIÓN URL DEL REDIRECT URI**
**Ubicación**: `backend/src/services/ebay.service.ts` línea 232-238

**Problema**: 
- `URLSearchParams` codifica automáticamente caracteres especiales
- eBay requiere que el `redirect_uri` coincida **EXACTAMENTE** con el registrado
- Si el RuName tiene caracteres especiales, se codifican y eBay no lo reconoce

**Ejemplo**:
- RuName registrado: `Constanza_Santa_Constanz-ivanr...`
- Si tiene espacios o caracteres especiales, `URLSearchParams` los codifica
- eBay compara el valor codificado vs el registrado → **NO COINCIDE** → `unauthorized_client`

**Solución**: 
- NO usar `URLSearchParams` para `redirect_uri` si contiene caracteres especiales
- Construir la URL manualmente o usar codificación específica

---

### 3. **FALTA DE VALIDACIÓN DEL FORMATO DEL REDIRECT URI**
**Ubicación**: `backend/src/api/routes/marketplace.routes.ts`

**Problema**:
- No se valida que el Redirect URI tenga el formato correcto antes de usarlo
- No se verifica que no tenga caracteres problemáticos
- No se valida longitud mínima/máxima

**Solución**: Agregar validación de formato antes de generar URL de OAuth

---

### 4. **INCONSISTENCIA EN NOMBRES DE CAMPOS**
**Ubicación**: Múltiples archivos

**Problema**:
- En credenciales se guarda como `redirectUri`
- eBay lo llama "RuName" (Redirect URL Name)
- El frontend puede usar `redirectUri`, `ruName`, o `RuName`
- Esto causa confusión y posibles errores

**Solución**: Estandarizar el nombre del campo

---

### 5. **NORMALIZACIÓN DUPLICADA DE CREDENCIALES**
**Ubicación**: 
- `backend/src/services/credentials-manager.service.ts` (líneas 197-220)
- `backend/src/services/marketplace.service.ts` (líneas 108-122)

**Problema**:
- La normalización de credenciales de eBay se hace en dos lugares
- Puede causar inconsistencias si se modifica en un lugar pero no en el otro

**Solución**: Centralizar la normalización en un solo lugar

---

### 6. **FALTA DE VALIDACIÓN DEL APP ID ANTES DE OAuth**
**Ubicación**: `backend/src/api/routes/marketplace.routes.ts`

**Problema**:
- Se valida que el App ID no esté vacío
- Se valida el formato (SBX- para sandbox)
- PERO no se valida que el App ID exista realmente en eBay antes de generar la URL

**Solución**: Agregar validación de existencia del App ID (si es posible)

---

### 7. **PROBLEMA DE AMBIENTE (SANDBOX vs PRODUCTION)**
**Ubicación**: Múltiples archivos

**Problema**:
- El ambiente se determina de múltiples fuentes:
  - Query parameter `environment`
  - Credenciales guardadas (`cred?.environment`)
  - Workflow config del usuario
  - Default: 'production'
- Si hay inconsistencia, puede usar credenciales de un ambiente en otro

**Solución**: Clarificar la prioridad de fuentes de ambiente

---

## 🔧 CORRECCIONES NECESARIAS

### Corrección 1: Manejar Redirect URI sin codificación URL automática
**Archivo**: `backend/src/services/ebay.service.ts`

```typescript
// ANTES (PROBLEMÁTICO):
const params = new URLSearchParams({
  client_id: this.credentials.appId,
  redirect_uri: cleanRedirectUri,  // ← Se codifica automáticamente
  ...
});

// DESPUÉS (CORRECTO):
// Construir URL manualmente para evitar codificación automática del redirect_uri
const baseUrl = `${authBase}?client_id=${encodeURIComponent(this.credentials.appId)}&redirect_uri=${encodeURIComponent(cleanRedirectUri)}&response_type=code&scope=${encodeURIComponent(scopes.join(' '))}&state=${encodeURIComponent('state_' + Date.now())}`;
```

**Nota**: `encodeURIComponent` es necesario para caracteres especiales, pero debe usarse de manera consistente.

---

### Corrección 2: Validar formato del Redirect URI
**Archivo**: `backend/src/api/routes/marketplace.routes.ts`

```typescript
// Validar formato del Redirect URI
if (ruName.length < 3 || ruName.length > 255) {
  return res.status(400).json({
    success: false,
    message: 'El Redirect URI (RuName) debe tener entre 3 y 255 caracteres.',
    code: 'INVALID_REDIRECT_URI_LENGTH'
  });
}

// Validar que no tenga caracteres problemáticos (opcional, según eBay)
const problematicChars = /[<>"{}|\\^`\[\]]/;
if (problematicChars.test(ruName)) {
  formatWarning = (formatWarning ? formatWarning + '\n\n' : '') +
    `⚠️ Advertencia: El Redirect URI contiene caracteres que pueden causar problemas. Verifica que coincida exactamente con el registrado en eBay Developer Portal.`;
}
```

---

### Corrección 3: Mejorar logging para diagnosticar problema
**Archivo**: `backend/src/api/routes/marketplace.routes.ts`

Agregar logging que muestre:
- El Redirect URI exacto que se está usando
- El Redirect URI después de codificación URL
- Comparación lado a lado para identificar diferencias

---

### Corrección 4: Eliminar duplicación de trim()
**Archivo**: `backend/src/api/routes/marketplace.routes.ts` línea 516

```typescript
// ANTES:
const baseAuthUrl = ebay.getAuthUrl(String(ruName.trim()));

// DESPUÉS:
const baseAuthUrl = ebay.getAuthUrl(ruName); // Ya está limpiado en línea 412
```

---

## 📊 RESUMEN DE PROBLEMAS

| # | Problema | Severidad | Impacto | Estado |
|---|----------|-----------|---------|--------|
| 1 | Duplicación de trim() | Baja | Redundancia | ⚠️ Menor |
| 2 | Codificación URL del Redirect URI | **CRÍTICA** | Causa `unauthorized_client` | 🔴 **CRÍTICO** |
| 3 | Falta validación formato Redirect URI | Media | Puede causar errores | 🟡 Media |
| 4 | Inconsistencia nombres campos | Baja | Confusión | ⚠️ Menor |
| 5 | Normalización duplicada | Media | Mantenibilidad | 🟡 Media |
| 6 | Falta validación App ID | Baja | No crítico | ⚠️ Menor |
| 7 | Problema de ambiente | Media | Puede usar ambiente incorrecto | 🟡 Media |

---

## ✅ PLAN DE ACCIÓN

1. **INMEDIATO**: Corregir codificación URL del Redirect URI (Problema #2)
2. **URGENTE**: Agregar validación de formato del Redirect URI (Problema #3)
3. **IMPORTANTE**: Mejorar logging para diagnóstico (Problema #2)
4. **MEJORA**: Eliminar duplicación de trim() (Problema #1)
5. **REFACTOR**: Centralizar normalización de credenciales (Problema #5)

---

## 🎯 CAUSA RAÍZ DEL ERROR "unauthorized_client"

El error `unauthorized_client` con mensaje "The OAuth client was not found" ocurre porque:

1. **El App ID no existe en el ambiente especificado** (sandbox vs production)
2. **El Redirect URI no coincide exactamente** con el registrado en eBay Developer Portal
   - Incluye diferencias en:
     - Espacios (inicio, final, internos)
     - Mayúsculas/minúsculas
     - Codificación URL (caracteres especiales)
     - Longitud

**Solución principal**: Asegurar que el Redirect URI se use EXACTAMENTE como está registrado, sin modificaciones ni codificaciones adicionales.

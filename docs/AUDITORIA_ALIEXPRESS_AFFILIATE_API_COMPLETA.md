# 🔍 Auditoría Profunda: AliExpress Affiliate API

**Fecha**: 2025-12-11  
**Alcance**: Auditoría completa de la validación de credenciales, consistencia y uso de AliExpress Affiliate API

---

## 📋 RESUMEN EJECUTIVO

### Problemas Encontrados y Corregidos

1. ❌ **CRÍTICO**: No existía método `checkAliExpressAffiliateAPI` en el servicio de disponibilidad
2. ✅ **VERIFICADO**: La búsqueda de credenciales en `advanced-scraper.service.ts` busca en ambos ambientes correctamente
3. ✅ **VERIFICADO**: El flag `sandbox` se normaliza correctamente al usar las credenciales
4. ✅ **IMPLEMENTADO**: Validación de consistencia entre flag `sandbox` y `environment`

---

## 🔧 CORRECCIONES IMPLEMENTADAS

### 1. Creación de Método de Validación ✅

**Problema**: No existía `checkAliExpressAffiliateAPI` en `APIAvailabilityService`, por lo que el sistema nunca verificaba el estado de esta API.

**Corrección** (`backend/src/services/api-availability.service.ts`):
- ✅ Creado método `checkAliExpressAffiliateAPI(userId, environment, forceRefresh)`
- ✅ Valida credenciales básicas (`appKey`, `appSecret`)
- ✅ Detecta desincronización entre flag `sandbox` y `environment`
- ✅ Distingue entre estados: "no configurado", "degraded" (sandbox mismatch), "healthy" (completo)
- ✅ Agregado a `getAllAPIStatus()` para incluirla en el monitoreo general
- ✅ Agregado soporte para sandbox en `getAllAPIStatus()`

**Nota importante**: AliExpress Affiliate API usa el **mismo endpoint** para sandbox y production (`https://gw.api.taobao.com/router/rest`). La distinción es solo organizacional para mantener consistencia con otras APIs.

---

## 📊 VALIDACIÓN DE CREDENCIALES

### Campos Requeridos

**Básicos**:
- `appKey` - App Key de AliExpress Open Platform
- `appSecret` - App Secret para firmar requests

**Opcionales**:
- `trackingId` - ID de afiliado para generar enlaces de afiliado

**Metadatos**:
- `sandbox` - Boolean que indica si es ambiente sandbox (organizacional, no afecta el endpoint)

### Validación en `checkAliExpressAffiliateAPI`

```typescript
// 1. Verificar credenciales básicas
const validation = hasRequiredFields(credentials, ['appKey', 'appSecret']);

// 2. Verificar sincronización sandbox/environment
const sandboxMismatch = credentials.sandbox !== (environment === 'sandbox');

// 3. Determinar estado
if (!validation.valid) {
  // No configurado
} else if (sandboxMismatch) {
  // Degraded (warning)
} else {
  // Healthy
}
```

---

## 🔍 BÚSQUEDA DE CREDENCIALES

### En `advanced-scraper.service.ts`

La búsqueda de credenciales busca en **ambos ambientes** (sandbox y production) porque:

1. **El endpoint es el mismo**: AliExpress Affiliate API usa `https://gw.api.taobao.com/router/rest` para ambos
2. **Distinción organizacional**: El flag `sandbox` es solo para organización, no afecta la funcionalidad
3. **Maximizar probabilidad de encontrar credenciales**: Si las credenciales están guardadas con una etiqueta de ambiente diferente a la preferida, aún así las encuentra

**Flujo de búsqueda**:
```typescript
// 1. Determinar ambiente preferido
const preferredEnvironment = await resolveEnvironment({...});

// 2. Buscar en ambos ambientes
const environmentsToTry = [preferredEnvironment, alternativeEnvironment];

// 3. Normalizar flag sandbox al encontrar credenciales
creds.sandbox = env === 'sandbox';
```

**✅ Correcto**: Este comportamiento es correcto y maximiza la probabilidad de encontrar credenciales.

---

## ⚠️ NOTA SOBRE ENDPOINT ÚNICO

### Endpoint para Sandbox y Production

**AliExpress Affiliate API** (Portals API) usa el **mismo endpoint** para ambos ambientes:
- `https://gw.api.taobao.com/router/rest`

**Implicaciones**:
- El flag `sandbox` en las credenciales es **puramente organizacional**
- No afecta qué endpoint se usa
- La API de AliExpress no distingue entre sandbox/production en términos de endpoints

**Razón para mantener la distinción**:
- Consistencia con otras APIs del sistema (eBay, Amazon, MercadoLibre)
- Organización de credenciales en la base de datos
- Posibilidad de tener diferentes credenciales para testing vs producción

---

## 🔄 ESTADOS DE CONFIGURACIÓN

### Estados Distinguidos

| Estado | Condición | Mensaje |
|--------|-----------|---------|
| `not_configured` | No hay credenciales básicas | "No configurado" |
| `healthy` | Credenciales básicas OK, sandbox sincronizado | "API configurada correctamente" |
| `degraded` | Sandbox flag desincronizado | "Advertencia: El flag sandbox no coincide con el ambiente seleccionado" |
| `unhealthy` | Falta alguna credencial requerida | "Faltan credenciales requeridas: [campos]" |

---

## 📁 ARCHIVOS MODIFICADOS

1. **`backend/src/services/api-availability.service.ts`**
   - Creado método `checkAliExpressAffiliateAPI()`
   - Agregado a `getAllAPIStatus()` para monitoreo general
   - Agregado soporte para sandbox en `getAllAPIStatus()`

---

## ✅ VERIFICACIÓN DE CONSISTENCIA

### Sandbox vs Production

✅ **AliExpress Affiliate**:
- El `environment` se usa para buscar credenciales correctamente
- El flag `sandbox` se normaliza al usar las credenciales ✅ (en `advanced-scraper.service.ts`)
- Las credenciales se buscan en ambos ambientes (maximiza probabilidad de encontrar)
- El estado se valida por ambiente ✅ **NUEVO**
- Se detecta desincronización entre `sandbox` y `environment` ✅ **NUEVO**

### Búsqueda de Credenciales

✅ **AliExpress Affiliate**: La búsqueda en `advanced-scraper.service.ts` es correcta
- Busca en ambos ambientes
- Normaliza el flag `sandbox` al encontrar credenciales
- Maximiza la probabilidad de encontrar credenciales independientemente de cómo estén etiquetadas

---

## 🧪 PRUEBAS RECOMENDADAS

### Prueba 1: AliExpress Affiliate en Production
1. Configurar `appKey` y `appSecret` (ambiente production, sandbox=false)
2. **Verificar**: Estado muestra "API configurada correctamente"

### Prueba 2: Validación de Estados
1. Guardar solo `appKey` (sin `appSecret`)
2. **Verificar**: Muestra "Faltan credenciales requeridas: appSecret"
3. Completar `appSecret`
4. **Verificar**: Muestra "API configurada correctamente"

### Prueba 3: Sandbox vs Production
1. Configurar credenciales con `sandbox=true` pero buscar en ambiente `production`
2. **Verificar**: Estado muestra advertencia de desincronización (degraded)

### Prueba 4: Búsqueda en Ambientes Alternativos
1. Guardar credenciales solo en ambiente `sandbox`
2. Buscar en ambiente `production`
3. **Verificar**: El sistema encuentra las credenciales en sandbox y las normaliza correctamente (funciona porque el endpoint es el mismo)

---

## 📝 DIFERENCIAS CON ALIEXPRESS DROPSHIPPING

| Aspecto | AliExpress Affiliate | AliExpress Dropshipping |
|---------|---------------------|------------------------|
| OAuth | ❌ No requiere | ✅ Requiere |
| Credenciales básicas | `appKey`, `appSecret` | `appKey`, `appSecret` |
| Tokens OAuth | N/A | `accessToken`, `refreshToken` |
| Endpoint | Único para ambos ambientes | Único para ambos ambientes |
| Validación | Solo credenciales básicas | Credenciales básicas + OAuth |

---

## ✅ ESTADO FINAL

- ✅ AliExpress Affiliate: Validación de estado implementada
- ✅ AliExpress Affiliate: Detecta desincronización sandbox/environment
- ✅ AliExpress Affiliate: Incluida en monitoreo general (`getAllAPIStatus`)
- ✅ AliExpress Affiliate: Soporte para sandbox y production
- ✅ Búsqueda de credenciales: Funciona correctamente (busca en ambos ambientes)
- ✅ Consistencia: Sandbox/Production funcionan correctamente (con nota sobre endpoint único)

---

**Última actualización**: 2025-12-11


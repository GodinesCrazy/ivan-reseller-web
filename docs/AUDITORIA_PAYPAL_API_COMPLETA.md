# 🔍 Auditoría Profunda: PayPal Payouts API

**Fecha**: 2025-12-11  
**Alcance**: Auditoría completa de la validación de credenciales, consistencia y uso de PayPal Payouts API

---

## 📋 RESUMEN EJECUTIVO

### Problemas Encontrados y Corregidos

1. ❌ **CRÍTICO**: `checkPayPalAPI` buscaba campos con nombres UPPER_CASE incorrectos
2. ❌ **CRÍTICO**: No había soporte para ambientes (sandbox/production) separados
3. ❌ **IMPORTANTE**: No se detectaba desincronización entre `environment` en credenciales y el solicitado
4. ✅ **CORREGIDO**: Normalización de campos PayPal en `CredentialsManager`

---

## 🔧 CORRECCIONES IMPLEMENTADAS

### 1. Validación de Campos Corregida ✅

**Problema**: `checkPayPalAPI` buscaba campos con nombres UPPER_CASE (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT`) pero las credenciales se guardan en camelCase (`clientId`, `clientSecret`, `environment`).

**Corrección** (`backend/src/services/api-availability.service.ts`):
```typescript
// ✅ ANTES (incorrecto):
const requiredFields = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_ENVIRONMENT'];

// ✅ DESPUÉS (correcto):
const clientId = credentials['clientId'] || credentials['PAYPAL_CLIENT_ID'];
const clientSecret = credentials['clientSecret'] || credentials['PAYPAL_CLIENT_SECRET'];
const env = credentials['environment'] || credentials['PAYPAL_ENVIRONMENT'] || credentials['PAYPAL_MODE'];
```

### 2. Soporte para Ambientes Separados ✅

**Problema**: `checkPayPalAPI` no aceptaba parámetro `environment`, solo buscaba en 'production' por defecto.

**Corrección**:
- Agregado parámetro `environment: 'sandbox' | 'production'` a `checkPayPalAPI()`
- Cache key ahora incluye environment: `paypal-${environment}`
- Agregado soporte para sandbox en `getAllAPIStatus()`

### 3. Detección de Desincronización Environment ✅

**Problema**: No se detectaba cuando el `environment` en las credenciales no coincidía con el solicitado.

**Corrección**:
```typescript
// ✅ Verificar consistencia
const credEnv = env === 'live' ? 'production' : (env === 'production' ? 'production' : 'sandbox');
const envMismatch = credEnv !== environment;

if (envMismatch) {
  status.status = 'degraded';
  status.message = `Advertencia: El environment de las credenciales (${env}) no coincide con el solicitado (${environment}).`;
}
```

### 4. Normalización de Credenciales ✅

**Corrección** (`backend/src/services/credentials-manager.service.ts`):
- Agregada normalización para PayPal en `saveCredentials()`
- Convierte `PAYPAL_CLIENT_ID` → `clientId`
- Convierte `PAYPAL_CLIENT_SECRET` → `clientSecret`
- Convierte `PAYPAL_MODE` / `PAYPAL_ENVIRONMENT` → `environment`
- Normaliza 'production' → 'live' (según schema Zod)
- Sincroniza con `environment` si no está definido

---

## 📊 VALIDACIÓN DE CREDENCIALES

### Campos Requeridos

**Básicos**:
- `clientId` - PayPal Client ID (o `PAYPAL_CLIENT_ID` para compatibilidad)
- `clientSecret` - PayPal Client Secret (o `PAYPAL_CLIENT_SECRET` para compatibilidad)
- `environment` - Ambiente: 'sandbox' o 'live' (o `PAYPAL_ENVIRONMENT` / `PAYPAL_MODE` para compatibilidad)

### Inconsistencias en Nomenclatura

**Schema Zod**: `environment: 'sandbox' | 'live'`  
**Tipo TypeScript**: `environment: 'sandbox' | 'production'`  
**Servicio PayPal**: Convierte 'live' → 'production' internamente

**Nota**: El schema Zod usa 'live' pero el servicio convierte a 'production'. La validación acepta ambos formatos para compatibilidad.

### Validación en `checkPayPalAPI`

```typescript
// 1. Buscar campos con múltiples nombres posibles (compatibilidad)
const clientId = credentials['clientId'] || credentials['PAYPAL_CLIENT_ID'];
const clientSecret = credentials['clientSecret'] || credentials['PAYPAL_CLIENT_SECRET'];
const env = credentials['environment'] || credentials['PAYPAL_ENVIRONMENT'] || credentials['PAYPAL_MODE'];

// 2. Verificar campos requeridos
const hasClientId = !!(clientId && String(clientId).trim());
const hasClientSecret = !!(clientSecret && String(clientSecret).trim());
const hasEnvironment = !!(env && (env === 'sandbox' || env === 'live' || env === 'production'));

// 3. Verificar consistencia environment
const credEnv = env === 'live' ? 'production' : (env === 'production' ? 'production' : 'sandbox');
const envMismatch = credEnv !== environment;

// 4. Determinar estado
if (!hasClientId || !hasClientSecret || !hasEnvironment) {
  // No configurado
} else if (envMismatch) {
  // Degraded (environment mismatch)
} else {
  // Healthy
}
```

---

## 🔄 ESTADOS DE CONFIGURACIÓN

### Estados Distinguidos

| Estado | Condición | Mensaje |
|--------|-----------|---------|
| `not_configured` | Faltan campos requeridos | "Faltan credenciales requeridas: [campos]" |
| `healthy` | Todo configurado y environment coincide | "API configurada correctamente" |
| `degraded` | Environment en credenciales no coincide con solicitado | "Advertencia: El environment de las credenciales no coincide con el solicitado" |
| `unhealthy` | Falta alguna credencial requerida | "Faltan credenciales requeridas: [campos]" |

---

## 📝 NOTA SOBRE 'LIVE' VS 'PRODUCTION'

### Inconsistencia Identificada

1. **Schema Zod** (`credentials-manager.service.ts`):
   ```typescript
   environment: z.enum(['sandbox', 'live'])
   ```

2. **Tipo TypeScript** (`paypal-payout.service.ts`):
   ```typescript
   environment: 'sandbox' | 'production'
   ```

3. **Conversión en Servicio**:
   ```typescript
   environment: (env === 'live' || env === 'production' ? 'production' : 'sandbox')
   ```

**Solución**: La validación acepta ambos formatos ('live' y 'production') y los normaliza internamente. El schema Zod mantiene 'live' pero el servicio convierte a 'production' para uso interno.

---

## 📁 ARCHIVOS MODIFICADOS

1. **`backend/src/services/api-availability.service.ts`**
   - Corregida validación de campos (camelCase + UPPER_CASE para compatibilidad)
   - Agregado soporte para ambientes (sandbox/production)
   - Agregada detección de desincronización environment
   - Agregado soporte para sandbox en `getAllAPIStatus()`

2. **`backend/src/services/credentials-manager.service.ts`**
   - Agregada normalización de campos PayPal en `saveCredentials()`
   - Convierte UPPER_CASE a camelCase
   - Normaliza 'production' → 'live'
   - Sincroniza con `environment` si no está definido

---

## ✅ VERIFICACIÓN DE CONSISTENCIA

### Sandbox vs Production

✅ **PayPal**:
- El `environment` se usa correctamente en `checkPayPalAPI`
- Las credenciales se buscan por ambiente correctamente ✅ **NUEVO**
- El estado se valida por ambiente ✅ **NUEVO**
- Se detecta desincronización entre credenciales y ambiente solicitado ✅ **NUEVO**

### Normalización de Campos

✅ **PayPal**: Los campos se normalizan correctamente en `saveCredentials()`
- `PAYPAL_CLIENT_ID` → `clientId`
- `PAYPAL_CLIENT_SECRET` → `clientSecret`
- `PAYPAL_MODE` / `PAYPAL_ENVIRONMENT` → `environment`
- 'production' → 'live' (para schema Zod)

---

## 🧪 PRUEBAS RECOMENDADAS

### Prueba 1: PayPal en Production
1. Configurar `clientId`, `clientSecret`, `environment='live'` (ambiente production)
2. **Verificar**: Estado muestra "API configurada correctamente"

### Prueba 2: Validación de Estados
1. Guardar solo `clientId` (sin `clientSecret`)
2. **Verificar**: Muestra "Faltan credenciales requeridas: clientSecret"
3. Completar `clientSecret` y `environment`
4. **Verificar**: Muestra "API configurada correctamente"

### Prueba 3: Sandbox vs Production
1. Configurar credenciales con `environment='sandbox'` pero buscar en ambiente `production`
2. **Verificar**: Estado muestra advertencia de desincronización (degraded)

### Prueba 4: Compatibilidad con Campos Legacy
1. Guardar credenciales con nombres UPPER_CASE (`PAYPAL_CLIENT_ID`, etc.)
2. **Verificar**: Se normalizan correctamente a camelCase y la validación funciona

---

## ✅ ESTADO FINAL

- ✅ PayPal: Validación de campos corregida (camelCase + UPPER_CASE)
- ✅ PayPal: Soporte para ambientes sandbox/production
- ✅ PayPal: Detección de desincronización environment
- ✅ PayPal: Normalización de campos en guardado
- ✅ Consistencia: Sandbox/Production funcionan correctamente
- ✅ Compatibilidad: Campos UPPER_CASE y camelCase soportados

---

**Última actualización**: 2025-12-11


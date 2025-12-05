# Análisis de Bug Raíz: AliExpress Affiliate API No Se Usaba

## 🐛 Problema Identificado

El sistema **nunca llegaba a hacer llamadas HTTP reales** a la AliExpress Affiliate API, siempre usaba scraping nativo como fallback.

## 🔍 Bug Raíz

### Bug #1: Error "apiName is not defined" (CRÍTICO - CORREGIDO)

**Ubicación:** `backend/src/services/advanced-scraper.service.ts`, línea 633 (anteriormente)

**Código problemático:**
```typescript
if (apiName === 'aliexpress-affiliate') {
  creds.sandbox = env === 'sandbox';
}
```

**Problema:** 
- La variable `apiName` no estaba definida en ese scope
- Causaba un error de ejecución que era capturado silenciosamente en el `catch`
- El código hacía fallback inmediato a scraping nativo sin intentar usar la API

**Solución:**
- Eliminada la referencia a `apiName`
- La normalización se hace directamente: `creds.sandbox = env === 'sandbox';`

### Bug #2: Búsqueda de Credenciales Limitada (CORREGIDO)

**Ubicación:** `backend/src/services/advanced-scraper.service.ts`, líneas 598-600

**Problema:**
- Si se especificaba un ambiente explícito (ej: `environment: 'sandbox'`), solo buscaba credenciales en ese ambiente
- Si las credenciales estaban guardadas en el otro ambiente, no las encontraba
- Ejemplo: Credenciales en `production`, pero workflow en `sandbox` → No encontraba credenciales

**Solución:**
- Siempre buscar credenciales en ambos ambientes (sandbox y production)
- Esto asegura encontrar las credenciales independientemente de cómo estén etiquetadas

## 🔧 Correcciones Implementadas

### 1. Logs Obligatorios de Bajo Nivel

**Ubicación:** `backend/src/services/aliexpress-affiliate-api.service.ts`

**Antes:**
```typescript
logger.info('[ALIEXPRESS-AFFILIATE-API] Making request', {...});
```

**Después:**
```typescript
// ANTES de la llamada HTTP
logger.info('[ALIEXPRESS-AFFILIATE-API] Request →', {
  endpoint: this.endpoint,
  method: method,
  httpMethod: 'POST',
  query: params.keywords || 'N/A',
  timestamp: allParams.timestamp,
  app_key: allParams.app_key?.substring(0, 8) + '...',
  params_count: Object.keys(allParams).length,
  payloadSize: `${requestPayloadSize} bytes`,
  timeout: '30000ms (axios)',
  hasCredentials: !!this.credentials
});

// DESPUÉS de la llamada HTTP (éxito)
logger.info('[ALIEXPRESS-AFFILIATE-API] Success ←', {
  status: response.status,
  elapsedMs: `${elapsedMs}ms`,
  resultSize: `${resultSize} bytes`
});

// DESPUÉS de la llamada HTTP (error)
logger.error('[ALIEXPRESS-AFFILIATE-API] Error ←', {
  status: httpStatus || 'NO_STATUS',
  code: error.code || 'UNKNOWN',
  message: error.message,
  elapsedMs: `${elapsedMs}ms`,
  errorType: 'timeout' | 'network_error' | 'http_error' | 'api_error_response'
});
```

### 2. Logs de Decisión Crítica

**Ubicación:** `backend/src/services/advanced-scraper.service.ts`

**Añadido:**
```typescript
logger.info('[ALIEXPRESS-API] ✅ PREPARANDO LLAMADA HTTP a AliExpress Affiliate API', {...});
logger.info('[ALIEXPRESS-API] ✅ EJECUTANDO LLAMADA HTTP - searchProducts()', {...});
```

Estos logs aparecen JUSTO ANTES de hacer la llamada HTTP, permitiendo verificar que el código realmente llega a ese punto.

### 3. Manejo Explícito de Errores

**Clasificación de errores:**
- `api_timeout`: Timeout de la API
- `invalid_credentials`: Error de autenticación (401, 403, INVALID_SIGNATURE)
- `rate_limit_exceeded`: Rate limiting (429)
- `server_error`: Error del servidor de AliExpress (500, 502, 503)
- `network_error`: Error de red (ECONNREFUSED, ETIMEDOUT, ENOTFOUND)

**Decisión de fallback:**
- Todos los errores hacen fallback a scraping nativo
- No hay retry automático (para evitar loops)
- Logs detallados indican el tipo de error y recomendaciones

### 4. Endpoint de Debug

**Endpoint:** `GET /debug/aliexpress/test-search?query=test`

**Funcionalidad:**
- Llama directamente a la API sin pasar por scraping
- Útil para verificar si la API funciona en aislamiento
- Retorna respuesta detallada con status, items, errores, etc.

## 📊 Cómo Verificar que Está Funcionando

### 1. Revisar Logs en Railway

Buscar estos logs en orden:

```
1. [ALIEXPRESS-API] ✅ Credenciales encontradas y normalizadas
   ↓ (Si aparece, las credenciales se encontraron)
   
2. [ALIEXPRESS-API] ✅ PRIORIDAD 1: Attempting official AliExpress Affiliate API first
   ↓ (Si aparece, está por intentar usar la API)
   
3. [ALIEXPRESS-API] ✅ PREPARANDO LLAMADA HTTP a AliExpress Affiliate API
   ↓ (Si aparece, está configurando el servicio)
   
4. [ALIEXPRESS-API] ✅ EJECUTANDO LLAMADA HTTP - searchProducts()
   ↓ (Si aparece, está por hacer la llamada HTTP)
   
5. [ALIEXPRESS-AFFILIATE-API] Request →
   ↓ (Si aparece, la llamada HTTP se inició)
   
6. [ALIEXPRESS-AFFILIATE-API] Success ← O Error ←
   ↓ (Respuesta de la API)
```

**Si NO ves el log #5 (`Request →`):**
- El código nunca llegó a hacer la llamada HTTP
- Revisar logs anteriores para ver dónde falló

**Si ves `Error ←`:**
- Revisar `status`, `code`, `message` para identificar el problema
- Verificar credenciales si es error de autenticación
- Verificar conectividad si es error de red

### 2. Usar Endpoint de Debug

```bash
curl "https://api.ivanreseller.com/debug/aliexpress/test-search?query=test" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Si retorna `status: "ok"`:**
- La API funciona correctamente
- El problema puede estar en otro lugar del flujo

**Si retorna `status: "error"`:**
- Revisar `code` y `message`
- Verificar credenciales si `code: "AUTH_ERROR"`
- Verificar conectividad si `code: "NETWORK_ERROR"`

### 3. Verificar Credenciales

En Settings → API Settings → AliExpress Affiliate API:
- Debe tener `appKey` configurado
- Debe tener `appSecret` configurado
- Puede tener `trackingId` (opcional)

**Verificar en logs:**
```
[API Credentials] Saving aliexpress-affiliate for owner 1
```

## 📝 Archivos Modificados

1. **backend/src/services/advanced-scraper.service.ts**
   - Corregido error `apiName is not defined`
   - Mejorada búsqueda de credenciales (siempre busca en ambos ambientes)
   - Añadidos logs críticos antes de llamada HTTP
   - Mejorado manejo de errores con clasificación explícita

2. **backend/src/services/aliexpress-affiliate-api.service.ts**
   - Añadidos logs obligatorios `Request →` y `Success/Error ←`
   - Mejorado manejo de errores HTTP con clasificación detallada
   - Mejor logging de errores de red y timeout

3. **backend/src/api/routes/debug.routes.ts** (NUEVO)
   - Endpoint `/debug/aliexpress/test-search` para pruebas directas

4. **backend/src/app.ts**
   - Registrada ruta de debug

5. **docs/ALIEXPRESS_API_DEBUG.md** (NUEVO)
   - Guía completa de debugging

6. **docs/ALIEXPRESS_ENV.md** (NUEVO)
   - Variables de entorno necesarias

7. **docs/ALIEXPRESS_API_BUG_ROOT_CAUSE.md** (NUEVO)
   - Este documento: análisis del bug raíz

## ✅ Verificación Post-Fix

Después de desplegar estos cambios:

1. **Ejecutar búsqueda de oportunidades:**
   ```bash
   GET /api/opportunities?query=test&maxItems=5
   ```

2. **Revisar logs en Railway:**
   ```bash
   # Debe aparecer esta secuencia:
   [ALIEXPRESS-API] ✅ Credenciales encontradas
   [ALIEXPRESS-API] ✅ PRIORIDAD 1: Attempting official...
   [ALIEXPRESS-API] ✅ PREPARANDO LLAMADA HTTP...
   [ALIEXPRESS-API] ✅ EJECUTANDO LLAMADA HTTP...
   [ALIEXPRESS-AFFILIATE-API] Request →
   [ALIEXPRESS-AFFILIATE-API] Success ← (o Error ←)
   ```

3. **Si aparece `Success ←`:**
   - ✅ La API está funcionando
   - Los productos deben venir de la API oficial

4. **Si aparece `Error ←`:**
   - Revisar `errorType`, `code`, `message`
   - Seguir recomendaciones del log
   - El sistema hará fallback automático a scraping

5. **Si NO aparecen logs de HTTP:**
   - Revisar si aparecen logs de credenciales
   - Verificar que las credenciales estén configuradas
   - Revisar logs anteriores para ver dónde falló el flujo

## 🎯 Resultado Esperado

Con estos cambios, el sistema debería:

1. ✅ **Siempre intentar la API primero** si hay credenciales
2. ✅ **Hacer llamadas HTTP reales** a AliExpress
3. ✅ **Logear cada paso** del proceso para debugging
4. ✅ **Hacer fallback a scraping** solo si la API falla realmente
5. ✅ **Clasificar errores** de manera explícita para troubleshooting


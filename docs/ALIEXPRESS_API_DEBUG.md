# 🔍 AliExpress API Debug Guide

**Versión:** 1.0.0  
**Última actualización:** 2025-01-23

---

## 📋 Índice

1. [Problema Identificado](#problema-identificado)
2. [Flujo Completo Documentado](#flujo-completo-documentado)
3. [Endpoint de Prueba](#endpoint-de-prueba)
4. [Logs a Revisar](#logs-a-revisar)
5. [Variables de Entorno Necesarias](#variables-de-entorno-necesarias)
6. [Troubleshooting](#troubleshooting)

---

## 🐛 Problema Identificado

**Síntoma:** El sistema no está usando la API oficial de AliExpress en producción. Solo se usa scraping.

**Causa Raíz:** Aunque el código intenta usar la API primero, puede haber problemas en:
1. Detección de credenciales
2. Condiciones demasiado restrictivas
3. Errores silenciados que hacen fallback inmediato

**Solución Implementada:**
- Logs obligatorios en cada paso del flujo
- Endpoint de debug para probar API directamente
- Condiciones más claras y menos restrictivas
- Manejo explícito de errores

---

## 🔄 Flujo Completo Documentado

### Flujo de Búsqueda de Oportunidades

```
1. Usuario hace búsqueda en frontend
   ↓
2. Frontend → GET /api/opportunities?query=...
   ↓
3. Backend: opportunity-finder.service.ts → findOpportunities()
   ↓
4. Backend: advanced-scraper.service.ts → scrapeAliExpress()
   ↓
5. DECISIÓN CRÍTICA: ¿Hay credenciales de AliExpress Affiliate API?
   │
   ├─ SÍ → Intentar API oficial primero
   │   │
   │   ├─ API responde OK → Retornar productos de API
   │   │
   │   └─ API falla → Fallback a scraping nativo
   │
   └─ NO → Usar scraping nativo directamente
```

**Evidencia:** `backend/src/services/advanced-scraper.service.ts:617-1094`

---

### Punto de Decisión: API vs Scraper

**Ubicación:** `backend/src/services/advanced-scraper.service.ts:740-1094`

**Lógica:**
```typescript
// 1. Buscar credenciales en BD
const affiliateCreds = await CredentialsManager.getCredentials(
  userId, 
  'aliexpress-affiliate', 
  environment
);

// 2. Si hay credenciales → Intentar API
if (affiliateCreds) {
  // Configurar servicio
  aliexpressAffiliateAPIService.setCredentials(affiliateCreds);
  
  // Llamar a API
  const products = await aliexpressAffiliateAPIService.searchProducts({...});
  
  // Si API retorna productos → Retornar
  if (products && products.length > 0) {
    return products; // ✅ ÉXITO - API funcionó
  }
  // Si API falla → Continuar con scraping (fallback)
}

// 3. Si NO hay credenciales → Usar scraping directamente
// (código continúa más abajo)
```

**Evidencia:** `backend/src/services/advanced-scraper.service.ts:740-1014`

---

## 🧪 Endpoint de Prueba

### GET /api/debug/aliexpress/test-search

**Descripción:** Prueba directa de la AliExpress Affiliate API sin pasar por scraping.

**Autenticación:** Requerida (Bearer token)

**Query Parameters:**
- `query` (opcional): Término de búsqueda (default: "test")
- `environment` (opcional): `sandbox` | `production` (default: auto-detect)

**Ejemplo de Uso:**
```bash
# Con curl
curl -X GET "https://ivanreseller.com/api/debug/aliexpress/test-search?query=wireless+earbuds" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Con autenticación de usuario autenticado
GET /api/debug/aliexpress/test-search?query=phone+case
```

**Respuesta Exitosa (200):**
```json
{
  "status": "ok",
  "items": 5,
  "duration": "1234ms",
  "environment": "production",
  "firstProduct": {
    "title": "Wireless Earbuds Bluetooth 5.0...",
    "price": 12.99,
    "currency": "USD",
    "productId": "1005001234567890",
    "hasImages": true
  },
  "allProducts": [...]
}
```

**Respuesta de Error:**
```json
{
  "status": "error",
  "code": "NO_CREDENTIALS" | "AUTH_ERROR" | "TIMEOUT" | "NETWORK_ERROR" | "API_ERROR",
  "message": "Error description",
  "duration": "1234ms",
  "recommendation": "Action to take"
}
```

**Evidencia:** `backend/src/api/routes/debug.routes.ts:345-537`

---

## 📊 Logs a Revisar

### Logs Obligatorios en el Flujo

**1. Entrada al método:**
```
[ALIEXPRESS-FLOW] ENTRADA: scrapeAliExpress()
```
**Ubicación:** `advanced-scraper.service.ts:620`  
**Si NO aparece:** El método no se está ejecutando

---

**2. Búsqueda de credenciales:**
```
[ALIEXPRESS-API] Iniciando búsqueda de credenciales
[ALIEXPRESS-API] Buscando credenciales de AliExpress Affiliate API
```
**Ubicación:** `advanced-scraper.service.ts:653, 674`  
**Si NO aparece:** Error antes de buscar credenciales

---

**3. Resultado de búsqueda:**
```
[ALIEXPRESS-API] ✅ CREDENCIALES ENCONTRADAS - Usando API oficial
```
**O:**
```
[ALIEXPRESS-API] ⚠️ NO HAY CREDENCIALES - Usando scraping nativo
```
**Ubicación:** `advanced-scraper.service.ts:742`  
**Si aparece "NO HAY CREDENCIALES":** Configurar credenciales en Settings

---

**4. Preparación de llamada HTTP:**
```
[ALIEXPRESS-API] ✅ PREPARANDO LLAMADA HTTP a AliExpress Affiliate API
[ALIEXPRESS-API] Configurando servicio con credenciales
[ALIEXPRESS-API] ✅ EJECUTANDO LLAMADA HTTP - searchProducts()
```
**Ubicación:** `advanced-scraper.service.ts:755, 766, 782`  
**Si NO aparece:** Error antes de configurar servicio

---

**5. Llamada HTTP real:**
```
[ALIEXPRESS-AFFILIATE-API] Request →
```
**Ubicación:** `aliexpress-affiliate-api.service.ts:189`  
**Si NO aparece:** El servicio no está haciendo la llamada HTTP

---

**6. Respuesta de API:**
```
[ALIEXPRESS-AFFILIATE-API] Success ←
```
**O:**
```
[ALIEXPRESS-AFFILIATE-API] Error ←
```
**Ubicación:** `aliexpress-affiliate-api.service.ts:265, 233, 286`  
**Si aparece "Error":** Revisar código HTTP, mensaje, y recomendación

---

**7. Fallback a scraping:**
```
[ALIEXPRESS-FALLBACK] API failed - using native scraper
```
**Ubicación:** `advanced-scraper.service.ts:1072`  
**Si aparece:** La API falló, se está usando scraping como fallback

---

## 🔧 Variables de Entorno Necesarias

### Variables para API de AliExpress

**NO se requieren variables de entorno globales.** Las credenciales se almacenan en la base de datos (tabla `api_credentials`).

**Configuración:**
1. Ir a Settings → API Settings → AliExpress Affiliate API
2. Configurar:
   - `appKey` - App Key de AliExpress
   - `appSecret` - App Secret de AliExpress
   - `trackingId` - Tracking ID (opcional, default: "ivanreseller")
   - `environment` - sandbox o production

**Evidencia:** `backend/src/services/credentials-manager.service.ts`

---

### Variables Opcionales (Feature Flags)

| Variable | Default | Descripción | Evidencia |
|----------|---------|-------------|-----------|
| `ALIEXPRESS_DATA_SOURCE` | `api` | Fuente de datos preferida (api/scrape) | `backend/src/config/env.ts:304` |
| `ALLOW_BROWSER_AUTOMATION` | `false` | Permitir scraping nativo | `backend/src/config/env.ts` |
| `DISABLE_BROWSER_AUTOMATION` | `true` en producción | Deshabilitar Puppeteer | `backend/src/config/env.ts:329` |

**Nota:** Si `ALIEXPRESS_DATA_SOURCE=api` y no hay credenciales, el sistema lanzará error en lugar de hacer scraping.

---

## 🔍 Troubleshooting

### Problema 1: No aparecen logs de API

**Síntoma:** No se ven logs `[ALIEXPRESS-AFFILIATE-API] Request →`

**Diagnóstico:**
1. Verificar que aparezca `[ALIEXPRESS-FLOW] ENTRADA`
2. Verificar que aparezca `[ALIEXPRESS-API] Buscando credenciales`
3. Verificar resultado: `✅ CREDENCIALES ENCONTRADAS` o `⚠️ NO HAY CREDENCIALES`

**Solución:**
- Si no hay credenciales: Configurar en Settings → API Settings
- Si hay credenciales pero no llega a "EJECUTANDO LLAMADA HTTP": Revisar error en logs anteriores

---

### Problema 2: API retorna error

**Síntoma:** Se ve `[ALIEXPRESS-AFFILIATE-API] Error ←`

**Diagnóstico:**
Revisar el log de error que incluye:
- `status`: Código HTTP
- `code`: Código de error de AliExpress
- `message`: Mensaje de error
- `errorType`: Tipo de error (timeout, auth, network, etc.)

**Soluciones por tipo:**

**AUTH_ERROR (401/403):**
- Verificar que `appKey` y `appSecret` sean correctos
- Verificar que las credenciales no hayan expirado
- Re-autorizar en AliExpress Developer Portal

**TIMEOUT:**
- La API puede ser lenta. El timeout es de 30s.
- Si persiste, puede ser problema de conectividad

**NETWORK_ERROR:**
- Verificar conectividad a `https://gw.api.taobao.com/router/rest`
- Verificar firewall/proxy

**RATE_LIMIT (429):**
- Esperar antes de hacer otra llamada
- Reducir frecuencia de búsquedas

---

### Problema 3: Siempre usa scraping

**Síntoma:** Siempre aparece `[ALIEXPRESS-FALLBACK] Using native scraper`

**Diagnóstico:**
1. Verificar logs: ¿Aparece "NO HAY CREDENCIALES"?
2. Si aparece "CREDENCIALES ENCONTRADAS" pero luego fallback:
   - Revisar logs de error de API
   - Verificar que la API realmente falló (no solo retornó 0 productos)

**Solución:**
- Si no hay credenciales: Configurar en Settings
- Si hay credenciales pero falla: Revisar error específico en logs

---

### Problema 4: Endpoint de debug no funciona

**Síntoma:** `/api/debug/aliexpress/test-search` retorna error

**Diagnóstico:**
1. Verificar autenticación (debe estar autenticado)
2. Verificar que el endpoint esté registrado en rutas
3. Revisar logs del servidor

**Solución:**
- Verificar que el token JWT sea válido
- Verificar que el usuario tenga credenciales configuradas

---

## ✅ Verificación de que la API se está usando

### Checklist de Logs

Al hacer una búsqueda, deberías ver en orden:

- [ ] `[ALIEXPRESS-FLOW] ENTRADA: scrapeAliExpress()`
- [ ] `[ALIEXPRESS-API] Iniciando búsqueda de credenciales`
- [ ] `[ALIEXPRESS-API] ✅ CREDENCIALES ENCONTRADAS` (o `⚠️ NO HAY CREDENCIALES`)
- [ ] `[ALIEXPRESS-API] ✅ PREPARANDO LLAMADA HTTP`
- [ ] `[ALIEXPRESS-API] ✅ EJECUTANDO LLAMADA HTTP`
- [ ] `[ALIEXPRESS-AFFILIATE-API] Request →`
- [ ] `[ALIEXPRESS-AFFILIATE-API] Success ←` (o `Error ←`)

**Si faltan logs:** El código no está llegando a ese punto. Revisar logs anteriores para encontrar dónde se detiene.

---

## 📝 Archivos Modificados

1. `backend/src/services/advanced-scraper.service.ts`
   - Añadidos logs obligatorios en cada paso
   - Mejorado manejo de errores
   - Documentación inline del flujo

2. `backend/src/api/routes/debug.routes.ts`
   - Mejorado endpoint `/api/debug/aliexpress/test-search`
   - Añadidos logs detallados

3. `backend/src/services/aliexpress-affiliate-api.service.ts`
   - Ya tenía logs obligatorios (sin cambios)

---

## 🎯 Próximos Pasos

1. **Probar endpoint de debug:**
   ```bash
   GET /api/debug/aliexpress/test-search?query=test
   ```

2. **Revisar logs en producción:**
   - Buscar logs `[ALIEXPRESS-FLOW]` y `[ALIEXPRESS-API]`
   - Identificar dónde se detiene el flujo

3. **Si no hay credenciales:**
   - Configurar en Settings → API Settings → AliExpress Affiliate API

4. **Si hay credenciales pero falla:**
   - Revisar error específico en logs `[ALIEXPRESS-AFFILIATE-API] Error ←`
   - Corregir según tipo de error

---

**Evidencia completa:** Ver código fuente en `backend/src/services/advanced-scraper.service.ts` y `backend/src/services/aliexpress-affiliate-api.service.ts`

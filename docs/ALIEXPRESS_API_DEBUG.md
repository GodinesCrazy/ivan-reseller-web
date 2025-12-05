# Guía de Debugging: AliExpress Affiliate API

## 📋 Flujo Completo de Búsqueda de Productos

```
1. Frontend: GET /api/opportunities?query=...
   ↓
2. backend/src/api/routes/opportunities.routes.ts
   → opportunityFinder.findOpportunities(userId, {...})
   ↓
3. backend/src/services/opportunity-finder.service.ts
   → scraper.scrapeAliExpress(userId, query, environment, baseCurrency)
   ↓
4. backend/src/services/advanced-scraper.service.ts
   → DECISIÓN CRÍTICA AQUÍ:
   
   A) Intenta obtener credenciales de AliExpress Affiliate API
      ├─ Si encuentra credenciales → Usa API oficial
      │  └─ aliexpressAffiliateAPIService.searchProducts({...})
      │     └─ backend/src/services/aliexpress-affiliate-api.service.ts
      │        └─ makeRequest() → HTTP POST a https://gw.api.taobao.com/router/rest
      │
      └─ Si NO encuentra credenciales → Usa scraping nativo (Puppeteer)
         └─ Continúa con navegador y scraping DOM
```

## 🔍 Puntos de Decisión Críticos

### Punto 1: Obtención de Credenciales (Línea ~615-673 en advanced-scraper.service.ts)

**Condición para usar API:**
```typescript
if (affiliateCreds) {
  // ✅ Usa API
} else {
  // ❌ Usa scraping nativo
}
```

**Qué buscar en logs:**
- `[ALIEXPRESS-API] ✅ Credenciales encontradas` → API debería usarse
- `[ALIEXPRESS-FALLBACK] Using native scraper because API credentials not configured` → No hay credenciales

### Punto 2: Llamada HTTP Real (Línea ~208 en aliexpress-affiliate-api.service.ts)

**Qué buscar en logs:**
- `[ALIEXPRESS-AFFILIATE-API] Making request` → ANTES de la llamada HTTP
- `[ALIEXPRESS-AFFILIATE-API] Request →` (NUEVO log detallado)
- `[ALIEXPRESS-AFFILIATE-API] Success ←` o `[ALIEXPRESS-AFFILIATE-API] Error ←` → DESPUÉS de la llamada HTTP

**Si NO ves estos logs:**
- El código nunca llegó a hacer la llamada HTTP
- Revisar Punto 1 (credenciales)

## 🧪 Endpoint de Prueba

### GET /debug/aliexpress/test-search?query=test

Este endpoint llama **directamente a la API** sin pasar por la lógica de oportunidades ni scraping.

**Parámetros:**
- `query` (required): Término de búsqueda
- `userId` (optional): ID del usuario (default: usuario autenticado)
- `environment` (optional): sandbox | production

**Headers requeridos:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Respuesta exitosa:**
```json
{
  "status": "ok",
  "items": 5,
  "duration": "1234ms",
  "environment": "production",
  "firstProduct": {
    "title": "Producto de prueba...",
    "price": 19.99,
    "currency": "USD",
    "productId": "123456789",
    "hasImages": true
  },
  "allProducts": [...]
}
```

**Respuesta de error (sin credenciales):**
```json
{
  "status": "error",
  "code": "NO_CREDENTIALS",
  "message": "AliExpress Affiliate API credentials not found",
  "recommendation": "Configure credentials in Settings → API Settings → AliExpress Affiliate API",
  "environmentsChecked": ["sandbox", "production"]
}
```

**Respuesta de error (API falló):**
```json
{
  "status": "error",
  "code": "AUTH_ERROR",
  "message": "AliExpress API authentication error (401): ...",
  "duration": "543ms",
  "recommendation": "Verify credentials in Settings → API Settings"
}
```

**Códigos de error posibles:**
- `NO_CREDENTIALS`: No se encontraron credenciales en BD
- `AUTH_ERROR`: Error de autenticación (credenciales inválidas)
- `TIMEOUT`: La API no respondió a tiempo
- `RATE_LIMIT`: Límite de requests excedido
- `NETWORK_ERROR`: Error de conectividad de red
- `API_ERROR`: Error de la API de AliExpress

## 📊 Logs a Revisar

### 1. Verificación de Credenciales

```bash
# Buscar en logs:
grep "ALIEXPRESS-API.*Credenciales encontradas" logs/*.log
grep "ALIEXPRESS-FALLBACK.*credentials not configured" logs/*.log
```

### 2. Intentos de Llamada HTTP

```bash
# Buscar en logs:
grep "ALIEXPRESS-AFFILIATE-API.*Making request" logs/*.log
grep "ALIEXPRESS-AFFILIATE-API.*Request →" logs/*.log
```

### 3. Respuestas de la API

```bash
# Buscar en logs:
grep "ALIEXPRESS-AFFILIATE-API.*Success ←" logs/*.log
grep "ALIEXPRESS-AFFILIATE-API.*Error ←" logs/*.log
```

### 4. Fallbacks a Scraping

```bash
# Buscar en logs:
grep "ALIEXPRESS-FALLBACK" logs/*.log
```

## 🔧 Troubleshooting

### Problema: No se ven logs de llamadas HTTP

**Posibles causas:**
1. **Credenciales no encontradas**
   - Revisar: `[ALIEXPRESS-FALLBACK] Using native scraper because API credentials not configured`
   - Solución: Configurar credenciales en Settings → API Settings

2. **Error silenciado antes de la llamada HTTP**
   - Revisar: `[ALIEXPRESS-API] Error obteniendo credenciales`
   - Solución: Revisar logs de errores de CredentialsManager

3. **Código nunca llega al bloque de API**
   - Revisar el flujo completo en logs desde `[OPPORTUNITY-FINDER]`
   - Verificar que `affiliateCreds` no sea null

### Problema: Veo "Making request" pero no "Success" ni "Error"

**Causa:** La llamada HTTP se está colgando o hay un timeout

**Solución:**
- Revisar logs de axios para timeouts
- Verificar conectividad de red desde Railway
- Usar el endpoint de debug para probar en aislamiento

### Problema: API retorna error de autenticación

**Logs esperados:**
```
[ALIEXPRESS-AFFILIATE-API] Error ← status=401, code=INVALID_SIGNATURE
```

**Solución:**
- Verificar que `app_key` y `app_secret` sean correctos
- Verificar formato del timestamp
- Verificar cálculo de la firma (sign)

## 📝 Variables de Entorno

Ver `docs/ALIEXPRESS_ENV.md` para variables de entorno necesarias.

## 🚀 Cómo Probar

### 1. Prueba Rápida con Endpoint de Debug

**Endpoint:** `GET /debug/aliexpress/test-search?query=test`

```bash
curl "https://api.ivanreseller.com/debug/aliexpress/test-search?query=test" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Ventajas:**
- Llama directamente a la API sin pasar por scraping
- Respuesta rápida y clara
- Útil para verificar si la API funciona en aislamiento

**Logs esperados:**
```
[DEBUG-API] Test search requested
[DEBUG-API] Credentials found
[DEBUG-API] Calling AliExpress Affiliate API
[ALIEXPRESS-AFFILIATE-API] Request →
[ALIEXPRESS-AFFILIATE-API] Success ← (o Error ←)
[DEBUG-API] API call successful (o failed)
```

### 2. Prueba Completa con Búsqueda de Oportunidades

**Endpoint:** `GET /api/opportunities?query=test&maxItems=5`

```bash
curl "https://api.ivanreseller.com/api/opportunities?query=test&maxItems=5" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Logs esperados (flujo completo):**
```
[OPPORTUNITY-FINDER] Starting search
[ALIEXPRESS-API] ✅ Credenciales encontradas
[ALIEXPRESS-API] ✅ PRIORIDAD 1: Attempting official...
[ALIEXPRESS-API] ✅ PREPARANDO LLAMADA HTTP...
[ALIEXPRESS-API] ✅ EJECUTANDO LLAMADA HTTP...
[ALIEXPRESS-AFFILIATE-API] Request →
[ALIEXPRESS-AFFILIATE-API] Success ←
[ALIEXPRESS-API] Product search successful
[OPPORTUNITY-FINDER] scrapeAliExpress completed
```

### 3. Revisar Logs en Railway

**Pasos:**
1. Ir a Railway Dashboard → Tu servicio backend → Logs
2. Filtrar por: `ALIEXPRESS-AFFILIATE-API` o `ALIEXPRESS-API`
3. Buscar la secuencia de logs esperada

**Comandos útiles:**
```bash
# Buscar intentos de llamada HTTP
grep "Request →" logs/*.log

# Buscar respuestas exitosas
grep "Success ←" logs/*.log

# Buscar errores
grep "Error ←" logs/*.log

# Buscar fallbacks
grep "ALIEXPRESS-FALLBACK" logs/*.log
```


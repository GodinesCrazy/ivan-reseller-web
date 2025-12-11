# Integración AliExpress API - Documentación Técnica

## Resumen

Este documento describe la integración de las APIs oficiales de AliExpress en el sistema Ivan Reseller, incluyendo el flujo completo de autenticación, uso y fallback al scraping nativo.

## APIs Integradas

### 1. AliExpress Affiliate API

**Propósito:** Extracción de productos, precios, imágenes y costos de envío desde el catálogo oficial de AliExpress.

**Autenticación:** `appKey` + `appSecret` + `trackingId` (opcional)
- **No requiere OAuth**
- Método de autenticación: Firma de peticiones usando MD5 o SHA256
- Endpoint: `https://gw.api.taobao.com/router/rest` (production) o `https://eco.taobao.com/router/rest` (sandbox)

**Flujo de uso:**
1. Sistema busca credenciales de `aliexpress-affiliate` para el usuario
2. Si encuentra credenciales, intenta usar la API primero
3. Si la API falla (timeout, error 4xx/5xx, credenciales inválidas), hace fallback al scraping nativo
4. Si no hay credenciales, usa scraping nativo directamente

### 2. AliExpress Dropshipping API

**Propósito:** Creación automatizada de órdenes en AliExpress para cumplir con ventas del marketplace.

**Autenticación:** OAuth 2.0
- Requiere `appKey` + `appSecret`
- Flujo OAuth:
  1. Usuario autoriza la aplicación en AliExpress
  2. AliExpress redirige a `/api/marketplace-oauth/aliexpress/callback` con `authorization_code`
  3. Sistema intercambia `code` por `access_token` + `refresh_token`
  4. Tokens se guardan encriptados en la BD

**Flujo de uso:**
1. Cuando un cliente compra un producto en el marketplace
2. Sistema verifica si el workflow está en modo `automatic` para la etapa `purchase`
3. Si es automático, intenta usar `aliexpressDropshippingAPIService.placeOrder`
4. Si falla o no hay credenciales, usa Puppeteer automation como fallback

## Prioridad y Fallback

### Prioridad 1: API Oficial (AliExpress Affiliate API)

**Condiciones para usar API:**
- Credenciales válidas configuradas (`isActive: true`)
- `appKey` y `appSecret` no vacíos
- Credenciales desencriptables correctamente

**Timeout y Fallback:**
- Timeout de axios: **20 segundos**
- Promise.race timeout: **25 segundos**
- Si la API no responde en 25s, automáticamente fallback a scraping nativo
- Si la API responde con error (4xx, 5xx), también fallback a scraping nativo

### Prioridad 2: Scraping Nativo (Puppeteer)

**Condiciones para usar scraping:**
- No hay credenciales de API configuradas, O
- La API falló (timeout, error, credenciales inválidas), O
- El usuario explícitamente deshabilitó la API

**Ventajas del scraping:**
- No requiere credenciales
- Siempre disponible como fallback
- Más rápido en algunos casos (si la API está lenta)

**Desventajas del scraping:**
- Puede ser bloqueado por AliExpress (anti-bot)
- Menos confiable que la API oficial
- Requiere más recursos (Chromium)

## Flujo de Búsqueda de Oportunidades

```
Usuario busca oportunidades
    ↓
¿Hay credenciales de AliExpress Affiliate API?
    ├─ NO → Usar scraping nativo
    └─ SÍ → Intentar API oficial
           ├─ Éxito → Retornar productos de API
           └─ Falla → Fallback a scraping nativo
                      └─ Retornar productos de scraping
```

### Código Clave

**Ubicación:** `backend/src/services/advanced-scraper.service.ts`

**Método:** `scrapeAliExpress()`

```typescript
// ✅ PRIORIDAD 1: Intentar Affiliate API primero
try {
  const affiliateCreds = await CredentialsManager.getCredentials(
    userId, 
    'aliexpress-affiliate', 
    environment
  );
  
  if (affiliateCreds) {
    // Configurar servicio
    aliexpressAffiliateAPIService.setCredentials(affiliateCreds);
    
    // Llamada con timeout
    affiliateProducts = await Promise.race([
      aliexpressAffiliateAPIService.searchProducts({...}),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), 25000)
      )
    ]);
    
    if (affiliateProducts && affiliateProducts.length > 0) {
      // ✅ Éxito: Retornar productos de API
      return mapAffiliateProductsToScrapedProducts(affiliateProducts);
    }
  }
} catch (apiError) {
  // ✅ Fallback: Continuar con scraping nativo
  logger.warn('[ALIEXPRESS-FALLBACK] API failed, using native scraper', {...});
}

// ✅ PRIORIDAD 2: Scraping nativo (si API no está disponible o falló)
return await this.scrapeAliExpressNative(query, options);
```

## Logging y Diagnóstico

### Logs de API

**Cuando se usa la API:**
```
[ALIEXPRESS-API] Using official API for product search
[ALIEXPRESS-API] Llamada exitosa (duration: 2345ms, productsFound: 5)
```

**Cuando falla la API:**
```
[ALIEXPRESS-FALLBACK] Using native scraper because API failed
  - errorType: TIMEOUT | API_ERROR
  - reason: "API no respondió a tiempo" | "Error en API: ..."
  - recommendation: "Verificar conectividad..." | "Verificar credenciales..."
```

**Cuando no hay credenciales:**
```
[ALIEXPRESS-FALLBACK] Using native scraper because no API credentials found
  - reason: "No se encontraron credenciales de AliExpress Affiliate API configuradas"
  - recommendation: "Configurar credenciales en API Settings"
```

### Endpoint de Diagnóstico

**GET `/api/system/api-status`**

Retorna el estado de todas las APIs configuradas, incluyendo:
- `aliexpress-affiliate`: Estado, configuración, último uso, errores
- `aliexpress-dropshipping`: Estado, OAuth status, tokens válidos

**Ejemplo de respuesta:**
```json
{
  "success": true,
  "data": {
    "apis": [
      {
        "name": "aliexpress-affiliate",
        "isConfigured": true,
        "isAvailable": true,
        "lastChecked": "2025-11-30T03:48:03.232Z",
        "environment": "sandbox"
      }
    ]
  }
}
```

## Configuración de Credenciales

### AliExpress Affiliate API

**Campos requeridos:**
- `appKey`: Application Key de AliExpress Open Platform
- `appSecret`: Application Secret
- `trackingId`: Tracking ID (opcional, para affiliate tracking)
- `sandbox`: `true` para sandbox, `false` para production

**Ubicación:** Frontend → API Settings → AliExpress Affiliate API

**Validación:**
- `appKey` y `appSecret` no pueden estar vacíos
- `sandbox` debe ser booleano
- Las credenciales se guardan encriptadas en `ApiCredential` table

### AliExpress Dropshipping API

**Campos requeridos:**
- `appKey`: Application Key de AliExpress Open Platform
- `appSecret`: Application Secret
- `sandbox`: `true` para sandbox, `false` para production

**OAuth Flow:**
1. Usuario configura `appKey` y `appSecret` en API Settings y hace click en "Guardar"
2. Usuario hace click en "OAuth" en API Settings
3. Sistema genera automáticamente el callback URL: `https://ivanreseller.com/aliexpress/callback` (no requiere configuración manual)
4. Sistema genera URL de autorización con `client_id`, `redirect_uri`, `state`
5. Usuario autoriza en AliExpress
6. AliExpress redirige a `/aliexpress/callback?code=XXX&state=YYY`
7. Sistema intercambia `code` por `access_token` y `refresh_token`
8. Tokens se guardan automáticamente y encriptados en `ApiCredential` table

**Nota importante:** A diferencia de eBay y MercadoLibre, **no es necesario configurar manualmente el Redirect URI** para AliExpress Dropshipping. El sistema usa automáticamente el callback URL configurado en AliExpress Open Service (`https://ivanreseller.com/aliexpress/callback`).

**Refresh Token:**
- Los tokens expiran después de `expires_in` (generalmente 24 horas)
- El sistema automáticamente refresca el token usando `refresh_token` cuando expira
- Si el `refresh_token` también expira, el usuario debe re-autorizar

## Manejo de Moneda y Precios

### Desde API

**Prioridad:** Usar moneda directamente de la API
- La API siempre retorna la moneda correcta
- No se aplica corrección CLP↔USD (esa lógica solo aplica para scraping)

**Ejemplo:**
```typescript
const productCurrency = product.currency || userBaseCurrency || 'USD';
// ✅ Usar directamente, sin inferir desde precio
```

### Desde Scraping

**Lógica de corrección:**
- Si se detecta posible confusión CLP↔USD (precio muy alto/bajo), se intenta corregir
- Esta lógica solo aplica cuando se usa scraping nativo

## Variables de Entorno

### AliExpress Affiliate API

```env
# Production
ALIEXPRESS_AFFILIATE_APP_KEY=your_app_key
ALIEXPRESS_AFFILIATE_APP_SECRET=your_app_secret
ALIEXPRESS_AFFILIATE_TRACKING_ID=your_tracking_id

# Sandbox (opcional)
ALIEXPRESS_AFFILIATE_SANDBOX_APP_KEY=sandbox_app_key
ALIEXPRESS_AFFILIATE_SANDBOX_APP_SECRET=sandbox_app_secret
```

### AliExpress Dropshipping API

```env
# Production
ALIEXPRESS_DROPSHIPPING_APP_KEY=your_app_key
ALIEXPRESS_DROPSHIPPING_APP_SECRET=your_app_secret

# Sandbox (opcional)
ALIEXPRESS_DROPSHIPPING_SANDBOX_APP_KEY=sandbox_app_key
ALIEXPRESS_DROPSHIPPING_SANDBOX_APP_SECRET=sandbox_app_secret
```

## Troubleshooting

### Problema: La API siempre hace timeout

**Posibles causas:**
1. Credenciales incorrectas o inválidas
2. Problemas de conectividad con AliExpress
3. La API está temporalmente inaccesible

**Solución:**
1. Verificar credenciales en API Settings
2. Revisar logs para ver el error específico
3. El sistema automáticamente hace fallback a scraping nativo

### Problema: No se encuentran credenciales aunque estén configuradas

**Posibles causas:**
1. Credenciales marcadas como `isActive: false`
2. Credenciales corruptas (error de desencriptación)
3. Ambiente incorrecto (sandbox vs production)

**Solución:**
1. Verificar que las credenciales estén activas en la BD
2. Revisar logs para errores de desencriptación
3. Verificar que el ambiente sea correcto (sandbox/production)

### Problema: OAuth de Dropshipping API falla

**Posibles causas:**
1. `appKey` o `appSecret` incorrectos o no guardados
2. `authorization_code` expirado (válido solo 10 minutos)
3. Callback URL no coincide con el configurado en AliExpress Open Platform (debe ser `https://ivanreseller.com/aliexpress/callback`)

**Solución:**
1. Verificar que `appKey` y `appSecret` estén correctamente guardados en API Settings antes de hacer clic en OAuth
2. Verificar que el Callback URL en AliExpress Open Platform sea exactamente: `https://ivanreseller.com/aliexpress/callback`
3. Intentar autorizar de nuevo (el código expira rápido, generalmente 10 minutos)
4. **No es necesario configurar Redirect URI manualmente** - el sistema lo maneja automáticamente

## Referencias

- [AliExpress Open Platform Documentation](https://open.aliexpress.com/doc/doc.htm)
- [AliExpress Affiliate API](https://open.aliexpress.com/doc/doc.htm?docId=87&docType=1)
- [AliExpress Dropshipping API](https://open.aliexpress.com/doc/doc.htm?docId=118&docType=1)
- [OAuth 2.0 Flow](https://open.aliexpress.com/doc/doc.htm?docId=118&docType=1#?docType=1&docId=118&id=10)


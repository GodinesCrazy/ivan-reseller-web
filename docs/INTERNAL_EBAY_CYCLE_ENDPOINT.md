# Endpoint Interno - Ciclo Real de eBay

## Objetivo
Ejecutar el ciclo completo de dropshipping (AliExpress ? Rentabilidad ? Publicación REAL en eBay) desde Railway usando un endpoint interno protegido.

## Endpoint
`POST /api/internal/run-ebay-cycle`

## Protección
El endpoint requiere el header:
```
x-internal-secret: <INTERNAL_RUN_SECRET>
```

## Configuración Requerida

### Variable de Entorno
- `INTERNAL_RUN_SECRET`: Secret para proteger el endpoint (configurar en Railway)

### Variables eBay (ya configuradas)
- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_REFRESH_TOKEN`
- `EBAY_ENV` (`production` o `sandbox`)
- `ENABLE_EBAY_PUBLISH=true`

### Variables AliExpress (ya configuradas)
- `ALIEXPRESS_APP_KEY`
- `ALIEXPRESS_APP_SECRET`

## Uso

### Ejecutar desde Railway
```bash
curl -X POST https://<tu-dominio-railway>/api/internal/run-ebay-cycle \
  -H "x-internal-secret: <INTERNAL_RUN_SECRET>" \
  -H "Content-Type: application/json"
```

### Respuesta Exitosa
```json
{
  "success": true,
  "message": "Ciclo real de dropshipping con eBay ejecutado correctamente",
  "data": {
    "keywordsAnalyzed": ["wireless earbuds", "gaming keyboard"],
    "productsFound": 15,
    "productsPublishable": 3,
    "productPublished": "Wireless Bluetooth Earbuds",
    "listingId": "123456789",
    "price": 29.99,
    "expectedProfit": 8.50
  },
  "duration": "45000ms",
  "correlationId": "internal-1234567890"
}
```

### Respuesta de Error
```json
{
  "success": false,
  "error": "Faltan variables de entorno: EBAY_CLIENT_ID",
  "message": "Error ejecutando ciclo real de eBay",
  "duration": "500ms",
  "correlationId": "internal-1234567890"
}
```

## Logs Esperados

Si todo funciona correctamente, verás en los logs de Railway:

```
[PRECHECK] Validating environment variables
[PRECHECK] Validating database connectivity
[PRECHECK] Validating AliExpress Affiliate API
[TRENDS] Fetching trending keywords
[TRENDS] Keywords selected
[ALIEXPRESS] Searching products by keyword
[ALIEXPRESS] Candidates normalized
[ALIEXPRESS] Candidates persisted
[PROFITABILITY] Evaluating candidates
[PROFITABILITY] Publishable results
[EBAY-PUBLISH] Publishing selected product
[REPORT] FINAL
Ciclo real de dropshipping con eBay ejecutado correctamente
```

## Seguridad

- El endpoint NO se expone públicamente
- Requiere secret en header
- Si `INTERNAL_RUN_SECRET` no está configurado, el endpoint retorna 503
- Intentos no autorizados se loguean con IP y User-Agent

## Notas

- No modifica FASE 1, 2 ni 3
- Solo usa eBay (no MercadoLibre ni Amazon)
- Publica máximo 1 producto (STAGING_REAL)
- Todo queda auditado en logs y DB
- No se ejecuta automáticamente al boot

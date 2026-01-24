## FASE 4 - Publicacion real controlada en marketplaces

### Objetivo
- Publicar productos `publishable` en marketplaces reales con controles estrictos.
- Modo por defecto: `STAGING_REAL` (maximo 1 publicacion por ejecucion).
- No automatiza compras.

### Endpoint principal
`POST /api/marketplace/publish`

Body (FASE 4):
```json
{
  "marketplace": "mercadolibre",
  "limit": 1,
  "mode": "STAGING_REAL"
}
```

### Modo de publicacion
- `SIMULATED`: no publica realmente (solo registra intento).
- `STAGING_REAL` (default): publica real con controles y limite 1.
- `FULL_AUTO`: bloqueado en FASE 4.

### MercadoLibre (FASE 4.2)
Variables requeridas:
- `ML_CLIENT_ID`
- `ML_CLIENT_SECRET`
- `ML_ACCESS_TOKEN` (o `ML_REFRESH_TOKEN`)
- `ML_REFRESH_TOKEN` (si no hay access token)
- `ML_SITE_ID` (opcional, default `MLM`)
- `ML_USER_ID` (opcional, se resuelve via `/users/me`)

Flag de seguridad:
- `ENABLE_ML_PUBLISH=true`

Como obtener credenciales:
- Crear app en MercadoLibre Developers.
- Autorizar OAuth para obtener `access_token` y `refresh_token`.

### eBay (FASE 4.3)
Variables requeridas:
- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_REFRESH_TOKEN`
- `EBAY_ENV` = `sandbox` | `production`

Variables opcionales (si estan disponibles):
- `EBAY_DEV_ID`
- `EBAY_CERT_ID`

Flag de seguridad:
- `ENABLE_EBAY_PUBLISH=true`

Si no esta configurado:
- Respuesta `NOT_CONFIGURED` y el flujo no se bloquea.

### Amazon (FASE 4.4)
Variables requeridas (deteccion automatica):
- `AMAZON_CLIENT_ID`
- `AMAZON_CLIENT_SECRET`
- `AMAZON_REFRESH_TOKEN`
- `AMAZON_SELLER_ID`
- `AMAZON_REGION`

Requisitos adicionales para publicar:
- `AMAZON_MARKETPLACE_ID`
- `AMAZON_AWS_ACCESS_KEY_ID`
- `AMAZON_AWS_SECRET_ACCESS_KEY`

Si no esta configurado:
- Se marca como `SKIPPED` y no bloquea el pipeline.

### Persistencia
Se guarda en `marketplace_publications`:
- `marketplace`
- `listingId`
- `publishStatus` (`published | failed | skipped`)
- `publishedAt`
- `publishMode`
- `rawResponse`

### Logs obligatorios
- `[MARKETPLACE] Validating credentials`
- `[MARKETPLACE] Publishing product`
- `[MARKETPLACE] Publish success`
- `[MARKETPLACE] Publish failed`
- `[MARKETPLACE] Skipped (not configured)`

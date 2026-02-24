# eBay OAuth - Producción Railway

## Rutas habilitadas

| Ruta | Método | Descripción |
|------|--------|-------------|
| `/api/marketplace-oauth/authorize/ebay` | GET | Redirige a eBay OAuth (sin auth) |
| `/api/marketplace-oauth/oauth/start/ebay` | GET | Redirige a eBay OAuth (requiere auth) |
| `/api/marketplace-oauth/oauth/callback/ebay` | GET | Callback de eBay, intercambia code por tokens |

## Variables en Railway

```
EBAY_APP_ID=...
EBAY_CERT_ID=...
EBAY_REDIRECT_URI=https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/ebay
```

El EBAY_REDIRECT_URI debe coincidir EXACTAMENTE con el registrado en eBay Developer Portal.

## Prueba en producción

1. Abrir: https://www.ivanreseller.com/api/marketplace-oauth/authorize/ebay
2. Debe redirigir a la página de autorización de eBay
3. Tras autorizar, eBay redirige al callback
4. Tokens se guardan en `api_credentials` (userId=1)

# API Settings — modelo de verdad (integraciones)

## Dependencias de flujo (resumen)

| Capacidad | AliExpress Affiliate | AliExpress Dropshipping | ML / eBay / Amazon |
|-----------|----------------------|-------------------------|---------------------|
| Buscar fuente (AliExpress) | Sí | — | — |
| Comparables / precio mercado | — | — | Browse / ML search / SP-API |
| Publicar | — | — | OAuth + APIs de publicación |
| Comprar (dropship) | — | Sí | — |

## Capas

1. **CONFIGURADO (`isConfigured`)** — Existen credenciales mínimas en BD (o env) para esa API.
2. **AUTENTICADO / PUBLICACIÓN (`isAvailable`, `status`)** — OAuth o token válido para flujos de cuenta (ej. Mercado Libre `GET /users/me`, eBay health / cuenta).
3. **OPERATIONAL_FOR_OPPORTUNITIES_COMPARABLES** — El **mismo** endpoint que usa Opportunities para precios comparables responde desde la IP del backend:
   - ML: `GET /sites/{SITE_ID}/search` (público) o, si aplica, búsqueda autenticada.
   - eBay: Browse `item_summary/search` con token de aplicación u OAuth.

`flowOperational.opportunityComparables` en cada `APIStatus` expone el resultado del **probe** en `checkMercadoLibreAPI` / `checkEbayAPI`.

## Regla de producto

No mostrar “Configurado y funcionando” como sin matices cuando `opportunityComparables.state` es `degraded` o `error`: la UI debe indicar que **publicación ≠ comparables**.

# Origen y Destino

Este documento describe cómo el sistema diferencia **origen** (proveedor) y **destino** (país de entrega) en el flujo de publicación y cálculo de costos.

## Origen (fijo)

- **AliExpress (China)**: todos los productos provienen actualmente de AliExpress.
- Modelado en `Product.originCountry` (valor `'CN'` para AliExpress).
- Precios, imágenes y detalles se obtienen vía API AliExpress.
- Costo base: `aliexpressPrice`, shipping e impuestos se calculan para entrega desde China.

## Destino (según cuenta de marketplace)

El destino depende de la **cuenta de marketplace** donde se publica:

| Marketplace   | Origen de destino                    | Ejemplo                          |
|---------------|--------------------------------------|----------------------------------|
| eBay          | `marketplace_id` en credenciales     | EBAY_US → US                     |
| Mercado Libre | `siteId` en credenciales             | MLC → CL, MLM → MX               |
| Amazon        | `marketplace` en credenciales        | US, UK, DE, etc.                 |

## Servicio central: destination.service

El archivo `backend/src/services/destination.service.ts` centraliza la lógica:

- **`resolveDestination(marketplace, credentials)`**: devuelve `{ countryCode, currency, region, siteId?, marketplaceId?, language }` según la cuenta.
- **`regionToCountryCode(region)`**: convierte región (cl, us, mx, etc.) a código ISO (CL, US, MX) para AliExpress `ship_to_country`, impuestos, etc.

## Uso en el flujo

1. **Oportunidades**: `region` del filtro (o RegionalConfig) → `regionToCountryCode(region)` para AliExpress `shipToCountry` y cálculo de impuestos.
2. **Preview**: `getMarketplaceConfig` usa `resolveDestination` con credenciales para currency, region y language.
3. **Publicación ML**: se resuelve destino con `resolveDestination('mercadolibre', creds)`; se registra `countryCode` para trazabilidad.

## Preparación para multi-cuenta

El modelo actual permite una credencial por marketplace por usuario. Para soportar múltiples países (ej. ML Chile + ML México):

- Se puede extender `ApiCredential` o crear `MarketplaceAccount` con `siteId` / `targetCountry`.
- `resolveDestination` ya soporta múltiples sites (MLC, MLM, MLA, etc.); el cambio sería permitir varias credenciales por marketplace con distintos `siteId`.

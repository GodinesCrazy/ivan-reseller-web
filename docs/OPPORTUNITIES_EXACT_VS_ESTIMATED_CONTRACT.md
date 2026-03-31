# Contrato: exacto vs estimado vs no disponible (Opportunities)

## Campos por ítem

- **`commercialTruth`**: `exact` | `estimated` | `unavailable` por coste, precio sugerido, margen, ROI (según lógica existente en opportunity-finder).
- **`competitionDiagnostics`**: por marketplace, `probeCode`, `dataSource`, `listingsFound`.

## Fuentes de datos comparables (`dataSource`)

- `mercadolibre_public_catalog` — `/sites/{id}/search` sin OAuth.
- `mercadolibre_authenticated_catalog` — búsqueda con token de usuario cuando el público falla.
- `ebay_browse_application_token` / `ebay_browse_user_oauth` — Browse API.
- `amazon_catalog` — SP-API (requiere credenciales).

## Reglas

- **ESTIMADO** solo cuando el pipeline no obtuvo precios comparables reales (o política de fees/shipping lo marca así). No suprimir ESTIMADO por cosmética.
- **403 ML público** → diagnóstico explícito; si el fallback autenticado devuelve listados, el precio puede pasar a **exact** según reglas existentes del finder.

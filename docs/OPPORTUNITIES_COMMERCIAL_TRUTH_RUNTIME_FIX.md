# Opportunities — ajustes de verdad comercial (runtime)

## Backend

1. **`mercadolibre.service.ts`** — `User-Agent` explícito en búsqueda pública (mejora marginal frente a bloqueos por cliente anónimo).
2. **`competitor-analyzer.service.ts`**
   - Reintento regional MLM si el sitio principal falla o está vacío.
   - **Fallback**: si hay token ML + clientId/secret, usa `MercadoLibreService.searchProducts` (misma ruta autenticada que el SDK interno).
   - Códigos de diagnóstico: `ML_PUBLIC_CATALOG_HTTP_FORBIDDEN`, `ML_PUBLIC_CATALOG_REQUEST_FAILED`, `ML_PUBLIC_CATALOG_ZERO_RESULTS`.
   - `dataSource`: `mercadolibre_authenticated_catalog` cuando el precio viene del fallback autenticado.
3. **`api-availability.service.ts`** — Probes `probeMercadoLibreOpportunityComparables` y `probeEbayOpportunityComparables` + campo `flowOperational` en `APIStatus`.
4. **`getCapabilities`** — `opportunityComparables.{ mercadolibre, ebay, messages, checkedAt }` para banner en Opportunities.

## Frontend

- **`APISettings.tsx`** — Si comparables `degraded|error`, estado unificado **partially_configured** con mensaje de publicación vs comparables.
- **`Opportunities.tsx`** — Banner ámbar cuando capabilities reportan comparables degradados y el marketplace está seleccionado.

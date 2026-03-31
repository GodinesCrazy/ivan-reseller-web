# Causa raíz: API Settings vs Opportunities

## Qué pasaba

- **Mercado Libre**: `checkMercadoLibreAPI` validaba **solo** OAuth con `GET /users/me`. Eso prueba publicación/cuenta, **no** el catálogo público que usa Opportunities (`/sites/{id}/search`).
- Desde IPs de hosting (p. ej. Railway), ML a menudo devuelve **403** en búsqueda pública mientras `users/me` sigue en 200 → contradicción “verde” en Settings y errores / ESTIMADO en Opportunities.
- **eBay**: Health check vía `testConnection` / cuenta no equivale a “hay resultados Browse”; **cero resultados** es un caso válido de API, no siempre fallo de credenciales.

## Evidencia en código (antes)

- `auth-status.routes.ts`: en producción solo lee `marketplace_auth_status` (AliExpress-heavy); no define salud ML/eBay para comparables.
- `api-availability.service.ts` — `checkMercadoLibreAPI`: sin probe de `/sites/.../search`.
- `competitor-analyzer.service.ts`: solo catálogo público ML; sin fallback autenticado.

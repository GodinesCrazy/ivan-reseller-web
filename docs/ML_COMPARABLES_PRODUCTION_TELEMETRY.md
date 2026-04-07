## ML comparables — producción, telemetría por intento

- Se agregó telemetría estructurada en `CompetitorAnalyzerService` (rama MercadoLibre) detrás de:
  - `ML_COMPARABLES_DEBUG=1`
  - `ML_COMPARABLES_DEBUG_USER_ID=<id opcional>`
- Cada intento registra:
  - `traceId`, `userId`, `region`
  - título crudo (muestra), `normalizedQuery`
  - estado de credenciales (presentes, access/refresh)
  - resultado de búsqueda autenticada (primario + MLM)
  - resultado de catálogo público (primario + MLM)
  - decisión final (`auth_comparables_used`, `estimated_due_to_public_403_after_auth_zero`, etc.).


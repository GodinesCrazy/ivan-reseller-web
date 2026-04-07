## ML comparables — traza de ruta autenticada

Cuando `ML_COMPARABLES_DEBUG=1`:

- Cada ejecución de comparables MercadoLibre emite un log JSON:
  - mensaje: `[competitor-analyzer] ML comparables telemetry`
  - campos clave:
    - `traceId`, `userId`, `region`
    - `normalizedQuery`
    - `siteIdInitial`, `siteIdFinal`
    - bloque `auth` (intentado, status, httpStatus, listings, error)
    - bloque `pub` (intentado, status HTTP, listings, error)
    - `finalDecision`.
- Esto permite ver en producción si:
  - la ruta autenticada se ejecutó,
  - con qué `siteId`,
  - si devolvió resultados o errores,
  - y cómo terminó la decisión (valores reales vs ESTIMADO).


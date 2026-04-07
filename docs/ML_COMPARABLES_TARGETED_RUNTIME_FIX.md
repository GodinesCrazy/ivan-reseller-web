## ML comparables — plan de fix dirigido

Flujo recomendado tras capturar un intento real con telemetría:

1. Revisar `auth`:
   - si `statusPrimary/statusMLM` son `skipped_no_credentials` → problema de OAuth/config.
   - si son `failed` con HTTP y `error*` → investigar token/scope o endpoint.
   - si son `ok` pero `listings*` están en 0 → posible problema de `siteId` o `normalizedQuery`.
2. Revisar `pub`:
   - confirmar 403 público consistente vs IP/WAF.
3. Ajustar solo lo que la telemetría pruebe:
   - sitio, normalización de query, caminos de refresh, etc.


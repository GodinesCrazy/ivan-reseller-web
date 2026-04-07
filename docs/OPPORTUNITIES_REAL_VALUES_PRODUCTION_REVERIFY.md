## Opportunities — re-verificación de valores reales en producción

Pasos tras habilitar `ML_COMPARABLES_DEBUG` para un usuario afectado:

1. Ejecutar una búsqueda real en Opportunities.
2. Localizar en logs `[competitor-analyzer] ML comparables telemetry` con el `userId` y `traceId`.
3. Confirmar:
   - si `finalDecision` pasa a `auth_comparables_used` (valores reales),
   - o si permanece en alguna variante de `estimated_*` con causa raíz ya probada.


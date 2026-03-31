# Veredicto final — alineación integración / Opportunities

## Estado

**Parcialmente alineado y más honesto en runtime.**

- Se elimina la ficción de que “ML verificado = comparables OK”: el probe y la UI lo separan.
- Si ML sigue bloqueando la IP del backend, **puede** seguir habiendo ESTIMADO; el sistema ahora **declara** el bloqueo y prueba fallback autenticado cuando hay token.

## Archivos tocados (resumen)

- `backend/src/services/api-availability.service.ts` — tipos, probes, `getCapabilities`.
- `backend/src/services/mercadolibre.service.ts` — headers búsqueda pública.
- `backend/src/services/competitor-analyzer.service.ts` — fallback ML + códigos.
- `backend/src/services/__tests__/api-availability-flow-operational.test.ts` — contrato de tipo.
- `frontend/src/pages/APISettings.tsx` — `getUnifiedAPIStatus` + tipos.
- `frontend/src/pages/Opportunities.tsx` — banner + labels de fuente.

## Veredicto literal solicitado

**API_SETTINGS_FIXED_BUT_OPPORTUNITIES_STILL_FALLBACK_ESTIMATED** — *condicional*: solo donde el proveedor o la red siguen impidiendo datos reales; ya no es silencioso ni contradice el estado de Settings.

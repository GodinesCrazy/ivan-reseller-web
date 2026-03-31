# Tests y validación — integration truth

## Ejecutado

```bash
cd backend && npx tsc --noEmit
cd backend && npx jest src/services/__tests__/api-availability-flow-operational.test.ts
cd frontend && npm run build
```

## Validación manual recomendada (post-deploy)

1. API Settings → Mercado Libre / eBay: con comparables degradados debe verse **advertencia** (partially_configured), no solo verde pleno.
2. Opportunities → con ML+eBay marcados y `capabilities.opportunityComparables` en `degraded`, debe aparecer el **banner ámbar**.
3. Búsqueda real: si el fallback autenticado ML funciona, filas deben dejar de depender solo de ESTIMADO cuando el finder recibe precios.

## Bloqueadores externos

- WAF / 403 persistente de Mercado Libre hacia la IP de Railway sin ruta alternativa acordada con ML.
- eBay Browse sin scopes / app keys válidos (probe y comparables fallan con 401/403).

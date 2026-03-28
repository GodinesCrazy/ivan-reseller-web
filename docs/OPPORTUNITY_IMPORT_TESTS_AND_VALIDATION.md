# Opportunity import — tests and validation

## Automatizado (ejecutado)

- `backend`: `npm run type-check` — OK.
- `backend`: Jest  
  - `src/__tests__/services/operational-truth.service.test.ts` (incluye envío gratis `0`).  
  - `src/services/__tests__/catalog-validation-state.service.test.ts` (`preventiveAuditPending`).
- `frontend`: `npm run build` — OK.

## Smoke manual (web)

1. Buscar en **Opportunities** (query real).
2. **Importar** un ítem con `productId` y URL estándar `/item/<id>.html`.
3. Abrir **Products** y verificar:
   - `productData` (vía API o admin) contiene `importSource`, `opportunityImport.aliExpressItemId`, `preventivePublish.marketplace`.
   - Tras respuesta 201, si hay credenciales Affiliate: columnas `aliexpressSku` y `shippingCost` pobladas cuando la API devuelve datos.
4. Si el workflow tiene analyze en **automatic**, comprobar que el producto **no** cae en `LEGACY_UNVERIFIED` solo por envío 0 cuando SKU + totalCost + país están presentes.

## Límites del smoke

- Requiere usuario con credenciales **aliexpress-affiliate** en production en el entorno probado.

## Comandos de referencia

```bash
cd backend && npm run type-check
cd backend && npx jest src/__tests__/services/operational-truth.service.test.ts src/services/__tests__/catalog-validation-state.service.test.ts --forceExit
cd frontend && npm run build
```

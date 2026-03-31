# E2E: Opportunities → Import → Products (audit + fixes)

## Intended flow

1. **Opportunities** (`GET /api/opportunities`): AliExpress discovery → `competitor-analyzer` (eBay Browse, ML public catalog, Amazon SP-API) → cost/margin/ROI → `commercialTruth` + `estimatedFields` / `estimationNotes`.
2. **Import** (`POST /api/products`): Zod-validated body; `product.service.createProduct` dedupes by **normalized AliExpress URL** (409 `RESOURCE_CONFLICT` + `existingProductId`, `duplicateBy`, `userMessage`).
3. **Opportunity enrichment** (`opportunity-import-enrichment.service`): Affiliate SKU + shipping, Dropshipping API fallback; writes `aliexpressSku`, `shippingCost`, `totalCost`, `productData.opportunityImport.*`.
4. **Auto-approve** (if analyze stage is automatic): Skipped when opportunity enrichment returns `ok: false` (avoids pushing hollow rows to APPROVED / LEGACY paths).
5. **Products read-model**: `getProductValidationSnapshot` drives `validationState`, `blockedReasons`, fee completeness.

## Root causes addressed (this change set)

| Symptom | Cause | Fix |
|--------|--------|-----|
| “ESTIMADO” sin explicación operativa | Competidor devolvía `{}` cuando faltaban credenciales o 0 resultados, sin diagnóstico por marketplace | `competitor-analyzer` registra filas vacías con `competitionProbe` (p. ej. `EBAY_BROWSE_NOT_CONFIGURED`, `ML_PUBLIC_CATALOG_ZERO_RESULTS`); `opportunity-finder` las vuelca a `estimationNotes` y `competitionDiagnostics` |
| Import sin contexto Chile | Selector de región sin `cl` | Opción **CL / Chile (Mercado Libre MLC)** + `targetCountry` desde `regionToIsoCountry(region)` en el payload |
| `incompleteFees` con costo inferible | Snapshot exigía `totalCost` en DB aunque `aliexpressPrice + shipping + importTax` bastaba | `catalog-validation-state.service`: `inferredTotalCost()` |
| Respuesta duplicado poco accionable | Solo mensaje en `error` | `error.middleware`: `code: DUPLICATE_PRODUCT_IMPORT`, `userMessage`; frontend: toast **Ya existe**, acciones **Abrir producto existente** / **Ir a Productos** |
| Pérdida de verdad comercial al importar | Payload mínimo | `productData.opportunitySnapshot` (truth, notas, diagnósticos, fees, región de búsqueda) |
| Delete inseguro con historial | Solo ventas (`Sale`) | `deleteProduct` también bloquea si hay `Order` con `productId` |
| `products.api.ts` roto | Interface `Product` mal cerrada (TS) | Interface completa + campos opcionales alineados con `toProduct` |

## Files touched (reference)

- `backend/src/services/competitor-analyzer.service.ts` — probes + stubs por marketplace.
- `backend/src/services/opportunity-finder.service.ts` — `competitionDiagnostics` + notas.
- `backend/src/services/opportunity-finder.types.ts` — tipo `competitionDiagnostics`.
- `backend/src/services/catalog-validation-state.service.ts` — costo total inferido.
- `backend/src/services/product.service.ts` — duplicado `userMessage`; delete + órdenes.
- `backend/src/middleware/error.middleware.ts` — campos estables para cliente en 409 duplicado.
- `frontend/src/pages/Opportunities.tsx` — CL, snapshot en `productData`, duplicate UX, banner estimado.
- `frontend/src/pages/Products.tsx` — copy delete (órdenes).
- `frontend/src/services/products.api.ts` — corrección sintaxis/tipos `Product`.
- `backend/src/services/__tests__/catalog-validation-state.service.test.ts` — caso inferido.

## Production verification (operator)

1. Desplegar backend (Railway) y frontend (Vercel) en el mismo commit.
2. Comprobar versión: build de frontend (hash de chunk `Opportunities-*.js`) y logs de deploy Railway.
3. Flujo: Oportunidades con región CL → importar → `GET /api/products` debe mostrar `targetCountry`/meta; duplicado debe responder 409 con `existingProductId` y toast **Ya existe**.

## Verdict

Canary ML sigue condicionado a credenciales ML + enriquecimiento AliExpress (Affiliate o Dropshipping) y a datos comparables reales cuando se quieren precios **exactos** en Oportunidades. Este entregable mejora **diagnóstico honesto**, **persistencia de verdad en import**, **fees inferibles** en validación, y **UX de duplicado**; no sustituye OAuth/credenciales ausentes ni catálogos vacíos.

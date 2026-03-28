# Opportunity import pipeline fix

## Objetivo

Que **Importar** desde Opportunities deje un `Product` con verdad de origen y metadatos **visibles** para validación, reconciliación y flujos posteriores (optimización, publish readiness).

## Cambios implementados

### 1. `mergeProductMetadata` (product.service)

- Sigue guardando `sourceData` para trazabilidad.
- **Eleva** `preventivePublish` y `opportunityImport` a la **raíz** de `productData` cuando vienen en `dto.productData`.
- Si `importSource === "opportunity_search"`, rellena raíz con `importSource`, `opportunityImport` y `preventivePublish` (marketplace, país, proveedor mínimo).

### 2. DTO y validación HTTP

- `CreateProductDto` + `createProductSchema` (Zod): `importSource`, `aliExpressItemId`, `targetMarketplaces`.
- `createProduct` extrae esos campos del resto para no pasarlos a Prisma.

### 3. Enriquecimiento sincrónico post-create

- Nuevo servicio: `backend/src/services/opportunity-import-enrichment.service.ts`.
- Tras `createProduct`, si el import es de oportunidad, se llama `enrichProductAfterOpportunityImport(productId, userId)` **antes** del bloque de auto-aprobación del workflow.
- Usa credenciales del usuario para **AliExpress Affiliate** (`getSKUDetails`, `getProductDetails`).

### 4. Reconciliación operativa

- `hasMachineVerifiablePublishContext`: envío resuelto si el valor es **conocido** (no null/undefined) y `>= 0`; `totalCost` sigue exigiendo `> 0` (coste total real de negocio).

### 5. Validación de catálogo

- Para `PENDING` + import de oportunidad, `!policyComplianceReady` genera **`preventiveAuditPending`** en lugar de `policyIncomplete`.

### 6. Frontend Opportunities

- Payload de import incluye `importSource`, `aliExpressItemId` (`item.productId`), `targetMarketplaces`.

## Archivos tocados (referencia)

- `backend/src/services/product.service.ts`
- `backend/src/services/opportunity-import-enrichment.service.ts` (nuevo)
- `backend/src/api/routes/products.routes.ts`
- `backend/src/services/operational-truth.service.ts`
- `backend/src/services/catalog-validation-state.service.ts`
- `frontend/src/pages/Opportunities.tsx`

## Estado antes vs después (resumen)

| Aspecto | Antes | Después |
|--------|-------|---------|
| `preventivePublish` en raíz | No | Sí (cuando aplica) |
| `aliexpressSku` tras import | Casi siempre null | Relleno por Affiliate cuando hay credenciales + ID ítem |
| Envío gratis | Trataba como “sin contexto” para reconcile | `0` cuenta como envío conocido |
| Auto-aprobación + reconcile | Degradaba a LEGACY sin contexto máquina | Tras enriquecer, contexto suele alcanzarse si API responde |
| Política en PENDING import | `policyIncomplete` genérico | `preventiveAuditPending` explícito |

# Opportunity import — root cause

## Symptom

Importar desde **Opportunities** creaba un producto en **Products** con filas “degradadas”: `missingSku`, `missingShipping`, verdad operativa pobre, y en muchos entornos **`LEGACY_UNVERIFIED`** tras el flujo automático de aprobación.

## Causas exactas (verificadas en código)

### 1. Metadatos de catálogo invisibles para la validación

`mergeProductMetadata` guardaba el payload del cliente **solo** bajo `sourceData` dentro de `productData` (JSON).  
`getProductValidationSnapshot` lee `preventivePublish` y `validatedCatalog` en la **raíz** del JSON.

**Efecto:** siempre faltaba contexto de proveedor / marketplace aunque el usuario hubiera elegido Mercado Libre en Opportunities → `supplierUnavailable`, `invalidMarketplaceContext`, y bloqueos en cadena.

**Archivo:** `backend/src/services/product.service.ts` — función `mergeProductMetadata`.

### 2. Sin persistencia de SKU AliExpress en el create

`POST /api/products` persistía URL, precios y costos opcionales, pero **no** rellenaba `Product.aliexpressSku`. Ese campo es el que usa el validador de catálogo para `missingSku`.

**Archivo:** `backend/src/services/product.service.ts` — `createProduct` (Prisma `create`).

### 3. Enriquecimiento posterior inexistente

No había paso que, tras el import, llamara a la **Affiliate API** (`getSKUDetails` / `getProductDetails`) para materializar SKU comprable y envío cuando el listado de oportunidades no los llevaba explícitos a columnas.

### 4. Reconciliación “fail-closed” incompatible con envío gratis o no numérico

`hasMachineVerifiablePublishContext` exigía `shippingCost > 0`. Con envío **gratis** (`0`) o coste no persistido, el contexto máquina se consideraba ausente.

Cuando el workflow ponía el producto en `APPROVED` en modo automático, `updateProductStatusSafely` reconciliaba contra esa función y **degradaba a `LEGACY_UNVERIFIED`**.

**Archivo:** `backend/src/services/operational-truth.service.ts`.

### 5. Política preventiva vs import honesto

Productos `PENDING` importados desde oportunidades no tienen aún auditoría preventiva completa; marcarlos como `policyIncomplete` mezclaba “falta real de política” con “pipeline aún no corrido”.

**Archivo:** `backend/src/services/catalog-validation-state.service.ts`.

## Resumen

El problema no era solo cosmético en Products: la combinación de **JSON mal estructurado**, **SKU no persistido**, **sin enriquecimiento**, **regla de envío demasiado estricta** y **auto-aprobación** producía estados incorrectos y poco operativos.

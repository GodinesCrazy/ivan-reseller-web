# Plan de corrección e implementación — Envío (Fases 1–3)

## Resumen

- **Fase 1:** Default de costo de envío configurable (`DEFAULT_SHIPPING_COST_USD`), helper `getEffectiveShippingCost` y uso en márgenes/totalCost (ya no se usa 0 cuando falta dato).
- **Fase 2.1:** MercadoLibre: payload de shipping derivado del producto (mode, free_shipping según `product.shipping` o `product.shippingCost`).
- **Fase 2.2:** eBay: política de fulfillment con valor configurable (`EBAY_DEFAULT_SHIPPING_USD`); alinear con `DEFAULT_SHIPPING_COST_USD` para márgenes consistentes.
- **Fase 3:** Observabilidad (log cuando se usa default), tests unitarios, documentación.

---

## Fase 1 — Completada

### Cambios

- **`config/env.ts`:** Variable `DEFAULT_SHIPPING_COST_USD` (default 5.99).
- **`utils/shipping.utils.ts`:**
  - `getEffectiveShippingCost(product, metadata?, options?)`: usa `product.shippingCost` o `metadata.shippingCost` si son válidos; si no, default de env o `options.defaultIfMissing`.
  - `getDefaultShippingCost()`: devuelve el default en USD.
- **Uso del default:** `marketplace.service.ts` (eBay, ML, Amazon y preview), `sale.service.ts` (createSaleFromOrder), `cost-calculator.service.ts`, `financial-calculations.service.ts`. `publisher.routes` y `analytics.routes` ya usaban el helper.
- **`.env.example`:** Sección SHIPPING con `DEFAULT_SHIPPING_COST_USD` y `EBAY_DEFAULT_SHIPPING_USD`.

### Criterio de éxito

En ningún flujo de margen/totalCost se usa 0 como costo de envío cuando no hay dato; siempre se usa un default explícito y configurable.

---

## Fase 2.1 — Completada

### Cambios

- **`marketplace.service.ts` (publicación ML):** En lugar de enviar siempre `shipping: { mode: 'not_specified', freeShipping: false }`, se deriva:
  - Si el producto tiene `shipping` con `mode` distinto de `not_specified`, se usa (mode + freeShipping).
  - Si no, se usa `mode: 'me2'` y `freeShipping: true` cuando `getEffectiveShippingCost(product) < 1`, y `freeShipping: false` en caso contrario.

### Criterio de éxito

El payload de MercadoLibre refleja envío por producto (free_shipping cuando el costo efectivo es bajo; mode me2 por defecto).

---

## Fase 2.2 — Completada

### Cambios

- **`internal.routes.ts` (creación de política eBay):** El monto de envío de la política se lee de `EBAY_DEFAULT_SHIPPING_USD` (default 4.99). Permite alinear con `DEFAULT_SHIPPING_COST_USD` para que lo que se cobra en eBay coincida con el costo usado en márgenes.
- **`.env.example`:** Comentario para `EBAY_DEFAULT_SHIPPING_USD` recomendando alinearlo con el default de envío.

### Criterio de éxito

La política única de eBay es configurable; se puede igualar al default de cálculos para consistencia de márgenes.

---

## Fase 3 — Completada

### Cambios

- **Observabilidad:** En `getEffectiveShippingCost`, cuando se usa el default por falta de dato, se hace log a nivel `debug`: `[SHIPPING] Using default cost (product has no shippingCost)` con `defaultUsd` y `productId` si existe.
- **Tests:** `utils/__tests__/shipping.utils.test.ts` — tests para `getEffectiveShippingCost` (producto con/sin valor, metadata, options.defaultIfMissing, negativos/NaN) y para `getDefaultShippingCost`.
- **Documentación:** Este reporte en `docs/SHIPPING_CORRECTION_AND_IMPLEMENTATION_REPORT.md`.

### Variables de entorno

| Variable | Uso | Default |
|----------|-----|---------|
| `DEFAULT_SHIPPING_COST_USD` | Costo de envío cuando el producto no tiene `shippingCost` (márgenes, totalCost). | 5.99 |
| `EBAY_DEFAULT_SHIPPING_USD` | Monto de envío en la política de fulfillment de eBay (creada vía internal). | 4.99 |

Recomendación: usar el mismo valor (p. ej. 5.99) en ambos para que el margen interno coincida con lo que paga el comprador en eBay.

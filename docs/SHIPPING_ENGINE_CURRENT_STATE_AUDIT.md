# Shipping Engine — Current State Audit

**Fecha:** 2026-04-04  
**Auditor:** Equipo Senior Backend + Logistics  
**Scope:** AliExpress → Mercado Libre Chile dropshipping shipping model

---

## A.1 Estado del modelo de shipping en el software

### Campos de shipping en `Product` (DB)

| Campo | Valor actual (producto 32722) | Evaluación |
|-------|------------------------------|-----------|
| `shippingCost` | `1.99` USD | ✅ Real quote AliExpress Standard Shipping |
| `importTax` | `1.14` USD | ✅ IVA Chile 19% sobre (supplier + freight) |
| `totalCost` | calculado | ✅ supplier + freight + IVA |
| `productData.mlChileFreight` | objeto JSON con `freightSummaryCode: freight_quote_found_for_cl` | ✅ Freight truth persistida |
| `productData.mlChileFreight.selectedServiceName` | `AliExpress Standard Shipping` | ✅ Servicio real |
| `productData.mlChileFreight.selectedFreightAmount` | `1.99` USD | ✅ Quote real |
| `productData.mlChileFreight.checkedAt` | `2026-04-01T21:32:05Z` | ⚠️ Stale en 3 días |
| `productData.mlChileFreight.selectionReason` | `standard_shipping_controlled_test` | ✅ |

### Payload de shipping hacia ML

```typescript
// marketplace.service.ts → mercadolibre.service.ts
{
  mode: 'me2',
  free_shipping: false,
  handling_time: 25,   // días hábiles declarados al comprador
}
```

**Problema real**: ML revierte `me2 → not_specified` durante el POST (`lost_me2_by_catalog`).
El listing queda con `mode: not_specified`, que entra en conflicto con `mandatory_settings.mode=me2` de la cuenta.
Resultado: ML marca el listing como `under_review:forbidden`.

### Qué ve el comprador hoy en ML

- **Badge**: "Entrega a acordar con el vendedor" (shipping.mode = not_specified)
- **Descripción**: "Este producto se despacha desde el exterior (China). Tiempo estimado: 20 a 30 días hábiles." ← workaround activo
- **ETA**: ninguno mostrado por ML (no_specified no genera ETA estimado)

### Qué se persiste en DB

| Campo | Modelo | Estado |
|-------|--------|--------|
| `productData.mlChileFreight` | JSON en `Product.productData` | ✅ Persistido y estructurado |
| `productData.mlChileLandedCost` | JSON en `Product.productData` | ✅ Persistido |
| `Order.shippingAddress` | JSON string en `Order` | ✅ Dirección real del comprador |
| `Order.shippingAddress._mlSaleAmountCLP` | JSON string (nuevo campo) | ✅ **Recién implementado** |
| `Order.price` | `Decimal` en `Order` | ⚠️ Almacena supplier cost (USD), no ML sale price |

### Qué usa el fulfillment al entrar una orden

**ANTES de esta implementación:**
1. Verificación de capital (PayPal balance ≥ order.price)
2. Verificación de límites diarios
3. Validación de dirección
4. `purchaseRetryService.attemptPurchase()` — sin verificación de freight

**DESPUÉS de esta implementación (nuevo):**
1. Verificación de capital (sin cambios)
2. Verificación de límites diarios (sin cambios)
3. **`resolveOrderTimeFreightTruth(productId, 'CL')`** — nuevo
4. **`checkOrderTimeProfitability({salePriceUsd, supplierCostUsd, freightUsd, ...})`** — nuevo
5. Gate: `AUTO_PURCHASE_BLOCKED_BY_FREIGHT` si netProfit < 0
6. Gate: `ORDER_REQUIRES_SHIPPING_RECHECK` si margen < 5% + freight estimado
7. `purchaseRetryService.attemptPurchase()` — sin cambios

---

## A.2 Documentos revisados

| Doc | Fecha | Relevancia |
|-----|-------|-----------|
| `ML_CHILE_SHIPPING_TRUTH_AUDIT.md` | 2026-04-01 | ✅ Fix handling_time:25 documentado |
| `ML_SHIPPING_ETA_TRUTH_REMEDIATION.md` | 2026-04-04 | ✅ Evaluación me2 correcta |
| `P31_FREIGHT_TRUTH_SOURCE_RECONCILIATION.md` | 2026-03-22 | ✅ Contrato canónico de freight truth |
| `P95_MLCHILEFREIGHT_PERSISTENCE_AUDIT.md` | 2026-03-xx | ✅ Auditoría de gaps de persistencia |
| `P27_LIVE_FREIGHT_RETEST.md` | 2026-03-22 | ✅ 9/10 productos con freight quote |
| `SHIPPING_CORRECTION_AND_IMPLEMENTATION_REPORT.md` | xx | ✅ Fases 1-3 de shipping utils |

---

## A.3 Diagnóstico: qué está bien / workaround / incompleto

### ✅ Ya correcto

- **Freight truth persistida** en `productData.mlChileFreight` con servicio, monto, timestamp
- **`pre-publish-validator`** verifica freshness (72h TTL) antes de publicar
- **`calculateBuyerFreight`** funciona con `sync_access_token` para CL (9/10 productos exitosos P27)
- **`handleTime: 25`** honesto para tránsito CN→CL
- **`shippingCost: false`** cuando costo de flete ≥ $1
- **Buyer address** capturada correctamente en order sync (city, state, zipCode)
- **Order-time freight recheck** — recién implementado en `order-time-freight.ts`
- **Profitability gate** — recién implementado en `order-fulfillment.service.ts`

### ⚠️ Workaround activo

- **Descripción con ETA** — texto manual de 20-30 días en descripción del listing. Necesario porque ML muestra "Entrega a acordar" cuando shipping.mode = not_specified
- **`Order.price` almacena supplier cost** — no el precio de venta ML. El campo `_mlSaleAmountCLP` en shippingAddress JSON lo complementa

### ❌ Problema sin resolver

- **`lost_me2_by_catalog`** — ML revierte me2→not_specified al crear listing en categoría MLC3530. No se puede cambiar `shipping.mode` en listings activos via API. Causa `under_review:forbidden`.
- **`mandatory_settings.mode=me2` vs `not_specified`** — conflicto estructural en la cuenta de ML. Ningún listing sobrevive más de 24-48h sin ir a forbidden.

---

## A.4 Ver: docs/SHIPPING_ENGINE_ARCHITECTURE_DECISION.md para la solución completa

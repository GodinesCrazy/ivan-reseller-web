# Shipping Engine — Architecture Decision

**Fecha:** 2026-04-04  
**Decisión:** MODELO D — Híbrido superior (precio absorbe flete + gate de rentabilidad en orden)  
**Estado:** Implementado

---

## Modelos evaluados

### A — Precio incluye envío absorbido
El precio de venta en ML se calcula incluyendo el costo de flete del proveedor.  
El comprador no ve un cargo de envío separado. El flete está baked into el precio.

**Pros**: Simple, sin fricción para el comprador, sin depender de que ML muestre un quote dinámico  
**Contras**: Si el flete cambia, el margen cambia silenciosamente

### B — Envío dinámico
ML muestra el costo real de envío del proveedor en tiempo real para cada comprador.

**Descartado**: ML no soporta esto. Los marketplaces no exponen quote dinámico del proveedor.
AliExpress API solo cotiza a nivel de país, no de comprador específico.

### C — Envío gratis con margen ajustado
`free_shipping: true`, flete absorbido completamente en precio de venta.

**Pros**: Mejora conversión en ML (badge "Envío gratis")  
**Contras**: Requiere que el margen cubra el flete; pricing engine debe recalcular.
Para AliExpress Standard Shipping ($1.99 USD) con margen del 18%, es viable.

### D — Modelo híbrido superior ← ELEGIDO
```
Capa 1 (interna):   Freight Truth Engine  →  verdad logística real del proveedor
Capa 2 (externa):   Shipping Representation Engine  →  representación compatible con ML
```

**Por qué D es superior a todos los demás**:
1. No depende de capacidades de ML que no existen (B)
2. No finjo que el flete es cero cuando no lo es (C)
3. El pricing ya absorbe el flete en el precio de venta (como A)
4. Agrega lo que A no tiene: **re-validación de flete real al entrar la orden**
5. **Gate de rentabilidad automático**: si el flete cambia y destroza el margen → compra bloqueada

---

## Capa 1 — Freight Truth Engine

### Responsabilidades
- Obtener freight real del proveedor para CL via `calculateBuyerFreight`
- Seleccionar servicio óptimo: `selectMlChileFreightOption` (preferencia tracked/standard)
- Persistir en `productData.mlChileFreight` con timestamp
- Re-cotizar al momento de la orden si el dato está stale (> 7 días)
- Retornar status flags: `SHIPPING_TRUTH_OK / ESTIMATED / MISSING`

### Archivos
```
backend/src/utils/order-time-freight.ts          ← motor principal
backend/src/utils/ml-chile-freight-selector.ts   ← selección de servicio óptimo
backend/src/utils/ml-chile-landed-cost.ts        ← cálculo landed cost con IVA 19%
backend/src/utils/aliexpress-freight-normalizer.ts ← normalización de respuesta API
backend/src/services/aliexpress-dropshipping-api.service.ts ← calculateBuyerFreight
backend/src/services/pre-publish-validator.service.ts ← gate en publish (72h TTL)
```

### Status flags

| Flag | Significado | Acción del sistema |
|------|------------|-------------------|
| `SHIPPING_TRUTH_OK` | Quote fresco (≤ 7 días) real | Continúa normalmente |
| `SHIPPING_TRUTH_ESTIMATED` | Quote stale; re-quote falló | Continúa con advertencia |
| `SHIPPING_TRUTH_MISSING` | Sin historial de freight | Usa $5.99 USD conservador |
| `PROFITABLE` | Margen positivo | Auto-purchase OK |
| `AUTO_PURCHASE_BLOCKED_BY_FREIGHT` | Flete destruye margen (netProfit < 0) | Order → FAILED |
| `ORDER_REQUIRES_SHIPPING_RECHECK` | Margen < 5% + freight estimado | Order → MANUAL_ACTION_REQUIRED |
| `INSUFFICIENT_DATA` | Sin datos de precio para calcular | Continúa (no bloquea) |

### Fórmula de rentabilidad

```
importDutyUsd   = (supplierCostUsd + freightUsd) * 0.19   // IVA Chile
mlFeeUsd        = salePriceUsd * 0.139                      // ML plan clásico
paymentFeeUsd   = salePriceUsd * 0.0349 + 0.49             // Mercado Pago
totalCostUsd    = supplierCostUsd + freightUsd + importDutyUsd + mlFeeUsd + paymentFeeUsd
netProfitUsd    = salePriceUsd - totalCostUsd
```

---

## Capa 2 — Shipping Representation Engine

### Estrategia actual: `me2 + handling_time: 25`

Es la representación más honesta disponible en ML para dropshipping desde China:
- No promete entrega en 2-5 días (doméstico)
- `handling_time: 25` muestra al comprador ETA ≈ 25 días
- Compatible con AliExpress Standard Shipping (~20-35 días reales)

### Limitación conocida: `lost_me2_by_catalog`

Para la categoría MLC3530 (soporte celular), ML revierte `me2 → not_specified` durante el POST.
Esto es una limitación de ML, no del software.

**Mitigación activa**: descripción del listing incluye info de envío internacional explícita.

**Mitigación pendiente**: resolver conflicto `mandatory_settings.mode=me2` vs `not_specified` con ML soporte.

### ¿Cuándo considerar `free_shipping: true`?

Si `selectedFreightAmount ≤ 0.50 USD`, se puede activar `free_shipping: true` para mejorar
conversión en ML (badge "Envío gratis"). El pricing engine ya absorbe el flete en el precio.

**Regla actual**: `free_shipping = (effectiveShippingCost < 1 USD)`.  
Para producto 32722 ($1.99 flete): `free_shipping: false`. Correcto.

---

## Flujo completo integrado

```
1. PRODUCTO IMPORTADO
   │
   ├── calculateBuyerFreight(CL) → persiste mlChileFreight
   ├── pricing engine: precio = (supplierCost + freight + importTax + mlFee) / (1 - minMargin)
   └── publish: mode=me2, handling_time=25, free_shipping=false

2. ORDEN RECIBIDA (PAID)
   │
   ├── resolveOrderTimeFreightTruth(productId) → SHIPPING_TRUTH_OK/ESTIMATED/MISSING
   ├── checkOrderTimeProfitability(salePriceUsd, supplierCostUsd, freightUsd)
   │     ├── PROFITABLE → continúa
   │     ├── AUTO_PURCHASE_BLOCKED_BY_FREIGHT → FAILED
   │     └── ORDER_REQUIRES_SHIPPING_RECHECK → MANUAL_ACTION_REQUIRED
   └── purchaseRetryService.attemptPurchase(shippingAddr)
         └── AliExpress recibe dirección real del comprador (city, state, zipCode)

3. ORDEN COMPRADA (PURCHASED)
   │
   └── fulfillment-tracking-sync → submitTrackingToMercadoLibre
```

---

## Decisión sobre granularidad geográfica

**AliExpress no soporta cotización por ciudad/código postal.** Esta es la arquitectura correcta dado eso:

1. No fingir que hay precisión donde no la hay
2. Usar quote country-level (CL) que es real y validado
3. Documentar la limitación explícitamente
4. El gate de rentabilidad usando el quote country-level es suficientemente conservador

La variación real de flete AliExpress entre Santiago y Talca es cero. Country-level es exacto.

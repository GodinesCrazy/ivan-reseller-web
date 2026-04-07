# Shipping Engine — Validation Rules

**Fecha:** 2026-04-04  
**Tests:** `backend/src/utils/__tests__/order-time-freight.test.ts`

---

## Reglas de validación implementadas

### R1 — Orden rentable pasa el gate

```
DADO: salePriceUsd=11.90, supplierCostUsd=4.00, freightUsd=1.99, status=OK
CUANDO: checkOrderTimeProfitability()
ENTONCES: allowed=true, status='PROFITABLE', netProfitUsd≈2.21
```

**Importancia:** Regresión crítica. Si este caso se bloquea, ninguna orden real de CL puede comprarse.

### R2 — Flete descontrolado bloquea la compra

```
DADO: salePriceUsd=11.90, supplierCostUsd=4.00, freightUsd=30.00
CUANDO: checkOrderTimeProfitability()
ENTONCES: allowed=false, status='AUTO_PURCHASE_BLOCKED_BY_FREIGHT', netProfitUsd<0
```

**Importancia:** Protege capital. Sin este gate, un cambio de flete podría causar pérdidas reales.

### R3 — Sin datos de precio no bloquea

```
DADO: salePriceUsd=0 (sin info de ML sale price)
CUANDO: checkOrderTimeProfitability()
ENTONCES: allowed=true, status='INSUFFICIENT_DATA'
```

**Importancia:** El gate no debe ser excesivamente restrictivo. Si no tenemos precio de venta, no bloqueamos — registramos como INSUFFICIENT_DATA y continuamos.

### R4 — Cálculo de ML fee correcto

```
DADO: salePriceUsd=100
ENTONCES: mlFeeUsd≈13.90 (13.9%)
```

### R5 — Cálculo de payment fee correcto

```
DADO: salePriceUsd=100
ENTONCES: paymentFeeUsd≈3.49+0.49=3.98 USD
```

### R6 — Cálculo de IVA Chile correcto

```
DADO: supplierCostUsd=10, freightUsd=5
ENTONCES: importDutyUsd=(10+5)*0.19=2.85 USD
```

### R7 — Flete cero es válido

```
DADO: freightUsd=0 (proveedor incluye envío en precio)
CUANDO: checkOrderTimeProfitability()
ENTONCES: allowed=true, IVA solo sobre supplierCostUsd
```

### R8 — SHIPPING_TRUTH_ESTIMATED con margen amplio no bloquea

```
DADO: freightUsd=1.99, margen=18.6%, status=SHIPPING_TRUTH_ESTIMATED
CUANDO: checkOrderTimeProfitability()
ENTONCES: allowed=true, status='PROFITABLE'
(solo bloquea si margen < 5% Y status ≠ OK)
```

### R9 — ORDER_REQUIRES_SHIPPING_RECHECK con margen thin + estimado

```
DADO: margen resultante < MIN_MARGIN_PCT (5%), shippingTruthStatus='SHIPPING_TRUTH_ESTIMATED'
CUANDO: checkOrderTimeProfitability()
ENTONCES: allowed=false, status='ORDER_REQUIRES_SHIPPING_RECHECK'
→ Order va a MANUAL_ACTION_REQUIRED (no a FAILED)
```

### R10 — Persistencia de freight truth tras re-quote

```
DADO: mlChileFreight stale (> 7 días), AliExpress API disponible
CUANDO: resolveOrderTimeFreightTruth()
ENTONCES:
  - nuevo quote obtenido
  - productData.mlChileFreight actualizado en DB
  - checkedAt = now()
  - selectionReason = 'order_time_recheck'
  - shippingCost column actualizada
  - retorna SHIPPING_TRUTH_OK
```

### R11 — Fallback conservador cuando sin freight truth

```
DADO: productData.mlChileFreight vacío, product.shippingCost = null
CUANDO: resolveOrderTimeFreightTruth()
ENTONCES:
  - freightUsd = 5.99 USD (conservative band)
  - status = 'SHIPPING_TRUTH_MISSING'
  - allowed = true (no bloquea — continúa con advertencia)
```

---

## Reglas de representación en ML (no-regresión)

### R12 — handling_time debe ser ≥ 20

`DROPSHIPPING_HANDLING_TIME_DAYS = 25`. Si esto baja a < 20, el ETA en ML no sería honesto para CN→CL.

### R13 — free_shipping solo cuando flete < $1 USD

```typescript
const freeShipping = effectiveShippingCost < 1;
```

Para `shippingCost: 1.99 USD` → `freeShipping: false`. Correcto.  
Si el proveedor ofrece flete gratuito (CAINIAO_STANDARD $0) → `freeShipping: true` es aceptable.

### R14 — _mlSaleAmountCLP siempre en CLP, nunca en USD

Si `total_amount` de ML es `11305` → almacenar `11305` (CLP), no `/950` = 11.9 (USD).
La conversión ocurre en el gate, no en el sync.

---

## Cómo ejecutar los tests

```bash
cd backend

# Cuando jest esté instalado en node_modules:
npx jest src/utils/__tests__/order-time-freight.test.ts --no-coverage

# Alternativa: type-check (siempre disponible)
npx tsc --noEmit
```

---

## Reglas de negocio que no deben romperse en el futuro

1. **La freight truth siempre se obtiene de AliExpress DS API o del último valor conocido.** Nunca usar 0 ni inventar un valor.
2. **El gate de rentabilidad NO bloquea cuando `INSUFFICIENT_DATA`.** Solo bloquea cuando puede calcular y el resultado es negativo.
3. **El gate de rentabilidad bloquea en `FAILED` si netProfit < 0**, independientemente del status de freight truth.
4. **El gate usa `ORDER_REQUIRES_SHIPPING_RECHECK` (manual) solo cuando la combinación es: margen thin + freight no confirmado.**
5. **La dirección real del comprador siempre llega a AliExpress** vía `purchaseRetryService.attemptPurchase(shippingAddr)`. No usar dirección ficticia.
6. **`_mlSaleAmountCLP` en shippingAddress es el precio de venta real de ML**, no el supplier cost.

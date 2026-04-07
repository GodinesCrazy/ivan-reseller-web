# Order-Time Freight Recheck Flow

**Fecha:** 2026-04-04  
**Implementado en:** `backend/src/utils/order-time-freight.ts`  
**Integrado en:** `backend/src/services/order-fulfillment.service.ts`

---

## ¿Por qué es necesario el recheck?

El `mlChileFreight` se persiste al momento de publicar el producto (TTL: 72h). Una orden puede llegar días,
semanas o meses después de la publicación. El flete del proveedor puede haber cambiado (variaciones
estacionales, cambios de servicio AliExpress, disponibilidad del carrier).

El recheck en order-time garantiza que la decisión de compra automática usa la información de flete
más reciente posible.

---

## Flujo completo

```
ORDER entra como PAID
    │
    ▼
resolveOrderTimeFreightTruth(productId, 'CL')
    │
    ├─── ¿productData.mlChileFreight fresco (≤ 7 días)?
    │         └── SÍ → SHIPPING_TRUTH_OK (usa dato persistido)
    │
    ├─── ¿Stale (> 7 días)?
    │         └── attemptLiveFreightReQuote()
    │                   ├── AliExpress API OK → persiste nuevo freight → SHIPPING_TRUTH_OK
    │                   └── AliExpress API falla → usa stale → SHIPPING_TRUTH_ESTIMATED
    │
    └─── ¿Sin freight truth?
              └── usa product.shippingCost o $5.99 USD → SHIPPING_TRUTH_MISSING
    │
    ▼
checkOrderTimeProfitability({ salePriceUsd, supplierCostUsd, freightUsd, status })
    │
    ├─── netProfit < 0
    │         └── AUTO_PURCHASE_BLOCKED_BY_FREIGHT → markFailed → FAILED
    │
    ├─── margin < 5% Y status ≠ SHIPPING_TRUTH_OK
    │         └── ORDER_REQUIRES_SHIPPING_RECHECK → markFailed → MANUAL_ACTION_REQUIRED
    │
    └─── PROFITABLE → continúa con purchaseRetryService.attemptPurchase()
```

---

## Cálculo de rentabilidad

```typescript
importDutyUsd   = (supplierCostUsd + freightUsd) * 0.19  // IVA Chile 19%
mlFeeUsd        = salePriceUsd * 0.139                    // ML fee 13.9%
paymentFeeUsd   = salePriceUsd * 0.0349 + 0.49           // Mercado Pago fee
totalCostUsd    = supplierCostUsd + freightUsd + importDutyUsd + mlFeeUsd + paymentFeeUsd
netProfitUsd    = salePriceUsd - totalCostUsd
```

Ejemplo real (producto 32722, comprador en Talca):
```
supplierCostUsd = 4.00 USD    (AliExpress)
freightUsd      = 1.99 USD    (AliExpress Standard Shipping)
importDutyUsd   = 1.14 USD    (19% IVA sobre $5.99)
mlFeeUsd        = 1.65 USD    (13.9% de $11.90)
paymentFeeUsd   = 0.91 USD    (3.49% + $0.49)
─────────────────────────────
totalCostUsd    = 9.69 USD
salePriceUsd    = 11.90 USD   (11,305 CLP / 950 = $11.90)
netProfitUsd    = 2.21 USD    (18.6% margen) → PROFITABLE ✅
```

---

## Flags de estado

| Flag | Significado | Acción |
|------|------------|--------|
| `SHIPPING_TRUTH_OK` | Freight fresco confirmado | Continúa |
| `SHIPPING_TRUTH_ESTIMATED` | Dato stale; API falló | Continúa con warning |
| `SHIPPING_TRUTH_MISSING` | Sin historial de freight | Continúa con band conservadora |
| `PROFITABLE` | Margen positivo | Compra automática OK |
| `AUTO_PURCHASE_BLOCKED_BY_FREIGHT` | Flete destruye margen | Order → FAILED |
| `ORDER_REQUIRES_SHIPPING_RECHECK` | Margen bajo + dato estimado | Order → MANUAL_ACTION_REQUIRED |
| `INSUFFICIENT_DATA` | Sin precios para calcular | Continúa (no bloquea) |

---

## Configuración

```bash
# En .env — margen mínimo antes de bloquear (default: 5%)
ORDER_MIN_MARGIN_PCT=0.05
```

---

## Limitación conocida: granularidad geográfica

**La API de AliExpress solo acepta `countryCode` (CL) — no ciudad ni código postal.**

Esto significa:
- Un comprador en Talca recibe la misma cotización de flete que uno en Santiago
- El flete real puede variar si el supplier cobra extra por regiones remotas (raro en AliExpress)
- Esta limitación es estructural en la API; no hay workaround actual
- La variabilidad real observada en AliExpress Standard Shipping es mínima por región en Chile

**Mejor aproximación profesional posible**: band conservadora CL ($1.99–$5.99 USD según servicio).
Si el flete real supera esta banda, el gate de rentabilidad lo detectará si los datos de precios están presentes.

---

## Log de audit (ejemplo)

```json
{
  "level": "info",
  "message": "[ORDER-FULFILLMENT] Freight truth + profitability gate",
  "orderId": "abc123",
  "productId": 32722,
  "freightUsd": 1.99,
  "shippingTruthStatus": "SHIPPING_TRUTH_OK",
  "serviceName": "AliExpress Standard Shipping",
  "profitStatus": "PROFITABLE",
  "netProfitUsd": 2.21,
  "breakdown": {
    "salePriceUsd": 11.90,
    "supplierCostUsd": 4.00,
    "freightUsd": 1.99,
    "importDutyUsd": 1.14,
    "mlFeeUsd": 1.65,
    "paymentFeeUsd": 0.91,
    "totalCostUsd": 9.69,
    "marginPct": 18.57
  }
}
```

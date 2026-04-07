# Shipping Engine — Implementation Report

**Fecha:** 2026-04-04  
**Status:** Completado — listo para compra real

---

## Archivos nuevos creados

### `backend/src/utils/order-time-freight.ts`

**Propósito:** Motor central del Freight Truth Engine para order-time.

**Exports públicos:**

```typescript
// Resolución de freight truth en 4 capas (fresh → stale+requote → stale → missing)
export async function resolveOrderTimeFreightTruth(
  productId: number,
  targetCountry: string = 'CL',
): Promise<OrderTimeFreightResult>

// Gate de rentabilidad: ¿la orden sigue siendo rentable con este flete?
export function checkOrderTimeProfitability(params: {
  salePriceUsd: number;
  supplierCostUsd: number;
  freightUsd: number;
  shippingTruthStatus: ShippingTruthStatus;
}): OrderTimeProfitabilityCheck
```

**Lógica de resolución:**
1. Lee `productData.mlChileFreight` del producto
2. Si fresco (≤ 7 días): retorna `SHIPPING_TRUTH_OK`
3. Si stale: intenta re-quote via `calculateBuyerFreight` → actualiza DB → retorna `SHIPPING_TRUTH_OK`
4. Si re-quote falla: usa valor stale → retorna `SHIPPING_TRUTH_ESTIMATED`
5. Si sin historial: usa `product.shippingCost` o band conservadora $5.99 → retorna `SHIPPING_TRUTH_MISSING`

**Extracción del AliExpress product ID:**
```typescript
// Extrae el ID desde product.aliexpressUrl via aliExpressSupplierAdapter.getProductIdFromUrl()
// No intenta leer from productData (ese campo no existe)
const aliexpressProductId = aliExpressSupplierAdapter.getProductIdFromUrl(product.aliexpressUrl)
```

**Fórmula de rentabilidad:**
```
ML Chile fee:   13.9%
Payment fee:    3.49% + $0.49 USD
Chile IVA:      19% sobre (supplierCost + freight)
Min margin:     ORDER_MIN_MARGIN_PCT (env, default 5%)
```

### `backend/src/utils/__tests__/order-time-freight.test.ts`

Tests para:
- Orden rentable (producto 32722 baseline)
- Bloqueo por flete descontrolado
- INSUFFICIENT_DATA cuando no hay precio
- Cálculo exacto del breakdown (ML fee, IVA, payment fee)
- Flete cero (envío incluido en precio del proveedor)

---

## Archivos modificados

### `backend/src/services/order-fulfillment.service.ts`

**Cambio:** Agregado bloque de freight gate antes del cambio a status PURCHASING.

```typescript
// Antes (línea ~175):
await prisma.order.update({ data: { status: 'PURCHASING' } });

// Ahora: primero el gate
if (order.productId) {
  const freightTruth = await resolveOrderTimeFreightTruth(order.productId, 'CL');

  // Resolve sale price: 1) from _mlSaleAmountCLP in shippingAddress, 2) product proxy
  const salePriceUsd = ...;
  const supplierCostUsd = product.aliexpressPrice;

  const profitCheck = checkOrderTimeProfitability({ salePriceUsd, supplierCostUsd, freightUsd, ... });

  if (!profitCheck.allowed && profitCheck.status === 'AUTO_PURCHASE_BLOCKED_BY_FREIGHT') {
    await this.markFailed(orderId, `AUTO_PURCHASE_BLOCKED_BY_FREIGHT: ${profitCheck.reason}`);
    return { success: false, status: 'FAILED' };
  }
  if (!profitCheck.allowed && profitCheck.status === 'ORDER_REQUIRES_SHIPPING_RECHECK') {
    await this.markFailed(orderId, `ORDER_REQUIRES_SHIPPING_RECHECK: ${profitCheck.reason}`);
    return { success: false, status: 'MANUAL_ACTION_REQUIRED' };
  }
}
// Luego: set PURCHASING y llamar purchaseRetryService
```

**Lógica de resolución del precio de venta ML:**
1. Lee `_mlSaleAmountCLP` del JSON en `order.shippingAddress` (nuevo campo de order sync)
2. Si existe: `salePriceUsd = mlSaleAmountCLP / 950`
3. Si no: usa `product.finalPrice` o `product.suggestedPrice` como proxy (en CLP → divide por 950)

### `backend/src/services/mercadolibre-order-sync.service.ts`

**Cambio:** Al crear el Order desde ML, persiste el ML sale amount real en CLP dentro del JSON de `shippingAddress`.

```typescript
// Antes:
shippingAddress: JSON.stringify(normalizedAddr)

// Ahora:
const mlSaleAmountCLP = toNumber((order as any).total_amount ?? 0);
const addrWithSaleMeta = {
  ...normalizedAddr,
  ...(mlSaleAmountCLP > 0 ? { _mlSaleAmountCLP: mlSaleAmountCLP } : {}),
};
shippingAddress: JSON.stringify(addrWithSaleMeta)
```

Sin DB migration. El campo `_mlSaleAmountCLP` es metadata adicional dentro del JSON existente.

### `backend/src/services/mercadolibre.service.ts`

**Cambio:** Logging mejorado cuando `me2` no puede ser aplicado post-creación.

Flag añadido: `SHIPPING_TRUTH_NOT_ENFORCED_ON_ML` en el log de warning cuando el PUT post-creación falla.
El comentario documenta la limitación estructural de ML.

---

## Variables de entorno nuevas

| Variable | Default | Descripción |
|---------|---------|-------------|
| `ORDER_MIN_MARGIN_PCT` | `0.05` | Margen mínimo (5%) antes de `ORDER_REQUIRES_SHIPPING_RECHECK` |

---

## Cosas que NO se cambiaron

- `Product.shippingCost` column semántica — sigue siendo el freight del proveedor en USD
- `Order.price` semántica — sigue siendo el supplier cost para el capital check
- `pre-publish-validator.service.ts` — el gate de 72h en publish-time no se tocó
- `ml-chile-freight-selector.ts` — sin cambios
- `ml-chile-landed-cost.ts` — sin cambios
- Schemas de Prisma — sin migrations necesarias
- Pipeline de imágenes, publicación, ML compliance — sin tocar

---

## Diagrama de flujo

```
Order PAID entra
    │
    ▼ checkDailyLimits()
    │
    ▼ hasSufficientFreeCapital()
    │
    ▼ parseShippingAddress()
    │
    ▼ [NUEVO] resolveOrderTimeFreightTruth(productId)
    │   └── reads mlChileFreight → SHIPPING_TRUTH_OK/ESTIMATED/MISSING
    │
    ▼ [NUEVO] checkOrderTimeProfitability(...)
    │   ├── PROFITABLE → continúa
    │   ├── AUTO_PURCHASE_BLOCKED_BY_FREIGHT → FAILED (no compra)
    │   └── ORDER_REQUIRES_SHIPPING_RECHECK → MANUAL_ACTION_REQUIRED
    │
    ▼ status = PURCHASING
    │
    ▼ purchaseRetryService.attemptPurchase(shippingAddr)
         └── AliExpress recibe dirección real (Talca, etc.)
```

# Simulación de Orden Real — Comprador en Talca, Chile

**Fecha:** 2026-04-04  
**Producto:** Soporte Escritorio Teléfono Gatito (ID: 32722)  
**Precio ML:** 11,305 CLP  
**Listing:** MLC3838173870 (actualmente under_review:forbidden — ver sección 6)

---

## Datos de entrada

```
Comprador: persona en Talca, Región del Maule, Chile
Dirección: [calle], Talca, Maule, 3460000, CL
Precio pagado en ML: 11,305 CLP
```

---

## Paso a paso del sistema

### Paso 1 — ML procesa el pago

ML genera un pedido con:
```json
{
  "id": "ML_ORDER_ID",
  "status": "paid",
  "total_amount": 11305,
  "currency_id": "CLP",
  "buyer": { "nickname": "COMPRADORXX" },
  "shipping": {
    "receiver_address": {
      "address_line": "Av. O'Higgins 1234",
      "street_number": "1234",
      "city": { "name": "Talca" },
      "state": { "name": "Maule" },
      "zip_code": "3460000",
      "country": { "name": "Chile" }
    }
  }
}
```

### Paso 2 — Order sync (cada ~10 minutos)

`syncMercadoLibreOrdersForUser()` detecta el pedido:

```typescript
// Dirección capturada correctamente
const normalizedAddr = {
  fullName: 'COMPRADORXX',
  addressLine1: 'Av. O\'Higgins 1234',
  city: 'Talca',
  state: 'Maule',
  zipCode: '3460000',
  country: 'CL',
};

// ML sale amount capturado (NUEVO — implementado 2026-04-04)
const mlSaleAmountCLP = 11305;
const addrWithSaleMeta = { ...normalizedAddr, _mlSaleAmountCLP: 11305 };

// Order creado en DB
await prisma.order.create({
  data: {
    price: 4.00,          // product.aliexpressPrice (supplier cost USD)
    currency: 'USD',
    shippingAddress: JSON.stringify(addrWithSaleMeta),
    // _mlSaleAmountCLP: 11305 embebido en el JSON
  }
});
```

### Paso 3 — fulfillOrder() se dispara

`orderFulfillmentService.fulfillOrder(orderId)`:

#### 3a. Capital check
```
order.price = 4.00 USD (supplier cost)
PayPal balance ≥ 4.00 USD → OK
```

#### 3b. Daily limits check
```
Límite diario: OK
```

#### 3c. Freight truth resolution [NUEVO]

```typescript
resolveOrderTimeFreightTruth(productId=32722, 'CL')
```

```
productData.mlChileFreight:
  freightSummaryCode: 'freight_quote_found_for_cl' ✅
  selectedServiceName: 'AliExpress Standard Shipping'
  selectedFreightAmount: 1.99 USD
  checkedAt: '2026-04-01T21:32:05Z'
  ageMs = (now - 2026-04-01) = 72h-96h

  ¿Fresco? → ageMs ≤ 7 días = SÍ (si es dentro de 7 días de la publicación)
  Status: SHIPPING_TRUTH_OK ✅
  freightUsd: 1.99
```

#### 3d. Profitability gate [NUEVO]

```typescript
checkOrderTimeProfitability({
  salePriceUsd: 11305 / 950 = 11.90 USD,  // desde _mlSaleAmountCLP
  supplierCostUsd: 4.00 USD,               // aliexpressPrice
  freightUsd: 1.99 USD,                    // mlChileFreight
  shippingTruthStatus: 'SHIPPING_TRUTH_OK',
})
```

**Cálculo detallado:**

| Componente | Cálculo | Resultado |
|-----------|---------|---------|
| Supplier cost | - | $4.00 USD |
| Freight AliExpress Standard | - | $1.99 USD |
| IVA Chile 19% | (4.00 + 1.99) × 0.19 | $1.14 USD |
| ML fee 13.9% | 11.90 × 0.139 | $1.65 USD |
| Mercado Pago 3.49% + $0.49 | 11.90 × 0.0349 + 0.49 | $0.91 USD |
| **Total costo** | **suma** | **$9.69 USD** |
| **Precio de venta** | **11,305 CLP / 950** | **$11.90 USD** |
| **Ganancia neta** | **11.90 - 9.69** | **$2.21 USD** |
| **Margen** | **2.21 / 11.90** | **18.6%** |

```
Resultado: PROFITABLE ✅ (margen 18.6% > mínimo 5%)
→ Compra automática autorizada
```

#### 3e. AliExpress purchase

```typescript
purchaseRetryService.attemptPurchase(
  productUrl,     // URL AliExpress del soporte gatito
  quantity: 1,
  maxBudget: 4.00 * 1.5 = 6.00 USD,
  shippingAddr: {
    fullName: 'COMPRADORXX',
    addressLine1: 'Av. O\'Higgins 1234',
    city: 'Talca',
    state: 'Maule',
    zipCode: '3460000',
    country: 'CL',
  }
)
```

AliExpress recibe la dirección real de Talca y despacha directamente al comprador.

### Paso 4 — Tracking

- AliExpress genera tracking en ~3-5 días
- `fulfillment-tracking-sync.service.ts` lo captura
- `submitTrackingToMercadoLibre(shipmentId, trackingNumber)` lo registra en ML

**ETA real:** 20-35 días calendario desde la compra en AliExpress.

---

## Qué shipping quote usa el sistema

| Fuente | Valor | Status |
|--------|-------|--------|
| AliExpress Standard Shipping | $1.99 USD | SHIPPING_TRUTH_OK (quote fresco) |
| ETA estimado | 20-35 días | Del servicio seleccionado |
| Granularidad | País (CL) — no ciudad | Limitación de AliExpress API |
| Talca vs Santiago | Sin diferencia de precio | Misma cotización para todo Chile |

---

## Resumen de riesgos residuales

| Riesgo | Probabilidad | Impacto | Estado |
|--------|-------------|---------|--------|
| **Listing forbidden en ML** | **Alta** | Sin ventas | ❌ Bloqueante activo |
| Tracking chino no aceptado por me2 | Media | Sin confirmación ML | Pendiente prueba real |
| Variación de flete > $5.99 USD | Muy baja | Margen reducido | Gate detecta si netProfit < 0 |
| AliExpress rechaza envío a Talca | Muy baja | Fulfillment falla | Retry service lo maneja |
| Tipo de cambio CLP/USD varía > 10% | Baja | Profit check impreciso | Gate usa 950 fijo |

---

## Resultado: qué pasaría si compra alguien en Talca HOY

**Si el listing estuviera activo:** el sistema ejecutaría la compra automática con margen del 18.6%.  
La dirección de Talca llegaría correctamente a AliExpress. El tracking se generaría en 3-5 días.

**En el estado actual:** el listing MLC3838173870 está `under_review:forbidden`. No llegarían órdenes
desde ML. El gate de freight funcionaría correctamente si se simulara una orden manual.

**Bloqueante**: el listing forbidden, no el shipping engine.

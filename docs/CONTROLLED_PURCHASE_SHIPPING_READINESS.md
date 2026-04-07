# Controlled Purchase Shipping Readiness

**Fecha:** 2026-04-04  
**Producto:** Soporte Escritorio Teléfono Gatito (ID: 32722)  
**Listing activo:** MLC3838173870 (actualmente under_review:forbidden)

---

## Escenario: alguien en Talca compra el producto hoy

### Paso 1 — ML procesa el pago
- Comprador paga 11,305 CLP en ML Chile
- ML genera el pedido con status `paid`
- El `receiver_address` incluye: city: "Talca", state: "Maule", zipCode: "3460000" (approx)

### Paso 2 — Order Sync (cada ~10 min)
`syncMercadoLibreOrdersForUser()` detecta el pedido y crea un `Order` en DB:
```json
{
  "status": "PAID",
  "shippingAddress": {
    "city": "Talca", "state": "Maule", "zipCode": "3460000", "country": "CL"
  },
  "price": 4.00,       ← aliexpressPrice del producto (USD)
  "currency": "USD"
}
```
⚠️ Nota: `order.price` es el costo del proveedor, no el precio de venta de ML.

### Paso 3 — fulfillOrder() ejecuta el freight gate

```
resolveOrderTimeFreightTruth(productId=32722, 'CL')
  ├── Lee productData.mlChileFreight
  │   ├── freightSummaryCode: 'freight_quote_found_for_cl' ✅
  │   ├── selectedFreightAmount: 1.99 USD ✅
  │   └── checkedAt: 2026-04-01 (3 días de antigüedad — ≤ 7d TTL)
  └── SHIPPING_TRUTH_OK → freightUsd: 1.99

checkOrderTimeProfitability(...)
  ├── supplierCostUsd: 4.00 (aliexpressPrice)
  ├── freightUsd: 1.99
  ├── salePriceUsd: 11.90 (11,305 CLP / 950 = $11.90 USD)
  ├── importDutyUsd: 1.14 (19% IVA)
  ├── mlFeeUsd: 1.65 (13.9%)
  ├── paymentFeeUsd: 0.91 (3.49% + $0.49)
  ├── totalCostUsd: 9.69
  └── netProfitUsd: 2.21 → PROFITABLE ✅ → continúa
```

### Paso 4 — AliExpress Purchase
`purchaseRetryService.attemptPurchase()` con shippingAddr:
```json
{ "country": "CL", "city": "Talca", "state": "Maule", "zipCode": "3460000" }
```
AliExpress recibe la dirección completa del comprador → AliExpress Standard Shipping directo a Talca.

### Paso 5 — Tracking
- AliExpress genera tracking en ~3-5 días desde la compra
- `fulfillment-tracking-sync.service.ts` lo captura
- `submitTrackingToMercadoLibre()` registra el tracking en el shipment de ML

---

## Riesgos que quedan activos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| Listing forbidden (shipping.mode conflict) | **Alta** | Sin ventas | Resolver me2/catalog issue con ML |
| Tracking chino rechazado por me2 shipment | Media | Sin confirmación de envío en ML | Probar con primer pedido real |
| Variación de flete (AliExpress sube precio) | Baja | Margen reducido | Gate detecta si netProfit < 0 |
| Comprador en zona remota (Isla de Pascua) | Muy baja | AliExpress puede rechazar | Verificar capabilities del proveedor |
| order.price = supplier cost (bug de precios) | Confirmado | Gate no puede verificar margen ML real | Fix: guardar ML sale price en order |

---

## Decisión: PARTIAL GO

### Qué está listo
- [x] Freight truth persistido y validado ($1.99 USD, AliExpress Standard Shipping)
- [x] Order-time freight recheck implementado
- [x] Profitability gate implementado
- [x] Order sync captura dirección real del comprador
- [x] AliExpress DS API acepta dirección completa para purchase
- [x] Tracking sync service existe

### Qué bloquea la compra real controlada
- [ ] **Listing activo en ML**: MLC3838173870 está `under_review:forbidden`
- [ ] **order.price bug**: el campo almacena el costo del proveedor, no el precio de venta ML → gate de rentabilidad no puede verificar margen real con exactitud

---

## Prerequisitos antes de la compra real de prueba

1. **Tener un listing activo en ML** (resolver forbidden issue)
2. **Corregir order.price**: guardar ML total_amount (en CLP) en un campo separado del Order, o convertir a USD y guardarlo
3. **Confirmar que ML acepta tracking externo** en shipment me2 (probar con primer pedido)
4. **Verificar capital PayPal**: suficiente para purchase AliExpress (~$5-6 USD total)

---

## Qué pasaría si se fuerza la compra hoy (simulación)

Si la compra se ejecutara hoy con el listing en forbidden:
- No llegarían órdenes reales desde ML (listing no activo)
- Si se simula una orden manual: el freight gate permitiría la compra (PROFITABLE)
- AliExpress recibiría el pedido con dirección correcta de Talca
- El tracking se generaría en ~3-5 días
- La experiencia del comprador dependería de la disponibilidad del listing en ML

**GO quando**: listing activo + order.price fix corregido.

# FASE 7 ? ALIEXPRESS REAL PURCHASE REPORT

Confirmar que, tras fulfillment, la orden queda comprada en AliExpress y la base de datos se actualiza correctamente.

## Condiciones

- **Order.status** debe pasar a **PAID** (por capture-order).
- **order-fulfillment.service.ts** ejecuta **fulfillOrder(orderId)** (desde capture-order o al detectar PAID).
- **executePurchase** usa **aliexpressDropshippingAPIService.placeOrder()** cuando hay OAuth.
- Tras éxito: **Order.status = PURCHASED**, **Order.aliexpressOrderId** rellenado.

## Consulta DB (tras compra real)

```sql
SELECT id, "userId", status, "aliexpressOrderId", "productUrl", price, "createdAt"
FROM orders
WHERE status = 'PURCHASED'
ORDER BY "updatedAt" DESC
LIMIT 5;
```

## Campos del reporte (rellenar tras compra real)

| Campo | Valor |
|-------|--------|
| **Order.id** | |
| **Order.userId** | |
| **Order.status** | PURCHASED |
| **Order.aliexpressOrderId** | (ID de orden en AliExpress) |
| **Order.productUrl** | |
| **Order.price** | |

## Verificación

- [ ] Order.status = 'PURCHASED'
- [ ] Order.aliexpressOrderId no es null
- [ ] Fulfillment se ejecutó (log/order-fulfillment o respuesta de capture-order con aliexpressOrderId)

---

*Rellenar tras una compra manual en el frontend y fulfillment automático exitoso.*

# Post-Sale E2E Readiness Audit — ML Chile

**Fecha:** 2026-04-01  
**Alcance:** Ciclo completo desde venta ML Chile → compra AliExpress → tracking → resolución

---

## Mapa del flujo post-venta

```
ML Chile (comprador paga)
    ↓ webhook / polling
syncMercadoLibreOrdersForUser()
    ↓ crea Order DB (status: PAID)
orderFulfillmentService.fulfillOrder(orderId)
    ↓ checkDailyLimits + hasSufficientFreeCapital
purchaseRetryService.attemptPurchase(aliexpressUrl, ...)
    ↓ AliExpress Dropshipping API
Order DB → status: PURCHASED + aliexpressOrderId
    ↓ (manual o cron)
submitTrackingToMercadoLibre(userId, mlOrderId, trackingNumber)
    ↓ ML API notifyShipmentShipped
Comprador ve tracking en ML
```

---

## Análisis de cada etapa

### 1. Order sync: `syncMercadoLibreOrdersForUser`

**Estado:** ✅ Implementado, funcional

| Aspecto | Evaluación |
|---------|------------|
| Fetch orders ML API | ✅ `mlService.searchRecentOrders(30)` — últimos 30 días |
| Filtro status `paid` | ✅ Solo procesa órdenes pagadas |
| Dedup por `paypalOrderId` | ✅ `mercadolibre:{mlOrderId}` — evita duplicados |
| Lookup product vía `marketplaceListings` | ✅ Busca por `listingId` del item ML |
| Shipping address normalizada | ✅ Mapea `shipping.receiver_address` |
| Trigger `fulfillOrder` | ✅ Llamado inmediatamente tras crear Order |
| Cron scheduling | ✅ `runMercadoLibreOrderSync` disponible para cron |

**Bug encontrado — Order amount:**
```typescript
const price = toNumber(product.aliexpressPrice ?? 0) > 0
  ? toNumber(product.aliexpressPrice)  // ← $1.69 USD (costo proveedor)
  : toNumber((product as any).suggestedPrice ?? 0);
const amount = price > 0 ? price : order.total_amount;
```
La orden se guarda con `price = $1.69` (costo AliExpress) y `currency: 'USD'` hardcoded.  
El precio real de venta fue $11,305 CLP. **El registro de ganancia en DB estará incorrecto.**  
Impacto en producción: bajo (no afecta la compra en AliExpress), pero los reportes de profit serán erróneos.

---

### 2. Fulfillment: `orderFulfillmentService.fulfillOrder`

**Estado:** ✅ Implementado, funcional con precondiciones

| Aspecto | Evaluación |
|---------|------------|
| Guard estado PAID | ✅ Solo procesa PAID / MANUAL_ACTION_REQUIRED |
| Guard daily limits | ✅ `checkDailyLimits` |
| Guard working capital | ✅ `hasSufficientFreeCapital` |
| Resolución URL AliExpress | ✅ Desde `order.productUrl` → `product.aliexpressUrl` → `listing.supplierUrl` |
| Timeout 300s | ✅ Protege contra cuelgues de AliExpress API |
| Validación URL pattern | ✅ Regex `[\/_](\d+)\.html` requerida |
| Shipping address → AliExpress | ⚠️ Envía dirección chilena del comprador a AliExpress |
| Status PURCHASED + aliexpressOrderId | ✅ Guardado en DB |
| `saleService.createSaleFromOrder` | ✅ Crea registro de venta (profit tracking) |
| Escalado a manual queue | ✅ `maybeEscalateFailedOrderToManual` en failure |

**Consideración sobre shipping address:**  
AliExpress API recibe la dirección del comprador chileno. AliExpress enviará directo a Chile.  
Esto es coherente con el modelo de dropshipping directo. ✅

---

### 3. Tracking submission: `submitTrackingToMercadoLibre`

**Estado:** ⚠️ Implementado pero NO probado en producción

| Aspecto | Evaluación |
|---------|------------|
| Fetch ML credentials | ✅ Via `marketplaceService.getCredentials` |
| `getOrder(mlOrderId)` | ✅ Obtiene `shipping.id` |
| `notifyShipmentShipped(shipmentId, tracking)` | ✅ Implementado |
| Integración AliExpress tracking → ML | ⚠️ Sin prueba real — ver limitación abajo |
| Trigger automático post-PURCHASED | ❌ **No existe** — se debe invocar manualmente o via cron |
| Cron para tracking check | ❌ No existe cron de polling de tracking de AliExpress |

**Flujo de tracking actual:**
1. AliExpress asigna tracking ~3-5 días después del pedido
2. **No hay polling automático del tracking de AliExpress**
3. El tracking debe ser ingresado manualmente o programar un job
4. Luego llamar `submitTrackingToMercadoLibre` manualmente

**Riesgo:** Si no se envía el tracking dentro del `handling_time` (25 días), ML puede escalar una disputa.

---

### 4. Tracking compatibility con `me2`

**Estado:** ⚠️ Sin confirmar

`me2` en ML Chile espera que el vendedor genere una etiqueta ML y haga drop-off.  
Con tracking externo (AliExpress Standard Shipping), es posible que ML acepte el tracking  
pero también posible que lo rechace porque el `shipment_id` fue creado para un envío doméstico.

**Para el primer pedido real:**
1. Ejecutar `submitTrackingToMercadoLibre` con el tracking de AliExpress
2. Si ML acepta → flujo validado
3. Si ML rechaza → evaluar migrar a `mode: 'not_specified'` en shipping config

---

## Resumen de readiness post-venta

| Etapa | Estado | Bloqueante para Phase H |
|-------|--------|------------------------|
| Order sync (cron) | ✅ Listo | No |
| fulfillOrder (AliExpress purchase) | ✅ Listo | No |
| Tracking polling automático | ❌ No existe | No (mitigable manual) |
| Tracking submission a ML | ⚠️ Sin probar en producción | No (manual para primer pedido) |
| Order amount en DB | ⚠️ Guarda costo, no precio venta | No (bug reportado, fix separado) |
| Reporting de profit | ⚠️ Incorrecto hasta fix de order amount | No |

**Conclusión:** El ciclo post-venta puede completarse manualmente para los primeros pedidos. No es bloqueante para Phase H. El tracking submission se valida con el primer pedido real.

---

## Acciones pendientes (post-Phase H)

1. **Fix order amount**: en `mercadolibre-order-sync.service.ts`, usar `order.total_amount` (precio de venta ML) y mapear currency desde el listing
2. **AliExpress tracking poller**: cron que consulte el aliexpressOrderId y actualice el tracking cuando esté disponible
3. **Auto-submit tracking**: trigger automático de `submitTrackingToMercadoLibre` cuando el tracking esté disponible
4. **Test con primer pedido real**: validar que `notifyShipmentShipped` acepta tracking externo en me2

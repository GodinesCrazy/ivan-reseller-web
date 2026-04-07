# POST_SALE_E2E_READINESS_AND_FIXES.md
**Fecha:** 2026-04-04  
**Fase:** F — Auditoría del ciclo postventa E2E

---

## F.1 Flujo Completo Cuando un Cliente Compra

### Diagrama del flujo esperado

```
Comprador compra en ML
        ↓
ML genera orden (status: paid)
        ↓
syncMercadoLibreOrdersForUser() — cron cada ~10 min
  → Fetch órdenes de ML API (últimos 30 días, status=paid)
  → Busca listing en DB (marketplace_listings, listingId = itemId de la orden)
  → Crea Order en DB (status=PAID, paypalOrderId="mercadolibre:<mlOrderId>")
        ↓
orderFulfillmentService.fulfillOrder(orderId)
  → Valida límites diarios (checkDailyLimits)
  → Valida capital libre (hasSufficientFreeCapital)
  → Parsea dirección del comprador (parseShippingAddress)
  → Resuelve AliExpress URL del producto (order.productUrl o product.aliexpressUrl)
  → Estado: PAID → PURCHASING
  → purchaseRetryService.attemptPurchase(productUrl, qty, budget, shippingAddr, ...)
        ↓
AliExpress Dropshipping API (aliexpress-dropshipping-api.service.ts)
  → getProductInfo(productId)
  → placeDropshippingOrder(productId, skuId, shippingAddr)
  → Obtiene aliexpressOrderId
        ↓
Order: PURCHASING → PURCHASED
  → Sale record creado automáticamente
        ↓
syncTrackingForEligibleOrders() — cron periódico
  → Fetch tracking desde AliExpress API
  → Actualiza Sale.trackingNumber + PurchaseLog.trackingNumber
  → submitTrackingToMercadoLibre(userId, mlOrderId, trackingNumber)
        ↓
ML muestra tracking al comprador
```

---

## F.2 Estado Real de Cada Componente

### 1. ML Order Sync (`mercadolibre-order-sync.service.ts`)
- **Código:** ✅ Implementado
- **Función:** `syncMercadoLibreOrdersForUser()` — fetcha órdenes ML API status=paid, crea Order en DB
- **Deduplicación:** ✅ Usa `paypalOrderId = "mercadolibre:<mlOrderId>"` para evitar duplicados
- **Dirección del comprador:** ✅ Parsea `shipping.receiver_address` de ML
- **Vinculación producto:** ✅ Busca `marketplace_listings.listingId` para enlazar con producto interno
- **Riesgo:** El cron de ejecución debe estar activo en Railway. Sin cron, las órdenes no se capturan automáticamente.

### 2. Order Fulfillment (`order-fulfillment.service.ts`)
- **Código:** ✅ Implementado
- **Pipeline:** PAID → PURCHASING → PURCHASED | FAILED
- **Dirección directa al comprador:** ✅ — `order.shippingAddress` → `shippingAddr` → pasada a AliExpress
- **Capital check:** ✅ — `hasSufficientFreeCapital`
- **Daily limits:** ✅ — `checkDailyLimits`
- **Timeout:** ✅ — 300 segundos máximo
- **Retry:** ✅ — `purchaseRetryService.attemptPurchase` con reintentos

### 3. AliExpress Dropshipping API (`aliexpress-dropshipping-api.service.ts`)
- **Código:** ✅ Implementado (68 KB, service completo)
- **API methods:** `getProductInfo`, `placeDropshippingOrder`, `getTrackingInfo`
- **Credenciales requeridas:** `appKey`, `appSecret`, `accessToken` para usuario 1
- **⚠️ RIESGO CRÍTICO:** Se desconoce si las credenciales de AliExpress Dropshipping API están configuradas en producción (Railway). Sin ellas, `attemptPurchase` falla inmediatamente.
- **Cómo verificar:** `GET /api/credentials?apiName=aliexpress-dropshipping` o revisar Railway env vars.

### 4. Tracking Sync (`fulfillment-tracking-sync.service.ts`)
- **Código:** ✅ Implementado
- **Función:** `syncTrackingForEligibleOrders()` — fetcha tracking de AliExpress, actualiza Sale, envía a ML
- **Submit a ML:** ✅ — `submitTrackingToMercadoLibre(userId, mlOrderId, trackingNumber)` via `mlService.notifyShipmentShipped()`
- **Riesgo:** AliExpress Standard Shipping puede tardar 5–15 días en generar tracking número.

### 5. ML Tracking Notification (`mercadolibre-fulfillment.service.ts`)
- **Código:** ✅ Implementado
- **Flujo:** `getOrder(mlOrderId)` → extrae `shipping.id` → `notifyShipmentShipped(shipmentId, trackingNumber)`
- **Riesgo:** Si `shipping.id` es null (vendedor sin logística ML activa), falla gracefully.

---

## F.3 ¿Qué Pasaría si Alguien Compra HOY?

### Escenario optimista (credenciales AliExpress configuradas)

```
✅ ML captura la orden (cron activo)
✅ Order creada en DB con dirección del comprador
✅ Sistema intenta compra en AliExpress (listing ya tiene aliexpressUrl)
⚠️  AliExpress placeOrder puede requerir intervención manual si:
   - SKU específico no disponible
   - Dirección chilena no compatible con formato AliExpress
   - Pago en AliExpress sin saldo suficiente
✅ Si compra exitosa → PURCHASED, Sale creada
✅ Tracking sync corre en cron → actualiza Sale
⚠️  submitTrackingToMercadoLibre puede fallar si shipping.id es null
```

### Escenario pesimista (credenciales AliExpress NO configuradas)

```
✅ ML captura la orden
✅ Order creada en DB (status=PAID)
❌ purchaseRetryService.attemptPurchase falla → Order → FAILED
❌ Orden va a cola manual (MANUAL_ACTION_REQUIRED)
❌ Comprador queda sin fulfillment automático
✅ Sistema escala a manual queue (maybeEscalateFailedOrderToManual)
→ Ivan debe comprar manualmente en AliExpress
```

---

## F.4 Qué Está Listo vs Qué Está en Riesgo

| Componente | Estado | Riesgo |
|-----------|--------|--------|
| Captura de orden ML | ✅ Código listo | Depende de cron activo en Railway |
| Parseo dirección comprador | ✅ Implementado | Formato calles Chile puede tener variaciones |
| Compra AliExpress (API) | ✅ Código listo | **⚠️ Credenciales aliexpress-dropshipping deben estar configuradas** |
| Fallback a cola manual | ✅ Implementado | N/A — es el safety net |
| Tracking desde AliExpress | ✅ Implementado | AliExpress Standard puede tardar días en generar tracking |
| Submit tracking a ML | ✅ Implementado | shipping.id puede ser null si cuenta sin logística |
| Sale/comisión automática | ✅ Implementado | N/A |

---

## F.5 Acción Requerida Antes de Primera Compra Real

### CRÍTICO — verificar antes de cualquier compra

1. **Verificar credenciales AliExpress Dropshipping API en producción:**
   ```bash
   # En Railway o localmente con DB prod:
   npx ts-node backend/scripts/check-aliexpress-top-credential-shapes.ts
   ```
   Si no existen: configurar `appKey`, `appSecret`, `accessToken` para `apiName=aliexpress-dropshipping` en Railway env o via backoffice.

2. **Verificar que el cron de ML order sync está activo en Railway:**
   - Buscar job de `syncMercadoLibreOrdersForUser` en `scheduled-tasks.service.ts` o similar.
   - Sin el cron activo, las órdenes nuevas no se capturan.

3. **Verificar saldo en AliExpress** para poder ejecutar la compra con costo ~USD 1.99 (flete) + precio del producto.

4. **Dry-run recomendado:** Hacer una compra de prueba como comprador externo (USD 1 producto + shipping) para validar el flujo completo antes de volumen real.

---

## F.6 Fixes Aplicados en Esta Fase

No se requirieron cambios de código al flujo de postventa — la infraestructura está completa. Los fixes de esta fase son operacionales (verificación de credenciales y activación de crons), no de código.

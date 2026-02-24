# PRODUCTION REVENUE READINESS REPORT

**Objetivo:** Estado FULLY AUTONOMOUS REAL PRODUCTION REVENUE.  
**Alcance:** Auditoría ejecutiva sobre generación de ingresos reales. Sin modificación de código.  
**Base:** Código real en `backend/` (servicios, rutas, workers). No repite SYSTEM_AUDIT_REPORT.md.

---

## REVENUE PIPELINE STATUS

| Paso | Estado | Razón (código real) |
|------|--------|----------------------|
| **Opportunity discovery** | OK | `opportunity-finder.service` (Affiliate API + fallbacks) devuelve `OpportunityItem[]`. Autopilot llama `searchOpportunities` y obtiene lista. |
| **Product creation** | OK | `autopilot.service` `publishToMarketplace` ? `prisma.product.create` en transacción con `userId`, `aliexpressUrl`, `suggestedPrice`, etc. Deduplicación por `aliexpressUrl`. |
| **Publishing** | OK | `marketplace.service` `publishToMultipleMarketplaces` ? eBay/ML/Amazon; `MarketplaceListing` creado; producto actualizado a PUBLISHED. |
| **Listing persistence** | OK | `updateProductMarketplaceInfo` escribe en `MarketplaceListing`; `product.status` y `isPublished` se actualizan en éxito. |
| **Checkout** | WARNING | Checkout real existe: `paypal.routes` POST `/create-order` y POST `/capture-order` (authenticate). Order solo se crea en **capture-order** (no en webhook). Si el cliente no llama capture-order tras aprobar PayPal, no hay Order. Webhook PayPal solo hace log y `received: true` (no crea Order ni fulfillment). |
| **Payment capture** | OK | `PayPalCheckoutService.captureOrder(paypalOrderId)` en capture-order; si success, se crea `Order` con `status: 'PAID'` y se llama `fulfillOrder(order.id)` en la misma request. |
| **Fulfillment** | FAIL | `order-fulfillment.service` marca PURCHASING, llama `purchaseRetryService.attemptPurchase` ? `aliexpressCheckoutService.placeOrder`. Si `ALLOW_BROWSER_AUTOMATION=false`, checkout devuelve `orderId: 'SIMULATED_ORDER_ID'`. `fulfillOrder` solo actualiza a PURCHASED y llama `createSaleFromOrder` cuando `result.orderId !== 'SIMULATED_ORDER_ID'`. Con stub, Order queda FAILED y no se crea Sale. Para dinero real hace falta compra real en AliExpress (browser con ALIEXPRESS_USER/ALIEXPRESS_PASS o API real). |
| **Sale creation** | WARNING | `createSaleFromOrder` se invoca solo tras PURCHASED. Exige `order.userId` y producto por `order.productId` o `order.productUrl`. Si Order se crea sin `userId` (ej. capture sin auth) o sin productId/productUrl que matchee, retorna null y no se crea Sale. |
| **Commission calculation** | OK | Dentro de `sale.service.createSale`: `platformConfigService.getCommissionPct()`, cálculo de commissionAmount y netProfit, creación de `Commission` y `AdminCommission` en la misma transacción que la Sale. |
| **Payout execution** | WARNING | Admin: `paypal-payout.service` real (PayPal Payouts API). User: si `PAYOUT_PROVIDER=payoneer` y usuario tiene `payoneerPayoutEmail`, se intenta `payoneerService.withdrawFunds` (stub ? siempre falla) y hay fallback a PayPal. Si usuario tiene `paypalPayoutEmail` y PayPal configurado, payout usuario vía PayPal funciona. Si faltan `adminPaypalEmail` o `user.paypalPayoutEmail` (y no hay Payoneer real), Sale se marca PAYOUT_FAILED; en `AUTOPILOT_MODE=production` además se lanza error. Payoneer real no implementado (stub). |

---

## CAN SYSTEM GENERATE REAL MONEY RIGHT NOW

**NO**

El sistema puede publicar productos, recibir pago por PayPal y crear Order PAID, pero **no puede completar fulfillment real** con el código actual en modo producción sin compra real en AliExpress. Mientras fulfillment devuelva `SIMULATED_ORDER_ID`, Order no pasa a PURCHASED, no se llama `createSaleFromOrder` y no hay Sale ni payout. Además, para que haya Sale y payout cuando sí haya PURCHASED, hace falta Order con `userId` y producto identificable, y PayPal (o Payoneer real) configurado para payout.

---

## IF NO, EXACT BLOCKERS

1. **Fulfillment real desactivado por defecto**  
   `aliexpress-checkout.service`: con `ALLOW_BROWSER_AUTOMATION=false` devuelve `SIMULATED_ORDER_ID`. Con `AUTOPILOT_MODE=production` y stub lanza error. Para compra real hace falta `ALLOW_BROWSER_AUTOMATION=true` y `ALIEXPRESS_USER` + `ALIEXPRESS_PASS` (y que el flujo de browser coloque la orden en AliExpress), o una ruta de compra que use API real (p. ej. `aliexpress-dropshipping-api.service` `aliexpress.dropshipping.order.create`) en lugar del stub.

2. **Order sin userId no genera Sale**  
   `sale.service` `createSaleFromOrder`: si `!order.userId` sale temprano y retorna null. El único punto donde se crea Order es `paypal.routes` capture-order (y rutas internas de test). Capture-order usa `req.user?.userId`; si la llamada no es autenticada o no lleva usuario, Order queda sin userId y nunca se crea Sale para ese Order.

3. **PayPal webhook no crea Order ni dispara fulfillment**  
   En `paypal.routes` el handler de webhook solo comprueba firma, loguea y responde `received: true`. No crea Order ni llama `fulfillOrder`. Todo el flujo de ingreso depende de que el cliente llame POST `/api/paypal/capture-order` después de aprobar en PayPal. Si el cliente cierra antes, no hay Order.

4. **Payoneer es stub**  
   `payoneer.service` `withdrawFunds` siempre devuelve `success: false` y mensaje de integración pendiente. No bloquea si el usuario tiene `paypalPayoutEmail` (hay fallback a PayPal), pero si se quiere usar solo Payoneer para usuarios, no hay payout real hasta implementar la API.

5. **Configuración mínima para payout**  
   Para que el payout se ejecute: `PayPalPayoutService.fromUserCredentials(userId)` disponible, `platformConfigService.getAdminPaypalEmail()` definido, y usuario con `paypalPayoutEmail` (o Payoneer real). Si falta algo, Sale queda PAYOUT_FAILED.

---

## MINIMUM REQUIRED ACTIONS TO ENABLE REAL AUTOMATIC REVENUE

(Ordenadas por prioridad; sin refactor ni cambios de arquitectura.)

1. **Activar fulfillment real (mínimo viable)**  
   - Opción A: En producción donde se quiera dinero real, setear `ALLOW_BROWSER_AUTOMATION=true` y configurar `ALIEXPRESS_USER` y `ALIEXPRESS_PASS`; asegurar que el flujo de browser (AliExpressAutoPurchaseService) efectivamente coloque la orden y devuelva un orderId real (no SIMULATED_ORDER_ID).  
   - Opción B: Conectar la ruta de compra (p. ej. `purchase-retry` / `aliexpress-checkout`) con `aliexpress-dropshipping-api.service` cuando existan credenciales de dropshipping API, de forma que en producción se use API en lugar de stub cuando corresponda.  
   Objetivo: que `fulfillOrder` reciba `result.orderId` real y marque Order PURCHASED y se llame `createSaleFromOrder`.

2. **Asegurar Order con userId y producto**  
   - Garantizar que el cliente que paga (frontend/app) llame POST `/api/paypal/capture-order` **con usuario autenticado** (cookie/Authorization) y envíe en body `productId` (o `productUrl` que coincida con un producto del usuario). Así `order.userId` y producto existen y `createSaleFromOrder` puede crear la Sale.

3. **Completar configuración de payout**  
   - Tener en PlatformConfig `adminPaypalEmail`.  
   - Tener en cada usuario que reciba ganancias `paypalPayoutEmail` (o, cuando exista, integración real Payoneer).  
   - Mantener `PAYPAL_CLIENT_ID` y `PAYPAL_CLIENT_SECRET` (y entorno correcto) para que `PayPalPayoutService.fromUserCredentials` y payouts funcionen.

4. **(Opcional) Webhook PayPal que cree Order y dispare fulfillment**  
   - Si se quiere resiliencia ante cierre del navegador tras aprobar PayPal: en el webhook, ante evento de pago aprobado/capturado, crear `Order` con status PAID (usando datos del webhook + almacén/sesión si hace falta userId/productId) y llamar `orderFulfillmentService.fulfillOrder(order.id)`. Requiere poder resolver userId y productId desde el payload o un almacén asociado al paypalOrderId.

5. **(Opcional) Payoneer real**  
   - Implementar en `payoneer.service` las llamadas reales a la API de Mass Payout en `withdrawFunds` (y token/balance si aplica) para poder pagar a usuarios por Payoneer sin depender solo de PayPal.

---

## ESTIMATED TIME TO ENABLE REAL AUTOMATIC REVENUE

**5?12 días** (días laborables, según opción de fulfillment)

- **Opción A (browser automation):** 5?7 días. Configurar env (ALLOW_BROWSER_AUTOMATION, ALIEXPRESS_USER, ALIEXPRESS_PASS), validar en staging que el flujo de compra en AliExpress devuelve orderId real, asegurar frontend con capture-order autenticado y productId/productUrl, y configurar adminPaypalEmail + paypalPayoutEmail. Pruebas E2E: pago ? fulfillment ? Sale ? payout.
- **Opción B (dropshipping API):** 8?12 días. Implementar uso de `aliexpress-dropshipping-api.service` en la cadena de compra cuando existan credenciales, sustituyendo/alternando el stub; pruebas con API real; mismo resto de configuración y pruebas que arriba.

---

## PRODUCTION SAFETY LEVEL

**72 / 100**

- Puntos positivos: flujo de negocio claro, transacciones atómicas en Sale/Commission, doble payout (admin + user), fallback PayPal cuando Payoneer falla, validaciones (profit guard, daily limits), auth en capture-order.
- Descuentos: fulfillment por defecto no es real (stub), webhook no usa el pago para crear Order/fulfillment, dependencia de que el cliente complete capture-order con usuario y productId, Payoneer sin implementar.

---

*Informe basado únicamente en lectura del código. No se ha modificado ningún archivo.*

# Auditoría — Post-publicación y postventa (prueba con tercero)

---

## Flujo objetivo

1. Producto publicado vía web  
2. Comprador real en ML  
3. Sistema detecta venta → compra proveedor → tracking → estados coherentes → profit real  

---

## Componentes verificados en código

| Componente | Archivo / servicio | Listo “en papel” |
|------------|-------------------|------------------|
| Webhook Mercado Libre | `webhooks.routes.ts` POST `/mercadolibre` | Sí — firma, fetch orden orders_v2, `recordSaleFromWebhook` |
| Creación orden interna | `prisma.order.create` status `PAID` | Sí |
| Compra automática | `orderFulfillmentService.fulfillOrder` | Sí — AliExpress DS + retries |
| Idempotencia | `paypalOrderId` = `mercadolibre:{id}` | Sí |
| Fallo → notificación manual | `notificationService` USER_ACTION | Sí |
| Reintentos / cola | `process-paid-orders.service.ts`, `retry-failed-orders.service.ts` | Sí |
| eBay paralelo | Webhook eBay + mismas ideas | Sí (distinto flujo envío Phase 39) |

---

## ¿Listo hoy para prueba real?

**Estado global:** **Parcialmente verificado** — el **diseño** del código soporta el flujo; la **prueba real** exige verificación externa:

| Prerrequisito | Verificación en esta auditoría |
|---------------|--------------------------------|
| Webhook ML registrado y secreto correcto | **No verificado** |
| `marketplaceListing.listingId` coincide con item ML real | **No verificado** |
| Producto con `aliexpressUrl` válido `.../item/ID.html` | **Verificado** como requisito en código |
| Credenciales AliExpress Dropshipping por `userId` | **No verificado** |
| Capital libre ≥ coste compra (`hasSufficientFreeCapital`) | **No verificado** |
| Precio orden vs precio proveedor (margen) | **Parcial** — `attemptPurchase` usa `order.price * 1.5` como techo; riesgo si precio mal calculado |

---

## Hallazgos

### PS-001
- **Título:** Postventa **automática** está acoplada a webhook + fulfill en misma request
- **Estado:** **Verificado** (código)
- **Severidad:** Media (timeouts, reintentos ML)
- **Impacto técnico:** Si `fulfillOrder` tarda o falla, usuario recibe notificación manual; orden puede quedar PAID/PURCHASING/FAILED.
- **Impacto operativo:** Operador debe usar `PendingPurchases` / reintentos.
- **Evidencia:** `webhooks.routes.ts` + `order-fulfillment.service.ts` timeout 300s.
- **Recomendación:** Prueba real: monitorear logs y UI órdenes durante 30 min post-compra.
- **Bloquea prueba real:** Solo si webhook o DS no configurados.
- **Bloquea escalado:** Sí si fiabilidad < objetivo.

### PS-002
- **Título:** Profit / fondos liberados — UI advierte límites de “truth”
- **Estado:** **Parcialmente verificado**
- **Severidad:** Media
- **Evidencia:** `Sales.tsx`; integración contable **no auditada** en profundidad esta sesión.
- **Recomendación:** Definir criterio de éxito de prueba: ¿solo PURCHASED o también conciliación PayPal/ML?
- **Bloquea prueba real:** No para “compra proveedor”; sí para “profit auditado”.

### PS-003
- **Título:** Resolución `productUrl` prioriza `product.aliexpressUrl`; fallback listing solo **ebay**
- **Estado:** **Verificado** (`order-fulfillment.service.ts` ~115–123)
- **Severidad:** Baja si producto ML siempre tiene URL en `Product`
- **Riesgo:** Listing ML sin URL en producto → fallo fulfill.
- **Bloquea prueba real:** **Sí** si datos incompletos.

---

## Conclusión

El software **puede** ejecutar postventa automatizada **si** la infraestructura y datos perimetrales están correctos. **No** se ha verificado en esta auditoría un ciclo real con comprador tercero.

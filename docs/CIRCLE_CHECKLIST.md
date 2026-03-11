# Checklist: Círculo cerrado (venta → Order → fulfill → Sale → payout)

Este documento centraliza la verificación del flujo automático: venta en marketplace → creación de Order → compra en AliExpress → Sale → comisión y payout. Permite auditar que el sistema pueda "generar dinero por sí solo" cuando hay tráfico y configuración correcta.

---

## 1. Webhooks (Mercado Libre y eBay)

Las ventas en ML/eBay notifican al backend; se crea la Order (PAID) y se llama a `fulfillOrder`.

| Item | Comprobación |
|------|--------------|
| **URL backend pública** | Base: `https://ivan-reseller-backend-production.up.railway.app` (o tu dominio). En Vercel, las peticiones `/api/*` se reescriben a esta URL. |
| **Mercado Libre** | Registrar en [Mercado Libre Developers](https://developers.mercadolibre.com/) → Tu aplicación → Notificaciones: URL `https://TU_BACKEND/api/webhooks/mercadolibre` para notificaciones de órdenes. |
| **eBay** | Registrar en [eBay Developer](https://developer.ebay.com/) → Tu app → Notifications: URL `https://TU_BACKEND/api/webhooks/ebay` para notificaciones de órdenes. |
| **Variables de entorno (Railway / .env)** | `WEBHOOK_SECRET_MERCADOLIBRE`, `WEBHOOK_SECRET_EBAY` con los valores que proporcionan ML/eBay. `WEBHOOK_VERIFY_SIGNATURE_MERCADOLIBRE` y `WEBHOOK_VERIFY_SIGNATURE_EBAY` en `true` en producción. |
| **Verificación** | Tras una venta real en ML o eBay, comprobar en logs que llega la petición a `/api/webhooks/mercadolibre` o `/api/webhooks/ebay` y que se crea la Order y se llama a `fulfillOrder`. |

**Comprobar si los secrets están configurados:** `GET /api/webhooks/status` devuelve `{ ebay: { configured: true|false }, mercadolibre: { configured: true|false }, amazon: { configured: true|false } }` sin revelar valores. Útil para el panel de estado o el checklist de primera venta.

**Guía paso a paso (primera venta):**

1. **URL base del backend:** Usa la URL pública del backend (ej. `https://ivan-reseller-backend-production.up.railway.app`). Sin `/` final.
2. **Mercado Libre:** En [developers.mercadolibre.com](https://developers.mercadolibre.com) → Tu aplicación → Notificaciones → Añadir URL: `https://TU_BACKEND_URL/api/webhooks/mercadolibre`. Copia el **secret** que ML muestra y configúralo en Railway como `WEBHOOK_SECRET_MERCADOLIBRE`. Opcional: `WEBHOOK_VERIFY_SIGNATURE_MERCADOLIBRE=true`.
3. **eBay:** En [developer.ebay.com](https://developer.ebay.com) → My Account → Application Keys → tu app → Notifications → Endpoint URL: `https://TU_BACKEND_URL/api/webhooks/ebay`. Configura el **signing key** en Railway como `WEBHOOK_SECRET_EBAY`. Opcional: `WEBHOOK_VERIFY_SIGNATURE_EBAY=true`.
4. **Verificación:** Tras configurar, llama a `GET /api/webhooks/status` (o revisa el panel de estado): `ebay.configured` y `mercadolibre.configured` deben ser `true`. Luego haz una venta de prueba y revisa logs del backend para confirmar que llega el webhook y se crea la Order.

### Amazon

- En el código actual **no** hay endpoint de webhook para Amazon en `backend/src/api/routes/webhooks.routes.ts`.
- Si vendes por Amazon y quieres el mismo flujo automático, hay que añadir una ruta (p. ej. `POST /api/webhooks/amazon`) que parsee la notificación de Amazon (SP-API), cree la Order y llame a `orderFulfillmentService.fulfillOrder`.
- Estado: **pendiente** hasta que se implemente.

---

## 2. OAuth AliExpress Dropshipping

Para que las compras en AliExpress se ejecuten sin Puppeteer (vía API), cada usuario que vaya a tener compras automáticas debe tener completado el OAuth de AliExpress Dropshipping.

| Item | Comprobación |
|------|--------------|
| **Configuración en API Settings** | En el frontend, el usuario va a Configuración de APIs / API Settings y completa el flujo "Conectar AliExpress Dropshipping". |
| **Base de datos** | Debe existir una fila en `api_credentials` con `apiName = 'aliexpress-dropshipping'` y credenciales válidas (token no expirado) para ese usuario. |
| **Variables de entorno** | `ALIEXPRESS_DROPSHIPPING_APP_KEY`, `ALIEXPRESS_DROPSHIPPING_APP_SECRET` (y opcionalmente `ALIEXPRESS_DROPSHIPPING_REDIRECT_URI`) configuradas en Railway. |
| **Verificación** | Ejecutar una compra de prueba (Order PAID → fulfillOrder) y revisar logs: debe verse "Order placed via Dropshipping API". Si no hay token válido, el sistema puede intentar fallback a Puppeteer si `ALIEXPRESS_USER`/`ALIEXPRESS_PASS` están configurados. |

---

## 3. PayPal

El flujo de captura de pago (checkout) crea la Order en estado PAID y llama a `fulfillOrder`. Los payouts (comisión y usuario) se envían tras crear la Sale.

| Item | Comprobación |
|------|--------------|
| **Variables de entorno** | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT=production` (o `sandbox` para pruebas). Opcional: `PAYPAL_WEBHOOK_ID` si se usa webhook de PayPal para eventos de pago. |
| **URL pública** | La URL del backend (p. ej. `https://ivan-reseller-backend-production.up.railway.app`) debe coincidir con la configurada en la app de PayPal (redirect/callback y webhook si aplica). |
| **PlatformConfig y usuarios** | `PlatformConfig.adminPaypalEmail` para recibir comisiones de plataforma. Cada usuario que reciba payout debe tener `paypalPayoutEmail` configurado. |
| **Verificación** | Hacer un checkout de prueba (create-order → redirect PayPal → capture-order). Comprobar que se crea la Order (PAID), se llama a `fulfillOrder` y, tras compra exitosa, se crea la Sale y se ejecuta (o se programa) el payout. |

---

## 4. Cron: compras pendientes (órdenes PAID)

Un job programado procesa **todas** las órdenes en estado PAID y llama a `fulfillOrder` para cada una. Así se automatiza al 100% incluso si un webhook falla o llega tarde.

| Item | Comprobación |
|------|--------------|
| **Servicio** | `backend/src/services/process-paid-orders.service.ts`: función `processPaidOrders()`. |
| **Programación** | En `scheduled-tasks.service.ts`, cola BullMQ `process-paid-orders` con patrón `*/5 * * * *` (cada 5 minutos). |
| **Redis** | El job solo se programa si Redis está disponible (misma condición que el resto de tareas programadas). |
| **Límites** | Se procesan hasta 30 órdenes PAID por ejecución (batch). `fulfillOrder` aplica límites diarios y comprobación de capital. |
| **Verificación** | Crear una Order manual en estado PAID (o simular webhook que no llame a fulfillOrder). En menos de 5 minutos debe procesarse y la orden pasar a PURCHASED o FAILED según resultado. Revisar logs "[PROCESS-PAID-ORDERS]". |

---

## 5. Balance vs tarjeta (compras con saldo bajo)

Si tienes poco saldo en PayPal pero fondos suficientes en la tarjeta asociada, puedes permitir que las compras se autoricen aunque el saldo sea bajo; PayPal usará la tarjeta como respaldo.

| Item | Comprobación |
|------|--------------|
| **Variable de entorno** | `ALLOW_PURCHASE_WHEN_LOW_BALANCE=true` (en Railway o .env). Por defecto `false`. |
| **Límite por orden** | `PURCHASE_LOW_BALANCE_MAX_ORDER_USD=500` (opcional). Solo se permite "low balance" si el coste de la orden es menor o igual a este valor. Por defecto 500. |
| **Dónde aplica** | En `working-capital.service.ts`, `hasSufficientFreeCapital()`: si la variable está activa y el coste está dentro del límite, se devuelve `sufficient: true` aunque el capital libre sea menor al coste. |
| **Documentación** | Ver `backend/.env.example` (comentarios) y este checklist. |

---

## Resumen rápido

| Componente | Estado | Acción |
|------------|--------|--------|
| Webhooks ML / eBay | Implementados | Registrar URLs y secrets en paneles de desarrollador y en Railway. |
| Webhook Amazon | No implementado | Pendiente si se vende por Amazon. |
| OAuth AliExpress Dropshipping | Implementado | Completar OAuth por usuario y verificar token en BD. |
| PayPal (capture + payout) | Implementado | Configurar env y URLs; probar checkout y payout. |
| Cron PAID (process-paid-orders) | Implementado | Redis activo; job cada 5 min. Sin Redis: fallback setInterval cada 5 min. |
| ALLOW_PURCHASE_WHEN_LOW_BALANCE | Implementado | Activar y opcionalmente ajustar PURCHASE_LOW_BALANCE_MAX_ORDER_USD. |

Cuando todos los ítems aplicables estén verificados, el círculo venta → Order → fulfill → Sale → payout está cerrado y el sistema puede operar de forma automática con tráfico real.

---

## 6. Flujo primera venta real (verificación punta a punta)

Para comprobar que una venta real recorre todo el ciclo sin fallos, verifica estos puntos en orden.

| Paso | Qué comprobar |
|------|----------------|
| **1. Webhook** | ML/eBay envía notificación → `POST /api/webhooks/mercadolibre` o `/ebay`. Si `WEBHOOK_SECRET_*` no está configurado, el webhook se acepta igual y se loguea un warning (no 401). |
| **2. Order PAID** | En `recordSaleFromWebhook` se crea la Order con `productUrl` (desde `product.aliexpressUrl`); si falta, se rechaza antes de crear la Order. |
| **3. Fulfill** | Se llama `fulfillOrder(orderId)`. Requiere: OAuth Dropshipping válido **o** `ALLOW_BROWSER_AUTOMATION=true` y credenciales AliExpress; capital suficiente (`hasSufficientFreeCapital`); límites diarios. |
| **4. Sale** | Al pasar a PURCHASED, `createSaleFromOrder` crea la Sale. Si el producto está INACTIVE o no publicado, la Sale se crea igual (flujo fulfillment) para no bloquear la venta real. |
| **5. Cron sin Redis** | Si Redis no está disponible, el bootstrap arranca un `setInterval` cada 5 min que ejecuta `processPaidOrders({ batchSize: 30 })`, así las Orders PAID se procesan aunque no haya BullMQ. |

**Variables críticas para el ciclo:**

- **Redis**: necesario para BullMQ y el cron programado; si no hay Redis, el fallback de process-paid-orders mantiene el ciclo.
- **WEBHOOK_SECRET_MERCADOLIBRE / WEBHOOK_SECRET_EBAY**: recomendado en producción; si no están definidos, los webhooks pasan con warning.
- **OAuth AliExpress Dropshipping** (o `ALLOW_BROWSER_AUTOMATION` + usuario/contraseña): sin esto, la compra en AliExpress falla.
- **Capital y límites**: `workingCapital`, límites diarios de compra y (opcional) `ALLOW_PURCHASE_WHEN_LOW_BALANCE`.

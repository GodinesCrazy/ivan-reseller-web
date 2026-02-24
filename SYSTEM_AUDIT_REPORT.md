# SYSTEM AUDIT REPORT ? Ivan Reseller Web

**Fecha:** 2025-02-24  
**Alcance:** Auditoría técnica y operativa completa. Sin modificación de código. Conclusiones basadas exclusivamente en el código existente en `backend/`, `frontend/`, `prisma/`, `scripts/`, `security/`, `src/`.

---

## SYSTEM INTEGRITY
**STATUS: WARNING**

- **Arquitectura backend:** Express, Prisma, servicios modulares; rutas y middlewares ordenados. Health-first bootstrap (`server-bootstrap.ts`) escucha antes de cargar módulos pesados; `/health` responde rápido.
- **Arquitectura frontend:** No auditada en detalle en esta pasada; se asume alineada con el backend vía API.
- **Base de datos:** Schema Prisma completo (User, Product, Sale, Commission, Order, Opportunity, AutopilotCycleLog, PayoneerAccount, etc.). Índices y relaciones coherentes con el flujo de negocio.
- **Flujo dropshipping:** Cadena lógica verificada: Opportunity ? Product (PENDING?APPROVED?PUBLISHED) ? MarketplaceListing ? Order (CREATED?PAID?PURCHASING?PURCHASED) ? Sale ? Commission ? Payout (PayPal; Payoneer stub).
- **Problemas de integridad identificados:**
  - **Autopilot:** `consecutiveFailures` nunca se incrementa en fallos ni se resetea en éxito. La lógica de backoff y pausa tras 5 fallos no se activa (variable siempre 0).
  - **Scheduled tasks:** Cola `product-unpublish` recibe jobs (`productUnpublishQueue.add('unpublish-products', ...)`) pero no existe `Worker` para el nombre `'product-unpublish'`. Solo se crean workers para `financial-alerts`, `commission-processing`, `ali-auth-health`, `fx-rates-refresh`, `listing-lifetime-optimization`, `dynamic-pricing`, `ali-express-token-refresh`. Los jobs de despublicación automática nunca se procesan.
  - **Scheduler (Autopilot):** El siguiente ciclo se programa con `setTimeout` dentro del callback del ciclo anterior; si `runSingleCycle` lanza, el callback hace catch y llama `scheduleNextCycle()`, por lo que la recurrencia se mantiene. No hay race por doble programación gracias a `cycleScheduled`.
- **Riesgos:** Sin reset/increment de `consecutiveFailures`, no hay backoff real ni límite de fallos consecutivos. Cola `product-unpublish` sin worker implica que la despublicación automática por capital/conversión no se ejecuta.

---

## PRODUCTION READINESS
**STATUS: WARNING**

- **autopilot.service:** Inicio con `userId`, validación de onboarding, capital, credenciales (scraping + eBay). Ciclo: búsqueda ? filtrado por capital/umbrales ? publicación multi-marketplace. Persistencia en `SystemConfig`; evento `autopilot:paused_max_failures` existe pero no se dispara por el bug de `consecutiveFailures`.
- **opportunity-finder.service:** Fuente principal AliExpress Affiliate API; fallback eBay ? ScraperAPI/ZenRows ? cache ? AI. Deduplicación, márgenes, Google Trends (opcional). Coherente para producción si las APIs están configuradas.
- **marketplace.service:** Publicación a eBay, MercadoLibre, Amazon; credenciales desde DB o env (eBay); retry en `suggestCategory`; validación de estado APPROVED y precios.
- **order-fulfillment.service:** Solo cumple órdenes en estado PAID; límites diarios; `purchaseRetryService.attemptPurchase`; en PURCHASED llama `saleService.createSaleFromOrder(orderId)` (non-fatal si falla).
- **sale.service:** Creación de Sale + Commission + AdminCommission en transacción; doble payout (admin PayPal, luego usuario PayPal o Payoneer si `PAYOUT_PROVIDER=payoneer` y email Payoneer). En `AUTOPILOT_MODE=production` exige PayPal y marca PAYOUT_FAILED si falta config.
- **PayPal:** `paypal-payout.service.ts` implementado con OAuth y Payouts API real. Integración lista para producción con `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` y PlatformConfig (adminPaypalEmail) y `user.paypalPayoutEmail`.
- **Payoneer:** Ver sección PAYMENT SYSTEM READINESS.
- **Scheduler (BullMQ):** Depende de Redis. Si Redis no está disponible, las tareas programadas no se inician. Cola `product-unpublish` sin worker (ver SYSTEM INTEGRITY).
- **Retries:** `purchase-retry.service` (hasta 5 intentos, backoff); `retryMarketplaceOperation` en marketplace; `retryWithBackoff` en opportunity-finder para scraping.

---

## AUTOMATIC REVENUE CAPABILITY
**STATUS: WARNING**

- **Publicación automática:** Autopilot publica a uno o varios marketplaces (ebay/amazon/mercadolibre) con credenciales válidas; producto creado en transacción con Opportunity; deduplicación por `aliexpressUrl`.
- **Captura de pagos:** Flujo Order (PayPal checkout) ? PAID ? fulfillment ? PURCHASED. La creación de Sale se dispara desde `order-fulfillment.service` tras compra exitosa (`createSaleFromOrder`). Webhooks PayPal y ruta interna llaman `fulfillOrder`.
- **Fulfillment automático:** `fulfillOrder` se invoca desde `paypal.routes` (webhook) e `internal.routes`; usa `purchaseRetryService` y `aliexpressCheckoutService.placeOrder`. Si el checkout es simulado (`SIMULATED_ORDER_ID`), no se considera éxito real.
- **Comisiones:** Cálculo en `sale.service` (platformCommission desde PlatformConfig, netProfit para usuario); Commission y AdminCommission creados en la misma transacción que la Sale.
- **Payout automático:** Tras crear Sale, se ejecuta payout admin (PayPal) y luego usuario (Payoneer si configurado y preferido, si no PayPal). En producción, si falta PayPal o email usuario, se marca PAYOUT_FAILED y en `AUTOPILOT_MODE=production` se lanza error.
- **Persistencia:** Sale, Commission, Order, Product, AutopilotCycleLog, etc. persisten correctamente.
- **Bloqueos:** (1) Payoneer es stub: no envía dinero real. (2) Si no hay `user.paypalPayoutEmail` ni Payoneer operativo, el payout al usuario falla. (3) Creación de Sale desde Order depende de `Order.userId` y de encontrar Product por `productId` o `productUrl`; si el Order no tiene `userId` o no se encuentra producto, no se crea Sale (solo log).

---

## PAYMENT SYSTEM READINESS
**STATUS: WARNING**

- **PayPal:** Implementación real en `paypal-payout.service.ts` (OAuth, Payouts API). `sale.service` usa `PayPalPayoutService.fromUserCredentials(userId)` para admin y usuario (fallback si no Payoneer). Listo para producción con variables y PlatformConfig.
- **Payoneer (payoneer.service.ts):**
  - **Carga de credenciales:** `fromEnv()` lee `PAYONEER_PROGRAM_ID`, `PAYONEER_API_USERNAME`, `PAYONEER_API_PASSWORD`. Correcto.
  - **Certificado:** `ensurePayoneerCertificate()` y `createPayoneerHttpsAgent()` usan `security/payoneer.crt` y `payoneer.key`; auto-generación vía `generatePayoneerCertificate` si no existen. `hasCertificate()` y `ensureCertificate()` expuestos.
  - **Lógica de payout:** `withdrawFunds()` devuelve `{ success: false, error: 'Payoneer Mass Payout API integration pending' }`. Código comentado/documentado indica integración pendiente. No hay llamada real a la API de Mass Payout.
  - **Fallback:** En `sale.service`, si Payoneer está configurado y usuario tiene `payoneerPayoutEmail` y `PAYOUT_PROVIDER=payoneer`, se intenta Payoneer; si no hay éxito, se usa PayPal para el usuario. Mientras Payoneer sea stub, el fallback a PayPal es el que realmente paga.
- **Conclusión:** Con solo `PAYONEER_PROGRAM_ID`, `PAYONEER_API_USERNAME`, `PAYONEER_API_PASSWORD` el servicio se instancia y el certificado puede generarse, pero **no está listo para operar pagos reales** hasta implementar las llamadas reales a la API de Payoneer en `withdrawFunds` (y si aplica `getBalance`/token).

---

## AUTOPILOT RELIABILITY
**STATUS: WARNING**

- **autopilot.service:** Ciclo único con `runSingleCycle(query?, userId?, environment?)`; programación con `setTimeout` y flag `cycleScheduled` para evitar doble programación. Pausa global vía `SystemConfig` key `autopilot_global_pause`.
- **Scheduler:** Recurrencia encadenada (al terminar un ciclo se llama `scheduleNextCycle()`). Intervalo base `cycleIntervalMinutes`; backoff por `consecutiveFailures` no efectivo (nunca se incrementa).
- **Opportunity discovery:** Delegado a `opportunity-finder.service.searchOpportunities` (Affiliate API + fallbacks). Errores capturados y se devuelve array vacío sin tumbar el ciclo.
- **Motor de publicación:** `publishToMarketplace` ? `marketplaceService.publishToMultipleMarketplaces`; validación de credenciales por marketplace; producto APPROVED y actualización a PUBLISHED en éxito.
- **Retry:** Por servicio (scraping, marketplace); en autopilot no hay retry explícito del ciclo completo, solo programación del siguiente.
- **Recuperación de errores:** En `runSingleCycle` el catch registra en `autopilotCycleLogService.logCycle` y emite `cycle:failed`. No se incrementa `consecutiveFailures`, por tanto no hay pausa automática tras N fallos.
- **24/7:** Conceptual y estructuralmente puede correr 24/7 si el proceso no se reinicia y Redis/DB están disponibles. Dependencia de scraping/eBay/Affiliate para que cada ciclo aporte valor; sin backoff real, fallos repetidos no reducen la frecuencia.

---

## SECURITY STATUS
**STATUS: OK**

- **JWT:** Generación en `auth.service`, validación en `auth.middleware` (cookie primero, luego Authorization). Refresh token considerado en middleware.
- **Autenticación:** Login con bcrypt; registro público deshabilitado (redirige a access-requests). Rutas protegidas con `authenticate`.
- **Credenciales:** Almacenamiento encriptado (ENCRYPTION_KEY / JWT_SECRET ? 32 caracteres); `CredentialsManager` y normalización por marketplace.
- **API:** Helmet, CORS configurado (origins desde env), rate limiting por rol (`createRoleBasedRateLimit`), body size limit (1mb json).
- **Secrets:** env.ts no expone secretos en logs; DATABASE_URL/REDIS enmascarados en diagnósticos. Endpoint `/config` sin secretos.
- **Riesgos menores:** Uso de `ENCRYPTION_KEY`/JWT_SECRET por defecto en algunos fallbacks (p. ej. marketplace OAuth state) si no se configuran; validación de ENCRYPTION_KEY puede lanzar en arranque (modo degradado documentado).

---

## SCALABILITY STATUS
**STATUS: WARNING**

- **100 usuarios:** Carga actual (un Autopilot por usuario conceptualmente, en código un solo `autopilotSystem` con `currentUserId`) y Prisma/Postgres deberían soportarlo. Autopilot en la implementación actual es single-tenant por instancia (un usuario activo a la vez).
- **1K?100K usuarios:** Cuellos de botella identificables:
  - **Autopilot:** Una sola instancia en memoria con un `currentUserId`; no hay cola ni workers por usuario. Para multi-tenant masivo haría falta arquitectura por usuario/cola.
  - **Scheduled tasks:** BullMQ con Redis; workers con concurrencia 1 en varios casos; una sola instancia de backend procesa todas las colas. Escalaría con más instancias de worker y Redis.
  - **Base de datos:** Sin pooling explícito en el código (Prisma usa su gestión); conexiones y tiempo de queries (p. ej. `queryWithTimeout` en sale stats) pueden limitar bajo carga alta.
  - **Sin caché de lectura** en rutas críticas más allá de Redis para colas; muchas lecturas van directo a Prisma.
- **Puntos de saturación:** Endpoints que disparan ciclos pesados (opportunity search, publicación múltiple); rate limit ayuda pero no elimina picos de CPU/IO. Health/ready ligeros y pensados para no depender de DB en el primer tick.

---

## CRITICAL BLOCKERS

1. **Payoneer:** `withdrawFunds`, `getBalance`, `receivePayment` son stubs. No se pueden realizar pagos reales a usuarios vía Payoneer hasta implementar la integración real con la API de Mass Payout.
2. **Cola product-unpublish:** Jobs a?adidos a la cola `product-unpublish` no tienen worker asignado; la función `processProductUnpublish` existe pero no está conectada a ningún Worker. La despublicación automática por capital/conversión no se ejecuta.
3. **Autopilot consecutiveFailures:** Nunca se incrementa en fallo ni se resetea en éxito. El backoff exponencial y la pausa tras 5 fallos consecutivos no funcionan.
4. **Producción sin PayPal completo:** En `AUTOPILOT_MODE=production`, si faltan PayPal (client/secret), adminPaypalEmail o user paypalPayoutEmail, el payout falla y se marca PAYOUT_FAILED; el flujo de ingresos automáticos se interrumpe para esa venta.

---

## NON-CRITICAL IMPROVEMENTS

1. Resetear `consecutiveFailures` a 0 al final de un ciclo exitoso en `runSingleCycle`; incrementarlo en el catch de ciclo fallido (y opcionalmente en resultados con 0 publicados por error).
2. Crear un Worker para la cola `'product-unpublish'` que ejecute `processProductUnpublish` (o extraer la lógica a un método invocable por el worker).
3. Documentar que Autopilot es single-runner (un usuario activo por instancia) y, si se desea multi-tenant a gran escala, dise?ar cola/workers por usuario.
4. Revisar `listingLifetimeWorker`: está registrado como Worker para `'listing-lifetime-optimization'` pero la cola usa nombre `'listing-lifetime-optimization'` en `add`; confirmar que el nombre de la cola y del job coinciden con lo que espera BullMQ para ese worker (las colas son por nombre de queue, no por job name).
5. A?adir tests E2E o de integración para el flujo Order PAID ? fulfillOrder ? PURCHASED ? createSaleFromOrder ? createSale ? payout.
6. En `createSaleFromOrder`, cuando no se encuentra producto por `productId` ni por `productUrl`, considerar crear un producto ?sombra? o dejar trazabilidad para no perder la venta (hoy se retorna null y solo se loguea).

---

## PRODUCTION DEPLOYMENT READINESS SCORE
**68 / 100**

- Descuentos por: Payoneer stub (-12), cola product-unpublish sin worker (-8), consecutiveFailures no operativo (-5), dependencia fuerte de PayPal y emails para payout (-4), escalabilidad single-tenant del Autopilot (-3).
- Puntos positivos: flujo end-to-end coherente, PayPal real, seguridad y auth sólidos, health/ready y diagnósticos útiles, persistencia y modelo de datos alineados con el negocio.

---

## ESTIMATED TIME TO FULLY AUTOMATED REVENUE
**15?25 días** (asumiendo priorización de bloqueadores y sin cambios de producto)

- **Días 1?3:** Implementar integración real de Payoneer Mass Payout (withdrawFunds/getBalance/token) y pruebas en sandbox.
- **Días 4?5:** Corregir `consecutiveFailures` (incrementar en fallo, reset en éxito) y a?adir Worker para `product-unpublish`.
- **Días 6?10:** Configuración y pruebas E2E en producción: PayPal, Payoneer (o solo PayPal), usuarios con paypalPayoutEmail/payoneerPayoutEmail, PlatformConfig, webhooks PayPal y fulfillment.
- **Días 11?15:** Monitoreo y ajustes (límites, reintentos, logs); verificar que createSaleFromOrder se ejecute en todos los casos esperados (Order con userId y producto identificable).
- **Días 16?25:** Estabilización, documentación operativa y (opcional) mejoras de escalabilidad si se prevé más de un tenant activo por instancia.

---

*Auditoría basada únicamente en el código existente. No se ha modificado ningún archivo.*

# GLOBAL SYSTEM AUDIT ? Ivan Reseller Dropshipping

Auditoría del flujo real: trend discovery ? product creation ? publish ? checkout ? PayPal capture ? executePurchase ? AliExpress Dropshipping API ? Order PURCHASED ? Sale ? commission ? payout ? profit.

---

## 1. FRONTEND

| Área | Estado | Notas |
|------|--------|--------|
| API base | OK | runtime.ts: producción `/api`, proxy Vercel |
| Endpoints | OK | /api/products, /api/paypal/create-order, capture-order, /api/orders, /api/marketplace/auth-url, /api/sales |
| Checkout auth | OK | capture-order requiere authenticate; Bearer desde localStorage/store |
| userId en Order | OK | Backend toma req.user.userId en capture-order y persiste en Order.userId |
| OAuth APISettings | OK | Flujo AliExpress: auth-url, redirect en pesta?a (aliexpress-dropshipping), sessionStorage anti-doble |
| Navegación | OK | Sidebar y Settings ? API Configuration llevan a /api-settings |

---

## 2. BACKEND ? RUTAS Y SERVICIOS

| Ruta / Servicio | Estado | Notas |
|-----------------|--------|--------|
| /api/products | OK | products.routes.ts, product.service |
| /api/paypal | OK | paypal.routes.ts; create-order (público), capture-order (authenticate) |
| /api/orders | OK | orders.routes.ts |
| /api/marketplace, /api/marketplace-oauth | OK | auth-url, callback; AliExpress usa JWT state |
| /api/aliexpress | OK | aliExpressRoutes (módulo) |
| /api/sales | OK | sale.routes.ts, sale.service |
| order-fulfillment.service | OK | fulfillOrder ? purchaseRetry.attemptPurchase(..., order.userId) |
| purchase-retry.service | OK | aliexpressCheckoutService.placeOrder(..., userId) |
| aliexpress-checkout.service | OK | Con userId: executePurchase(request, userId); sin userId: Puppeteer o stub |
| aliexpress-auto-purchase.service | OK | executePurchase: con userId y creds OAuth usa aliexpressDropshippingAPIService.placeOrder(); no Puppeteer en ese camino |
| sale.service | OK | createSaleFromOrder desde order-fulfillment tras PURCHASED; createSale calcula grossProfit, netProfit, commissionAmount; sendPayout (PayPal/Payoneer) real |
| working-capital, balance-verification | OK | Degraded mode si balance no disponible (no bloquean compra/payout) |

---

## 3. BASE DE DATOS (PRISMA)

| Modelo | Relaciones | Estado |
|--------|------------|--------|
| User | products, sales, orders, apiCredentials | OK |
| Product | userId, status, isPublished | OK |
| Order | userId, productId, status, paypalOrderId, aliexpressOrderId | OK |
| Sale | userId, productId, orderId, grossProfit, netProfit, adminPayoutId, userPayoutId | OK |
| ApiCredential | userId, apiName, environment, credentials (encriptado) | OK |

Integridad referencial correcta (Cascade/SetNull según modelo).

---

## 4. OAUTH ALIEXPRESS DROPSHIPPING

| Elemento | Estado | Detalle |
|----------|--------|---------|
| State | OK | oauth-state.ts: JWT stateless (signStateAliExpress, verifyStateAliExpressSafe) |
| redirect_uri | OK | Canonical: WEB_BASE_URL + '/api/marketplace-oauth/callback'; ALIEXPRESS_DROPSHIPPING_REDIRECT_URI opcional |
| auth-url | OK | marketplace.routes: defaultCallbackUrl canonical; getAuthUrl(callbackUrl, state, appKey) |
| Callback | OK | marketplace-oauth.routes: GET /callback (bajo /aliexpress y bajo /api/marketplace-oauth); exchangeCodeForToken con mismo redirect_uri; saveCredentials, clearCredentialsCache |
| Persistencia | OK | CredentialsManager.saveCredentials(userId, 'aliexpress-dropshipping', updatedCreds, environment) |
| Frontend post-OAuth | OK | Redirect a /api-settings?oauth=success; postMessage si popup; sessionStorage aliexpress_oauth_redirecting |

Dos handlers de callback existen: (1) GET /callback directo AliExpress (state JWT); (2) GET /oauth/callback/:marketplace (parseState base64). El flujo principal usa (1) con redirect_uri = /api/marketplace-oauth/callback; el backend recibe esa ruta vía rewrite y ejecuta el mismo router.

---

## 5. PAYPAL

| Elemento | Estado | Detalle |
|----------|--------|---------|
| create-order | OK | Sin auth; PayPalCheckoutService.createOrder; PAYPAL_ENV / PAYPAL_ENVIRONMENT (default sandbox) |
| capture-order | OK | authenticate; captureOrder(paypalOrderId); Order creado con status PAID; fulfillOrder(order.id) inmediato |
| Modo real | Config | PAYPAL_ENV=production o PAYPAL_ENV=live para api-m.paypal.com |
| Payout (Sale) | OK | paypal-payout.service sendPayout; PayPalPayoutService.fromUserCredentials; admin + user payout |

Para producción real: configurar PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET y PAYPAL_ENV=production.

---

## 6. executePurchase Y PLACEORDER REAL

| Paso | Estado | Detalle |
|------|--------|---------|
| fulfillOrder | OK | Order PAID ? PURCHASING; purchaseRetry.attemptPurchase(..., order.userId) |
| placeOrder(..., userId) | OK | aliexpress-checkout.service: con userId llama executePurchase(request, userId) |
| executePurchase | OK | aliexpress-auto-purchase.service: si userId y creds aliexpress-dropshipping con accessToken ? aliexpressDropshippingAPIService.placeOrder(); NO Puppeteer en ese camino |
| Order update | OK | Si result.orderId !== SIMULATED_ORDER_ID ? status PURCHASED, aliexpressOrderId guardado |
| createSaleFromOrder | OK | Llamado desde order-fulfillment tras PURCHASED; requiere Order.userId y Product |

---

## 7. SALE Y PROFIT

| Elemento | Estado | Detalle |
|----------|--------|---------|
| createSale | OK | grossProfit, netProfit, commissionAmount calculados; platform commission y admin commission |
| netProfit > 0 | OK | Cuando salePrice > costPrice y comisión < grossProfit |
| Balance/payout check | OK | hasSufficientBalanceForPayout (degraded si no hay balance API); luego sendPayout real |

---

## 8. PAYOUT REAL

| Elemento | Estado | Detalle |
|----------|--------|---------|
| sendPayout | OK | PayPalPayoutService.sendPayout (PayPal Payouts API); Payoneer opcional si PAYOUT_PROVIDER=payoneer |
| adminPayoutId / userPayoutId | OK | Guardados en Sale; status PAYOUT_FAILED si falla |
| Saldo | OK | balance-verification permite payout en degraded mode si API no disponible |

---

## 9. QUÉ ESTÁ PARCIALMENTE IMPLEMENTADO O DEPENDE DE CONFIG

- **Trend discovery / opportunity**: Implementado (trends.service, opportunity-finder); depende de SerpAPI/Google Trends y AliExpress Affiliate (o scraping si está habilitado).
- **Publicación en marketplace**: POST /api/marketplace/publish; depende de eBay/MercadoLibre OAuth y listing flow.
- **PayPal producción**: Requiere PAYPAL_ENV=production y credenciales live.
- **AliExpress Dropshipping OAuth**: Requiere App Key/Secret en AliExpress Open Platform y redirect_uri registrado = WEB_BASE_URL/api/marketplace-oauth/callback (o ALIEXPRESS_DROPSHIPPING_REDIRECT_URI).
- **Payout real**: Requiere PayPal Payouts (o Payoneer) configurado y saldo suficiente; balance-verification en modo degradado permite continuar si no hay API de saldo.

---

## 10. MAL CONECTADO O A CORREGIR

- **Inconsistencia de callback URL en documentación**: Un comentario en marketplace-oauth menciona /api/aliexpress/callback para un flujo; el canonical es /api/marketplace-oauth/callback. El auth-url usa canonical; el callback handler recibe /api/marketplace-oauth/callback vía rewrite. Correcto en código.
- **ALLOW_BROWSER_AUTOMATION**: Si false y AUTOPILOT_MODE=production, placeOrder lanza; para ciclo real sin Puppeteer debe haber OAuth AliExpress y userId en Order.

---

## RESUMEN

- **Funciona**: Routing frontend/backend, schema DB, flujo OAuth AliExpress (state JWT, callback canonical, persistencia), PayPal capture + fulfillOrder, executePurchase vía Dropshipping API cuando hay userId y OAuth, createSaleFromOrder, cálculo de profit, sendPayout real.
- **No funciona sin config**: PayPal en producción (PAYPAL_ENV), AliExpress OAuth (App Key/Secret + redirect_uri), payouts (PayPal/Payoneer y saldo).
- **Parcial**: Trend/opportunity y publish dependen de APIs externas y OAuth de marketplaces.

El sistema está preparado para ciclo real; la ejecución real depende de credenciales y variables de entorno en el entorno de despliegue.

# FINAL SYSTEM STRUCTURAL AUDIT

## Scope

Backend (routes, services, config, utils), Frontend (pages, services, api), Database (schema: User, Order, Sale, api_credentials, Product, PlatformConfig), OAuth, and execution flow consistency.

---

## FRONTEND STATUS: **CONSISTENT**

- **frontend/src**: Present. Pages under `src/pages` (APISettings, Autopilot, etc.).
- **frontend/src/services**: API client and business logic.
- **frontend/src/api**: API integration (e.g. `API_BASE_URL`, auth).
- **Dropshipping/OAuth**: APISettings calls `GET /api/marketplace/auth-url/aliexpress-dropshipping` for auth URL; opens popup; listens for `oauth_success`/`oauth_error` postMessage; handles `?oauth=success&provider=aliexpress-dropshipping` on /api-settings.
- **Checkout/PayPal**: Frontend creates orders and calls capture/fulfillment endpoints as implemented in paypal routes and internal routes.

---

## BACKEND STATUS: **CONSISTENT**

- **Routes**: Under `backend/src/api/routes/` (no top-level `backend/src/routes`). Relevant: `marketplace.routes.ts`, `marketplace-oauth.routes.ts`, `orders.routes.ts`, `paypal.routes.ts`, `internal.routes.ts`, `opportunities.routes.ts`, `products.routes.ts`, `api-credentials.routes.ts`.
- **Services**: Under `backend/src/services/`. Key for dropshipping:
  - `aliexpress-auto-purchase.service.ts`: `executePurchase(request, userId)` uses Dropshipping API first when `CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', env)` returns creds with `accessToken`; then calls `aliexpressDropshippingAPIService.placeOrder()`; falls back to Puppeteer only when no OAuth or API error (and not ACCESS_TOKEN_EXPIRED).
  - `aliexpress-checkout.service.ts`: `placeOrder(request, userId?)` delegates to auto-purchase `executePurchase`.
  - `purchase-retry.service.ts`: `attemptPurchase(..., userId?)` calls `aliexpressCheckoutService.placeOrder(..., userId)`.
  - `order-fulfillment.service.ts`: `fulfillOrder(orderId)` sets PURCHASING, calls `purchaseRetryService.attemptPurchase(..., order.userId)`, updates Order to PURCHASED/FAILED, then `saleService.createSaleFromOrder(orderId)`.
  - `sale.service.ts`: `createSaleFromOrder(orderId)` creates Sale with `orderId: order.id`, computes cost/sale price, `netProfit` via `createSale`.
  - `opportunity-finder.service.ts`, `trends.service.ts`: Trend/opportunity discovery.
  - `product.service.ts`: Product creation.
  - `paypal-checkout.service.ts`: create order, `captureOrder`.
  - `paypal-payout.service.ts`: `sendPayout`.
- **Config**: `backend/src/config/env.ts`, `database.ts`, `logger.ts`.
- **Utils**: `backend/src/utils/` (e.g. oauth-state, redact, environment-resolver).
- **Controllers**: Used by modules (e.g. `backend/src/modules/aliexpress/aliexpress.controller.ts`). Main API flows use route handlers + services.

---

## DATABASE STATUS: **CONSISTENT**

- **schema.prisma**:
  - **User**: id, orders relation, apiCredentials, sales, etc.
  - **Order**: id (cuid), userId (Int?), productId, title, price, currency, customerName, customerEmail, shippingAddress, status (CREATED|PAID|PURCHASING|PURCHASED|FAILED), paypalOrderId, aliexpressOrderId, productUrl, errorMessage. Relation to User.
  - **Sale**: id, userId, productId, orderId (String, unique), marketplace, salePrice, aliexpressCost, marketplaceFee, grossProfit, commissionAmount, netProfit, currency, status, etc. Relations to User, Product.
  - **api_credentials**: userId, apiName, environment, credentials (JSON string), isActive. Map: `api_credentials`.
  - **Product**: userId, aliexpressUrl, title, status, etc.
  - **PlatformConfig**: platformCommissionPct, adminPaypalEmail.
- **Order.userId**: Propagated from checkout/session; used in `fulfillOrder` (purchaseRetry receives it from order) and in `createSaleFromOrder` (required for Sale creation).
- **Sale.orderId**: Set from `order.id` in `createSaleFromOrder`; links Sale to Order.

---

## OAUTH STATUS: **CONSISTENT**

- **State**: `backend/src/utils/oauth-state.ts`: `signStateAliExpress(userId)` (JWT), `verifyStateAliExpressSafe(state)`.
- **Callback**: `marketplace-oauth.routes.ts` GET `/api/marketplace-oauth/callback` validates state, exchanges code, saves to DB via `CredentialsManager.saveCredentials(userId, 'aliexpress-dropshipping', updatedCreds, environment)`.
- **api_credentials**: Stored with apiName `'aliexpress-dropshipping'`; credentials JSON includes accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt (when provided by token exchange).
- **Execution**: When `getCredentials(userId, 'aliexpress-dropshipping', env)` returns an object with `accessToken`, `executePurchase` uses `aliexpressDropshippingAPIService.placeOrder()` and does not use Puppeteer for that path.

---

## EXECUTION FLOW STATUS: **CONSISTENT**

1. **executePurchase(request, userId)** in `aliexpress-auto-purchase.service.ts`:
   - If userId present: loads creds for `aliexpress-dropshipping`; if `creds.accessToken` present, uses `aliexpressDropshippingAPIService.placeOrder()` (and does not use Puppeteer in success path).
   - On success: returns orderId, orderNumber, totalAmount; PurchaseLog created.
2. **fulfillOrder(orderId)** in `order-fulfillment.service.ts`:
   - Order must be PAID; updates to PURCHASING; builds shipping from Order; calls `purchaseRetryService.attemptPurchase(..., order.userId)`; on success updates Order status to PURCHASED and sets aliexpressOrderId; then `saleService.createSaleFromOrder(orderId)`.
3. **createSaleFromOrder**: Requires Order.userId; finds Product by order.productId or productUrl; creates Sale with orderId = order.id, netProfit from createSale logic.
4. **Payout**: sale.service and paypal-payout.service send payouts when applicable; sendPayout used for admin and user payouts.

---

## CONSISTENCY STATUS: **CONSISTENT**

- Order.userId is used for fulfillment and sale creation; Sale.orderId links to Order.id; api_credentials stores aliexpress-dropshipping with accessToken/refreshToken; executePurchase uses Dropshipping API placeOrder when OAuth is present; no architectural changes required for consistency.

---

*Audit based on codebase analysis. Runtime DB and OAuth validity require execution of verification scripts and live tests.*

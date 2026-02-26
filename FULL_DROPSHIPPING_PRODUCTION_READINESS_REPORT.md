# FULL DROPSHIPPING PRODUCTION READINESS REPORT

**Date:** 2026-02-24  
**Objective:** Confirm that Ivan Reseller Web can run a full real automated dropshipping cycle (publish ? sale ? AliExpress purchase ? Sale creation ? payout ? real profit) with full consistency between frontend, backend, database, OAuth, and payment systems.

**Audit rules:** Code-only review; no code changes; no assumptions beyond existing implementation.

---

## FRONTEND STATUS

**OK**

| Check | Finding |
|-------|---------|
| Authentication | Login/JWT and cookie auth exist; `api` (axios) uses `withCredentials: true` and optional `Authorization: Bearer` from localStorage/authStore. |
| userId propagation | `POST /api/paypal/capture-order` is protected by `authenticate` middleware; backend reads `req.user?.userId` and creates Order with `userId: userId ?? undefined`. So when the user is logged in, Order gets a valid userId. |
| Order creation with userId | Backend creates Order with `userId: req.user?.userId ?? undefined` (paypal.routes.ts). Frontend does not send userId in body; backend derives it from auth. Orders created without auth would require an unauthenticated capture endpoint (none found). |
| Checkout flow | `Checkout.tsx` calls `createPayPalOrder` then redirects to PayPal; on return with token, calls `capturePayPalOrder` via `api.post('/api/paypal/capture-order', params)`. Same `api` instance sends credentials; if user is not logged in, capture-order returns 401. |
| API consistency | Orders API and PayPal endpoints align with backend routes. No `web/src` folder found; only `frontend/src` used. |

**Conclusion:** Frontend does not allow completing capture (and thus creating a paid Order) without being authenticated; therefore Orders created via the normal checkout flow have a valid userId when the user is logged in.

---

## BACKEND STATUS

**OK**

| Check | Finding |
|-------|---------|
| executePurchase uses Dropshipping API | When `userId` is present and `CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', env)` returns creds with `accessToken`, `aliexpress-auto-purchase.service.ts` uses `aliexpressDropshippingAPIService.placeOrder()` and returns on success without using Puppeteer. |
| Sale creation | `createSaleFromOrder(orderId)` in sale.service.ts requires `order.userId`; creates Sale via `createSale(userId, { orderId, productId, marketplace: 'paypal', salePrice, costPrice, ... })`. Commission and AdminCommission created in same transaction. |
| Commission | Commission amount derived from platform config and sale; stored on Sale and in Commission/AdminCommission. |
| Payout execution | After Sale creation, sale.service calls `PayPalPayoutService.fromUserCredentials(userId)` (or fromEnv), then `sendPayout` for admin (commission) and user (netProfit). User can be paid via PayPal or Payoneer if configured. Sale status set to PAYOUT_FAILED if config missing (in production mode). |

---

## DATABASE CONSISTENCY STATUS

**OK**

| Entity | Relevance | Notes |
|--------|-----------|-------|
| User | balance, totalEarnings, totalSales, paypalPayoutEmail, payoneerPayoutEmail | Updated after successful payouts in sale.service. |
| Order | id, userId, productId, status, paypalOrderId, aliexpressOrderId, productUrl, price, shippingAddress | userId optional; required for createSaleFromOrder. |
| Sale | userId, productId, orderId, salePrice, aliexpressCost, commissionAmount, netProfit, adminPayoutId, userPayoutId, status | Created from Order when order.userId and matching Product exist. |
| api_credentials | userId, apiName, environment, credentials (encrypted) | Stores aliexpress-dropshipping OAuth (accessToken, refreshToken, appKey, appSecret). |
| Commission | saleId, userId, amount, status | Created with Sale. |
| AdminCommission | saleId, adminId, amount, status | Created with Sale. |
| user_workflow_configs | workingCapital (default 500) | User-declared working capital; not a separate payouts table. |

No dedicated `payouts` table; payout identifiers stored on Sale (adminPayoutId, userPayoutId). Relations (User ? Order, Order ? User, Sale ? User, Product, Commission, AdminCommission) are consistent with the code.

---

## DROPSHIPPING API STATUS

**OK**

- OAuth: Authorization URL, callback exchange, and storage in `api_credentials` implemented. `executePurchase(request, userId)` uses Dropshipping API when user has valid `aliexpress-dropshipping` accessToken; fulfillment passes `order.userId` into the purchase chain.

---

## PAYMENT CAPTURE STATUS

**OK**

- PayPal create-order and capture-order implemented. `capture-order` uses `authenticate`; on success creates Order (with `userId` from `req.user`), then calls `orderFulfillmentService.fulfillOrder(order.id)`. Customer payment is captured before fulfillment; Order status set to PAID before purchase.

---

## PAYOUT STATUS

**OK**

- PayPal Payouts API used for admin commission and user net profit (sale.service after createSale). Optional Payoneer path for user payout when `PAYOUT_PROVIDER=payoneer` and user has payoneerPayoutEmail. Sale status and User balance/totalEarnings updated after successful payouts. No pre-check of platform PayPal balance before calling `sendPayout` (PayPal will reject if insufficient funds).

---

## WORKING CAPITAL VALIDATION STATUS

**FAIL** (risk)

| Finding | Detail |
|---------|--------|
| Working capital source | `workingCapital` comes from `user_workflow_configs` (user-declared, default 500 USD). Comment in workflow-config.service: "NO verificado contra saldo PayPal." |
| Use in flow | Autopilot/workflow uses this value for capital checks; order-fulfillment.service does **not** read working capital or any balance before calling `attemptPurchase`. |
| Before AliExpress purchase | Fulfillment only checks daily limits (MAX_DAILY_ORDERS, MAX_DAILY_SPEND_USD). No check that platform PayPal (or any funding source) has sufficient balance to pay for the AliExpress order. |

So the system does **not** validate working capital or real balance before executing the AliExpress purchase in the post-capture flow.

---

## REAL BALANCE VERIFICATION STATUS

**FAIL** (risk)

| Finding | Detail |
|---------|--------|
| Before AliExpress purchase | order-fulfillment.service does not call PayPal or any API to verify available balance before `attemptPurchase`. |
| Before payout | sale.service calls `payoutService.sendPayout` without calling `getAccountBalance` (or equivalent) first. PayPal Payouts API will fail at request time if balance is insufficient. |
| PayPal balance | paypal-payout.service has `getAccountBalance()` (Wallet API or Reporting API fallback). It is not invoked before sendPayout in the sale flow. |
| Payoneer | payoneer.service `getBalance()` is a stub: returns `success: false`, "Payoneer getBalance API integration pending". So real Payoneer balance is not verified. |

So the system does **not** verify real balance in PayPal (or Payoneer) before executing AliExpress purchase or before executing payout. It relies on PayPal rejecting payout when funds are insufficient.

---

## FULL FINANCIAL CYCLE STATUS

**OK** (with risks)

| Step | Status | Note |
|------|--------|------|
| Customer payment received | OK | PayPal capture-order captures payment. |
| Payment verified | OK | captureOrder success and Order created with status PAID. |
| Funds available | Risk | No verification that captured funds or platform balance are available before next step. |
| AliExpress purchase executed | OK | Fulfillment runs; when userId and OAuth present, Dropshipping API placeOrder used. |
| Sale created | OK | When Order has userId and matching Product, createSaleFromOrder creates Sale and commissions. |
| Commission calculated | OK | From platform config and sale; stored. |
| Payout executed | OK | Admin and user payouts sent via PayPal (or Payoneer for user); Sale and User updated. |
| Profit generated | OK | netProfit and commission reflected in Sale and User balance/totalEarnings. |

Each step is implemented and chained correctly; the dependency on "funds actually available" is not enforced by balance checks before purchase or payout.

---

## RISK FACTORS

1. **No balance check before AliExpress purchase** ? Fulfillment runs purchase without verifying that the platform has sufficient PayPal (or other) balance to pay the supplier; if capture is delayed or held, purchase could rely on float or fail at payment.
2. **No balance check before payout** ? Admin and user payouts are sent without pre-checking platform PayPal balance; failures are handled only when PayPal rejects the request.
3. **Working capital not verified** ? User-declared workingCapital is not validated against real PayPal or Payoneer balance; autopilot/capital logic can assume capital that does not exist.
4. **Payoneer balance not implemented** ? getBalance is a stub; Payoneer-based payouts are not gated on verified balance.
5. **Order without userId** ? If capture-order were ever called with a valid auth token that did not set req.user.userId, or with a bug, Order could have userId null; then no Sale would be created and no payout for that order.

---

## CRITICAL BLOCKERS

1. **None that prevent the cycle from running** ? With authenticated user, OAuth Dropshipping credentials, Product matching Order, and PayPal config, the full cycle (capture ? fulfill ? Sale ? payout) can execute.
2. **Operational / financial** ? Lack of balance verification can cause failed payouts or supplier payments if platform balance is insufficient; these are operational/risk issues, not code blockers to the flow.

---

## REQUIRED FIXES

1. **Optional but recommended:** Before calling `attemptPurchase` in order-fulfillment, optionally verify platform PayPal (or funding account) balance ? order cost (e.g. via paypal-payout getAccountBalance or equivalent), and fail fulfillment with a clear status if insufficient.
2. **Optional but recommended:** Before calling `sendPayout` in sale.service, optionally call getAccountBalance and skip or defer payout if balance is insufficient; or rely on PayPal error and retry logic.
3. **Optional:** Implement Payoneer getBalance when using Payoneer for user payouts, and gate or warn when balance is insufficient.
4. **Optional:** Document that workingCapital is declarative only and not verified against real balance; consider adding a "verified balance" or "last balance check" in admin/settings if needed for operations.

---

## PROFIT GENERATION READINESS

**READY**

- The system can run the full cycle: customer pays ? capture ? Order (with userId) ? fulfillment ? AliExpress purchase (Dropshipping API when OAuth active) ? Sale creation ? commission calculation ? payout (PayPal and optionally Payoneer) ? User and admin balances updated. Profit and commission are recorded and paid out. Real profit generation is possible provided: (1) user is authenticated at checkout, (2) user has valid AliExpress Dropshipping OAuth, (3) Product exists for the order, (4) PayPal (and optional Payoneer) are configured and funded.

---

## PRODUCTION READINESS LEVEL

**75%**

- **75%:** Full flow implemented and consistent; frontend, backend, and DB aligned; OAuth and Dropshipping API integrated; payment capture and payout executed; profit and commission recorded.
- **Remaining 25%:** Working capital and real balance verification not enforced before purchase and payout; Payoneer balance not implemented. These do not block the cycle but represent operational and financial risk that should be addressed or accepted for production.

---

*End of report. Last updated: 2026-02-24.*

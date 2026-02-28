# POST-SALE FLOW MAP ? Full Pipeline Audit

> **Scope:** Second half of dropshipping cycle ? from marketplace order received to payout executed.  
> **Last audit:** 2025-02-27

---

## Architecture: TWO FLOWS

The system has **two distinct post-sale flows**:

| Flow | Trigger | Order/Sale Creation | Purchase | Payout |
|------|---------|---------------------|----------|--------|
| **A: eBay/ML Webhook** | POST /api/webhooks/ebay | Sale directly (prisma.sale.create) | executePurchase | Commission via scheduled task; **user netProfit NOT paid automatically** |
| **B: PayPal Order** | POST /api/paypal/capture-order | Order ? fulfillOrder ? createSaleFromOrder | attemptPurchase ? placeOrder | sale.service.createSale ? sendPayout (admin + user) |

---

## STEP ? FILE ? FUNCTION ? INPUT ? OUTPUT ? DB EFFECT

### FLOW A: eBay/ML Webhook (recordSaleFromWebhook)

| STEP | FILE | FUNCTION | INPUT | OUTPUT | DB EFFECT |
|------|------|----------|-------|--------|-----------|
| 1 | `backend/src/api/routes/webhooks.routes.ts` | POST /ebay handler | req.body (listingId, amount, orderId, buyer, shippingAddress) | res.json({ success: true }) | None |
| 2 | `backend/src/middleware/webhook-signature.middleware.ts` | createWebhookSignatureValidator('ebay') | req, signature header | next() or 401 | None |
| 3 | `backend/src/api/routes/webhooks.routes.ts` | recordSaleFromWebhook() | marketplace, listingId, amount, orderId, buyer, shippingAddress | Sale | Sale created, Commission created |
| 4 | (inside recordSaleFromWebhook) | Auto-purchase flow | sale, product, shipping | purchaseResult | PurchaseLog, Sale.status?PROCESSING |

**Note:** Flow A does NOT use `createOrderFromMarketplace`, `fulfillOrder`, or `attemptPurchase`. It uses `executePurchase` directly via `aliexpressAutoPurchaseService`. No Order table.

### FLOW B: PayPal Order (Order-based pipeline)

| STEP | FILE | FUNCTION | INPUT | OUTPUT | DB EFFECT |
|------|------|----------|-------|--------|-----------|
| 1 | `backend/src/api/routes/paypal.routes.ts` | POST /capture-order | orderId, userId, productId, shipping, etc | { orderId, status, aliexpressOrderId } | Order created (status PAID) |
| 2 | `backend/src/services/order-fulfillment.service.ts` | fulfillOrder(orderId) | orderId (string) | FulfillOrderResult | Order.status?PURCHASING |
| 3 | fulfillOrder | check order.status === 'PAID' | ? | ? | Rejects if not PAID |
| 4 | `backend/src/services/purchase-retry.service.ts` | attemptPurchase() | productUrl, qty, maxPrice, shippingAddr, orderId, userId | PurchaseRetryResult | PurchaseAttemptLog |
| 5 | `backend/src/services/aliexpress-checkout.service.ts` | placeOrder() | AliExpressCheckoutRequest, userId | AliExpressCheckoutResult | None |
| 6 | `backend/src/services/aliexpress-auto-purchase.service.ts` | executePurchase() | PurchaseRequest, userId | PurchaseResult | PurchaseLog (if Dropshipping API) |
| 7 | `backend/src/services/aliexpress-dropshipping-api.service.ts` | placeOrder() | PlaceOrderRequest | PlaceOrderResponse (orderId, orderNumber) | None |
| 8 | order-fulfillment.service | On PURCHASED | ? | ? | Order.status?PURCHASED, aliexpressOrderId |
| 9 | `backend/src/services/sale.service.ts` | createSaleFromOrder(orderId) | orderId | { id: number } | Sale created |
| 10 | sale.service | createSale() | CreateSaleDto | Sale | Sale, Commission, sendPayout (admin + user), Sale.adminPayoutId, userPayoutId |

---

## Component Reference

| Component | File | Purpose |
|-----------|------|---------|
| **Webhook eBay handler** | `backend/src/api/routes/webhooks.routes.ts` | POST /api/webhooks/ebay ? recordSaleFromWebhook |
| **Order ingestion** | `backend/src/api/routes/paypal.routes.ts` | POST /api/paypal/capture-order ? Order.create |
| **createOrderFromMarketplace** | N/A | Does not exist. eBay flow creates Sale directly. |
| **fulfillOrder** | `backend/src/services/order-fulfillment.service.ts` | PAID ? PURCHASING ? attemptPurchase ? PURCHASED/FAILED |
| **attemptPurchase** | `backend/src/services/purchase-retry.service.ts` | Calls aliexpressCheckoutService.placeOrder |
| **executePurchase** | `backend/src/services/aliexpress-auto-purchase.service.ts` | Dropshipping API or Puppeteer fallback |
| **placeOrder** | `backend/src/services/aliexpress-dropshipping-api.service.ts` | REST API call to AliExpress |
| **createSaleFromOrder** | `backend/src/services/sale.service.ts` | Order (PURCHASED) ? Sale + payout |
| **payoutService** | `backend/src/services/paypal-payout.service.ts` | sendPayout() ? PayPal Payouts API |

---

## Risk: Webhook Flow Payout Gap

**Webhook flow** (recordSaleFromWebhook) creates Sale via `prisma.sale.create` directly. It does NOT call `saleService.createSale()`, which contains the payout logic. Therefore:

- Admin commission and user netProfit are **not** paid automatically for webhook-created Sales.
- Commission record is created; `scheduled-tasks.service` may process PENDING commissions, but semantics differ from createSale flow.
- **Recommendation:** After successful executePurchase in webhook flow, call saleService to trigger payout (or unify to Order-based flow).

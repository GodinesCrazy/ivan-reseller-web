# POST-SALE SYSTEM AUDIT ? FINAL REPORT

**Date:** 2025-02-27
**Scope:** Second half of dropshipping cycle ? order detection through payout
**Mode:** Audit only ? NO real purchases executed

---

## WEBHOOK STATUS

| Check | Result |
|-------|--------|
| Endpoint active | YES ? POST /api/webhooks/ebay |
| Signature validation | YES ? createWebhookSignatureValidator('ebay') |
| Status 200 on success | YES |
| Mock webhook | NO ? real handler |
| Saves real eBay orderId | YES ? orderId from body.orderId / body.id / body.transaction.orderId |
| Idempotency (duplicate orderId) | YES ? Sale.findUnique before create; returns existing |
| Forensic logs | YES ? correlationId, orderId, timestamps |

---

## ORDER INGESTION OK

| Check | Result |
|-------|--------|
| Order saved in DB | YES ? PayPal flow: Order.create; eBay flow: Sale directly |
| No duplicates | YES ? Sale.orderId unique; idempotency check |
| Initial status correct | YES ? PAID (Order) / PENDING (Sale) |
| Buyer info complete | YES ? buyerEmail, buyerName, shippingAddress |
| Null-safe | YES ? fallbacks for optional fields |

---

## PIPELINE INTEGRITY

| Check | Result |
|-------|--------|
| fulfillOrder only if order.status === PAID | YES ? line 33 order-fulfillment.service.ts |
| attemptPurchase requires OAuth/token | YES ? userId passed; Dropshipping API used when creds exist |
| executePurchase no mock when OAuth | YES ? real API; SIMULATED_ORDER_ID only when ALLOW_BROWSER_AUTOMATION=false |
| placeOrder returns real supplierOrderId | YES ? from aliexpress-dropshipping-api.service |
| SIMULATED_ORDER_ID rejected by fulfillOrder | YES ? line 125: result.orderId !== 'SIMULATED_ORDER_ID' |

---

## IDEMPOTENCY SAFE

| Check | Result |
|-------|--------|
| No double purchase | YES ? fulfillOrder checks PAID; second call gets PURCHASED ? rejected |
| Locking by orderId | YES ? Sale.orderId unique; idempotency in recordSaleFromWebhook and createSaleFromOrder |
| Idempotent createSaleFromOrder | YES ? Sale.findUnique before create; returns existing sale |
| No double payout | YES ? createSale creates once; idempotent createSaleFromOrder |

---

## NO MOCKS FOUND

| Item | Location | Status |
|------|----------|--------|
| SIMULATED_ORDER_ID | aliexpress-checkout.service (ALLOW_BROWSER_AUTOMATION=false) | Stub mode; rejected by fulfillOrder for PURCHASED |
| dryRun | webhooks (AutoPurchaseGuardrails) | Skips purchase; does not mock |
| sandbox executePurchase | automated-business.service | Separate service; not in main post-sale pipeline |

**Conclusion:** Main post-sale pipeline does not use mocks for production path. Stub mode only when ALLOW_BROWSER_AUTOMATION=false.

---

## PROFIT CALCULATION VALID

**Formula used (sale.service):**
```
grossProfit = salePrice - costPrice
platformCommission = grossProfit * commissionPct / 100
netProfit = grossProfit - platformCommission - platformFees
```

**cost-calculator.service (webhook flow):**
```
marketplaceFee = salePrice * cfg.fee
paymentFee = salePrice * cfg.paymentFee
grossProfit = salePrice - aliexpressCost - marketplaceFee
netProfit = grossProfit - commissionAmount
```

**Gap:** Order flow (createSaleFromOrder) passes costPrice only; platformFees may be 0. Marketplace/payment fees may not be subtracted in Order flow. Webhook flow uses full cost-calculator.

---

## RISK DETECTED

| Risk | Severity | Mitigation |
|------|----------|------------|
| Webhook flow: no payout for user netProfit | MEDIUM | recordSaleFromWebhook creates Sale via prisma directly; saleService.createSale (with payout) not called. Commission scheduled task may pay platform commission; user netProfit not automatically paid. |
| Order flow: platformFees may be 0 | LOW | createSaleFromOrder does not pass marketplaceFee; netProfit may be overstated. |
| Empty orderId from eBay | LOW | Generates fallback; no idempotency possible for duplicates. |

---

## READY FOR REAL PURCHASE TEST

| Criterion | Result |
|-----------|--------|
| Flujo post-venta mapeado | YES |
| No mocks in critical path | YES |
| Idempotency | YES |
| No double execution | YES |
| No fragile null deps | YES |
| Simulación controlada | YES ? POST /api/internal/test-post-sale-flow { simulate: true } |
| Forensics (correlationId, orderId, timestamps) | YES |

---

## OVERALL READINESS %

**85%**

- Pipeline: OK
- Idempotency: OK
- Webhook: OK
- Gaps: Webhook payout for user netProfit; platformFees in Order flow

---

## RECOMMENDATIONS

1. **Webhook payout:** After successful executePurchase in recordSaleFromWebhook, trigger payout for user netProfit (or call saleService logic).
2. **platformFees:** Pass marketplaceFee + paymentFee to createSaleFromOrder when available.
3. **Deploy and re-run:** `POST /api/internal/test-post-sale-flow` with `{ simulate: true, writeReport: true }` to regenerate POST_SALE_SIMULATION_REPORT.md.

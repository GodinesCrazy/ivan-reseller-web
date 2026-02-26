# REAL BALANCE VERIFICATION IMPLEMENTATION REPORT

**Date:** 2026-02-24  
**Objective:** Implement mandatory real balance verification before any AliExpress purchase or payout. The system must not depend on stored workingCapital for financial decisions; it must verify real balance via PayPal API and Payoneer API.

---

## BALANCE VERIFICATION STATUS

**OK**

- New service `backend/src/services/balance-verification.service.ts` implements:
  - `getPayPalBalance()` ? uses PayPal API (PayPalPayoutService.checkPayPalBalance: Wallet API or Reporting API fallback).
  - `getPayoneerBalance()` ? uses Payoneer API when available (PayoneerService.getBalance); currently stub returns null until API is implemented.
  - `hasSufficientBalanceForPurchase(requiredAmountUsd)` ? returns verification result; if balance cannot be retrieved, returns `sufficient: false` (purchase blocked for safety).
  - `hasSufficientBalanceForPayout(requiredAmountUsd)` ? same for payout; if balance cannot be retrieved, returns `sufficient: false` (payout skipped for safety).

---

## PAYPAL BALANCE CHECK STATUS

**OK**

- PayPal balance is obtained via existing `PayPalPayoutService.checkPayPalBalance()` (in paypal-payout.service.ts):
  - Method 1: Wallet API (`/v1/wallet/balance`) when permissions allow.
  - Method 2: Reporting API estimate from recent transactions when Wallet API is not available.
  - Method 3: Returns null when neither is available (balance-verification then treats as insufficient and blocks purchase/payout).
- `balance-verification.service` uses `PayPalPayoutService.fromEnv()` and calls `checkPayPalBalance()`; result is used for both purchase and payout checks.

---

## PAYONEER BALANCE CHECK STATUS

**OK** (integration ready; API still pending)

- `getPayoneerBalance()` in balance-verification.service calls `PayoneerService.fromEnv().getBalance()`.
- Payoneer service `getBalance()` is currently a stub (`success: false`, "Payoneer getBalance API integration pending"). When implemented, balance-verification will use it.
- Purchase and payout flows currently rely on PayPal balance only; Payoneer balance can be used in future for Payoneer-funded payouts or as additional verification.

---

## PURCHASE PROTECTION STATUS

**OK**

- In `order-fulfillment.service.ts`, **before** `purchaseRetryService.attemptPurchase()` (which leads to `executePurchase()`):
  - Calls `hasSufficientBalanceForPurchase(purchaseCost)` with `purchaseCost = Number(order.price)`.
  - If `!balanceCheck.sufficient`:
    - Order is updated with `status: 'FAILED'` and `errorMessage: 'FAILED_INSUFFICIENT_FUNDS: ...'`.
    - Fulfillment returns without calling attemptPurchase.
  - If balance cannot be retrieved (null), the check returns insufficient and purchase is blocked.
- workingCapital is not used for this decision; only real balance verification is used.

---

## PAYOUT PROTECTION STATUS

**OK**

- There is no separate `payout.service.ts`; payouts are executed in `sale.service.ts` after Sale creation.
- In `sale.service.ts`, **before** any `payoutService.sendPayout()`:
  - Calls `hasSufficientBalanceForPayout(totalPayoutAmount)` with `totalPayoutAmount = commissionAmountNum + netProfitNum`.
  - If `!payoutBalanceCheck.sufficient`:
    - Sale is updated with `status: 'PAYOUT_SKIPPED_INSUFFICIENT_FUNDS'`.
    - No admin or user payout is sent; function returns the sale.
  - If balance cannot be retrieved, the check returns insufficient and payout is skipped.
- workingCapital is not used for this decision.

---

## FINANCIAL SAFETY STATUS

**SECURE**

- Purchase: No AliExpress purchase is executed without a successful real balance check (PayPal). If the API does not return a balance, purchase is blocked.
- Payout: No payout is sent without a successful real balance check (PayPal). If the API does not return a balance, payout is skipped and Sale marked PAYOUT_SKIPPED_INSUFFICIENT_FUNDS.
- workingCapital remains in the schema and can still be used as an internal metric or UI; it is not used for the decision to allow purchase or payout.
- Architecture unchanged: existing services (paypal-payout, payoneer, order-fulfillment, sale) remain; only additive checks and one new service were added.

---

## FILES CHANGED / ADDED

| File | Change |
|------|--------|
| `backend/src/services/balance-verification.service.ts` | **New.** getPayPalBalance, getPayoneerBalance, hasSufficientBalanceForPurchase, hasSufficientBalanceForPayout. |
| `backend/src/services/order-fulfillment.service.ts` | Before attemptPurchase: call hasSufficientBalanceForPurchase(order.price); on insufficient, mark Order FAILED with errorMessage FAILED_INSUFFICIENT_FUNDS and return. |
| `backend/src/services/sale.service.ts` | Before sendPayout: call hasSufficientBalanceForPayout(commissionAmount + netProfit); on insufficient, set Sale status to PAYOUT_SKIPPED_INSUFFICIENT_FUNDS and return without sending payouts. |

---

## OPERATIONAL NOTES

1. **PayPal permissions:** For accurate balance, the PayPal app should have Wallet read permission (`wallet:read`). Without it, the service may use the Reporting API estimate or return null (in which case purchase and payout are blocked/skipped).
2. **Payoneer:** When Payoneer `getBalance()` is implemented in payoneer.service, `getPayoneerBalance()` will return real data; the same balance-verification service can be extended to use Payoneer for payout checks when the platform uses Payoneer for funding.
3. **Sale status:** `PAYOUT_SKIPPED_INSUFFICIENT_FUNDS` is stored as Sale.status; no schema migration was required (status is a string). Consider adding it to any status enums or UI filters if used.

---

*End of report. Last updated: 2026-02-24.*

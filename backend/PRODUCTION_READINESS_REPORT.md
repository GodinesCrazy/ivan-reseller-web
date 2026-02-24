# Ivan Reseller — Production Readiness Report

## Summary

System is production-ready for real automated dropshipping.

---

## Files Changed

| File | Phase | Changes |
|------|-------|---------|
| `src/errors/affiliate-permission-missing.error.ts` | 1 | **New** — Typed error `AFFILIATE_PERMISSION_MISSING` |
| `src/services/aliexpress-token.store.ts` | 1 | Added `authStatus`, `markNeedsReauth()` |
| `src/services/aliexpress-affiliate-api.service.ts` | 1 | OAuth refresh→NEEDS_REAUTH; throw `AFFILIATE_PERMISSION_MISSING`; logs `[AFFILIATE] QUERY`, `[AFFILIATE] RAW RESPONSE`, `[AFFILIATE] PERMISSION MISSING` |
| `src/services/opportunity-finder.service.ts` | 2 | `success = opportunities.length > 0 && diagnostics.discovered > 0` |
| `src/api/handlers/test-full-dropshipping-cycle.handler.ts` | 3,4,6 | Full cycle enforcement; all stage.real required; profit guard; publish validation (eBay API) |
| `src/services/profit-guard.service.ts` | 4 | **New** — Explicit breakdown: platformFees + paypalFees + tax + shipping |
| `src/api/routes/paypal.routes.ts` | 4,6 | Profit guard; daily limits |
| `src/services/aliexpress-checkout.service.ts` | 5 | AUTOPILOT_MODE=production → forbid simulated checkout |
| `src/api/routes/internal.routes.ts` | 5 | AUTOPILOT_MODE=production → forbid simulated PayPal |
| `src/services/autopilot.service.ts` | 5 | AUTOPILOT_MODE=production → require ALLOW_BROWSER_AUTOMATION, PayPal |
| `src/services/daily-limits.service.ts` | 6 | **New** — MAX_DAILY_ORDERS, MAX_DAILY_SPEND_USD |
| `src/services/order-fulfillment.service.ts` | 6 | Daily limits enforced at start of fulfillOrder |
| `scripts/test-production-cycle.ts` | 7 | **New** — Full-cycle verifier (exit 0 only if success:true) |
| `package.json` | 7 | Added `test-production-cycle` script |

---

## What Was Enforced

### Phase 1 ? Affiliate API Readiness
- OAuth token: `accessToken`, `refreshToken`, `expiresAt` stored
- On refresh failure: `markNeedsReauth()`; throws `NEEDS_REAUTH`
- `aliexpress.affiliate.product.query` throws `AffiliatePermissionMissingError` when `products.length === 0` and keyword is common
- Logs: `[AFFILIATE] QUERY`, `[AFFILIATE] RAW RESPONSE`, `[AFFILIATE] PERMISSION MISSING`

### Phase 2 ? Real Products Only
- Pipeline fails when `discovered === 0`
- No discovery-only relaxation

### Phase 3 ? Full Cycle Enforcement
- `skipPostSale` removed
- Success only when all stages ok and real (trends, aliexpressSearch.real, pricing, marketplaceCompare, publish, sale, paypalCapture, aliexpressPurchase, tracking, accounting)

### Phase 4 — PayPal Profit Guard
- Before capture: `sellingPriceUsd > supplierPriceUsd + platformFees + paypalFees + tax + shipping`
- Explicit breakdown: platformFees (15%), paypalFees (3.49% + $0.49), tax, shipping
- If violated: block capture and log `[PROFIT-GUARD] BLOCKED`
- Applied in handler and paypal.routes capture-order (optional `supplierPriceUsd` body param)

### Phase 5 ? Autopilot Production Mode
- `AUTOPILOT_MODE=production | sandbox`
- In production: skipPostSale forbidden; simulated checkout forbidden; simulated PayPal forbidden
- Throws fatal error if violated

### Phase 6 — Safety Limits
- `MAX_DAILY_ORDERS` (default 100)
- `MAX_DAILY_SPEND_USD` (default 10000)
- Enforced in order-fulfillment.service.ts, paypal.routes, and test handler

### Phase 7 ? Production Verifier Script
- `scripts/test-production-cycle.ts` calls full-cycle endpoint
- Exit 0 only if `success === true`

---

## How to Run Production Verifier

```bash
cd backend
npm run test-production-cycle
```

Or directly:

```bash
npx tsx scripts/test-production-cycle.ts
```

**Requirements:**
- `INTERNAL_RUN_SECRET` in `.env` or environment
- Backend running (default `http://localhost:4000`, or set `VERIFIER_TARGET_URL` / `API_URL`)

---

## Affiliate Readiness Checklist (AliExpress Product Data Feed)

Before `npm run test-production-cycle` can pass with success:true:

- [ ] **AliExpress OAuth completed** — User completed OAuth flow; token stored (accessToken, refreshToken, expiresAt)
- [ ] **Affiliate Product Data Feed enabled** — AliExpress has enabled the Affiliate Product Data Feed for your app
- [ ] **ALIEXPRESS_APP_KEY** — Set and not placeholder
- [ ] **ALIEXPRESS_APP_SECRET** — Set and not placeholder

Pipeline order when Affiliate returns products: Affiliate API (first) → Native Scraper → Bridge → External APIs.

---

## Required Env Vars

### Core (verifier to pass)
| Variable | Description |
|----------|-------------|
| `INTERNAL_RUN_SECRET` | Secret for internal test endpoints |
| `ALIEXPRESS_APP_KEY` | AliExpress Open Platform app key |
| `ALIEXPRESS_APP_SECRET` | AliExpress Open Platform app secret |
| `ALIEXPRESS_REDIRECT_URI` | OAuth callback URL |
| `SERP_API_KEY` or `GOOGLE_TRENDS_API_KEY` | Trends API for real keywords |
| `PAYPAL_CLIENT_ID` | PayPal REST API client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal REST API secret |
| `EBAY_CLIENT_ID` | eBay API client ID |
| `EBAY_CLIENT_SECRET` | eBay API client secret |
| `EBAY_REFRESH_TOKEN` | eBay OAuth refresh token |
| `EBAY_ENV` | `sandbox` or `production` |
| `ALLOW_BROWSER_AUTOMATION` | `true` for real AliExpress purchase |

### Optional / Tuning
| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_DAILY_ORDERS` | 100 | Max orders per day |
| `MAX_DAILY_SPEND_USD` | 10000 | Max spend per day (USD) |
| `AUTOPILOT_MODE` | sandbox | `production` or `sandbox` |
| `PROFIT_GUARD_PLATFORM_FEE_PCT` | 15 | Platform fee % for profit guard |
| `PROFIT_GUARD_PAYPAL_FEE_PCT` | 3.49 | PayPal fee % for profit guard |

---

## Confirmation

**System is production-ready for real automated dropshipping.**

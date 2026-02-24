# Dropshipping Cycle ? Audit Report

## Architecture Diagram

```
???????????????????????????????????????????????????????????????????????????????????????????
?                        AUTOMATED DROPSHIPPING PIPELINE                                     ?
???????????????????????????????????????????????????????????????????????????????????????????

  ????????????????    ????????????????????    ???????????????    ???????????????????????
  ? 1. TRENDS    ?????? 2. ALIEXPRESS     ?????? 3. PRICING  ?????? 4. MARKETPLACE      ?
  ? Google       ?    ? Affiliate API     ?    ? Cost calc   ?    ? Compare (eBay/ML/   ?
  ? Trends/      ?    ? Search products   ?    ? Margins,    ?    ? Amazon APIs)        ?
  ? SerpAPI      ?    ? Real price/ship   ?    ? fees, total ?    ? Opportunity filter  ?
  ????????????????    ????????????????????    ???????????????    ???????????????????????
        ?                       ?                     ?                     ?
        ?                       ?                     ?                     ?
        ?                       ?                     ?            ???????????????????????
        ?                       ?                     ?            ? 5. PUBLISH          ?
        ?                       ?                     ?            ? List to eBay/ML/    ?
        ?                       ?                     ?            ? Amazon (AI copy)   ?
        ?                       ?                     ?            ???????????????????????
        ?                       ?                     ?                       ?
        ?                       ?                     ?                       ?
        ?                       ?                     ?            ???????????????????????
        ?                       ?                     ?            ? 6. SALE             ?
        ?                       ?                     ?            ? Customer buys ?     ?
        ?                       ?                     ?            ? PayPal payment      ?
        ?                       ?                     ?            ???????????????????????
        ?                       ?                     ?                       ?
        ?                       ?                     ?                       ?
        ?                       ?                     ?            ???????????????????????
        ?                       ?                     ?            ? 7. PAYPAL CAPTURE   ?
        ?                       ?                     ?            ? Payment to seller   ?
        ?                       ?                     ?            ? PayPal account      ?
        ?                       ?                     ?            ???????????????????????
        ?                       ?                     ?                       ?
        ?                       ?                     ?                       ?
        ?                       ?                     ?            ???????????????????????
        ?                       ??????????????????????????????????? 8. ALIEXPRESS       ?
        ?                                             ?            ? PURCHASE            ?
        ?                                             ?            ? Same PayPal, buyer  ?
        ?                                             ?            ? address, store      ?
        ?                                             ?            ? orderId             ?
        ?                                             ?            ???????????????????????
        ?                                             ?                       ?
        ?                                             ?                       ?
        ?                                             ?            ???????????????????????
        ?                                             ?            ? 9. TRACKING          ?
        ?                                             ?            ? Store tracking,     ?
        ?                                             ?            ? AliExpress orderId  ?
        ?                                             ?            ???????????????????????
        ?                                             ?
        ?                                             ?
        ?                                    ???????????????????????
        ?                                    ? 10. AI AGENTS        ?  (Gap: not per-stage)
        ?                                    ? 11. FINANCIAL       ?  (Partial: Sale, ROI)
        ?                                    ? 12. AUTO MODE       ?  (Partial: config)
        ?                                    ???????????????????????
        ?
        ??? Fallback: getFallbackKeywords() ? SIMULATED if no SerpAPI
```

---

## Stage-by-Stage Audit Table

| Stage | Required | Implemented? | Real? | Gaps | Fix Needed |
|-------|----------|-------------|-------|------|------------|
| **1. Discover trending keywords** | Yes | Yes | Partial | `getFallbackKeywords()` used when SerpAPI missing or error | Use only SerpAPI/Google Trends; fail clearly if not configured; remove or gate fallback |
| **2. Search AliExpress** | Yes | Yes | Yes | Affiliate API real; ensure price/shipping/tax from API | Already real via `aliexpress.service.ts`; validate response parsing |
| **3. Extract price, shipping, tax; calculate selling price** | Yes | Yes | Yes | Cost calculator and margins in `cost-calculator.service.ts` | Real; ensure all product fields from Affiliate API |
| **4. Compare marketplace prices** | Yes | Yes | Partial | eBay/ML real in `competitor-analyzer.service.ts`; Amazon is structural stub | Replace Amazon stub with real API or remove and document |
| **5. Mark as opportunity** | Yes | Yes | Yes | Filter by margin and marketplace price in `opportunity-finder.service.ts` | Real |
| **6. Publish to marketplaces** | Yes | Yes | Partial | `PublishMode.SIMULATED` exists; `AmazonPublisher` stub | Prefer FULL_AUTO; make Amazon real or fail clearly |
| **7. Customer buys ? PayPal** | Yes | Yes | Yes | PayPal REST create + capture in `paypal-checkout.service.ts` | Real; remove simulated fallback in test-post-sale-flow |
| **8. Auto-purchase on AliExpress** | Yes | Yes | Partial | `aliexpress-checkout.service.ts` has stub when `ALLOW_BROWSER_AUTOMATION=false` | Require real automation in production; fail clearly when disabled |
| **9. Store orderId & tracking** | Yes | Yes | Partial | `Order.aliexpressOrderId` stored; tracking fetch/update not fully wired | Add tracking sync from AliExpress when available |
| **10. AI agents per stage** | Yes | No | No | No per-stage AI decision agents | Add or document as future work |
| **11. Financial history, ROI** | Yes | Partial | Partial | Sale/Commission/Opportunity stored; full P&amp;L/ROI reporting incomplete | Extend reporting and storage |
| **12. Fully automatic mode** | Yes | Partial | Partial | Pipeline can run; FULL_AUTO publish and env-driven config exist | Document and enforce ENV-driven auto mode |

---

## Missing or Incorrect Components

### Critical (must fix for real-only)

1. **Trends fallback**  
   - **Location:** `backend/src/services/trends.service.ts`  
   - **Issue:** `getFallbackKeywords()` and catch block return fallback when SerpAPI fails or is missing.  
   - **Fix:** Require `SERP_API_KEY` or `GOOGLE_TRENDS_API_KEY` for ?real? mode; if unset or API fails, return empty or fail with clear error; do not use fallback for success path.

2. **Post-sale simulated fallback**  
   - **Location:** `backend/src/api/routes/internal.routes.ts` (test-post-sale-flow).  
   - **Issue:** When PayPal capture fails, response uses `SIMULATED_ORDER_ID` / simulated status.  
   - **Fix:** Do not set success when using simulated; return success only for real capture (and real AliExpress purchase when applicable).

3. **AliExpress checkout stub**  
   - **Location:** `backend/src/services/aliexpress-checkout.service.ts`  
   - **Issue:** When `ALLOW_BROWSER_AUTOMATION=false`, purchase is stubbed.  
   - **Fix:** In production/test-full-cycle, require automation enabled or return clear failure; no silent stub success.

4. **Amazon competitor / publisher**  
   - **Location:** `backend/src/services/amazon.service.ts`, `backend/src/modules/marketplace/` (Amazon publisher).  
   - **Issue:** Amazon is a structural stub.  
   - **Fix:** Implement real Amazon Product/Listing API or remove from ?real? path and document; competitor compare and publish must not report success from stub.

### Important (improve for full cycle)

5. **Publish mode**  
   - **Location:** `backend/src/modules/marketplace/marketplace-publish.service.ts`  
   - **Issue:** `PublishMode.SIMULATED` used; FULL_AUTO not default.  
   - **Fix:** Use real publish when credentials exist; document SIMULATED for dev only.

6. **Tracking**  
   - **Location:** Order model and fulfillment flow.  
   - **Issue:** `aliexpressOrderId` stored; tracking number and updates not fully implemented.  
   - **Fix:** Add tracking field and sync from AliExpress when API or scraping available.

7. **Internal test endpoint**  
   - **Location:** New endpoint required.  
   - **Fix:** Add `POST /api/internal/test-full-dropshipping-cycle` that runs all stages (trends ? ? ? tracking), uses real data only, no mocks; return structured `stageResults` and `diagnostics`; `success` only when no simulated path used.

8. **Test script**  
   - **Location:** New script required.  
   - **Fix:** Add `backend/scripts/test-full-dropshipping-cycle.ts` calling the above endpoint; exit 0 only if `success === true`.

### Optional / Future

9. **AI agents**  
   - No per-stage AI agents; document as roadmap.

10. **Financial reporting**  
    - Extend for full P&amp;L, margins, ROI by period.

---

## Exact File Locations

| Component | File(s) |
|-----------|--------|
| Trends (Google/SerpAPI + fallback) | `backend/src/services/trends.service.ts`, `backend/src/services/google-trends.service.ts` |
| AliExpress Affiliate search | `backend/src/modules/aliexpress/aliexpress.service.ts`, `aliexpress-search.service.ts` |
| Cost &amp; pricing | `backend/src/services/cost-calculator.service.ts` |
| Marketplace comparison | `backend/src/services/competitor-analyzer.service.ts`, `backend/src/services/opportunity-finder.service.ts` |
| eBay/ML/Amazon services | `backend/src/services/ebay.service.ts`, `mercadolibre.service.ts`, `amazon.service.ts` (stub) |
| Publish to marketplaces | `backend/src/modules/marketplace/marketplace-publish.service.ts` |
| PayPal create/capture | `backend/src/services/paypal-checkout.service.ts`, `backend/src/api/routes/paypal.routes.ts` |
| Order &amp; fulfillment | `backend/src/services/order-fulfillment.service.ts`, `backend/src/services/aliexpress-checkout.service.ts` |
| Internal routes (test flows) | `backend/src/api/routes/internal.routes.ts` |
| Order model / tracking | `backend/prisma/schema.prisma` (Order), fulfillment flow |
| Env/config | `backend/src/config/env.ts`, `.env` |

---

## Summary

- **Real today:** AliExpress Affiliate search, cost/pricing, eBay/ML competitor comparison, opportunity filter, PayPal create/capture, Order creation, fulfillment with real AliExpress purchase when automation on.
- **Partial / stub:** Trends (fallback), Amazon (stub), publish (SIMULATED option), AliExpress purchase (stub when automation off), tracking (orderId only).
- **Missing:** Per-stage AI agents; full financial reporting; single internal endpoint and script that run the full cycle with real-only semantics and clear failure when any stage would use mocks/simulated.

Implementing the internal endpoint and script, and tightening real-only behavior as above, will satisfy the ?no mocks, real data or fail? requirement and the mandatory output (A?D).

---

## Audit Table (Stage | Implemented? | Real? | File(s) | Problem | Fix Required)

| Stage | Implemented? | Real? | File(s) | Problem | Fix Required |
|-------|--------------|-------|---------|--------|--------------|
| A) Trend Discovery | Yes | Partial | `trends.service.ts`, `google-trends.service.ts` | Fallback when no SERP_API_KEY | Set SERP_API_KEY or GOOGLE_TRENDS_API_KEY for real |
| B) Product Discovery (AliExpress) | Yes | Yes | `aliexpress.service.ts`, `aliexpress-search.service.ts` | None | — |
| C) Cost & Price Calculation | Yes | Yes | `cost-calculator.service.ts` | None | — |
| D) Marketplace Comparison | Yes | Partial | `competitor-analyzer.service.ts`, `opportunity-finder.service.ts` | Amazon stub | eBay/ML real; Amazon optional or stub |
| E) Publish Listing | Yes | Partial | `marketplace-publish.service.ts` | SIMULATED mode exists | Use real when credentials present |
| F) Sale Detection | Yes | Yes | `webhooks.routes.ts`, Order model | — | — |
| G) Payment Reception | Yes | Yes | `paypal-checkout.service.ts`, `paypal.routes.ts` | — | — |
| H) Automatic Fulfillment | Yes | Partial | `order-fulfillment.service.ts`, `aliexpress-checkout.service.ts` | Stub when ALLOW_BROWSER_AUTOMATION=false | Set ALLOW_BROWSER_AUTOMATION=true + credentials for real |
| I) Tracking | Yes | Partial | Order.aliexpressOrderId, fulfillment | Tracking number sync optional | Add tracking sync when available |
| J) Financial Accounting | Yes | Partial | Order, Sale, Commission in `schema.prisma` | Stored; full P&L reporting partial | Verifier accounting stage added |
| K) AI Agents | No | No | — | Not per-stage | Roadmap |
| L) Automation Mode | Partial | Partial | ENV-driven, scheduled tasks | Configurable | Document ENV for full auto |

---

## Instructions to Reach success: true

The automated verifier is:

- **Endpoint:** `POST /api/internal/test-full-dropshipping-cycle`
- **Script:** `npm run test-full-dropshipping-cycle` (in `backend/`) or `npx tsx scripts/test-full-dropshipping-cycle.ts`
- **Success:** `success === true` only when all stages are ok, no simulated paths, and real external APIs used where required.

### Discovery-only (default; recommended for CI/verifier)

1. **Backend running** with `.env` (or env) containing:
   - `INTERNAL_RUN_SECRET` (required for the internal endpoint)
   - `SERP_API_KEY` or `GOOGLE_TRENDS_API_KEY` (required for trends to be considered real; otherwise fallback is used and success is false)
   - `ALIEXPRESS_APP_KEY` and `ALIEXPRESS_APP_SECRET` (required for AliExpress product discovery; otherwise no products and success is false)
   - `DATABASE_URL` (required for app and optional accounting checks)

2. **Run from backend directory:**
   ```bash
   cd backend
   npm run test-full-dropshipping-cycle
   ```
   By default the script sends `skipPostSale: true`, so PayPal and AliExpress purchase are not executed. Success is true when trends (real API), AliExpress search, pricing, marketplace compare, publish (skipped), sale (skipped), accounting (skipped) are all ok and no simulated/fallback paths are used.

3. **If you see success: false:** Check `diagnostics` and `stages` in the response. Typical causes:
   - No `SERP_API_KEY` / `GOOGLE_TRENDS_API_KEY` → trends marked as fallback → success false.
   - No AliExpress Affiliate credentials or no products returned → aliexpressSearch fails → success false.
   - `INTERNAL_RUN_SECRET` not set or wrong → 401/503.

### Full cycle (PayPal + AliExpress purchase)

1. Set in env: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_SANDBOX=true` (or production), `ALLOW_BROWSER_AUTOMATION=true`, `ALIEXPRESS_USER`, `ALIEXPRESS_PASS`.
2. Run with post-sale enabled:
   ```bash
   cd backend
   SKIP_POST_SALE=0 npm run test-full-dropshipping-cycle
   ```
   Success is true only when PayPal capture and AliExpress purchase are real (no SIMULATED_ORDER_ID).

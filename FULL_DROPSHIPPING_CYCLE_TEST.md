# Full Dropshipping Cycle Test

**Purpose:** Run a real end-to-end test (product discovery ? listing ? sale simulation ? supplier purchase simulation ? tracking update) and record results.

---

## 1. Objective

Validate that the system can execute:

1. **Product discovery** ? Trends keywords and AliExpress (or pipeline) search.
2. **Product listing** ? Publish to marketplace (e.g. eBay).
3. **Sale simulation** ? Create sale/order (test path may skip or simulate).
4. **Supplier purchase simulation** ? Trigger fulfillment / AliExpress placeOrder (or simulated).
5. **Tracking update** ? Persist tracking number and status.

Success is defined by the internal handler: `success === true` when no stage used simulated/fallback data (in production mode, `skipPostSale` is forbidden).

---

## 2. Environment

- **Backend** running (default: `http://localhost:4000` or set `VERIFIER_TARGET_URL`).
- **Required env (backend):**
  - `INTERNAL_RUN_SECRET` ? Required for `POST /api/internal/*`.
  - For full real cycle: Scraping/Trends API key, AliExpress Affiliate (or Dropshipping) keys, eBay credentials, PayPal credentials.
- **Optional:** `SKIP_POST_SALE=1` (default) runs discovery + pricing + publish only; `SKIP_POST_SALE=0` runs full cycle including PayPal capture and AliExpress purchase (requires all APIs).
- **Optional:** `keyword=...` (e.g. `keyword=auriculares`) to override search keyword.

---

## 3. How to Run

### Option A: Internal endpoint test-full-dropshipping-cycle

**Endpoint:** `POST /api/internal/test-full-dropshipping-cycle`  
**Headers:** `Content-Type: application/json`, `x-internal-secret: <INTERNAL_RUN_SECRET>`  
**Body:** `{ "keyword": "phone case", "skipPostSale": true }`

**Stages executed:** trends ? aliexpressSearch ? pricing ? marketplaceCompare ? publish ? (sale ? paypalCapture ? aliexpressPurchase ? tracking ? accounting if !skipPostSale).

**Response shape:**

- `success: boolean`
- `stageResults` or `stages`: object with keys `trends`, `aliexpressSearch`, `pricing`, `marketplaceCompare`, `publish`, `sale`, `paypalCapture`, `aliexpressPurchase`, `tracking`, `accounting`. Each stage: `{ ok: boolean, real: boolean, data?: unknown, error?: string }`.
- `diagnostics: string[] | { stageCount: number }`

### Option B: Internal endpoint test-full-cycle-search-to-publish

**Endpoint:** `POST /api/internal/test-full-cycle-search-to-publish`  
**Headers:** `Content-Type: application/json`, `x-internal-secret: <INTERNAL_RUN_SECRET>`  
**Body:** `{ "keyword": "phone case" }` (or similar)

This runs the discovery ? normalize ? pricing ? (optional publish) pipeline and returns opportunities and diagnostics. It does not run sale/paypal/aliexpress purchase.

### Option C: NPM script (recommended for repeatability)

From repo root or `backend/`:

```bash
cd backend
npm run test-full-dropshipping-cycle
```

Or with keyword and full post-sale:

```bash
keyword=auriculares SKIP_POST_SALE=0 npm run test-full-dropshipping-cycle
```

Script uses `VERIFIER_TARGET_URL` if set (e.g. Railway URL). It validates response structure and exits 0 only when `success === true` (or when `TEST_STRUCTURE_ONLY=1` and structure is valid).

---

## 4. Steps Executed (Reference)

| Step | Handler / service | Description |
|------|-------------------|-------------|
| 1. Product discovery | trends.service, opportunity-finder (findOpportunitiesWithDiagnostics) | Get keywords, search AliExpress, normalize products. |
| 2. Pricing | opportunity-finder pipeline | suggestedPriceUsd, profitMargin, roi. |
| 3. Marketplace compare | opportunity-finder | Competition snapshot. |
| 4. Publish | marketplace.service (eBay/Amazon/ML) | Create listing; record MarketplaceListing/MarketplacePublication. |
| 5. Sale | (test handler) | Create sale/order when !skipPostSale. |
| 6. PayPal capture | paypal services | Capture payment when !skipPostSale. |
| 7. AliExpress purchase | order-fulfillment / aliexpress-checkout or placeOrder | Fulfill order when !skipPostSale. |
| 8. Tracking | Order/Sale/PurchaseLog update | Persist tracking number. |
| 9. Accounting | Order lookup | Verify order record. |

---

## 5. Results (Template ? fill after running)

**Date:** _________________  
**Environment:** Local / Staging / Production  
**Backend URL:** _________________  
**Keyword:** _________________  
**skipPostSale:** true / false  

**Endpoint called:**  
- [ ] `POST /api/internal/test-full-dropshipping-cycle`  
- [ ] `POST /api/internal/test-full-cycle-search-to-publish`  
- [ ] `npm run test-full-dropshipping-cycle`  

**HTTP status:** _________________  
**success (from JSON):** true / false  

**Stage results (ok / real):**

| Stage | ok | real | Notes |
|-------|----|------|--------|
| trends | | | |
| aliexpressSearch | | | |
| pricing | | | |
| marketplaceCompare | | | |
| publish | | | |
| sale | | | |
| paypalCapture | | | |
| aliexpressPurchase | | | |
| tracking | | | |
| accounting | | | |

**Diagnostics (paste or summarize):**  
_________________

**Errors (if any):**  
_________________

**Conclusion:**  
- [ ] Cycle OK (success=true, all critical stages ok/real as expected).  
- [ ] Partial (structure OK, some stages fallback/simulated or failed).  
- [ ] Failed (success=false or script exit code 1).  

**Notes:**  
_________________

---

## 6. Conclusion (Audit)

The full cycle test is implemented and scriptable. Actual execution depends on environment variables and API configuration. Use this document to record each run and conclude whether the system passes the full dropshipping cycle in your environment.

# Phase — REAL MercadoLibre Chile E2E dropshipping test (runbook)

**Role:** Autonomous dropshipping QA + profit safety  
**Target:** Mercado Libre **Chile (MLC)** | **Supplier cost &lt; 10 USD** | **Real buyer in Chile**  
**Rules:** No mocks for go/no-go decisions; use **real APIs**; **STOP** on any failed gate.

---

## Current automated preflight (operator)

Run from `backend/`:

```bash
BASE_URL=https://ivan-reseller-backend-production.up.railway.app \
INTERNAL_RUN_SECRET=<secret> \
JWT=<optional_bearer_for_stage_2> \
npm run real-dropshipping:preflight
```

**Last run (agent, UTC ~2026-03-20T01:30Z, production URL):**

| Check | Result |
|--------|--------|
| `GET /health` | **200** `status: ok` |
| `GET /api/debug/ping` | **200** |
| `GET /api/debug/db-health` | **200** `db: ok` |
| `POST /api/internal/active-listings-risk-scan` `{dryRun:true}` | **200** `scanned: 0`, all summary zeros |
| `GET /api/system/readiness-report` | **Skipped** (requires JWT) |

**Stage 1 (listings):** DB scan via Phase 54 reports **0 active** `marketplace_listings` — consistent with “clean” for new test.  
**MercadoLibre live catalog:** not verified from this script — confirm in ML seller center (no stray `active` items).

---

## Stage map → system (this repo)

| Stage | Requirement | How in Ivan Reseller |
|-------|-------------|------------------------|
| **1** | Clean state | `POST /api/internal/active-listings-risk-scan` `{dryRun:true}`; ML seller UI; exclude test orders via real-orders filters (`orders-real-filter`, finance exclusions). |
| **2** | System health | `GET /api/system/readiness-report` (**Bearer JWT**). Check `health.database`, `redis`, `bullmq`, `marketplaceApi`, `supplierApi`. |
| **3** | Discovery ≤ $10 | Authenticated flows: `/api/opportunities/*`, product research / `opportunity-finder.service.ts`. Filter **source price ≤ 10 USD**, prefer simple SKU set, **ship_to CL** in Affiliate/DS params where applicable. |
| **4** | Supplier validation | **AliExpress Dropshipping** `getProductInfo(productId, { localCountry: 'CL', ... })` (`aliexpress-dropshipping-api.service.ts`). Require **stock**, **SKU**, **shipping methods** to Chile. |
| **5** | Full cost + ≥20% margin | `cost-calculator.service.ts` / `computeProfitAfterFees` in `pre-publish-validator.service.ts`. Set **`PRE_PUBLISH_MIN_MARGIN_RATIO=0.2`** for ≥20% net margin / sale. |
| **6** | Pre-publish | `evaluatePrePublishValidation` → **`SAFE` only** for strict test: set **`PRE_PUBLISH_REJECT_RISKY=true`** + **`PRE_PUBLISH_SHIPPING_FALLBACK=false`** on Railway so **RISKY/UNSHIPPABLE/UNPROFITABLE/CONFIG** block publish (`assertProductValidForPublishing` in `marketplace.service.ts`). |
| **7** | Create listing | `POST /api/products/:id/publish` or Marketplace flow with `marketplace: mercadolibre`, **MLC** credentials (`MERCADOLIBRE_SITE_ID=MLC`). Store `aliexpressSku`, `aliexpressUrl`, shipping in product + `MarketplaceListing`. |
| **8** | Verify listing | ML API / `MercadoLibreService` + DB `marketplace_listings`; optional `POST /api/publisher/listings/run-reconciliation-audit` (JWT). |
| **9** | Wait for purchase | Human buys; **`syncMercadoLibreOrdersForUser`** / webhooks create **`Order`**. |
| **10** | Order validation | `GET /api/orders` (JWT); compare to ML order detail (id, buyer, Chile address, total). |
| **11** | Auto fulfillment | `order-fulfillment.service.ts` → `placeOrder` (`aliexpress-dropshipping-api.service.ts`) with **CL** address + validated **SKU**. |
| **12** | Failures | `SKU_NOT_EXIST` / stock → `aliexpress-alternative-product.service.ts` or Phase 48 **smart-supplier** on manual path; funds → `MANUAL_ACTION_REQUIRED`; retries in DS client. |
| **13** | Success | `Order.status` **PURCHASED**, `aliexpressOrderId` set. |
| **14** | Tracking | Fulfillment tracking sync services; verify carrier + Chile destination. |
| **15** | Profit | `GET /api/finance/real-profit?days=30` (JWT); confirm line not negative after real fees. |
| **16** | This report | Fill tables below during the run. |

---

## Railway env (strict E2E — recommended for this test)

```env
MERCADOLIBRE_SITE_ID=MLC
PRE_PUBLISH_REJECT_RISKY=true
PRE_PUBLISH_SHIPPING_FALLBACK=false
PRE_PUBLISH_MIN_MARGIN_RATIO=0.2
PRE_PUBLISH_MIN_NET_PROFIT=0.01
BLOCK_NEW_PUBLICATIONS=false
```

*If `PRE_PUBLISH_SHIPPING_FALLBACK=false` and AliExpress returns no shipping line costs, publish will fail until API returns methods — intentional for “real shipping” safety.*

---

## Execution log (fill during test)

### Product selected

| Field | Value |
|--------|--------|
| AliExpress URL / productId | |
| Chosen SKU | |
| Supplier unit (USD) | |
| Shipping (source) | API / fallback |

### Cost breakdown

| Line | USD (or CLP) |
|------|----------------|
| Product | |
| Shipping | |
| ML fee | |
| Payment fee | |
| Tax | |
| **Sale price** | |
| **Net profit** | |
| **Margin %** | |

### Listing

| Field | Value |
|--------|--------|
| MarketplaceListing id | |
| ML item id / URL | |
| Price listed | |

### Order

| Field | Value |
|--------|--------|
| Order id (internal) | |
| ML order id | |
| Buyer / address | |
| Fulfillment status | |

### Final

| Question | Answer |
|----------|--------|
| Profitable after real fees? | |
| Shipped to correct CL address? | |
| **SYSTEM READY?** | YES / NO |

---

## STOP conditions (failure = not production-ready)

- Wrong shipping country vs buyer
- No stock at `placeOrder`
- Cost model wrong → negative real profit
- Order not fulfilled or stuck without escalation

---

## Final verdict template

- **SYSTEM_STATUS:** `SAFE_TO_OPERATE` | `NOT_SAFE`  
- **Evidence:** link to ML listing, internal order id, finance export, tracking id.

---

*Generated as part of real E2E test planning; preflight section updated from live production checks where noted.*

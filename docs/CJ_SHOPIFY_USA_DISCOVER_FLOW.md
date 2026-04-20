# CJ → Shopify USA — Discover Flow

**Created:** 2026-04-19

## What Discover does

The Discover screen is the entry point of the operator pipeline for `CJ → Shopify USA`. It allows operators to:

1. **Search** the live CJ catalog by keyword
2. **Evaluate** any result inline — pricing breakdown with suggested Shopify sell price
3. **Create a Draft** listing in one click — product is saved to DB and a draft listing is created ready to publish
4. **Navigate to Listings** to publish the draft to Shopify

Discover is not decorative. Every action creates real DB records and real pipeline state.

---

## Endpoints used

All endpoints are under `/api/cj-shopify-usa/` and require authentication + module enabled.

### `GET /discover/search`

Live search of CJ catalog via `product/listV2`.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `keyword` | string (required) | — | Search term |
| `page` | number | 1 | Page (1-indexed) |
| `pageSize` | number | 20 | Results per page (max 50) |

**Response:**
```json
{
  "ok": true,
  "results": [
    {
      "cjProductId": "...",
      "title": "...",
      "mainImageUrl": "...",
      "listPriceUsd": 12.50,
      "inventoryTotal": 450,
      "fulfillmentOrigin": "CN"
    }
  ],
  "count": 20,
  "page": 1,
  "pageSize": 20
}
```

No DB writes. Rate-limited by CJ adapter (1100ms min interval, 429 retry with backoff).

---

### `POST /discover/evaluate`

Fetch full CJ product detail + warehouse-aware shipping quote + run qualification math.

**No DB writes.** Pure evaluation for operator preview.

**Body:**
```json
{
  "cjProductId": "...",
  "quantity": 1,
  "destPostalCode": "10001"
}
```

**Response:**
```json
{
  "ok": true,
  "cjProductId": "...",
  "title": "...",
  "imageUrls": ["..."],
  "variants": [{ "cjSku": "...", "cjVid": "...", "unitCostUsd": 8.50, "stock": 120, "attributes": {} }],
  "shipping": {
    "amountUsd": 2.30,
    "method": "CJPacket",
    "estimatedDays": 12,
    "fulfillmentOrigin": "CN",
    "confidence": "known"
  },
  "qualification": {
    "decision": "APPROVED",
    "breakdown": {
      "supplierCostUsd": 8.50,
      "shippingCostUsd": 2.30,
      "totalCostUsd": 10.80,
      "paymentProcessingFeeUsd": 0.95,
      "targetProfitUsd": 2.24,
      "suggestedSellPriceUsd": 14.89
    }
  },
  "shippingError": null
}
```

If shipping quote fails (CJ API error), `shipping` is `null` and `shippingError` contains the message. Qualification still runs with `shippingCostUsd = 0`.

---

### `POST /discover/import-draft`

Saves the CJ product to DB (upsert) and creates a draft listing ready for Shopify publish.

**Body:**
```json
{
  "cjProductId": "...",
  "variantCjVid": "...",
  "quantity": 1,
  "destPostalCode": "10001"
}
```

**What this call does internally:**
1. `adapter.getProductById(cjProductId)` — fetch full product + variants from CJ
2. `prisma.cjShopifyUsaProduct.upsert(userId, cjProductId)` — save product snapshot
3. `prisma.cjShopifyUsaProductVariant.upsert(productId, cjSku)` — save all variants
4. `adapter.quoteShippingToUsWarehouseAware(...)` — get shipping quote
5. `prisma.cjShopifyUsaShippingQuote.create(...)` — save shipping quote
6. `cjShopifyUsaPublishService.buildDraft(userId, dbProductId, variantId)` — create draft listing

**Response:**
```json
{
  "ok": true,
  "dbProductId": 42,
  "listing": {
    "id": 17,
    "status": "DRAFT",
    "listedPriceUsd": 14.89,
    "shopifySku": "CJ-ABC123"
  }
}
```

The listing is now visible in `GET /listings` and ready for `POST /listings/publish`.

---

## Connection to the rest of the pipeline

```
[Discover]
  GET /discover/search           → search CJ catalog
  POST /discover/evaluate        → preview pricing (optional)
  POST /discover/import-draft    → save product + create DRAFT listing
         ↓
[Store Products / Listings]
  GET  /listings                 → operator sees DRAFT listing
  POST /listings/publish         → publish to Shopify → status → ACTIVE
         ↓
[Orders]
  Shopify webhook / sync         → order ingested
  GET  /orders                   → manage fulfillment
         ↓
[Profit / Logs]
  Tracking, profit snapshots, traces
```

---

## End-to-end flow test result (2026-04-20)

**Status: EXECUTED LIVE**

The full Discover → Evaluate → Import Draft → Publish flow was executed against production on `2026-04-20`.

**Live result summary:**
- `GET /discover/search` returned real CJ catalog results
- `POST /discover/evaluate` returned real CJ detail, shipping, and qualification data
- `POST /discover/import-draft` created a real draft listing in DB for an eligible candidate and now returns `400 VALIDATION_ERROR` for zero-stock candidates
- `POST /listings/publish` published successfully to Shopify after the inventory mutation was updated for Shopify API `2026-04`
- Resulting listing reached `ACTIVE` with:
  - `shopifyProductId = gid://shopify/Product/9145457803476`
  - `shopifyVariantId = gid://shopify/ProductVariant/47821968474324`
  - `shopifyHandle = wireless-tws-stereo-earbuds-cjej264155501az`

**What was verified:**
- ✅ Backend type-check PASS
- ✅ Frontend type-check PASS
- ✅ Frontend build PASS
- ✅ Discover page loads (no placeholder)
- ✅ Real CJ search returning results in production
- ✅ Real evaluate response with shipping + qualification
- ✅ Real import-draft DB write
- ✅ End-to-end publish to Shopify
- ✅ Listing status became `ACTIVE` in `/api/cj-shopify-usa/listings`
- ✅ Storefront URL responded `200`

**Warnings still open after this run:**
- The top tested search candidate (`1999395299549302785`) currently has `stock = 0` on all variants, so it is not draftable/publishable and is now blocked honestly by validation
- Anonymous storefront visibility is still gated by the Shopify password page; the public URL returns `200` but not buyer-facing product content
- Profit / order-ingestion validation still depends on a real Shopify order flow

---

## Backend service: `cj-shopify-usa-discover.service.ts`

Location: `backend/src/modules/cj-shopify-usa/services/cj-shopify-usa-discover.service.ts`

Methods:
- `search(userId, keyword, page, pageSize)` → `CjProductSummary[]`
- `evaluate(userId, cjProductId, quantity, destPostalCode?)` → `DiscoverEvaluationResult`
- `importAndDraft(userId, cjProductId, variantCjVid?, quantity, destPostalCode?)` → `DiscoverImportDraftResult`

All three methods record an execution trace (`discover.search`, `discover.evaluate`, `discover.import`) visible in the Logs page.

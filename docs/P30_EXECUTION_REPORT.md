# P30 Execution Report

Date: 2026-03-22
Mission: first controlled real MercadoLibre Chile execution on candidate `32690`

## Outcome summary

P30 executed the first real controlled MercadoLibre Chile publish attempt on exactly one strict-ready candidate and stopped honestly at the first exact blocker reached.

The attempt did not fail on MercadoLibre OAuth, marketplace context, CL target, CLP currency, or candidate status. It failed in the live strict pre-publish supplier validation layer before listing creation.

## Commands run

### 1. Type check

Command:

```text
backend npm run type-check
```

Output:

```text
> ivan-reseller-backend@1.0.0 type-check
> tsc --noEmit
```

Result: success

### 2. Controlled-operation readiness recheck

Command:

```text
backend npm run check:ml-chile-controlled-operation -- 1
```

Key output:

```text
generatedAt=2026-03-23T00:51:52.787Z
credentialCount=1
authState=access_token_present
hasAccessToken=true
hasRefreshToken=true
runtimeUsable=true
oauthReauthRequired=false
coverage.strictMlChileReadyCount=16
blockers=[
  no_ml_chile_released_funds_profit_proof,
  no_real_mercadolibre_order_with_supplier_purchase_proof
]
```

### 3. Global publication gate check

Command:

```text
PowerShell env check in backend runtime
```

Output:

```json
{
  "ENABLE_ML_PUBLISH": null,
  "WEBHOOK_SECRET_MERCADOLIBRE_configured": false
}
```

### 4. Real single-candidate controlled publish attempt

Command:

```text
backend npx tsx scripts/p30-controlled-mlc-publish.ts
```

Key runtime evidence:

```text
[P30] start userId=1 productId=32690
[P30] credentials_ok siteId=MLC currency=CLP language=es
[P30] category_predicted categoryId=MLC414091
[P30] publish_call_start
[ALIEXPRESS-DROPSHIPPING-API] Getting product info {"productId":"1005010297651726","localCountry":"CL"}
[ALIEXPRESS-DROPSHIPPING-API] Primary getProductInfo returned no product fields; trying aliexpress.ds.product.get
[ALIEXPRESS-DROPSHIPPING-API] ds.product.get result shape ...
[ALIEXPRESS-DROPSHIPPING-API] getProductInfo product shape (skus) ... "normalizedShippingMethodCount":0
[P30] publish_call_done
[P30] publish_result={"success":false,"marketplace":"mercadolibre","error":"Product not valid for publishing: no real AliExpress API shipping cost for destination"}
```

### 5. Post-attempt persistence check

Key output:

```json
{
  "product": {
    "id": 32690,
    "status": "VALIDATED_READY",
    "isPublished": false,
    "publishedAt": null,
    "shippingCost": "2.99",
    "importTax": "0.8",
    "totalCost": "5.01",
    "targetCountry": "CL",
    "finalPrice": "25",
    "aliexpressSku": "12000051835705515"
  },
  "listings": [],
  "publications": []
}
```

Persisted freight fragment for the same product:

```json
{
  "freightSummaryCode": "freight_quote_found_for_cl",
  "targetCountry": "CL",
  "freightOptionsCount": 1,
  "selectedServiceName": "CAINIAO_FULFILLMENT_STD",
  "selectedFreightAmount": 2.99,
  "selectedFreightCurrency": "USD"
}
```

## Final execution diagnosis

### Runtime gate state

- MercadoLibre Chile auth/runtime: usable
- Global `ENABLE_ML_PUBLISH`: unset
- Global `WEBHOOK_SECRET_MERCADOLIBRE`: not configured
- Execution mode: `manual_or_polling_partial`

### Listing result

- candidate attempted: `32690`
- siteId: `MLC`
- targetCountry: `CL`
- intended listing currency: `CLP`
- intended listing language: `es`
- listing created: `false`
- permalink: none
- marketplace response currency: not available

### Exact blocker reached

`Product not valid for publishing: no real AliExpress API shipping cost for destination`

### What this proves

P30 narrowed the lead blocker from "can we execute a controlled publish?" to a stricter contradiction:

- candidate `32690` is still `VALIDATED_READY`
- candidate `32690` still has persisted Chile freight truth
- the live publish-time validator still rejects the same candidate as if destination shipping truth were absent

That inconsistency is now the immediate blocker preventing the first real ML Chile listing and every later stage after it.

## Furthest stage reached

`publication_failed`

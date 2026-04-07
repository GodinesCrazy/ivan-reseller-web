# P95 — ML Chile Freight Recovery

## Product: 32714

## Recovery Execution

**Script**: `backend/scripts/p95-run-now.ts` (executed at 2026-03-26T20:24–20:25 UTC)

### AliExpress Freight Quote Result

| Field | Value |
|---|---|
| API Called | `calculateBuyerFreight` (AliExpress Dropshipping API) |
| Target Country | CL |
| Send Goods Country | CN |
| Product ID (AE) | 1005009130509159 |
| Options Returned | 4 |
| Selection Algorithm | `selectMlChileFreightOption` — cheapest tracked/standard-like |

### Selected Freight Option

| Field | Value |
|---|---|
| Service Name | CAINIAO_STANDARD |
| Freight Amount | $3.12 USD |
| Freight Currency | USD |
| Estimated Delivery | 11 days |
| Selection Reason | Selected the cheapest tracked/standard-like freight option |

### Landed Cost Calculation

| Field | Value |
|---|---|
| Product Cost (AE) | $3.19 USD |
| Shipping Cost | $3.12 USD |
| Import Tax Method | `cl_vat_19_product_plus_shipping_low_value` |
| Import Tax Amount | $1.20 USD |
| Total Cost | $7.51 USD |
| Completeness | `complete` |

### Persisted Data

**Database columns updated** (product 32714):

| Column | Before | After |
|---|---|---|
| `shippingCost` | unknown/missing | 3.12 |
| `importTax` | unknown/missing | 1.20 |
| `totalCost` | unknown/missing | 7.51 |

**productData.mlChileFreight persisted**:
```json
{
  "freightSummaryCode": "freight_quote_found_for_cl",
  "checkedAt": "2026-03-26T20:25:02.566Z",
  "targetCountry": "CL",
  "sendGoodsCountryCode": "CN",
  "freightOptionsCount": 4,
  "rawOptionNodeCount": 4,
  "selectedServiceName": "CAINIAO_STANDARD",
  "selectedFreightAmount": 3.12,
  "selectedFreightCurrency": "USD",
  "selectedEstimatedDeliveryTime": 11,
  "selectionReason": "Selected the cheapest tracked/standard-like freight option."
}
```

**productData.mlChileLandedCost persisted**:
```json
{
  "costCurrency": "USD",
  "importTaxMethod": "cl_vat_19_product_plus_shipping_low_value",
  "importTaxAmount": 1.2,
  "totalCost": 7.51,
  "landedCostCompleteness": "complete",
  "checkedAt": "2026-03-26T20:25:02.566Z"
}
```

## Canonical Freight Truth Verification

After persistence, `resolveCanonicalMlChileFreightTruth` returns:

```json
{
  "status": "freight_truth_ready_for_publish",
  "ok": true,
  "truth": {
    "targetCountry": "CL",
    "freightSummaryCode": "freight_quote_found_for_cl",
    "selectedServiceName": "CAINIAO_STANDARD",
    "selectedFreightAmount": 3.12,
    "selectedFreightCurrency": "USD",
    "shippingUsd": 3.12,
    "ageHours": 0.13
  }
}
```

## Conclusion

**mlChileFreight is now PERSISTED with real freight truth.** The blocker identified in P94 (`persisted mlChileFreight metadata is missing`) is resolved.

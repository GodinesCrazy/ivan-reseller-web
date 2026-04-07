# P27 ML Chile Strict Re-entry

## Re-entry condition
Freight quote success was achieved for 9 of 10 sampled candidates on 2026-03-22, so strict ML Chile re-entry was executed.

## What was persisted
- `shippingCost` persisted as a top-level product field
- `importTax` persisted as a top-level product field
- `totalCost` persisted as a top-level product field
- `shippingServiceName` and `shippingCurrency` persisted inside `productData.mlChileFreight`

Note:
- there are no dedicated top-level columns for `shippingServiceName` or `shippingCurrency` in the current model
- persistence therefore happens in product metadata, not separate scalar columns

## Strict validation rerun
Command executed:
```bash
cd backend
npm run check:ml-chile-controlled-operation -- 1
```

Parsed result:
```json
{
  "authState": "credential_row_present_but_tokens_missing",
  "hasAccessToken": false,
  "hasRefreshToken": false,
  "oauthReauthRequired": true,
  "coverage": {
    "strictMlChileReadyCount": 0
  },
  "blockers": [
    "auth_blocked_ml_credentials_missing_tokens",
    "no_strict_validated_ready_candidate_for_ml_chile",
    "no_ml_chile_released_funds_profit_proof",
    "no_real_mercadolibre_order_with_supplier_purchase_proof"
  ]
}
```

## Re-entry conclusion
- `strictMlChileReadyCount` remains `0`
- freight is no longer the main blocker
- the immediate strict-readiness blocker is ML Chile auth/runtime readiness plus the existing product-status gate (`status_not_validated_ready`)

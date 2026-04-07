# P28 Strict MLC Readiness Rerun

## Commands

- `backend npm run check:ml-chile-controlled-operation -- 1` before status reconciliation
- `backend npx tsx scripts/p0-reconcile-operational-truth.ts --execute`
- `backend npm run check:ml-chile-controlled-operation -- 1` after status reconciliation

## Before Reconciliation

From `backend/p28-ml-controlled-operation-output-2.txt`:

```json
{
  "authState": "access_token_present",
  "hasAccessToken": true,
  "hasRefreshToken": true,
  "runtimeUsable": true,
  "oauthReauthRequired": false,
  "coverage": {
    "strictMlChileReadyCount": 0
  },
  "blockers": [
    "no_strict_validated_ready_candidate_for_ml_chile",
    "no_ml_chile_released_funds_profit_proof",
    "no_real_mercadolibre_order_with_supplier_purchase_proof"
  ]
}
```

The auth blocker disappeared, but the strict-ready count was still `0`.

## Reconciliation Evidence

From `backend/p28-reconcile-operational-truth-execute.txt`:

```json
{
  "executionSummary": {
    "statusReconciliation": {
      "scanned": 31904,
      "normalizedToLegacy": 23,
      "normalizedToValidatedReady": 16,
      "normalizedToPublished": 0,
      "unchanged": 31865
    },
    "legacyListingArchival": {
      "changed": 1
    }
  },
  "after": {
    "productByStatus": [
      {
        "status": "VALIDATED_READY",
        "_count": {
          "_all": 16
        }
      }
    ]
  }
}
```

## After Reconciliation

From `backend/p28-ml-controlled-operation-output-3.txt`:

```json
{
  "authState": "access_token_present",
  "runtimeUsable": true,
  "coverage": {
    "strictMlChileReadyCount": 16
  },
  "blockers": [
    "no_ml_chile_released_funds_profit_proof",
    "no_real_mercadolibre_order_with_supplier_purchase_proof"
  ]
}
```

## Best Strict Candidate

P27 continuity candidate `32637` is now fully strict-ready:

- status: `VALIDATED_READY`
- targetCountry: `CL`
- shippingCost: `2.99`
- importTax: `5.19`
- totalCost: `32.52`
- aliexpressSku: `12000052189745928`
- finalPrice: `35.29`

## Near-Valid Residuals

The top remaining near-valid candidate is `32706`. It still shows `status_not_validated_ready` in the strict queue because its persisted `shippingCost` is `0`, which prevents operational-truth promotion even though the weaker queue view still treats the field as present.

## Conclusion

P28 changed strict ML Chile readiness materially:

- `strictMlChileReadyCount`: `0 -> 16`
- auth/runtime: usable
- remaining blockers: no longer auth; now only post-sale commercial proof gates

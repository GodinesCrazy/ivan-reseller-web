# P28 Execution Report

## Mission Result

P28 succeeded on outcome A.

- MercadoLibre Chile production auth/runtime is usable again
- strict ML Chile readiness is no longer blocked by auth
- the first strict `VALIDATED_READY` ML Chile candidate was achieved
- total strict-ready ML Chile candidates after P28: `16`

## Commands And Outcomes

### `backend npm run type-check`

Result:

```text
> tsc --noEmit
```

### `backend npm run check:ml-chile-auth-runtime -- 1`

Result:

```json
{
  "hasAccessToken": true,
  "hasRefreshToken": true,
  "tokenShapeValid": true,
  "runtimeUsable": true,
  "authState": "access_token_present",
  "oauthReauthRequired": false,
  "usersMe": {
    "status": 200,
    "country_id": "CL"
  }
}
```

### `backend npm run check:ml-chile-controlled-operation -- 1` before reconciliation

Result:

```json
{
  "runtimeUsable": true,
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

### `backend npx tsx scripts/p0-reconcile-operational-truth.ts --execute`

Result:

```json
{
  "statusReconciliation": {
    "normalizedToLegacy": 23,
    "normalizedToValidatedReady": 16,
    "normalizedToPublished": 0
  },
  "legacyListingArchival": {
    "changed": 1
  }
}
```

### `backend npm run check:ml-chile-controlled-operation -- 1` after reconciliation

Result:

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

## Code Changes

- `backend/scripts/check-ml-chile-controlled-operation-readiness.ts`
  - switched auth truth from raw token-shape-only to runtime verification plus credential reread
- `backend/scripts/p0-reconcile-operational-truth.ts`
  - included `LEGACY_UNVERIFIED` rows in operational-truth reconciliation so machine-complete products can be promoted

## Exact State Shift

Before P28 completion:

- auth/runtime looked stale in the strict checker
- `strictMlChileReadyCount = 0`

After P28 completion:

- auth/runtime usable: yes
- `strictMlChileReadyCount = 16`
- candidate `32637` is now `VALIDATED_READY`

## Remaining Blockers

- `no_ml_chile_released_funds_profit_proof`
- `no_real_mercadolibre_order_with_supplier_purchase_proof`

## Bottom Line

Freight is no longer the blocker and MercadoLibre auth is no longer the blocker. The project state has advanced to the next real gate: obtaining ML Chile commercial proof on top of the new strict-ready candidate set.

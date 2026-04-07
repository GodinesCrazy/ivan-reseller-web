# P31 Controlled Publish Retest

Date: 2026-03-22
Candidate: `32690`

## Commands executed

```bash
cd backend
npm run type-check
npm run check:ml-chile-controlled-operation -- 1
npx jest src/services/__tests__/pre-publish-validator.service.test.ts --runInBand
npx tsx scripts/p30-controlled-mlc-publish.ts 1 32690
```

## Exact runtime proof that freight reconciliation took effect

The retest log now contains:

```text
[PREVENTIVE-SUPPLIER] Using persisted ML Chile freight truth for original supplier validation
shippingUsd=2.99
selectedServiceName=CAINIAO_FULFILLMENT_STD
```

That line did not exist before P31 and proves the validator is no longer ignoring the canonical persisted freight contract.

## Retest result

```text
listingCreated=false
listingId=none
permalink=none
listingCurrency=CLP
marketplaceResponseCurrency=none
```

Exact publish result:

```text
success=false
marketplace=mercadolibre
error=Product not valid for publishing: financial completeness is insufficient: missing_marketplaceFeeEstimate, missing_fxFeeEstimate
```

## Exact new blocker

The publish no longer fails on shipping.

It now fails at financial completeness in the fee ledger:

- `missing_marketplaceFeeEstimate`
- `missing_fxFeeEstimate`

The code-side reason is visible in `listing-fee-ledger.service.ts`:

- MercadoLibre CL marketplace fee estimate remains blocked when `ML_COMMISSION_PCT` is not configured
- FX fee estimate is still modeled as missing when supplier currency `USD` differs from listing currency `CLP`

## Post-retest persistence

Post-retest DB state still showed:

```text
isPublished=false
listings=[]
publications=[]
```

So the furthest real stage reached in P31 remained:

`publication_failed`

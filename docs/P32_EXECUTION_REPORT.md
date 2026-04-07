# P32 Execution Report

Date: 2026-03-22

## Mission

Complete the ML Chile marketplace fee and FX fee models required for controlled publication, then rerun the real single-candidate publish for `32690`.

## Outcome

Outcome `A` achieved.

P32 completed:

- ML Chile marketplace fee estimate
- cross-currency FX fee estimate
- financial completeness reconciliation
- real controlled publish retest

And it successfully created the first controlled MercadoLibre Chile listing for candidate `32690`.

## Code changes

Primary files updated:

- `backend/src/services/listing-fee-ledger.service.ts`
- `backend/src/services/pre-publish-validator.service.ts`
- `backend/src/__tests__/services/listing-fee-ledger.service.test.ts`

## Commands executed

```text
backend npm run type-check
backend npx jest src/__tests__/services/listing-fee-ledger.service.test.ts --runInBand
backend npm run check:ml-chile-controlled-operation -- 1
backend npx tsx scripts/p30-controlled-mlc-publish.ts 1 32690
```

## Exact results

`npm run type-check`

- passed

`jest src/__tests__/services/listing-fee-ledger.service.test.ts --runInBand`

- passed `4/4`

`npm run check:ml-chile-controlled-operation -- 1`

- `runtimeUsable = true`
- `oauthReauthRequired = false`
- `coverage.strictMlChileReadyCount = 16`

`npx tsx scripts/p30-controlled-mlc-publish.ts 1 32690`

- reached `createListing`
- `publish_result.success = true`
- `listingId = MLC3786354420`
- `listingUrl = https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM`
- `marketplaceResponseCurrency = CLP`

Persisted preventive publish snapshot for `32690`:

- `marketplaceFeeEstimate = 2850 CLP`
- `marketplaceFeeModel = default_mercadolibre_cl_commission_with_fixed_tiers`
- `fxFeeEstimate = 115.32 CLP`
- `fxModel = default_cross_currency_buffer_pct`
- `feeLedger.completenessState = complete`
- `feeLedger.missingFeeClasses = []`

Persisted listing state:

- `product.status = PUBLISHED`
- `product.isPublished = true`
- `marketplaceListing.listingId = MLC3786354420`
- `marketplaceListing.status = active`

## Exact blocker at sprint close

No blocker remained at listing-creation stage.

The system is now past presale readiness and past controlled publication. The next exact business gate is a real MercadoLibre buyer order followed by supplier purchase proof.

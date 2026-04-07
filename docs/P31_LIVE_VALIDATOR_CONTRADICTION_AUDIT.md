# P31 Live Validator Contradiction Audit

Date: 2026-03-22
Primary candidate: `32690`

## Exact failing path traced

The live controlled publish path is:

```text
MarketplaceService.publishProduct
-> prepareProductForSafePublishing
-> runPreventiveSupplierAudit
-> validateCandidate
```

## Exact contradiction found

Before P31, the original supplier validation for ML Chile still did this:

```text
getProductInfo(...)
-> minShippingCostFromApi(info)
-> reject if shippingInfo.availableShippingMethods had no priced methods
```

That was contradictory because candidate `32690` already had canonical persisted freight truth:

```text
freightSummaryCode=freight_quote_found_for_cl
selectedServiceName=CAINIAO_FULFILLMENT_STD
selectedFreightAmount=2.99
selectedFreightCurrency=USD
shippingCost(top-level)=2.99
targetCountry=CL
```

Yet the same publish-time validator was still rejecting on:

```text
Product not valid for publishing: no real AliExpress API shipping cost for destination
```

## Why the contradiction happened

The original supplier validation branch was still depending on legacy `ds.product.get` shipping extraction:

- `shippingInfo.availableShippingMethods`
- `normalizedShippingMethodCount`
- legacy `shippingInfo` assumptions

For the live CL retest, the DS product fetch still logged:

```text
hasClassicShippingInfo=false
hasLogisticsInfoDto=true
normalizedShippingMethodCount=0
```

So the old branch treated shipping as missing even though the canonical freight quote had already been persisted on the product.

## Contradiction verdict

Root cause proven:

`the live original-supplier validation path was still reading legacy getProductInfo shipping signals instead of the canonical persisted ML Chile freight truth`

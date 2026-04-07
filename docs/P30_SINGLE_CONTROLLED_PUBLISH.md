# P30 Single Controlled Publish

Date: 2026-03-22
Primary candidate: `32690`
Marketplace target: MercadoLibre Chile

## Candidate used

```text
candidateId=32690
status=VALIDATED_READY
targetCountry=CL
shippingCost=2.99
importTax=0.80
totalCost=5.01
finalPrice=25.00
aliexpressSku=12000051835705515
```

## Exact controlled publish path

The real controlled execution was run through `backend/scripts/p30-controlled-mlc-publish.ts`.

Observed runtime evidence from the execution log:

```text
[P30] start userId=1 productId=32690
[P30] credentials_ok siteId=MLC currency=CLP language=es
[MercadoLibre] Category predicted via domain_discovery ... "categoryId":"MLC414091","site":"MLC"
[P30] category_predicted categoryId=MLC414091
[P30] publish_call_start
[ALIEXPRESS-DROPSHIPPING-API] Getting product info {"productId":"1005010297651726","localCountry":"CL"}
[ALIEXPRESS-DROPSHIPPING-API] Primary getProductInfo returned no product fields; trying aliexpress.ds.product.get
[ALIEXPRESS-DROPSHIPPING-API] ds.product.get result shape ...
[ALIEXPRESS-DROPSHIPPING-API] getProductInfo product shape (skus) ... "normalizedShippingMethodCount":0
[P30] publish_call_done
[P30] publish_result={"success":false,"marketplace":"mercadolibre","error":"Product not valid for publishing: no real AliExpress API shipping cost for destination"}
```

## Publish result

Result: controlled publish attempted and failed before MercadoLibre listing creation.

Exact result:

```text
success=false
marketplace=mercadolibre
error=Product not valid for publishing: no real AliExpress API shipping cost for destination
```

## Currency and marketplace path truth

The real execution reached MercadoLibre pre-publish with:

```text
siteId=MLC
targetCountry=CL
intendedListingCurrency=CLP
intendedListingLanguage=es
finalPriceSentToMarketplace=not sent because createListing was never reached
marketplaceResponseCurrency=not available because createListing was never reached
```

There was no `currency_not_clp_for_mlc` failure. The attempt failed earlier in the strict pre-publish supplier validation layer.

## Persistence check after the failed attempt

Post-attempt DB verification returned:

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

## Exact contradiction proved by P30

Persisted freight truth for the same candidate still shows:

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

Therefore the exact blocker proved by P30 is:

`candidate 32690 remains VALIDATED_READY with persisted Chile freight truth, but the live publish-time strict validator still rejects it as if no real AliExpress API shipping cost exists for destination CL`

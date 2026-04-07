# P31 Order Readiness Handoff

Date: 2026-03-22

## Handoff status

`skipped_until_listing_created`

## Why

P31 did not create a MercadoLibre listing.

Exact stop point:

```text
Product not valid for publishing: financial completeness is insufficient: missing_marketplaceFeeEstimate, missing_fxFeeEstimate
```

## Next order-monitoring path once listing creation succeeds

When candidate `32690` reaches `listing_created`, the immediate next controlled monitoring path should be:

1. confirm `marketplaceListing.listingId` and permalink for product `32690`
2. monitor MercadoLibre order ingress through webhook if configured
3. otherwise use manual/polling fallback for order detection
4. confirm internal order row maps back to `productId=32690`
5. trigger supplier purchase attempt only after a real order exists

No order existence is claimed in P31 because no listing was created.

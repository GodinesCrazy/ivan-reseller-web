# P32 Controlled Publish Retest

Date: 2026-03-22

## Goal

Retry the real single-candidate controlled publish for candidate `32690` after completing ML Chile financial completeness.

## Command executed

```text
backend npx tsx scripts/p30-controlled-mlc-publish.ts 1 32690
```

## Exact publish proof

The publish path reached real MercadoLibre listing creation.

Captured runtime lines:

```text
[MercadoLibre] createListing attempt ... "price":23750,"currency_id":"CLP","siteId":"MLC"
[P30] publish_result={"success":true,"marketplace":"mercadolibre","listingId":"MLC3786354420","listingUrl":"https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM"}
"marketplaceResponseCurrency": "CLP"
```

Persisted listing state for product `32690`:

- `listingCreated = true`
- `listingId = MLC3786354420`
- `permalink = https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM`
- `marketplaceListing.status = active`
- `publishedAt = 2026-03-23T01:41:24.083Z`

## Publish result classification

`listing_created`

## Exact blocker if still failing

None at listing-creation stage.

P32 achieved the publication objective:

- the fee-ledger blockers were removed
- the publish path no longer failed on shipping truth
- the publish path no longer failed on financial completeness
- the first controlled MercadoLibre Chile listing was created successfully


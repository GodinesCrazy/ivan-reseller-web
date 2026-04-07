# P29 Publication Readiness Check

Date: 2026-03-22
Primary candidate under review: `32690`

## Readiness Verdict

`publication_readiness = PARTIAL`

Exact state:

- candidate data readiness: `ready`
- MercadoLibre API auth/runtime: `ready`
- hidden category contamination fix: `applied`
- live publication safety flag: `blocked`
- MercadoLibre webhook automation: `not_configured`
- operational classification: `manual_or_polling_partial`

## What Is Already Proven

- Candidate `32690` is `VALIDATED_READY`.
- `targetCountry`, `shippingCost`, `importTax`, `totalCost`, and `aliexpressSku` are all present.
- MercadoLibre Chile auth/runtime was already proven usable in P28.
- Chile freight is already real and persisted for the candidate.
- `aliexpressUrl` is present.

## Payload Completeness Check

- `title`: present
- `price/finalPrice`: present
- `currency`: publisher derives site currency from `MLC`
- `targetCountry`: `CL`
- `shipping`: publisher sends `me2` / `free_shipping=false`
- `images`: present, but only `1`
- `description`: stored description is empty, but publisher falls back to `Producto: {title}. Publicado con control de calidad.`

## Exact Code-Side Finding Fixed In P29

The MercadoLibre publish path was accepting internal catalog categories such as `desk_organization` as if they were MercadoLibre `category_id` values.

That is unsafe because MercadoLibre expects IDs like `MLC...`, not internal slugs.

P29 applied a code-side guard in `backend/src/modules/marketplace/marketplace-publish.service.ts` so that:

- only values that look like MercadoLibre category IDs are forwarded as `category`
- otherwise `category` is nulled for MercadoLibre publish requests
- the publisher then predicts a real MercadoLibre category instead of sending the internal slug

This removed a concrete publication blocker without changing business logic outside publish construction.

## Exact Remaining Publication Blockers

### 1. Real publish flag is still off

Runtime env check returned:

```json
{
  "ENABLE_ML_PUBLISH": null,
  "WEBHOOK_SECRET_MERCADOLIBRE_configured": false
}
```

`MarketplacePublishService.ensurePublishingEnabled()` requires:

- `process.env.ENABLE_ML_PUBLISH === 'true'`

So a real MercadoLibre publish remains intentionally blocked until the operator enables it.

### 2. MercadoLibre webhook automation is not configured

`webhook-readiness.service.ts` marks MercadoLibre webhook readiness from `WEBHOOK_SECRET_MERCADOLIBRE`.

Current runtime evidence:

- configured: `false`
- endpointConfigured: `false`
- verificationTokenConfigured: `false`
- signatureValidationMode: `shared_secret_hmac`
- eventFlowReady: `false`

This means the first controlled sale can still be run, but event ingestion must be monitored with manual/polling fallback rather than claiming full automation readiness.

### 3. Media quality remains a live risk

`mercadolibre.service.createListing()` rejects publish attempts if zero images survive pre-upload quality checks.

Candidate `32690` currently has only one stored image, so publication is possible but not fully de-risked.

## Hidden Legacy Contamination Check

- `32690`: no existing `marketplaceListings`
- `32691`: no existing `marketplaceListings`
- `32637`: has an old MercadoLibre listing record despite `isPublished=false`

This is another reason `32690` is safer than `32637` for the first controlled sale.

## Final Publication Readiness Classification

The selected candidate is publish-capable after the P29 category handling fix, but not yet publish-authorized.

Exact pre-publication blockers:

- `ENABLE_ML_PUBLISH not enabled`
- `WEBHOOK_SECRET_MERCADOLIBRE not configured`

Therefore the system is:

`ready_for_controlled_sale_pending_human_execution`

not

`safe_to_auto_publish_now`

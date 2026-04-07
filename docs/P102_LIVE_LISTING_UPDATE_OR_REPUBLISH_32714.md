# P102 — Live listing update or republish (32714)

## Step 1: Try direct update on current listing (required first)

Target listing: `MLC3804623142`.

Attempted operation:

- `MercadoLibreService.replaceListingPictures(MLC3804623142, [cover_main, detail])`

Runtime result:

- ML set attempt to `active` before replace, but item remained `under_review`.
- Error:
  - `Listing could not be switched to active for picture update (status after: under_review). See seller center for moderation or account restrictions.`

Conclusion:

- Direct live image replacement on `MLC3804623142` was blocked by ML moderation lock.

## Step 2: Fallback to fresh controlled republish

Executed:

- `p101-set-validated-ready-32714.ts`
- `p101-clean-republish-32714.ts` (with updated hardening-source allowlist: `p100|p102`)

Publish result (`p101-republish-result.json`):

- `success: true`
- New listing id: `MLC3805190796`
- New permalink: `https://articulo.mercadolibre.cl/MLC-3805190796-rotating-table-cell-phone-holder-support-desktop-stand-fo-_JM`

Payload picture order proof:

1. `cover_main.png` (`sha256=6917d000588a295d3100417fef277148a1208bbb8639274a65026f1ad2343ac1`)
2. `detail_mount_interface.png` (`sha256=7c0197a5c00fb5b607f365c528da248e02dd2eef57de253014f70adc1a667c13`)

## Live API validation on new listing

- `status: active`
- `sub_status: []`
- `warnings: []`
- item tags include `good_quality_thumbnail`

## Persistence check

- `marketplace_listing` latest: id `1368`, `listingId=MLC3805190796`, `status=active`
- product row: `PUBLISHED`, `isPublished=true`
- manifest listing id updated to `MLC3805190796`

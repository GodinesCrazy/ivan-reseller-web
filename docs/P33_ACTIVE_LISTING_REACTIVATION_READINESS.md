# P33 Active Listing Reactivation Readiness

Date: 2026-03-23

## Classification

`manual_reactivation_step_required`

## Exact current state

Application state:

- `product.status = APPROVED`
- `product.isPublished = false`
- `marketplaceListing.listingId = MLC3786354420`
- `marketplaceListing.status = failed_publish`
- `marketplaceListing.lastReconciledAt = 2026-03-23T12:00:02.052Z`

Platform signal:

- public MercadoLibre item fetch returned:
  - `403`
  - `code = PA_UNAUTHORIZED_RESULT_FROM_POLICIES`
  - `blocked_by = PolicyAgent`

## Why reactivation is not automatic yet

The active listing still lacks compliant replacement assets.

P33 fixed the future publish gate, but it did not automatically replace the already-published non-compliant cover image.

## Exact manual step required

In MercadoLibre seller tools for `MLC3786354420`:

1. edit the publication images
2. replace the current cover with a compliant square hero image
3. add clean supporting gallery images
4. save the changes
5. reactivate or resubmit the publication for review if MercadoLibre requires confirmation

## Readiness conclusion

The listing is not ready for buyer-order progression.

It becomes eligible for reactivation only after:

- compliant assets are uploaded
- the cover-policy issue is removed
- the updated assets are confirmed in MercadoLibre


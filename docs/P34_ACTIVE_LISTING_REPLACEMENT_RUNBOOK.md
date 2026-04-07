# P34 Active Listing Replacement Runbook

Date: 2026-03-23

## Listing target

- `listingId = MLC3786354420`
- permalink:
  `https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM`

## Before-state evidence to capture

Capture these before replacing anything:

1. screenshot of the current ML publication status screen
2. screenshot of the current non-compliant cover image
3. screenshot of any MercadoLibre warning, pause, or review message

## Manual replacement steps

1. Open MercadoLibre seller tools and navigate to the publication `MLC3786354420`.
2. Open the publication edit flow.
3. Remove the current cover image.
4. Upload the approved compliant `cover_main` asset as the first image.
5. Upload the approved supporting gallery assets:
   - `detail_mount_interface`
   - `usage_context_clean` if available and compliant
6. Save the publication changes.
7. If MercadoLibre shows the publication as paused or under review:
   - trigger the platform’s reactivate / resubmit / review-confirm action if offered
8. Wait for the post-edit status to settle.

## After-state evidence to capture

Capture these after replacement:

1. screenshot of the new first image inside the edit screen
2. screenshot of the final saved gallery order
3. screenshot of the post-save listing status
4. screenshot of any MercadoLibre confirmation or review message
5. copy of the final approved cover URL if MercadoLibre exposes it

## Exact local metadata follow-up

Once the replacement is confirmed:

1. record the approved replacement cover URL
2. write the reviewed-proof metadata as `ml_image_policy_pass`
3. preserve before/after screenshots for audit

## Stop conditions

Stop and do not resume controlled-sale progression if:

- MercadoLibre rejects the new images
- the replacement cover still contains any banned visual trait
- the operator cannot confirm the final approved cover URL

## P34 runbook conclusion

The listing is operationally ready for manual image replacement and reactivation, but not yet ready for buyer-order progression.


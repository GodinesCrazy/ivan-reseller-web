# P48 Executor Regeneration Update

## Goal
Update the native executor path so rejected assets regenerate through a stricter self-hosted path.

## Code changes
- updated [run-self-hosted-image-provider.ts](/c:/Ivan_Reseller_Web/backend/scripts/run-self-hosted-image-provider.ts)
  - added explicit failure-pattern break from `prompt_to_source_transform`
  - added product-family inference
  - added `wall_cable_organizer` clean render path
  - added `generic_clean_crop` fallback path
  - changed provider health metadata to `prompt_guided_clean_render_or_source_cleanup`
- updated [mercadolibre-image-remediation.service.ts](/c:/Ivan_Reseller_Web/backend/src/services/mercadolibre-image-remediation.service.ts)
  - strengthened prompt specs for `cover_main`
  - strengthened prompt specs for `detail_mount_interface`
  - explicitly instructs fresh studio render and removal of supplier contamination
- updated [self-hosted-image-provider.service.ts](/c:/Ivan_Reseller_Web/backend/src/services/self-hosted-image-provider.service.ts)
  - default self-hosted model label now reflects native clean-render intent

## Safe overwrite behavior
- regenerated files superseded the prior failed files in the canonical pack directory:
  - `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32690\cover_main.png`
  - `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32690\detail_mount_interface.png`
  - `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32690\usage_context_clean.png`

## Result
- required regenerated assets stopped inheriting:
  - text
  - arrows
  - visible hand
  - split supplier composition

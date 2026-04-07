# P49 Execution Report

## Objective
Replace the images on MercadoLibre listing `MLC3786354420`, reactivate it, and verify whether the listing is active and policy-clean again.

## Outcome
- outcome achieved: listing reactivated successfully

## Commands run
- `backend npm run type-check`
- `backend npx tsx scripts/check-ml-asset-pack-readiness.ts 32690`
- `backend npm run check:ml-chile-auth-runtime -- 1`
- `backend npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420`
- public visibility check:
  - `Invoke-WebRequest -Uri 'https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM' -Method Head`

## Key runtime proof
- approved assets used:
  - `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32690\cover_main.png`
  - `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32690\detail_mount_interface.png`
- before MercadoLibre state:
  - `status=under_review`
  - `sub_status=["waiting_for_patch"]`
- after MercadoLibre state:
  - `status=active`
  - `sub_status=[]`
- public URL:
  - HTTP `200`
- local sync:
  - product `32690` -> `PUBLISHED`, `isPublished=true`
  - listing `MLC3786354420` -> `active`

## Important sub-blocker encountered and resolved
- first live attempt failed with:
  - `invalid access token`
- recovered via auth runtime refresh:
  - `authState=access_token_invalid_refresh_persisted_and_verified`
  - `runtimeUsable=true`

## Final classification
- `listing_active_policy_clean`
- `ready_to_resume_controlled_sale`

## Next step
- resume the controlled-sale path from active listing monitoring and capture the first real MercadoLibre buyer order for `MLC3786354420`

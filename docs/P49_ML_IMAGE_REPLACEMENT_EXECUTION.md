# P49 ML Image Replacement Execution

## Goal
Replace the blocked MercadoLibre listing images with the approved native asset pack and verify the actual item response.

## Native execution path
- added native helper support in [mercadolibre.service.ts](/c:/Ivan_Reseller_Web/backend/src/services/mercadolibre.service.ts)
  - `replaceListingPictures(itemId, imageInputs)`
  - `activateListing(itemId)`
- executed live script:
  - [p49-reactivate-ml-listing.ts](/c:/Ivan_Reseller_Web/backend/scripts/p49-reactivate-ml-listing.ts)

## Runtime sequence
1. First live attempt failed before upload with `invalid access token`
2. Recovered auth via:
   - `backend npm run check:ml-chile-auth-runtime -- 1`
3. Refresh persisted successfully:
   - `authState=access_token_invalid_refresh_persisted_and_verified`
   - `runtimeUsable=true`
4. Reran live replacement:
   - `backend npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420`

## Before-state evidence from MercadoLibre API
- `status=under_review`
- `sub_status=["waiting_for_patch"]`
- existing picture set:
  - `727129-MLC109218309635_032026`

## Replacement result
- uploaded `cover_main.png`
  - new ML picture id: `614677-MLC109297138823_032026`
  - `max_size=1200x1200`
- uploaded `detail_mount_interface.png`
  - new ML picture id: `706701-MLC108496629126_032026`
  - `max_size=1156x1200`
- after replacement, MercadoLibre item state changed immediately to:
  - `status=active`
  - `sub_status=[]`

## Reactivation outcome
- explicit `activateListing()` call was not needed
- replacement itself cleared the `waiting_for_patch` condition and returned the item to active state

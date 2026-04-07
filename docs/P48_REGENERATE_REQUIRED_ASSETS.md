# P48 Regenerate Required Assets

## Goal
Regenerate the required MercadoLibre asset pack files for product `32690` using the stricter self-hosted strategy.

## Execution
- restarted the local self-hosted provider on `127.0.0.1:7860`
- reran:
  - `backend npx tsx scripts/check-ml-image-remediation.ts 32690 --persist`

## Generation result
- provider used: `self_hosted`
- required regenerated files:
  - `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32690\cover_main.png`
  - `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32690\detail_mount_interface.png`
- optional regenerated file:
  - `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32690\usage_context_clean.png`
- generation attempt count in the live executor rerun:
  - `generatedCount=3`
  - `approvedCount=0` before review, by design, because self-hosted remains fail-closed until native confirmation

## Visual outcome
- regenerated required assets are clean studio-style renders
- banned supplier traits no longer appear in the required outputs
- prior failed required files were superseded in place by the stricter regenerated versions

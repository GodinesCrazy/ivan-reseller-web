# P39 Tests And Diagnostics

Date: 2026-03-23

## Goal

Add the minimal tests and diagnostics required for the native ML remediation stage.

## Tests Added

New test file:

- `backend/src/services/__tests__/mercadolibre-image-remediation.service.test.ts`

Covered scenarios:

- risky supplier raw single cover -> `auto_remediate`
- compliant approved generated pack -> publish allowed
- missing approved asset pack -> publish blocked
- pack inspection / approval correctness

Existing ML policy tests kept:

- `backend/src/services/__tests__/mercadolibre-image-policy.service.test.ts`

## Diagnostics Added

New diagnostic:

- `backend/scripts/check-ml-image-remediation.ts`

Outputs:

- raw asset risk state
- remediation path selected
- compliant pack present or absent
- reviewed-proof state
- publish-safe or not

Updated readiness helper:

- `backend/scripts/check-ml-asset-pack-readiness.ts <productId>`

Now reports:

- canonical product-based pack dir
- manifest presence
- `ready`
- `packApproved`
- required asset status

## Command Results

- `backend npm run type-check` -> success
- `backend npx jest src/services/__tests__/mercadolibre-image-policy.service.test.ts src/services/__tests__/mercadolibre-image-remediation.service.test.ts --runInBand` -> success, `8/8` tests passed
- `backend npx tsx scripts/check-ml-image-compliance.ts 32690` -> raw audit remains `ml_image_manual_review_required`
- `backend npx tsx scripts/check-ml-image-remediation.ts 32690` -> `decision=auto_remediate`, `remediationPathSelected=internal_generated_asset_pack`, `publishSafe=false`
- `backend npx tsx scripts/check-ml-asset-pack-readiness.ts 32690` -> `manifestPresent=true`, `ready=false`, `packApproved=false`


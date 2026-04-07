# P40 Tests And Diagnostics

## Commands Run
- `backend npm run type-check`
- `backend npx jest src/services/__tests__/mercadolibre-image-policy.service.test.ts src/services/__tests__/mercadolibre-image-remediation.service.test.ts src/services/__tests__/mercadolibre-image-executor.service.test.ts src/services/__tests__/marketplace-optimization-agent.service.test.ts --runInBand`
- `backend npx jest src/services/__tests__/mercadolibre-image-executor.service.test.ts src/services/__tests__/marketplace-optimization-agent.service.test.ts --runInBand`
- `backend npx tsx scripts/check-ml-image-compliance.ts 32690`
- `backend npx tsx scripts/check-ml-image-remediation.ts 32690`
- `backend npx tsx scripts/check-ml-image-remediation.ts 32690 --persist`
- `backend npx tsx scripts/check-ml-asset-pack-readiness.ts 32690`
- `backend npx tsx scripts/check-marketplace-optimization-agent.ts 32690`

## Test Coverage Added
- provider unavailable -> executor returns `provider_unavailable`
- successful mocked generation/review -> required files written and approved
- optimizer returns valid advisory contract
- optimizer raises compliance-focused recommendations when pack is not approved

## Key Live Diagnostics
- raw compliance state still manual-review-required on supplier image
- remediation path now auto-selects `internal_generated_asset_pack`
- executor now returns exact provider-side blocker instead of generic failure

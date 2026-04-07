# P41 Tests And Diagnostics

## Commands Run
- `backend npm run type-check`
- `backend npx jest src/services/__tests__/mercadolibre-image-executor.service.test.ts src/services/__tests__/marketplace-optimization-agent.service.test.ts src/services/__tests__/mercadolibre-image-remediation.service.test.ts src/services/__tests__/mercadolibre-image-policy.service.test.ts --runInBand`
- `backend npx tsx scripts/check-ml-image-compliance.ts 32690`
- `backend npx tsx scripts/check-ml-image-remediation.ts 32690 --persist`
- `backend npx tsx scripts/check-ml-asset-pack-readiness.ts 32690`
- `backend npx tsx scripts/check-marketplace-optimization-agent.ts 32690`
- credential integrity audit for `openai` and `gemini`
- env presence audit for `OPENAI_API_KEY` and `GEMINI_API_KEY`

## Test Result
- test suites passed: `4/4`
- tests passed: `13/13`

# P44 Tests And Diagnostics

## Commands Run

- `backend npm run type-check`
- `backend npx jest src/services/__tests__/mercadolibre-image-executor.service.test.ts src/services/__tests__/mercadolibre-image-remediation.service.test.ts src/services/__tests__/mercadolibre-image-policy.service.test.ts src/services/__tests__/marketplace-optimization-agent.service.test.ts --runInBand`
- `backend npx tsx scripts/check-ml-image-remediation.ts 32690 --persist`
- `backend npx tsx scripts/check-ml-asset-pack-readiness.ts 32690`
- `backend npx tsx scripts/check-marketplace-optimization-agent.ts 32690`

## Test Coverage Added

- self-hosted provider selected when OpenAI/Gemini are unavailable
- self-hosted provider reports `self_hosted_misconfigured` when enabled without base URL
- existing executor/remediation/policy/optimizer contracts still pass

## Outcomes

- `type-check`: `PASS`
- focused Jest suites: `PASS`
- live 32690 remediation: self-hosted path visible in audit but unavailable in current env
- optimizer continuity: still advisory and non-blocking, with compliance attention focused on the image pack

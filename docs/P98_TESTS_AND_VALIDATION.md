# P98 — Tests and validation

## Status: DONE

### TypeScript

- `cd backend && npm run type-check` — **PASS**

### Unit tests

- `npx jest src/services/__tests__/mercadolibre-image-remediation.service.test.ts --no-coverage` — **PASS**
- Updated case: **P98** — `human_review_required` from mocked canonical + **inspect-approved** disk pack → **`publishSafe: true`**, `integrationLayerOutcome: legacy_approved_pack`

### Runtime / preflight

- `npx tsx scripts/p98-build-ml-pack-32714.ts` — built pack + updated DB `productData`
- `npx tsx scripts/p95-preflight-check.ts` — produced `p95-preflight.json` with `ready_to_publish`

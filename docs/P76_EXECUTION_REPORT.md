# P76 — Execution report

## Commands run

- `npm run type-check` (backend) — **pass** (after adding `InsetCropFractions` export to `marketplace-image-pipeline/types.ts`).
- `npx jest src/services/__tests__/mercadolibre-image-remediation.service.test.ts --no-cache` — **pass** (6 tests).

## Code delivered

- **Canonical module**: `backend/src/services/marketplace-image-pipeline/` (`types`, `policy-profiles`, `candidate-scoring`, `dual-gate`, `remediation-recipes`, `ml-chile-canonical-pipeline`).
- **Wiring**: `mercadolibre-image-remediation.service.ts` — `runMlChileCanonicalPipeline` + `writeCanonicalP76Pack`; outcomes **`raw_ordered`**, **`pack_buffers`**, **`human_review_required`**; metadata **`mlChileCanonicalPipeline`**.
- **Tests**: mock canonical service in remediation tests; P76 fail-closed + `raw_ordered` cases.
- **Config**: `backend/env.local.example` — `ML_CANONICAL_IMAGE_PIPELINE` documented.

## Docs delivered

All `docs/P76_*.md` files listed in the P76 mission (this report + nine topic documents).

## Known follow-ups (non-blocking for MVP)

- **`reject_hard` + pre-existing approved pack** can still yield **`publishSafe: true`** via legacy inspect logic (pre-existing edge case; canonical does not run on `reject_hard`).
- **General DAG engine** for recipes is not implemented — linear chain per profile only.
- **Other marketplaces** need their own profiles and wiring.

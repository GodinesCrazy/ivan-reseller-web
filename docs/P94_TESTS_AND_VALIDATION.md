# P94 — Tests and validation

## Executed
1. `npm run type-check` (backend) — PASS
2. Focused runtime state/preflight/preventive audit for `32714` with evidence captured in:
   - `artifacts/p94-product-32714-unblock.json`
3. `npx tsx scripts/p92-staging-candidate-setup.ts` — PASS for DS refresh/update of existing `32714`

## Key validations observed
- DS variant path uses `first-in-stock` successfully.
- Video URLs are filtered from DS image ingestion (latest `p92-resolution.json` reports `imageCount: 7`).
- Preflight still blocked by status and downstream readiness blockers.

## Inspected (not executed as publish)
- preflight guard precedence in `mercadolibre-publish-preflight.service.ts`
- preventive fail-closed requirements in `pre-publish-validator.service.ts`

## Not executed in this sprint
- real supervised publish
- webhook/order/fulfill live cycle

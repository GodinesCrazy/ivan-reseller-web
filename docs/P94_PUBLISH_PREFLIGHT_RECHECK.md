# P94 — Publish preflight recheck (Product 32714)

## Recheck method
Equivalent local execution of:
`GET /api/products/32714/publish-preflight?marketplace=mercadolibre`
via `buildMercadoLibrePublishPreflight({ userId, productId: 32714, isAdmin: true })`.

## New observed result
- `overallState`: `blocked_product_status`
- `publishAllowed`: `false`
- `nextAction`: `Move product to VALIDATED_READY in the preventive validation workflow.`

## Blockers
- `product_status:PENDING (required VALIDATED_READY)`
- `mercadolibre_test_connection_failed`
- `images:ml_canonical_dual_gate_failed_all_candidates_and_remediations`
- `pricing:product not in VALIDATED_READY`

## Detailed check slices
- images: `publishSafe=false`
- pricing: canonical pricing `ok=false` with reason `product not in VALIDATED_READY`
- credentials: present/active, no structural issues
- ML API: `testConnectionOk=false`
- postsale: webhook not configured, connector blocked

## Delta vs prior
`overallState` did not improve; remains blocked at product status gate.

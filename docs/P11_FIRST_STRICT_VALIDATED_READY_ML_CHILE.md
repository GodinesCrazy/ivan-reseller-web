# P11 First Strict Validated Ready - ML Chile

Date: 2026-03-21

## Outcome

No strict ML Chile `VALIDATED_READY` candidate was produced in this sprint.

## Batch Reports

### Batch A

- Strategy used: destination-first ML Chile enrichment with low-risk AliExpress batch
- Candidate set size: `5`
- Scanned: `5`
- Rejected: `5`
- Near-valid: `5`
- Validated: `0`
- RejectionSummaryByCode:
  - `missing_aliexpress_sku = 5`
- Best near-valid candidate:
  - Product `32637`
  - Exact blocker: `missing_aliexpress_sku`

### Batch B

- Strategy used: same, widened to `10` candidates
- Candidate set size: `10`
- Scanned: `10`
- Rejected: `10`
- Near-valid: `10`
- Validated: `0`
- RejectionSummaryByCode:
  - `missing_aliexpress_sku = 10`
- Best near-valid candidate:
  - Product `32637`
  - Exact blocker: `missing_aliexpress_sku`

## Fresh Blocker Hierarchy

From broad readiness scan:

1. `auth_blocked`
2. `missing_target_country`
3. `missing_shipping_cost`
4. `missing_import_tax`
5. `missing_total_cost`
6. `missing_aliexpress_sku`
7. `status_not_validated_ready`

From narrowed destination-first batch:

1. `missing_aliexpress_sku`

## Interpretation

The first strict candidate is still blocked.
The most precise current proof is:

- operationally, ML Chile auth is blocked by missing runtime tokens
- commercially, low-risk Chile candidates fail because AliExpress cannot provide a stable purchasable SKU with stock for destination `CL` in the tested batch

# P10 First Validated Ready - ML Chile

Date: 2026-03-21

## Current Truth

The first strict `VALIDATED_READY` candidate for ML Chile has not been achieved.

Latest dedicated readiness evidence for user `1`:

- scanned products: `1000`
- `targetCountry = CL`: `0`
- strict ML Chile ready count: `0`

## Controlled Recovery Program

### Batch 1 Strategy

- supplier: AliExpress only
- destination: Chile only
- category style: low-breakage, low-return-risk, low-variant home or desk utility products
- price band: CLP `24,990` to `39,990`
- shipping constraints: tracked shipping to Chile, low volumetric weight, no batteries, no fragile glass
- readiness requirements:
  - `targetCountry = CL`
  - strict shipping cost
  - strict import tax
  - strict total cost
  - stable AliExpress SKU
  - positive margin after ML Chile fees

### Current Batch Outcome

- Strategy used: destination-first ML Chile readiness scan and strict blocker extraction
- Categories/queries used: not yet proven in a fresh live discovery batch during this sprint
- Scanned: `1000` recent products in readiness diagnostic
- Rejected: `1000`
- Near-valid: `0` true near-valid candidates; best candidate still misses multiple core fields
- Validated: `0`

### Rejection Summary By Code

- `target_country_not_cl`
- `missing_target_country`
- `missing_shipping_cost`
- `missing_import_tax`
- `missing_total_cost`
- `status_not_validated_ready`
- `missing_aliexpress_sku`

### Best Failed Candidate

- Product ID: `32675`
- Exact blocker: the product is not even in the Chile-specific commercial truth layer yet

## Conclusion

This sprint did not produce the first strict ML Chile validated-ready candidate.
It did produce the diagnostic and code corrections needed to stop guessing about why it fails.

# P0 DB Reconciliation Report

Date: 2026-03-20

## Objective

Remove semantically publishable-but-unsafe product states and archive legacy-linked listing contamination without inventing healthy catalog states.

## Reconciliation policy applied

For products in `APPROVED` or `PUBLISHED`:

- if machine-verifiable publish context is missing:
  - `targetCountry`
  - `aliexpressSku`
  - `shippingCost`
  - `totalCost`
  - and active verified listing proof when published
  then status is normalized to `LEGACY_UNVERIFIED`
- if machine-verifiable context exists but no active verified listing exists:
  - target state would be `VALIDATED_READY`
- if active verified listing and machine-verifiable context exist:
  - target state would be `PUBLISHED`

In the real current DB, all remaining unsafe `APPROVED` and `PUBLISHED` rows normalized to `LEGACY_UNVERIFIED`.

## Real execution results

### Before

- `APPROVED = 1523`
- `PUBLISHED = 1`
- `LEGACY_UNVERIFIED = 30351`

### Intermediate observations

- an earlier serial reconciliation attempt partially progressed and reduced:
  - `APPROVED 1523 -> 1343 -> 663`
- final optimized bulk reconciliation completed the remaining rows safely

### Final

- `APPROVED = 0`
- `PUBLISHED = 0`
- `LEGACY_UNVERIFIED = 31875`
- `PENDING = 772`
- `REJECTED = 3`

## Unsafe-row elimination proof

Current anomaly scan:

- `publishedSamples = []`
- `approvedSamples = []`

This confirms the previously known unsafe patterns are gone:
- no `PUBLISHED` product remains without listing/country/SKU/cost context
- no `APPROVED` product remains as a semantically publishable drift state

## Listing cleanup results

### Before

- unresolved legacy-linked listings contaminating live state: `508`
- all were still represented as `failed_publish`

### After

- unresolved legacy-linked listings: `0`
- archived legacy artifacts: `508`
- listing state distribution now:
  - `ebay / archived_legacy_artifact = 157`
  - `mercadolibre / archived_legacy_artifact = 351`

## Important interpretation

The 508 rows were not deleted.  
They were preserved as historical artifacts while being removed from live operational truth.

That is the correct P0 behavior:
- preserve auditability
- remove fake active/failed-live contamination

## Remaining DB truths

- `VALIDATED_READY = 0`
- publishable coverage remains extremely weak across the frozen catalog
- the latest real failed order still reflects supplier reality, not a fake UI issue:
  - `SKU_NOT_EXIST`

## Conclusion

P0 DB reconciliation is complete for the unsafe state drift identified in the audit.  
The database is now stricter and more truthful:
- no fake approved inventory
- no fake published inventory
- no unresolved legacy-linked listings contaminating live truth

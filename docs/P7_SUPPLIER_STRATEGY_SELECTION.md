# P7 Supplier Strategy Selection

## Inputs used

Prior eBay US evidence before P7:

- `scanned=65`
- `validated=0`
- rejection summary:
  - `no_stock_for_destination=40`
  - `margin_invalid=20`
  - `supplier_unavailable=5`

Current codebase inventory:

- no production-safe non-AliExpress supplier connector
- strongest runnable strategy = `aliexpress_hybrid_internal_fallbacks`

## Decision

Selected strategy:

- `no_production_safe_alternative_exists_yet_in_codebase`

Recommended next move:

- `require_new_supplier_integration_before_any_more_marketplace_work`

## Why this was selected

- Repeating eBay/marketplace work would not attack the dominant blocker.
- The dominant blocker is supplier-side destination-valid stock.
- The current codebase already contains the strongest fair AliExpress path available:
  - discovery
  - strict Dropshipping API validation
  - fallback ranking
  - alternative-product substitution
- There is no second production-safe supplier path available to activate truthfully.

## Rejected strategy options

- `continue blind AliExpress-first retries`
  - rejected because evidence is already too strong against it
- `start another marketplace now`
  - rejected because supplier truth, not marketplace plumbing, remains the dominant blocker
- `pretend supplier abstraction equals alternative supplier readiness`
  - rejected because only AliExpress is actually implemented safely

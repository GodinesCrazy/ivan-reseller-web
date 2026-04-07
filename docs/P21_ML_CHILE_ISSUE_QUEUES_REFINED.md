# P21 ML Chile Issue Queues Refined

## New / Refined Queue Truth
- `freight_endpoint_compatible`
- `freight_endpoint_incompatible`
- `freight_app_session_mismatch`
- `freight_quote_found_for_cl`
- `freight_quote_missing_for_cl`
- `missing_import_tax_after_freight`
- `missing_total_cost_after_freight`
- `likely_rut_required_for_supplier_checkout`
- `near_valid_waiting_on_one_blocker`

## Dominant Live Queue After P21
- `freight_endpoint_incompatible`

## Meaning
The ML Chile lead path now separates:
- candidates blocked because the freight endpoint itself is incompatible with the current credential pair
- candidates blocked only because no freight quote exists yet
- later landed-cost blockers that should only appear after freight becomes usable

This makes the next sprint narrower and more truthful.

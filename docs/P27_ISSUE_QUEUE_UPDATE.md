# P27 Issue Queue Update

## Old queue truth
- `freight_method_absent / not_entitled`

## New queue truth after P27
- close:
  - `freight_method_absent / not_entitled`
- replace with:
  - `freight_signature_fixed_quote_obtained`

## Why this is the correct exact status
- the freight method is present in console evidence
- the live rerun returned real quotes through the dropshipping app family
- the live working request path is now known and documented
- remaining failures are limited to:
  - wrong app family + dropshipping token
  - stale env secret risk
  - legacy TOP router probes that do not represent the working path

## Secondary follow-on truths
- `freight_secret_mismatch_suspected`
  - still true for env-vs-DB secret consistency
- `freight_binding_mismatch_suspected`
  - still true only for affiliate-app misuse with dropshipping session
- `freight_quote_obtained_ready_for_landed_cost`
  - functionally satisfied for 9 sampled products

## Operational meaning
- Freight is no longer the stop reason for ML Chile.
- The next queue head is outside freight:
  - ML Chile OAuth/runtime recovery
  - strict validated-ready promotion

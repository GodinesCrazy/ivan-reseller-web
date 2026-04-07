# P10 ML Chile Pre-Sale Gap Map

Date: 2026-03-21

## Strict Field-State Audit

| Requirement | Current state | Truth |
| --- | --- | --- |
| `targetCountry = CL` | Missing at runtime scale | latest ML Chile diagnostic scanned `1000` products and found `0` with `CL` |
| Marketplace context = MercadoLibre Chile | Sourced correctly in code, runtime health blocked | destination service maps `MLC -> CL / CLP / es`, but live auth is degraded |
| Listing currency = `CLP` | Sourced correctly in code, not persisted per product | marketplace context supports it; fee engine consumes it |
| Language/content context for Chile | Sourced correctly in code, not commercially proven | marketplace context resolves Spanish for `CL`, but no live ML Chile publish proof exists |
| Shipping validity for Chile | Code-supported, runtime-unproven | validator can ask AliExpress with `localCountry = CL`, but no product survives to strict-ready |
| Shipping cost | Missing at runtime scale | diagnostic found `missingShippingCost = 1000/1000` in scanned set |
| Import tax | Missing at runtime scale | diagnostic found `missingImportTax = 1000/1000` |
| Total cost | Missing at runtime scale | diagnostic found `missingTotalCost = 1000/1000` |
| Stable AliExpress SKU / mapping | Missing at runtime scale | diagnostic found `missingAliExpressSku = 999/1000` |
| Projected margin after all relevant costs | Code-supported, runtime-unproven | fee model exists and was improved this sprint, but inputs are mostly missing |
| Publish readiness with auditable proof | Broken | strict ML Chile ready count = `0` |

## Persisted But Not Consumed Correctly

- ML Chile marketplace fee logic existed, but the fixed Chilean fee was effectively undercounted in CLP calculations before this sprint

## Best Near-Valid Candidate In Current Evidence

- Product ID: `32675`
- Title: `Lockable 24-Slot Home Storage Watch Box Double Layer Carbon Fiber Organizer`
- Status: `LEGACY_UNVERIFIED`
- Exact blockers:
  - `status_not_validated_ready`
  - `missing_target_country`
  - `missing_shipping_cost`
  - `missing_import_tax`
  - `missing_total_cost`
  - `target_country_not_cl`

## Pre-Sale Conclusion

ML Chile pre-sale safety is architecturally strong but operationally empty.
The core problem is not the lack of a validator.
The core problem is the lack of persisted Chile-specific commercial truth.

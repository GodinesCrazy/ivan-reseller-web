# P20 Chile RUT Realism Update

## Objective
Keep the first controlled ML Chile operation realistic without broadening into full checkout automation.

## Code-Level Reality
- New readiness helper: [backend/src/utils/ml-chile-rut-readiness.ts](/c:/Ivan_Reseller_Web/backend/src/utils/ml-chile-rut-readiness.ts)
- Current classification used in P20:
  - `absent_but_likely_required`

## Why
- The current ML Chile supplier-checkout shape in this repo does not yet model end-to-end `rut_no` capture/mapping.
- The active P20 contract treats Chile `rut_no` as a likely supplier-checkout requirement later in the real AliExpress purchase path.
- No fresh runtime evidence in P20 disproved that risk.

## P20 Conclusion
- RUT is not the current blocker for freight truth.
- RUT remains a likely later blocker for the first controlled real operation.
- The controlled-operation blueprint should continue to treat Chile RUT capture as mandatory realism work before real supplier checkout.

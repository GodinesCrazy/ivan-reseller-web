# P29 Primary Controlled Candidate Selection

Date: 2026-03-22
Scope: userId `1`, MercadoLibre Chile first controlled sale

## Selection Result

- `primaryCandidate`: `32690`
- `backupCandidate`: `32691`

## Exact Primary Candidate Snapshot

- candidate id: `32690`
- product title: `Soporte organizador de enchufes montado en la pared, estante de gestión de cables de escritorio, estante de almacenamiento requerido sin perforación para uso en el hogar y la Oficina`
- targetCountry: `CL`
- shippingCost: `2.99 USD`
- importTax: `0.80 USD`
- totalCost: `5.01 USD`
- finalPrice: `25.00 USD`
- aliexpressSku: `12000051835705515`
- expected presale margin inputs:
  sale price `25.00`
  landed cost `5.01`
  raw spread before marketplace fees/payout costs `19.99`

## Exact Backup Candidate Snapshot

- candidate id: `32691`
- product title: `Soporte autoadhesivo para tira de enchufe, fijador de enchufe sin perforaciones, organizador de cables para el hogar y la Oficina, 1/3/5 Uds.`
- targetCountry: `CL`
- shippingCost: `2.99 USD`
- importTax: `0.96 USD`
- totalCost: `6.02 USD`
- finalPrice: `25.00 USD`
- aliexpressSku: `12000049467961859`
- raw spread before marketplace fees/payout costs `18.98`

## Why 32690 Was Chosen

- It is the lowest-total-cost unpublished strict-ready Chile candidate in the live user `1` scope.
- It has a simple desk-organization profile with lower breakage and fashion/fit return risk than candidate `32637`.
- It already has real Chile freight truth persisted: `freight_quote_found_for_cl`, service `CAINIAO_FULFILLMENT_STD`, freight `2.99 USD`.
- It has no existing MercadoLibre listing record contamination, unlike `32637`, which already has a historical `marketplaceListing`.
- It preserves the narrowest possible first-sale exposure: low landed cost, simple buyer expectation, one-unit controlled publication.

## Ranking Evidence Used

Live query over unpublished strict-ready Chile candidates for `userId=1`, ordered by lowest `totalCost`:

1. `32690` -> `totalCost 5.01`
2. `32685` -> `totalCost 5.99`
3. `32691` -> `totalCost 6.02`
4. `32704` -> `totalCost 6.05`
5. `32708` -> `totalCost 6.06`

## Residual Candidate Risks

- `32690` has only one stored image; MercadoLibre can publish with one uploaded image, but media quality remains a live publish risk.
- `32690` has empty stored description length, but the publisher already falls back to a generated description when needed.
- Chile supplier checkout still carries `rut_no` realism risk after sale, so publication readiness is not the same as supplier-purchase proof readiness.

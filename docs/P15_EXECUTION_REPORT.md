# P15 Execution Report

## Sprint Scope

P15 stayed narrow:

- inspect raw AliExpress logistics truth for CL
- audit whether the Chile-support gate was semantically correct
- fix the gate safely if it was over-rejecting
- rerun the Chile-first discovery path

## Implemented Changes

### Logistics Forensics

- Added a logistics normalizer and support-signal interpreter for AliExpress Dropshipping payloads.
- Added a live forensic script for representative ML Chile candidate samples.
- Extended `getProductInfo` to preserve `logisticsInfoDto` in the normalized product shape.

### Gate Semantics

- Reworked the ML Chile discovery gate to distinguish:
  - real destination absence
  - supplier data incompleteness
  - destination acknowledged without shipping method/cost details
- Updated the CL-SKU gate to use the improved destination-support signal instead of collapsing everything into `no_destination_support_cl`.

### Regression Protection

- Added focused logistics normalizer tests.
- Added stronger discovery gate tests.

## Fresh Runtime Evidence

### Forensics

Live command:

- `npm run forensic:ml-chile-logistics -- 1`

Result:

- `8/8` representative samples exposed:
  - `logistics_info_dto.ship_to_country = CL`
  - `logistics_info_dto.delivery_time = 7`
  - `normalizedShippingMethodCount = 0`
- `8/8` representative samples now classify as:
  - `discoveryAdmission.code = admitted`
  - `supportSignal = acknowledged_without_shipping_methods`
- `8/8` representative samples fail the next gate as:
  - `skuAdmission.code = cl_sku_no_stock`

### Discovery Rerun

Live command:

- `npm run run:ml-chile-discovery-seed-pass -- 1 8`

Result:

- `scannedAtDiscovery = 8`
- `admittedAfterChileSupportGate = 8`
- `admittedAfterClSkuGate = 0`
- `validated = 0`
- `discoveryGateSummaryByCode.admitted = 8`
- `clSkuGateSummaryByCode.cl_sku_no_stock = 8`

### Broad Readiness

Live command:

- `npm run check:ml-chile-controlled-operation -- 1`

Result still shows:

- `strictMlChileReadyCount = 0`
- `targetCountryCl = 0`
- `mlSalesSummary.total = 0`
- `mlOrdersSummary.total = 0`

## What P15 Proved

P15 proved the old discovery blocker was partially false:

- the system was over-reading the absence of shipping methods as absence of Chile support

But P15 also proved the next blocker is fully real:

- CL support is acknowledged
- CL in-stock purchasable SKU is still absent

## Validation

- `npm run type-check` passed

Focused Jest tests were added/extended, but the direct `jest` invocation still returned `exit 1` with no visible output in this environment, so type-check and the live forensic reruns are the verified execution signals for this sprint.

## Final P15 Business Outcome

Outcome `A` was achieved for the gate semantics:

- the old Chile-support gate was too strict and was corrected safely

But the business system remains blocked because the next supplier-side blocker is now:

- `cl_sku_no_stock`

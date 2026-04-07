# P12 CL-SKU Admission Gate

## Objective
Stop admitting MercadoLibre Chile candidates into enrichment unless supplier truth already proves a Chile-purchasable AliExpress SKU.

## Gate rule added in P12
A candidate can enter the ML Chile enrichment batch only if the supplier layer can already prove:
- at least one AliExpress SKU exists
- the SKU is purchasable
- stock is greater than `0`
- destination `CL` is supported at the Dropshipping API layer

## Explicit pre-admission rejection codes
- `no_cl_sku`
- `cl_sku_no_stock`
- `no_destination_support_cl`
- `no_purchasable_variant`
- `supplier_data_incomplete`

## What changed technically
- Added a dedicated CL-SKU admission evaluator.
- Added raw AliExpress SKU normalization so the gate can use supplier payloads that were previously too raw to classify cleanly.
- Updated the ML Chile destination-first enrichment batch to run the gate before enrichment work begins.
- Prevented wasted enrichment on candidates that never had a Chile-purchasable supplier path.

## Fresh live batch proof
Command used:

```powershell
npm run run:ml-chile-enrichment-batch -- 1 10
```

Observed result:

```json
{
  "scannedBeforeGate": 10,
  "admittedAfterClSkuGate": 0,
  "rejectedBeforeEnrichment": 10,
  "admissionSummaryByCode": {
    "no_destination_support_cl": 9,
    "supplier_data_incomplete": 1
  }
}
```

## P12 verdict
- Status: `DONE`

The gate is working as intended. It made the batch smaller and much cleaner, and it replaced a vague downstream failure with precise supplier-truth rejection before enrichment.

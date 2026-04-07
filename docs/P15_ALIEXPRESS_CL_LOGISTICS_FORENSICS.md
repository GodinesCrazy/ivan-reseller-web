# P15 AliExpress CL Logistics Forensics

## Objective

Determine whether AliExpress Dropshipping truth is really saying "no Chile support" for the current ML Chile seed candidates, or whether the system is misreading the logistics payload.

## Fresh Raw Payload Evidence

Live command:

- `npm run forensic:ml-chile-logistics -- 1`

Representative result across 8 current Chile-first samples:

- `sampleCount = 8`
- all `8/8` samples exposed:
  - `hasLogisticsInfoDto = true`
  - `logisticsInfoKeys = ["delivery_time", "ship_to_country"]`
  - `logisticsInfoDtoPreview.ship_to_country = "CL"`
  - `logisticsInfoDtoPreview.delivery_time = 7`
- all `8/8` samples exposed:
  - `normalizedShippingMethodCount = 0`
  - no classic `shipping_info.methods.method`
  - no normalized shipping cost/method lines

## Exact Payload Interpretation

The current AliExpress Dropshipping payload is not saying a clean "Chile unsupported".

It is saying something narrower:

- the product payload acknowledges destination `CL`
- it exposes a delivery-time signal for `CL`
- but it does not expose method-level or cost-level logistics detail

That means the supplier truth currently looks like:

- `destination acknowledged`
- `shipping cost/method missing`

not:

- `destination absent`

## P15 Forensic Conclusion

Outcome `A` is supported for the discovery gate:

- the old gate was over-rejecting by treating "no shipping method/cost detail" as "no Chile support"

But outcome `B` still holds for strict readiness:

- there is still no usable shipping cost or method line
- and there is still no strict ML Chile candidate

## P15 Verdict

`LOGISTICS_INFO_DTO FORENSICS = DONE`

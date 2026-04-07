# P15 Chile Support Gate Semantics

## Objective

Audit the current Chile-support discovery gate against raw AliExpress logistics payload reality and fix it safely if it was misreading the payload.

## Prior Gate Problem

Before P15, the discovery gate treated:

- `shippingMethodCount = 0`

as equivalent to:

- `no_destination_support_cl`

That was too strict for the discovery layer because the raw payload was still exposing:

- `ship_to_country = CL`
- `delivery_time = 7`

inside `logistics_info_dto`.

## Safe Correction Implemented

P15 introduced a clearer support-signal model:

- `confirmed_with_shipping_methods`
- `acknowledged_without_shipping_methods`
- `no_support_signal`
- `supplier_data_incomplete`

The discovery gate now admits a candidate when supplier truth shows:

- Chile explicitly acknowledged in `logistics_info_dto`
- even if method-level shipping cost is still missing

This does not weaken strict validation because:

- discovery admission is not publish admission
- the strict funnel still requires real shipping cost later

## Fresh Proof

Live forensic result after the fix:

- all `8/8` representative samples now classify as:
  - `discoveryAdmission.code = admitted`
  - `supportSignal = acknowledged_without_shipping_methods`

## New Semantic Truth

The correct interpretation is now:

- `no_destination_support_cl` should mean truly no CL destination signal
- not merely missing shipping method/cost detail

## P15 Verdict

`CHILE-SUPPORT GATE SEMANTICS AUDIT = DONE`

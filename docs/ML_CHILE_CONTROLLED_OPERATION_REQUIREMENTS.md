# ML Chile Controlled Operation Requirements

Date: 2026-03-21

## Mandatory Context

- marketplace context must resolve to MercadoLibre Chile
- destination must be `CL`
- listing currency must be `CLP`
- listing language must be safe for Chilean publication
- AliExpress remains the supplier path for this phase

## Mandatory Pre-Sale Requirements

- target country persisted as `CL`
- shipping validity proven for Chile
- shipping cost known
- import tax known in the current model
- total cost known
- stable AliExpress SKU or equivalent supplier mapping
- projected margin remains valid after ML Chile fees and supplier-side cost assumptions
- product is `VALIDATED_READY`

## Mandatory Post-Sale Requirements

- ML order is ingested correctly
- invalid or cancelled proof is excluded
- supplier purchase payload matches real buyer destination in Chile
- supplier payment path is proven or tightly controlled
- tracking truth persists to delivery
- released funds are observable
- realized profit is recognized only after released-funds proof

## Completion Rule

The first controlled operation is only successful if it produces real net profit or a real net loss that is still fully proven end-to-end.
An unproven positive estimate does not count.

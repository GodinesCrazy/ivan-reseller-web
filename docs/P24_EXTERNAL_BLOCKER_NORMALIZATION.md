# P24 External Blocker Normalization

## Objective
Normalize the proven freight blocker into durable operator-facing truth.

## Normalized External Blocker
- `freight_entitlement_missing_or_incompatible`

## Exact Live Evidence
- Endpoint reached: `true`
- Error code: `29`
- Error sub-code: `isv.appkey-not-exists`
- Error message: `Invalid app Key`

## What This Is Not
- not a discovery blocker
- not a Chile destination blocker
- not a CL-SKU stock blocker
- not a category blocker
- not a parser/normalization blocker

## Operational Rule
Do not spend more internal cycles pretending this is still a generic funnel bug.
The blocker is external until the freight-capable app/session path is repaired.

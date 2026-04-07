# P8 New Supplier Integration Design

## Selected target

- `Alibaba`

## Minimum production-safe capabilities required

For Alibaba to become valid for first-product recovery, the supplier path would need all of:

- candidate retrieval / product discovery
- stable supplier product identity
- SKU-level stock truth
- destination-aware shipping truth
- shipping-cost truth
- supplier availability status
- cost basis for margin computation
- order-placement truth or an explicitly safe non-automated handoff mode
- failure reason mapping into the current strict rejection model

## Mapping into the current architecture

Required touchpoints:

- supplier adapter / capability service
- preventive validation path
- first-product recovery path
- supplier capability inventory
- diagnostics scripts
- rejection-code model

Minimal shape:

1. `AlibabaSupplierCapabilityService`
   - honest capability report
   - no fake readiness

2. `AlibabaSupplierAdapter` or equivalent
   - only after stock/shipping/cost truth are truly available

3. recovery integration
   - only if production-safe capability becomes true

## What P8 implemented

P8 implemented the narrow fail-closed design layer:

- target selection
- capability truth
- blocked recovery execution

P8 did not implement a fake Alibaba adapter, because the required stock/shipping/cost/order truth is still missing.

## Design conclusion

The minimal production-safe design is clear, but it cannot be completed safely within the current codebase and credential state without a larger supplier-platform change.

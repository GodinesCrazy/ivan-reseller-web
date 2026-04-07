# P24 AliExpress Multi-App Capability Model

## Objective
Refactor AliExpress from one blended provider into explicit capability families.

## Capability Families
### `affiliateDiscoveryCapability`
- Required app family: `affiliate`
- Required session family: `none`
- Current readiness: `runtime_ready`
- Current status: `affiliate_only_capable`
- Meaning: valid for discovery-facing work, not valid for freight

### `dropshippingProductCapability`
- Required app family: `dropshipping`
- Required session family: `dropshipping_session`
- Current readiness: `runtime_ready`
- Current status: `dropshipping_capable`
- Meaning: valid for destination acknowledgement, product info, and SKU truth

### `dropshippingOrderCapability`
- Required app family: `dropshipping`
- Required session family: `dropshipping_session`
- Current readiness: `code_ready`
- Current status: `dropshipping_capable`
- Meaning: modeled as a distinct capability even though this sprint did not re-verify downstream buying

### `freightQuoteCapability`
- Required app family: `dropshipping`
- Required session family: `dropshipping_session`
- Current readiness: `externally_blocked`
- Current status: `freight_entitlement_missing`
- Exact incompatibility state: `Invalid app Key`

## Key Architectural Result
The codebase should no longer think “AliExpress” means one interchangeable credential family.
Freight is now treated as its own capability and can remain blocked while discovery and dropshipping product truth stay usable.

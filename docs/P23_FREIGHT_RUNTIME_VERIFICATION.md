# P23 Freight Runtime Verification

## Objective
Verify whether the post-external-fix runtime now unlocks real AliExpress freight quotes for admitted ML Chile candidates.

## Commands Run
- `backend npm run type-check`
- `backend npm run forensic:ml-chile-freight-quotes -- 1 10`
- `backend npm run check:ml-chile-controlled-operation -- 1`

## Freight Runtime Result
The freight path is still blocked in live runtime.

### Exact Failure Signature
- `code = 29`
- `sub_code = isv.appkey-not-exists`
- `msg = Invalid app Key`

## Sample Summary
- `endpointReached = true`
- `sampleSize = 10`
- `scannedAtDiscovery = 10`
- `admittedAfterChileSupportGate = 10`
- `admittedAfterClSkuGate = 10`
- `admittedAfterFreightGate = 0`
- `validated = 0`

## Strategy Used
- `dropshipping_native`
- `appFamily = dropshipping`
- `tokenFamily = dropshipping_session`

## Best Failed Candidate
- Candidate id: `32713`
- Product id: `1005010784427692`
- SKU id: `12000053500084478`
- Target country: `CL`
- Send goods country: `CN`
- Result: `freight_endpoint_incompatible`

## Final Verification Verdict
Freight truth is not unlocked.
The sprint stops here by rule because the live blocker is still app/session entitlement compatibility.

# P21 Valid Freight Path Recovery

## Objective
Attempt the highest-leverage grounded recovery path for AliExpress freight compatibility.

## Recovery Work Performed
- Preserved the correct freight endpoint and request method.
- Confirmed the router/signature path is stable enough to hit the endpoint.
- Added explicit compatibility classification before and after freight attempts.
- Tested the native dropshipping app/session pair.
- Tested affiliate app plus dropshipping session as a controlled mismatch probe.
- Tested affiliate app without session to confirm session requirement behavior.

## Recovery Outcome
No valid freight-capable path was recovered from the currently stored credentials.

## Exact Remaining Compatibility Blocker
The currently active dropshipping app/session pair is the least-wrong runtime path, but it is still rejected by the freight endpoint with:
- `code = 29`
- `sub_code = isv.appkey-not-exists`
- `msg = Invalid app Key`

## Safe Interpretation
At least one of the following remains true:
- the current dropshipping app family is not freight-entitled
- the current app/session linkage is incompatible with the buyer freight method
- the freight method requires a different app family or a separately provisioned credential path

## Final Recovery Verdict
The correct next move is no longer code-side seller/category mining.
The next move is credential/app entitlement recovery for freight.

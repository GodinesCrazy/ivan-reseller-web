# P21 Live Freight Quote Rerun

## Command
- `npm run forensic:ml-chile-freight-quotes -- 1 8`

## Live Result
- Sample size: `8`
- Endpoint reached: `true`
- Chosen strategy: `dropshipping_native`
- App family used: `dropshipping`
- Token family used: `dropshipping_session`
- Admitted after Chile-support gate: `8`
- Admitted after CL-SKU gate: `8`
- Admitted after freight gate: `0`
- Validated: `0`

## Freight Summary By Code
- `freight_endpoint_incompatible = 8`

## Best Failed Candidate
- Candidate id: `32713`
- Product id: `1005010784427692`
- Blocker: `freight_endpoint_incompatible`
- Failure reason: `Invalid app Key`
- AliExpress code: `29`
- AliExpress sub-code: `isv.appkey-not-exists`

## Interpretation
The freight wall is now proven more precisely than in P20:
- the endpoint itself is reachable
- the current live app/session architecture still cannot obtain a usable freight quote

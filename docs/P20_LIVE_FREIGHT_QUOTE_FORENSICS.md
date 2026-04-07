# P20 Live Freight Quote Forensics

## Command
`backend npm run forensic:ml-chile-freight-quotes -- 1 8`

## Fresh Runtime Evidence
- The script bootstrapped DB/env correctly.
- The script selected a real ML Chile admitted candidate batch from persisted rows with `targetCountry = CL` and non-empty `aliexpressSku`.
- Representative first candidate:
  - `productId = 1005010784427692`
  - `targetCountry = CL`
  - `sendGoodsCountryCode = CN`
  - `hasSkuId = true`
- The call reached `aliexpress.logistics.buyer.freight.calculate`.

## Actual Response Progression During P20
1. First live attempt:
   - endpoint reached
   - response: `IncompleteSignature`
   - result: freight request shape/signing was wrong
2. After implementing router/rest + wrapped DTO + corrected signature path:
   - endpoint reached again
   - response changed to `Code: 29`, `sub_code: isv.appkey-not-exists`, `msg: Invalid app Key`
   - result: signature issue was materially reduced; the next blocker is credential/app compatibility
3. After checking live credential shapes:
   - `aliexpress-affiliate` for user `1`: `appKeyPrefix = 524880...`, `hasAccessToken = false`, `hasRefreshToken = false`
   - `aliexpress-dropshipping` for user `1`: `appKeyPrefix = 522578...`, `hasAccessToken = true`, `hasRefreshToken = true`
   - implication:
     - affiliate app cannot satisfy freight endpoint session requirement today
     - dropshipping app has session tokens, but the freight endpoint rejects its app key

## P20 Forensic Conclusion
- P20 did not produce a freight quote for Chile.
- The live freight endpoint is now the proven source of truth.
- The current blocker is no longer missing shipping extraction logic.
- The current blocker is: usable ML Chile admitted rows exist, but the AliExpress freight endpoint cannot be used successfully with the currently configured app/session combination.

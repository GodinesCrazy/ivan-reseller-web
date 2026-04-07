# P24 External Action Handoff Pack

## Exact Problem Statement
The software reaches `aliexpress.logistics.buyer.freight.calculate` live, but the only valid freight route currently fails with:
- `code = 29`
- `sub_code = isv.appkey-not-exists`
- `msg = Invalid app Key`

## What Is Already Proven
- affiliate app is not a freight path
- affiliate app plus dropshipping session is an invalid mismatch
- dropshipping app plus dropshipping session is the only legitimate freight route in this architecture
- freight is externally blocked while other AliExpress capabilities remain usable

## What To Verify In AliExpress Console
1. Verify the current dropshipping app is entitled for `aliexpress.logistics.buyer.freight.calculate`.
2. Verify the stored dropshipping app key and secret belong to the intended freight-capable app.
3. Verify freight permission is enabled for that app family or product line.
4. Verify the current session-bearing auth flow is bound to the same app family that should call freight.
5. Verify whether freight requires a separately provisioned or differently approved app.

## What Success Looks Like
- rerunning `npm run forensic:ml-chile-freight-quotes -- 1 10` returns at least one candidate with:
  - non-zero `freightOptionsCount`
  - non-empty `selectedServiceName`
  - non-null `selectedFreightAmount`
  - non-null `selectedFreightCurrency`

## What Failure Would Imply
- the current external app provisioning is still incompatible with freight
- ML Chile should remain paused on external freight dependency

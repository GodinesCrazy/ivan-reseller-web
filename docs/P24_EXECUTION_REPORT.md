# P24 Execution Report

## Sprint Goal
Refactor AliExpress into explicit capability families, isolate freight as its own capability, and normalize the ML Chile pause state around the external freight blocker.

## Real Code Changes
- Added explicit AliExpress capability modeling.
- Added canonical app/session routing for each capability.
- Extended diagnostics to emit capability snapshots and routing truth.
- Refined ML Chile issue queues to reflect external freight pause states.

## Mandatory Proof
### `backend npm run type-check`
- Passed

### `backend npm run forensic:ml-chile-freight-quotes -- 1 10`
- Endpoint reached: `true`
- `freightSummaryByCode.freight_endpoint_incompatible = 10`
- Native dropshipping freight route still fails with:
  - `code = 29`
  - `sub_code = isv.appkey-not-exists`
  - `msg = Invalid app Key`

### `backend npx tsx scripts/check-aliexpress-top-credential-shapes.ts 1`
- Affiliate app key present, no session tokens
- Dropshipping app key present, access and refresh token present
- Canonical routes now show freight must route through `dropshipping + dropshipping_session`

### `backend npm run check:ml-chile-controlled-operation -- 1`
- `targetCountryCl = 29`
- `missingShippingCost = 1000`
- `missingImportTax = 1000`
- `missingTotalCost = 1000`
- `missingAliExpressSku = 970`
- `strictMlChileReadyCount = 0`

### Focused Regression Tests
- `npx jest src/utils/aliexpress-capability-model.test.ts src/utils/aliexpress-capability-routing.test.ts src/utils/aliexpress-freight-compatibility.test.ts src/utils/p20-ml-chile-issue-queues.test.ts --runInBand`
- Result: `4` suites passed, `10` tests passed

## Final Verdict
P24 makes the AliExpress architecture materially cleaner:
- discovery and dropshipping remain usable
- freight is isolated as externally blocked
- ML Chile is now paused on a precise dependency instead of a noisy blended blocker

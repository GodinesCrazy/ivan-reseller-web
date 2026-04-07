# P21 Execution Report

## Sprint Goal
Determine whether the current AliExpress app/session architecture can be made freight-capable for the ML Chile lead path.

## Implemented Changes
- Added freight compatibility classification utilities.
- Added explicit app/session freight audit logic.
- Enriched freight runtime failures with AliExpress code, sub-code, and message.
- Upgraded the live freight forensic script to test multiple credential strategies and persist compatibility truth.
- Refined ML Chile issue queues around freight compatibility and later landed-cost blockers.
- Added focused freight-compatibility test coverage and a dedicated P21 test runner.

## Mandatory Proof Run Summary
### `npm run type-check`
- Passed

### `npm run forensic:ml-chile-freight-quotes -- 1 8`
- Endpoint reached successfully
- Native dropshipping strategy failed with `Invalid app Key`
- Cross-family affiliate-app plus dropshipping-session strategy classified as `freight_app_session_mismatch`
- No candidate reached the freight gate

### `npx tsx scripts/check-aliexpress-top-credential-shapes.ts 1`
- Affiliate app key present, but no access or refresh token
- Dropshipping app key present with access and refresh token
- Shape probe remains weaker than the live freight forensic result

### `npm run check:ml-chile-controlled-operation -- 1`
- `targetCountryCl = 29`
- `missingShippingCost = 1000`
- `missingImportTax = 1000`
- `missingTotalCost = 1000`
- `missingAliExpressSku = 970`
- `strictMlChileReadyCount = 0`

## Final Sprint Verdict
P21 proves the freight blocker is now primarily a credential/app entitlement problem, not a discovery, Chile-support, SKU, or freight-extraction problem.

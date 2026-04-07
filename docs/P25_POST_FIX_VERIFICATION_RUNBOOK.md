# P25 Post Fix Verification Runbook

## Command 1
- Command: `backend npm run type-check`
- Success looks like: command passes with no type errors
- Failure looks like: code drift or regression unrelated to the external fix
- Values that matter: exit code only

## Command 2
- Command: `backend npm run forensic:ml-chile-freight-quotes -- 1 10`
- Success looks like:
  - `endpointReached = true`
  - `admittedAfterFreightGate >= 1`
  - at least one row has:
    - non-zero `freightOptionsCount`
    - non-empty `selectedServiceName`
    - non-null `selectedFreightAmount`
    - non-null `selectedFreightCurrency`
  - `freightSummaryByCode.freight_quote_found_for_cl >= 1`
- Failure looks like:
  - repeated `code=29`, `sub_code=isv.appkey-not-exists`, `msg=Invalid app Key`
  - or another app/session entitlement-shaped failure
- Values that matter:
  - `chosenStrategy`
  - `freightSummaryByCode`
  - `bestCandidateResult`
  - `bestFailedCandidate`

## Command 3
- Command: `backend npx tsx scripts/check-aliexpress-top-credential-shapes.ts 1`
- Success looks like:
  - dropshipping app still present
  - dropshipping session still present
  - canonical freight route remains `dropshipping + dropshipping_session`
- Failure looks like:
  - missing dropshipping session
  - wrong app family selected
  - backend key mismatch after external changes
- Values that matter:
  - `affiliate`
  - `dropshipping`
  - `canonicalRoutes.freightQuoteCapability`

## Command 4
- Command: `backend npm run check:ml-chile-controlled-operation -- 1`
- Success looks like:
  - `missingShippingCost` drops materially
  - `missingImportTax` and `missingTotalCost` begin to populate
  - `strictMlChileReadyCount >= 1`
- Failure looks like:
  - `missingShippingCost` remains effectively full
  - `strictMlChileReadyCount = 0`
- Values that matter:
  - `coverage.missingShippingCost`
  - `coverage.missingImportTax`
  - `coverage.missingTotalCost`
  - `coverage.strictMlChileReadyCount`
  - `bestNearValidCandidate`

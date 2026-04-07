# P19 Chile Tax-ID / RUT Readiness

## Goal
Check whether the eventual AliExpress purchase path for Chile is likely to require RUT or tax-ID handling in a way that should already influence the controlled-operation design.

## What was implemented
- Added `backend/src/utils/ml-chile-tax-id-readiness.ts`
- Added `backend/src/utils/ml-chile-tax-id-readiness.test.ts`
- Added `backend/scripts/check-ml-chile-rut-readiness.ts`

## Current evidence quality
This section is less proven than the shipping findings.

Reason:
- the code-level readiness script was added
- but its runtime output could not be reliably recovered from the current shell wrapper

## Current working classification
`absent but likely required`

## Why this is the current classification
- No proven Chile-specific RUT field is part of the active ML Chile readiness outputs.
- No proven Chile tax-ID mapping is part of the current strict-funnel evidence.
- The first controlled ML Chile operation is intended to end in a real supplier purchase to Chile, where customs or tax-identifier requirements are plausible later blockers.

## What this means operationally
The ML Chile first-operation blueprint should now assume:
- Chile destination address completeness matters
- buyer tax-ID / RUT capture may become necessary later in the supplier checkout path
- the controlled first-buyer design should be ready to supply that field if AliExpress or the shipping route requires it

## Truth boundary
P19 does not claim RUT is already a proven hard blocker.
It claims only that RUT / tax-ID handling is not yet proven modeled and is likely a later realism blocker for the first controlled ML Chile operation.

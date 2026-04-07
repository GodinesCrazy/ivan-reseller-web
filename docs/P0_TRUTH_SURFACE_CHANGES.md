# P0 Truth Surface Changes

Date: 2026-03-20

## Goal

Fix truth at source so the frontend does not have to guess around unsafe states.

## Updated surfaces

### 1. Inventory summary

Updated:
- `/api/dashboard/inventory-summary`

Now explicitly separates:
- `pending`
- `approved`
- `legacyUnverified`
- `validatedReady`
- `published`
- `listingTruth.active`
- `listingTruth.failedPublish`
- `listingTruth.legacyArtifacts`
- `listingTruth.archived`

Real local validation returned:

- `approved = 0`
- `published = 0`
- `listingsTotal = 0`
- `listingTruth.legacyArtifacts = 508`
- `listingTruth.failedPublish = 0`

### 2. Control-center funnel source

Updated:
- `/api/analytics/control-center-funnel`

Active listing count now excludes:
- legacy artifacts
- failed publish residue
- non-machine-verifiable publish drift

### 3. Setup status

Updated:
- `/api/setup-status`

Now exposes:
- `connectorReadiness`
- `automationReadyMarketplaceCount`
- `missingRequirements.webhookAutomation`

It now fails closed when API status cannot be verified.

### 4. Readiness and autopilot truth

Updated:
- `/api/system/readiness-report`
- phase-28 autopilot/system-ready checks

The code now requires webhook/event readiness for automation claims.  
HTTP re-validation of `readiness-report` timed out locally in this session, so that endpoint is code-backed plus indirectly evidenced by `setup-status`, not fully HTTP-proven here.

### 5. Finance safety flags

Updated:
- `/api/finance/real-profit`

Now exposes:
- `profitClassification`
- `feeCompleteness`
- `currencySafety`

## What false truth was removed

- active listings inferred from stale historical rows
- approval semantics that looked publish-safe
- connector health reduced to one generic green state
- webhook-absent connectors appearing automation-ready
- silent currency fallback in live publish contexts

## What the frontend can now consume

Structured fields now available or stronger:
- `LEGACY_UNVERIFIED`
- `VALIDATED_READY`
- `connectorReadiness`
- `automationReadyMarketplaceCount`
- `webhookStatus`
- `listingTruth`
- `currencySafety`

## Remaining surface limitations

- Products UI still needs a proper validated/blocked catalog view
- readiness-report HTTP verification remains incomplete from this session due timeout
- language and policy surfaces still need P1/P2 exposure

## P52 - Canonical Operations Truth Contract

### Implemented backend contract

New canonical route:

- `GET /api/dashboard/operations-truth`

New backend builder:

- `backend/src/services/operations-truth.service.ts`

### Canonical item fields now implemented

- `productId`
- `productTitle`
- `marketplace`
- `listingId`
- `localListingState`
- `externalMarketplaceState`
- `externalMarketplaceSubStatus`
- `listingUrl`
- `lastMarketplaceSyncAt`
- `imageRemediationState`
- `publicationReadinessState`
- `blockerCode`
- `blockerMessage`
- `nextAction`
- `orderIngested`
- `supplierPurchaseProved`
- `trackingAttached`
- `deliveredTruthObtained`
- `releasedFundsObtained`
- `realizedProfitObtained`
- `proofUpdatedAt`
- `lastAgentDecision`
- `lastAgentDecisionReason`
- `decidedAt`
- `sourceLabels`
- `agentTrace`

### Summary fields now implemented

- `liveStateCounts`
  - `active`
  - `under_review`
  - `paused`
  - `failed_publish`
  - `unknown`
- `blockerCounts`
- `proofCounts`
  - `orderIngested`
  - `supplierPurchaseProved`
  - `trackingAttached`
  - `deliveredTruthObtained`
  - `releasedFundsObtained`
  - `realizedProfitObtained`

### Real data sources used

- product row
- marketplace listing row
- live MercadoLibre item status when available
- catalog validation snapshot
- orders table
- sales table
- ML image remediation metadata
- marketplace optimization advisory metadata

### First-truth design result

This contract is now the first canonical frontend-facing operations truth source for:

- listing truth
- blocker truth
- post-sale proof truth
- first agent trace truth

It replaces the need to infer these states inside primary frontend surfaces.

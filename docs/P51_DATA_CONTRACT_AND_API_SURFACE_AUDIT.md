## P51 - Data Contract and API Surface Audit

### Contracts the frontend already has but underuses

1. Listing truth
   - `/api/dashboard/inventory-summary`
   - fields:
     - `listingsByMarketplace`
     - `listingsTotal`
     - `listingsSource`
     - `lastSyncAt`
     - `listingTruth`

2. Product workflow truth
   - `/api/products/:id/workflow-status`
   - `/api/products/workflow-status-batch`

3. Product post-sale truth
   - `/api/products/post-sale-overview`

4. Setup and connector readiness
   - `/api/setup-status`
   - `/api/webhooks/status`

5. Sales/order automation truth
   - `/api/sales`
   - `/api/sales/stats`
   - `/api/orders`
   - `/api/orders/sync-status`

### Missing or insufficient frontend-facing contracts

1. Canonical listing state contract

Needed fields:

- productId
- marketplace
- listingId
- localListingState
- externalMarketplaceState
- externalMarketplaceSubStatus
- listingUrl
- lastMarketplaceSyncAt
- blockerCode
- blockerMessage
- nextAction

2. Canonical blocker contract

Needed fields:

- blockerCode
- blockerLevel
- blockerDomain
- source
- humanMessage
- actionRequired
- actionOwner
- detectedAt

3. Canonical agent decision contract

Needed fields:

- agentName
- stage
- decision
- decisionKind
- reasonCode
- evidenceSummary
- advisoryOnly
- blocking
- decidedAt

4. Canonical commercial proof contract

Needed fields:

- orderIngested
- supplierPurchaseProved
- trackingAttached
- deliveredTruthObtained
- releasedFundsObtained
- realizedProfitObtained
- proofUpdatedAt

### Fields that should be deprecated or relabeled at the frontend boundary

- product-level `profit` as generic `profit`
  - relabel to `estimatedUnitMargin`
- generic `published`
  - replace with a stronger listing lifecycle contract
- any frontend-derived workflow summary counts not supplied by backend

### API recommendations

Add:

- `/api/operations/overview`
  - one canonical source for the dashboard
- `/api/products/:id/operations-truth`
  - one canonical per-product operational truth view
- `/api/listings/:marketplace/:listingId/status`
  - canonical listing live status and blocker view
- `/api/agents/decisions`
  - recent agent decisions and blockers

Keep but consume more fully:

- `/api/products/post-sale-overview`
- `/api/dashboard/inventory-summary`
- `/api/setup-status`

### Conclusion

The frontend truth problem is not only a UI problem. It is also a contract-shaping problem. The product needs canonical frontend-facing truth contracts, not only scattered route payloads.

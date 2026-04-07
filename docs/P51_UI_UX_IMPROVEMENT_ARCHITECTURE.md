## P51 - UI/UX Improvement Architecture

### Target principle

The frontend must become a truthful operations console, not a blended analytics/demo layer.

### Target information architecture

1. Global Operations Dashboard
   - Canonical system health
   - active blockers
   - marketplace review states
   - order-ingestion truth
   - post-sale proof progress
   - last agent decisions

2. Product / Listing Operations View
   - one product
   - one or more marketplace listings
   - exact lifecycle stage
   - exact blockers
   - evidence trail

3. Marketplace Readiness View
   - technical readiness
   - publication readiness
   - external review state
   - order ingestion readiness

4. Orders / Post-sale Truth View
   - order ingestion
   - supplier purchase proof
   - tracking
   - delivery
   - payout
   - realized profit

5. Agent Decision View
   - advisory outputs
   - blocking outputs
   - evidence and reason codes

### Required design rules

- Every important status must have a source.
- Every blocker must have a next action.
- Every commercial metric must carry proof level.
- Every marketplace state must distinguish local state vs external marketplace state.
- Every agent output must distinguish advisory vs enforced.

### Canonical visual separations

Operational Health
- system dependencies
- auth
- workers
- connectors

Lifecycle Truth
- per product/listing stage
- exact current blocker

Commercial Proof
- order present
- supplier purchase proved
- delivered truth
- released funds
- realized profit

### Fail-closed presentation model

When proof is missing, UI must say:

- unknown
- blocked
- pending external review
- not yet proved

It must not silently upgrade these to positive business states.

### Recommended top-level dashboard layout

Top row:
- system health
- active blockers
- listings by real live state
- orders by real proof stage

Middle:
- marketplace review queue
- products needing intervention
- latest agent decisions

Bottom:
- business proof ladder
  - orders
  - supplier purchases
  - deliveries
  - released funds
  - realized profit

### Outcome

This architecture would align the UI with the actual finish-line objective: real autonomous dropshipping operations proved through real business events.

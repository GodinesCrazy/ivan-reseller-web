## P6 Webhook Proof Level Hardening

### Objective
Make webhook truth operationally precise and decision-grade.

### New Explicit Truth Model
The backend now distinguishes these levels explicitly:

- `not-configured`
- `code-ready`
- `endpoint-configured`
- `verified`
- `destination-registered`
- `subscription-registered`
- `inbound-event-seen`
- `event-ready`

### New Public Truth Fields
`/api/webhooks/status` now exposes, for eBay:

- `proofLevel`
- `endpointConfigured`
- `destinationRegistered`
- `subscriptionRegistered`
- `inboundEventSeen`
- `matchedDestinationId`
- `matchedSubscriptionIds`
- `matchedSubscriptionTopics`
- `verified`
- `eventFlowReady`

### Real Verified Production State
The live production route now shows:

- `proofLevel = subscription-registered`
- `endpointConfigured = true`
- `destinationRegistered = true`
- `subscriptionRegistered = true`
- `inboundEventSeen = false`
- `eventFlowReady = false`

### Safety Property
P6 preserved fail-closed behavior:

- no inbound event -> no `eventFlowReady`
- no `eventFlowReady` -> no automation-ready claim

### Validation
- `npm run type-check` passed
- focused webhook-readiness and eBay webhook tests passed

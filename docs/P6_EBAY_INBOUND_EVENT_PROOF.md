## P6 eBay Inbound Event Proof

### Objective
Raise eBay webhook proof from `subscription-registered` to real inbound business-event evidence.

### Real Current Proof
Production now returns the following on `GET /api/webhooks/status`:

- `proofLevel = subscription-registered`
- `destinationRegistered = true`
- `subscriptionRegistered = true`
- `matchedDestinationId = a1e3a7da-8c8d-408d-8b3f-0e1b5de114cc`
- `matchedSubscriptionIds = ["48d28631-faf6-4822-b7db-2307e45da0ce"]`
- `matchedSubscriptionTopics = ["ORDER_CONFIRMATION"]`
- `verified = true`
- `inboundEventSeen = false`
- `eventFlowReady = false`
- `lastWebhookEventAt = null`

### Exact Final Blocker
The missing proof is not endpoint reachability, destination registration, or subscription registration anymore.

The exact blocker is:

- the active real subscription topic is `ORDER_CONFIRMATION`
- that topic requires a real order-confirmation event
- there is no safe validated product to publish
- therefore there is no legitimate way in this execution to trigger a real business event without violating publish safety

### Conclusion
P6 did not obtain the first inbound business event.

That failure is not due to broken webhook plumbing. It is due to the absence of a safe event trigger under the current business state.

### Final Classification
- inbound business event proof: not obtained
- blocker type: event rarity / no safe trigger
- webhook plumbing status: materially real

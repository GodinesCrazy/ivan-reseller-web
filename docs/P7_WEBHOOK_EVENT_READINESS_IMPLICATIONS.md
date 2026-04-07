# P7 Webhook Event Readiness Implications

## Current webhook truth

eBay remains materially configured and subscription-registered, but not event-backed.

Current strongest webhook proof:

- `proofLevel=subscription-registered`

Current limitations:

- `inboundEventSeen=false`
- `eventFlowReady=false`

## Causal explanation after P7

Webhook/event readiness is still blocked by business-state reality, not by marketplace plumbing.

Why:

- There is still no `VALIDATED_READY` product.
- Therefore there is still no safe listing path.
- Therefore there is still no safe order path.
- Therefore there is still no legitimate way to trigger the subscribed eBay business event without violating the safety policy.

## What changes if a new supplier path succeeds later

If a new supplier path produces the first real `VALIDATED_READY` candidate:

- a tightly controlled first publish becomes possible
- a legitimate order path becomes possible
- the first inbound subscribed eBay business event can then be pursued honestly

## Bottom line

P7 confirms that the remaining eBay webhook proof gap is downstream of supplier failure. The next blocker to remove is supplier capability, not webhook plumbing.

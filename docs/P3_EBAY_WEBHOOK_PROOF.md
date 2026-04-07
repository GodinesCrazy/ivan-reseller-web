# P3 eBay Webhook Proof

## Goal

Move eBay from “manual or polling partial” toward real webhook truth.

## Implemented Code-Side Readiness

- Added official challenge-response endpoint behavior:
  - `GET /api/webhooks/ebay?challenge_code=...`
- Added official-style eBay notification signature validation using public-key lookup instead of the old shared-secret HMAC assumption.
- Added Notification API readiness diagnostics:
  - topic reachability
  - destination registry reachability
  - subscription registry reachability
  - resolved public endpoint
  - verification token presence

## Real Proof Achieved

`npx tsx scripts/check-ebay-webhook-readiness.ts 1`

Returned:

- `appTopicsReadable = true`
- `destinationsReadable = true`
- `subscriptionsReadable = false`
- `endpoint = null`
- `verificationTokenConfigured = false`
- `matchedDestinationId = null`

## Interpretation

Real Notification API access is available, so this is no longer a purely hypothetical webhook path.

But a real eBay webhook cannot yet be declared ready because:

1. no public callback endpoint is resolved
2. no verification token is configured
3. no destination is registered
4. subscription registry access still returns:
   - `Please provide configurations required for notifications. Refer to documentation.`

## Exact Blockers

- `public_webhook_endpoint_missing`
- `verification_token_missing`
- `destination_not_registered`
- `subscription_registry_unreachable`

## Final P3 Status for Webhooks

- code-side readiness: `materially improved`
- real registration proof: `not obtained`
- real event proof: `not obtained`
- eBay event readiness: `still partial/manual`

## Exact Next Manual/External Step

1. Set `BACKEND_URL` or `EBAY_WEBHOOK_ENDPOINT` to the public backend callback URL.
2. Set `EBAY_WEBHOOK_VERIFICATION_TOKEN`.
3. Re-authorize eBay with the notification subscription scope if required.
4. Register the destination/subscription in eBay Notification tooling or API.
5. Re-run `npx tsx scripts/check-ebay-webhook-readiness.ts 1`.
6. Capture first verified destination or inbound event.

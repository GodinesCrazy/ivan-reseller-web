# P4 Execution Report

## What Changed
- Hardened eBay webhook execution path with explicit Notification API config awareness, destination/subscription creation methods, and a stronger readiness diagnostic script.
- Added explicit order-truth handling so a manually cancelled marketplace order is excluded from commercial proof and cannot silently look like a successful sale.
- Added structured supplier rejection reason codes and propagated them through preventive supplier validation, catalog truth, and multi-region validation output.
- Expanded the first-product recovery loop so it now reports quantified rejection reason codes instead of a generic validation failure bucket.

## Files Modified
- `backend/src/services/ebay-webhook.service.ts`
- `backend/scripts/check-ebay-webhook-readiness.ts`
- `backend/src/services/order-truth.service.ts`
- `backend/src/api/routes/orders.routes.ts`
- `backend/src/services/sale.service.ts`
- `backend/src/services/supplier-validation-reason.service.ts`
- `backend/src/services/preventive-supplier-validation.service.ts`
- `backend/src/services/multi-region-validation.service.ts`
- `backend/src/services/catalog-validation-state.service.ts`
- `backend/scripts/mark-order-marketplace-cancelled.ts`
- `backend/src/__tests__/services/order-truth.service.test.ts`
- `backend/src/__tests__/services/supplier-validation-reason.service.test.ts`

## Real Outcome Summary
- eBay destination/subscription readiness is still not fully real.
- Cancellation/status truth is now hardened for the manually cancelled eBay order.
- Supplier-validation rejection reasons are now quantified with real reason codes.
- `VALIDATED_READY` did not rise above `0`.
- First controlled safe publish is still `NOT JUSTIFIED`.
- MercadoLibre should remain deferred.

## Exact Verified Evidence
- `npm run type-check` passed.
- `npm run build` passed.
- Focused Jest suites passed:
  - `order-truth.service.test.ts`
  - `supplier-validation-reason.service.test.ts`
  - `ebay-webhook.service.test.ts`
- Real eBay OAuth remains usable:
  - `npx tsx scripts/check-ebay-oauth.ts`
  - `userId=1 / production => integrity=valid token=SI refresh=SI usable=SI`
- Real eBay webhook readiness remains partial:
  - `endpoint=null`
  - `verificationTokenConfigured=false`
  - `alertEmailConfigured=false`
  - `appTopicsReadable=true`
  - `destinationsReadable=true`
  - `subscriptionsReadable=false`
  - `matchedDestinationId=null`
  - blockers:
    - `public_webhook_endpoint_missing`
    - `verification_token_missing`
    - `notification_config_missing`
    - `destination_not_registered`
    - `subscription_registry_unreachable`
- Real manual cancellation truth was applied to order `17-14370-63716`:
  - internal order status => `FAILED`
  - `failureReason => MANUALLY_CANCELLED_MARKETPLACE_SIDE`
  - `excludedFromCommercialProof => true`
- Real supplier recovery run on `eBay US` scanned `15` candidates and validated `0`.
- Real catalog check still shows no validated products:
  - `VALIDATED_READY = 0`

## Remaining Blockers For P5
- No public webhook endpoint configured for eBay.
- No `EBAY_WEBHOOK_VERIFICATION_TOKEN` configured.
- No Notification API config (`alertEmail`) configured.
- No registered eBay destination or subscription proof.
- Current AliExpress sourcing stack still fails the first safe candidate at supplier reality level.
- Dominant rejection remains `no_stock_for_destination`.
- Second blocker in the recovery sample is `margin_invalid`.
- No product is currently `VALIDATED_READY`.
- First controlled safe publish is still blocked by missing webhook proof plus missing validated candidate.

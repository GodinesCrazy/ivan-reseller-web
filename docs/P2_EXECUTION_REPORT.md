# P2 Execution Report

## 1. What Changed

P2 focused on runtime unblocking and connector-path execution without weakening the fail-closed safety model from P0/P1.

Implemented changes:

- `readiness-report` now uses a bounded snapshot-first path instead of waiting on slow live connector fan-out.
- `systemHealth` internals now have bounded DB/Redis/BullMQ probes, so readiness can return explicit health truth instead of hanging.
- `/api/products` no longer depends on expensive Prisma aggregations for categories/statuses in the hot path; the list query was slimmed and its aggregations were rewritten to faster SQL.
- setup gating for `/api/products` no longer calls live API status checks; it now uses credential truth from DB.
- eBay OAuth start URL now respects local request origin for callback precedence, preventing local flows from being forced back to production callback URLs.
- regression tests were added for:
  - setup-check DB-only logic
  - snapshot-first API status fast path
  - local eBay OAuth callback precedence

## 2. Files Modified

Primary P2 code changes:

- `backend/src/api/routes/system.routes.ts`
- `backend/src/api/routes/marketplace-oauth.routes.ts`
- `backend/src/services/system-health.service.ts`
- `backend/src/services/api-status-fast-path.service.ts`
- `backend/src/services/product.service.ts`
- `backend/src/services/marketplace.service.ts`
- `backend/src/utils/setup-check.ts`

P2 regression tests:

- `backend/src/__tests__/utils/setup-check.test.ts`
- `backend/src/__tests__/services/api-status-fast-path.service.test.ts`
- `backend/src/services/__tests__/marketplace-ebay-oauth-local.test.ts`

## 3. Readiness-Report HTTP Verification

Status: `DONE`

Real HTTP verification against the local source-backed runtime returned:

- `GET /api/system/readiness-report`
- HTTP `200`
- observed duration: about `6373 ms`
- `generationPath = snapshot_first_bounded`
- `readinessSource = snapshot`
- `degradedSections = []`

Verified response truths:

- DB health now returns explicitly as `ok`
- Redis/BullMQ/workers now return explicit failures instead of stalling
- connector readiness remains truthful:
  - eBay = `manual_or_polling_partial`
  - MercadoLibre = `blocked`
  - Amazon = `blocked`
- automation remains blocked:
  - `automationReadyCount = 0`
  - `canEnableAutonomous = false`

## 4. Products Endpoint Stability

Status: `DONE`

Real HTTP verification against the local source-backed runtime returned:

- `GET /api/products?limit=5&page=1`
- HTTP `200`
- observed duration: about `1348 ms`
- no `_degraded`
- no `_timeout`

Returned truth now includes:

- real paginated product rows
- `validationState`
- `blockedReasons`
- resolved country/language/currency
- `feeCompleteness`
- `projectedMargin`
- strict counts:
  - `total = 32650`
  - `LEGACY_UNVERIFIED = 31875`
  - `PENDING = 772`
  - `REJECTED = 3`

## 5. Local eBay OAuth Readiness

Status: `PARTIAL`

What was fixed:

- the eBay OAuth start URL builder now prefers a local callback when the request originates from `localhost` or `127.0.0.1`

Real runtime proof from source execution:

- `MarketplaceService.getEbayOAuthStartUrl(1, 'production', { requestBaseUrl: 'http://localhost:4000' ... })`
- returned URL now contains:
  - `redirect_uri=http://localhost:4000/api/marketplace-oauth/oauth/callback/ebay`

Remaining blocker:

- real stored eBay credentials still fail local OAuth usability diagnostics
- `npx tsx scripts/check-ebay-oauth.ts` returned:
  - `eBay ... error al descifrar/parsear`

That means the callback origin bug is fixed, but real local connector readiness is still blocked by credential state.

## 6. Webhook Proof

Status: `FAILED`

No marketplace reached real webhook proof during P2.

Evidence already preserved by runtime truth:

- readiness still reports:
  - `webhookReady = false`
  - `eventFlowReady = false`
  - `automationReady = false`
- eBay remains `manual_or_polling_partial`

No real webhook registration or event verification was completed in this phase.

## 7. VALIDATED_READY Recovery

Status: `FAILED`

Real state after P2:

- `VALIDATED_READY = 0`

Real proof:

- `npx tsx backend/scripts/check-validated-ready.ts` still shows:
  - `LEGACY_UNVERIFIED = 30351`
  - `PENDING = 3`
  - `REJECTED = 2`
  - `validated = []`
- re-running multi-region validation still fails safely with:
  - `Falta token OAuth de eBay. Completa la autorización en Settings → API Settings → eBay.`

## 8. Controlled Safe Sale

Status: `FAILED`

Not justified after P2.

Blocking prerequisites still missing:

- no real `VALIDATED_READY` product
- no real local eBay OAuth completion
- no webhook verification or event proof
- no event-ready marketplace

## 9. Remaining Blockers for P3

- Complete real local eBay OAuth and repair/replace undecryptable stored credentials
- Register and verify at least one real webhook/event flow
- Re-run validation loop until `VALIDATED_READY >= 1`
- Only then assess one controlled safe sale


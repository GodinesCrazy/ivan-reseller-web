# P28 MLC OAuth Recovery

## Goal

Recover a production-usable MercadoLibre Chile OAuth/runtime path and make the readiness diagnostics reflect the live truth.

## What Was Proven

- The dedicated runtime diagnostic refreshed and persisted MercadoLibre tokens successfully during P28 preparation.
- A fresh rerun no longer needed recovery and reported `authState=access_token_present`.
- `users/me` returned `200` for account `194000595 / MAIV6674255 / CL`.

## Grounded Code-Side Issue

The old `backend/scripts/check-ml-chile-controlled-operation-readiness.ts` was reading token shape only. It did not use the same runtime refresh-and-verify behavior that the shared marketplace path already uses, so it could keep reporting stale auth even after refresh succeeded elsewhere.

## Fix Applied

Updated `backend/scripts/check-ml-chile-controlled-operation-readiness.ts` to:

- clear the credentials cache before and after runtime auth verification
- call `MarketplaceService.testConnection(userId, 'mercadolibre', 'production')`
- re-read credentials after runtime verification
- report:
  - `initialHasAccessToken`
  - `initialHasRefreshToken`
  - `runtimeUsable`
  - `runtimeMessage`
- drive `authBlocked` and `oauthReauthRequired` from runtime truth instead of raw pre-refresh token shape alone

## Operator-Friendly Reauth Path

Manual reauth was not required in this sprint, but the runtime diagnostic produced a valid production start URL:

- `https://auth.mercadolibre.cl/authorization?client_id=8432109551263766&redirect_uri=https%3A%2F%2Fivanreseller.com%2Fapi%2Fmarketplace-oauth%2Fcallback&response_type=code&state=...`

If future refresh fails, the canonical operator path remains:

- authenticated user hits `/api/marketplace-oauth/oauth/start/mercadolibre`
- callback persists tokens through `/api/marketplace-oauth/callback`

## Outcome

- usable production OAuth path: recovered
- token persistence: verified
- post-recovery runtime usability: verified
- manual reauth required now: no

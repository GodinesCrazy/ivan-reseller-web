# P13 ML Chile OAuth Re-Auth

## Objective

Recover MercadoLibre Chile runtime auth for the active `MLC` credential row without fabricating tokens and prove the result with a real authenticated API call.

## Implemented Changes

- Added a real MercadoLibre OAuth start path for authenticated users through the marketplace OAuth routes.
- Added `MarketplaceService.getMercadoLibreOAuthStartUrl(...)` so the system can generate a real MercadoLibre auth URL for the active user and environment.
- Hardened the MercadoLibre callback flow so token persistence is immediately re-read from storage, cache is cleared, and runtime usability is verified after save.
- Extended ML Chile auth truth classification with explicit `oauthReauthRequired` logic.
- Extended runtime diagnostics so auth state reports:
  - `hasAccessToken`
  - `hasRefreshToken`
  - `tokenShapeValid`
  - `runtimeUsable`
  - `lastAuthFailureReason`
  - `oauthStartUrl`
- Hardened MercadoLibre runtime health checks so refresh success is persisted and re-verified against `users/me`.

## Fresh Runtime Evidence

Initial auth runtime check during P13 proved the old P12 belief was stale:

- `credentialRow.id = 5988`
- `siteId = MLC`
- `hasAccessToken = true`
- `hasRefreshToken = true`
- `tokenShapeValid = true`
- `runtimeUsable = false`
- `authState = access_token_invalid_refresh_succeeds`
- `oauthReauthRequired = false`
- `refreshResult.status = 200`
- `refreshResult.accessTokenReturned = true`
- `refreshResult.refreshTokenReturned = true`

This proved the real blocker was no longer "tokens missing". The row already had token material, but the current access token was stale.

After fixing refresh persistence and readback handling, the runtime auth check proved MercadoLibre Chile auth is now usable:

- `credentialRow.id = 5988`
- `siteId = MLC`
- `hasAccessToken = true`
- `hasRefreshToken = true`
- `tokenShapeValid = true`
- `runtimeUsable = true`
- `authState = access_token_present`
- `oauthReauthRequired = false`
- `lastAuthFailureReason = null`
- `usersMe.status = 200`
- `usersMe.id = 194000595`
- `usersMe.nickname = MAIV6674255`
- `usersMe.country_id = CL`

## Business Interpretation

P13 materially changed the lead-path truth:

- MercadoLibre Chile auth is no longer the dominant blocker.
- The active credential row is runtime-usable.
- A real authenticated MercadoLibre Chile runtime call has now been proven.

## Remaining Caveat

The broader controlled-operation readiness script still reports an older auth classification (`credential_row_present_but_tokens_missing`). That script is now behind the stronger runtime truth and should be aligned in a follow-up tightening pass. The source of truth for P13 auth recovery is the live `users/me` proof.

## P13 Verdict

`ML CHILE OAUTH RE-AUTH = DONE`

# P11 ML Chile Auth Recovery

Date: 2026-03-21

## Goal

Recover MercadoLibre Chile auth, or prove the exact blocker if recovery is not possible in this sprint.

## Fresh Runtime Evidence

### Live auth diagnostic

Command run:

- `npm run check:ml-chile-auth-runtime -- 1`

Result:

- active production MercadoLibre credential row exists
- credential row ID: `5988`
- credential row updatedAt: `2026-03-20T02:08:17.216Z`
- `siteId = MLC`
- `hasAccessToken = false`
- `hasRefreshToken = false`
- `hasClientId = true`
- `hasClientSecret = true`
- `authState = credential_row_present_but_tokens_missing`

### Live runtime logs

Latest deployment/runtime logs still show:

- `[MercadoLibre] searchRecentOrders failed`
- `error = invalid access token`
- `status = 401`

## Root Cause

The highest-confidence current root cause is:

- the production MercadoLibre credential row exists and is active
- but the decrypted runtime credential payload does not currently contain a usable `accessToken`
- and it also does not contain a `refreshToken`

This means the immediate blocker is not marketplace selection, not siteId, and not missing app credentials.
It is missing usable runtime tokens.

## What Was Implemented

- added explicit auth-truth classification in code and tests
- added live auth diagnostic script:
  - `backend/scripts/check-ml-chile-auth-runtime.ts`
- added npm command:
  - `check:ml-chile-auth-runtime`

## Recovery Outcome

Auth was not recovered in this sprint.
But the blocker is now explicit and proven.

## Final Auth Verdict

- Status: `PARTIAL`
- Exact blocker: `credential_row_present_but_tokens_missing`

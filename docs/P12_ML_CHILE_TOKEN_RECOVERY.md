# P12 ML Chile Token Recovery

## Objective
Recover MercadoLibre Chile runtime auth for the lead path without weakening safety or fabricating tokens.

## Fresh runtime evidence
Command used:

```powershell
npm run check:ml-chile-auth-runtime -- 1
```

Observed result:

```json
{
  "userId": 1,
  "credentialRow": {
    "id": 5988,
    "updatedAt": "2026-03-20T02:08:17.216Z"
  },
  "marketplaceAuthStatus": null,
  "apiSnapshot": null,
  "siteId": "MLC",
  "hasAccessToken": false,
  "hasRefreshToken": false,
  "hasClientId": true,
  "hasClientSecret": true,
  "tokenShapeValid": false,
  "runtimeUsable": false,
  "authState": "credential_row_present_but_tokens_missing",
  "lastAuthFailureReason": "missing_access_token"
}
```

## What P12 implemented
- Added explicit MercadoLibre auth truth classification with:
  - `hasAccessToken`
  - `hasRefreshToken`
  - `tokenShapeValid`
  - `runtimeUsable`
  - `lastAuthFailureReason`
- Extended the runtime diagnostic to read the active credential row and classify the exact auth state.
- Kept the sprint fail-closed: no token fabrication, no guessed recovery, no weakened auth assumptions.

## P12 verdict
- Status: `PARTIAL`
- Recovery achieved: `NO`
- Exact blocker proven: `YES`

The current blocker is not a generic MercadoLibre `401` anymore. The exact proven state is:
- an active production credential row exists
- `siteId = MLC`
- `clientId` and `clientSecret` exist
- `accessToken` is missing
- `refreshToken` is missing
- token shape is invalid
- runtime auth is not usable

## Finish-line implication
MercadoLibre Chile remains strategically correct for the first controlled operation, but runtime marketplace auth is still operationally blocked until a real OAuth re-auth persists usable tokens.

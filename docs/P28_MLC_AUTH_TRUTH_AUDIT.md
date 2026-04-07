# P28 MLC Auth Truth Audit

## Goal

Audit the exact MercadoLibre Chile production auth/runtime state after P27 proved freight on the canonical AliExpress path.

## Commands Run

- `backend npm run type-check`
- `backend npm run check:ml-chile-auth-runtime -- 1`
- `backend npm run check:ml-chile-controlled-operation -- 1`

## Active Credential Truth

From `backend/p28-ml-auth-runtime-output-2.txt`:

```json
{
  "credentialRow": {
    "id": 5988,
    "updatedAt": "2026-03-22T23:13:40.469Z"
  },
  "siteId": "MLC",
  "hasAccessToken": true,
  "hasRefreshToken": true,
  "hasClientId": true,
  "hasClientSecret": true,
  "tokenShapeValid": true,
  "runtimeUsable": true,
  "authState": "access_token_present",
  "oauthReauthRequired": false,
  "usersMe": {
    "status": 200,
    "id": 194000595,
    "nickname": "MAIV6674255",
    "country_id": "CL"
  }
}
```

## Classification

- `access_token_present`: true
- `refresh_token_present`: true
- `token_shape_valid`: true
- `runtime_usable`: true
- `oauthReauthRequired`: false
- `auth_blocked_ml_credentials_missing_tokens`: false

## Conclusion

MercadoLibre Chile production auth is no longer the immediate blocker. The live runtime has a usable access token, a refresh token, valid client credentials, and a successful `users/me` proof for a Chile account.

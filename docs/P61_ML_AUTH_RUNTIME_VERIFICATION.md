# P61 — ML Auth Runtime Verification

Date: 2026-03-24 (fresh run, operator workstation + production DB URL)

## Command

```bash
cd backend
npm run check:ml-chile-auth-runtime -- 1
```

## Result: **auth_healthy**

| Check | Evidence |
|--------|-----------|
| Access token present | `hasAccessToken: true` |
| Refresh token present | `hasRefreshToken: true` |
| Client id/secret present | `hasClientId: true`, `hasClientSecret: true` |
| Token shape valid | `tokenShapeValid: true` |
| Runtime usable | `runtimeUsable: true` |
| Live ML identity call | `GET https://api.mercadolibre.com/users/me` → **HTTP 200** |
| OAuth reauth required | `oauthReauthRequired: false` |
| Classified auth state | `authState: "access_token_present"` |

## API response body (users/me, non-secret fields)

- `id`: 194000595  
- `nickname`: MAIV6674255  
- `country_id`: CL  

## DB corroboration (not UI-only)

- `api_credentials` row for user `1` / `mercadolibre` / `production`: `id` 5988, `updatedAt` **2026-03-24T19:53:41.291Z** — consistent with credentials **persisted after** a recent OAuth completion, not merely a successful browser redirect without storage.

## Classification (per sprint taxonomy)

**auth_healthy** — cold runtime proves tokens load from DB, refresh material exists, and MercadoLibre accepts the access token for `users/me`.

## Notes

- `marketplaceAuthStatus` and `apiSnapshot` were **null** in this run; truth is taken from **credential payload + live users/me**, not from optional status rows.
- Do **not** treat “callback UI succeeded” alone as success; this sprint required the script above.

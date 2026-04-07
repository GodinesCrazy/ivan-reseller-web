# P92 — DS product info + gray SKU resolution

## Intended call

- **API:** `aliexpressDropshippingAPIService.getProductInfo('1005009130509159', { localCountry: 'CL', localLanguage: 'es' })`  
- **Code:** `backend/src/services/aliexpress-dropshipping-api.service.ts`  
- **Gray selection:** `backend/scripts/p92-staging-candidate-setup.ts` — first in-stock SKU whose attribute string matches `/\b(gray|grey|gris)\b/i` (no fabricated skuId).

## Execution result (this sprint)

**FAILED — `credentials_missing_or_no_token`**

| Field | Value |
|--------|--------|
| When | `2026-03-26T03:18:11.160Z` (UTC) |
| User used for credential lookup | `userId: 1` (first user in DB) |
| Env path tried | `ALIEXPRESS_DROPSHIPPING_APP_KEY` / `APP_SECRET` / `ACCESS_TOKEN` |
| DB path tried | `CredentialsManager.getCredentialEntry(userId, 'aliexpress-dropshipping', 'production')` |
| Blocker class | **credentials_missing** (no usable access token in env or DB for that user) |

## Evidence artifact

- `artifacts/p92/p92-resolution.json` — records `blocker` and `hint`.

## Title / images / supplier price / SKU list / gray mapping

**Not available** — `getProductInfo` was not executed successfully, so no DS payload was captured.

## Exact next action

Provide **AliExpress Dropshipping** credentials for the staging operator user (env vars **or** OAuth-stored `apiCredential` for `aliexpress-dropshipping`), then re-run:

```bash
cd backend && npx tsx scripts/p92-staging-candidate-setup.ts
```

Optional: `npx tsx scripts/p92-staging-candidate-setup.ts --resolve-only` to only resolve SKU and write JSON without DB writes.

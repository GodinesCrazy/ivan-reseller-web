# P68 — Dropshipping credential resolution audit

**Context:** Product **32690**, owner **`userId = 1`**, enrichment via `backend/scripts/p66-enrich-product-images.ts`.

## What the database already had (post-audit)

Using `npx tsx scripts/check-aliexpress-top-credential-shapes.ts 1` (loads `src/config/env`):

| Signal | Result |
|--------|--------|
| Row present | **Yes** — `aliexpress-dropshipping`, **user** scope, **production** |
| `hasAccessToken` / `hasRefreshToken` | **true** / **true** |
| `isActive` (implicit via resolution) | Credential entry resolves when decrypt succeeds |

So the row was **not** missing, not wrong-user for this product, and not inactive in the sense that blocked P67.

## Exact blocker before P68 (zero ambiguity)

**`p66-enrich-product-images.ts` imported only `dotenv/config`.**

Backend `src/config/env.ts` also loads **`.env.local`** (with override) and validates **`ENCRYPTION_KEY`**. The enrich script did **not** import that module.

If `ENCRYPTION_KEY` (or other required config) lives only under the same loading path as the main app, **`tryDecrypt` in `CredentialsManager` fails**, the user credential row is skipped, global is skipped or also undecryptable, and env may not supply a dropshipping **access token** → **`getDsApi` returned `null`** → P67 logged **`no_dropshipping_credentials`** even though the DB row existed.

**Classification:** **env / runtime bootstrap precedence** — not “AliExpress revoked the app.”

## Secondary issue (after auth worked)

`aliexpress.offer.ds.product.simplequery` returned no product payload; `aliexpress.ds.product.get` succeeded but **`product_images` was empty** in that shape. Gallery data lived under **`ae_multimedia_info_dto`** (and related SKU fields). Until P68, **`getProductInfo` did not map those into `productImages`**, so the lane looked “broken” at the enrichment script layer.

**Classification:** **response-shape mapping gap** (fixed in `aliexpress-dropshipping-api.service.ts` for P68).

## Env vs DB app-secret drift (informational)

The shape probe reported **`secret_suspect`** between DB-loaded dropshipping secret fingerprint and **`ALIEXPRESS_DROPSHIPPING_APP_SECRET`** in env. That is worth reconciling for long-term token refresh reliability; it did not prevent the successful P68 retrieval once decrypt + mapping were fixed.

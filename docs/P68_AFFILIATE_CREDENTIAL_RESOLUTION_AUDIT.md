# P68 — Affiliate credential resolution audit

**Context:** Product **32690**, owner **`userId = 1`**, fallback path inside `p66-enrich-product-images.ts` → `discoverViaAffiliate`.

## Database

`check-aliexpress-top-credential-shapes.ts 1` shows:

| Signal | Result |
|--------|--------|
| Row present | **Yes** — `aliexpress-affiliate`, **user** scope |
| `appKey` / `appSecret` | **Present** (lengths only in logs; no secret values here) |
| OAuth-style `accessToken` | **Not used** for Affiliate TOP sync calls (expected) |

So Affiliate was **not** “missing DB rows” for user 1.

## Why P67 logged `affiliate_not_configured`

Same root cause as Dropshipping for scripts that only used **`dotenv/config`**: without `src/config/env`, **`CredentialsManager.getCredentials` could not decrypt** the affiliate row. `discoverViaAffiliate` then called `new AliExpressAffiliateAPIService()` without usable DB creds; **`isConfigured()`** stayed false → outcome **`affiliate_not_configured`**.

Additionally, the Affiliate service constructor logs a warning when **`ALIEXPRESS_AFFILIATE_APP_KEY` / `SECRET`** are absent from **process env**; that log is **noisy** even when DB credentials are later applied via **`setCredentials`** — do not treat that console line alone as truth.

## After `import '../src/config/env'` in the enrich script

- Env may populate legacy/affiliate keys (if present), matching how the rest of the backend boots.
- DB affiliate credentials decrypt and **`setCredentials`** runs → Affiliate client is configured.
- For product `1005010297651726`, Affiliate **productdetail** / SKU calls did not add distinct URLs in the P68 run **after** Dropshipping already supplied gallery URLs — logged as **`affiliate_empty_or_failed`** relative to *new* discovery, not “credentials missing.”

## Blocker summary (Affiliate-specific)

**P67:** undecryptable / unloaded config → **appeared** unconfigured.  
**P68:** credentials OK; optional fallback when Dropshipping returns nothing.

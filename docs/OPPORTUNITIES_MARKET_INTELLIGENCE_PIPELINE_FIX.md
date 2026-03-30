# Opportunities market intelligence pipeline — fix summary

## Changes

### 1. Mercado Libre public catalog search

- Added `MercadoLibreService.searchSiteCatalogPublic({ siteId, q, limit })` calling `https://api.mercadolibre.com/sites/{SITE_ID}/search` **without** Bearer token.
- `competitor-analyzer.service.ts` uses it for the `mercadolibre` comparator. `siteId` comes from user credentials when present, else `REGION_TO_ML_SITE[region]`, else `MERCADOLIBRE_SITE_ID` / `MLM`.

### 2. eBay Browse — application token fallback

- `EbayService.searchProducts`: if user token is missing after refresh attempt, falls back to `getOAuthToken()` (client credentials), same family as arbitrage search.
- Competitor builds `EbayService` with **merged** App ID / Cert ID from user row **or** `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` (or legacy `EBAY_APP_ID` / `EBAY_CERT_ID` env names).
- Removed “skip eBay on any `issues`” when application keys exist.

### 3. Logging

- Competitor `catch` now logs `userId`, marketplace, region, and error message (no silent swallow).

### 4. Opportunity row quality

- `competitionLevel` derived from `listingsFound` via `listingsToCompetitionLevel`.
- `commercialTruth` populated per `OPPORTUNITIES_EXACT_VS_ESTIMATED_CONTRACT.md`.
- Credential **warnings** are **not** appended to rows that already have exact comparables (reduces false “estimated” messaging).
- Heuristic-only message updated to describe **missing comparables** and **Amazon / eBay app** requirements accurately (not “configure ML OAuth for public search”).

### 5. Cache invalidation

- After `MarketplaceService.saveCredentials`, `cacheService.invalidatePattern('opportunities:{userId}:*')` runs so OAuth refresh can yield fresh enrichment without waiting for TTL.

### 6. Frontend

- `Opportunities.tsx` reads `commercialTruth` for **Estimado** vs **Real** badges and shows human-readable comparables sources.
- Footer note updated to match the new behavior.

## Deploy

Ship backend + frontend together. Operators can pass `refresh=1` on searches (if exposed in UI) or rely on cache invalidation after saving credentials.

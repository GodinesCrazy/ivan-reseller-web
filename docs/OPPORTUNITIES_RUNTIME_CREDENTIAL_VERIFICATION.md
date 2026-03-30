# Opportunities — runtime credential verification

## What actually gates “real” suggested prices

| Marketplace | Required for **comparables** in Opportunities |
|-------------|-----------------------------------------------|
| Mercado Libre | **None** (public catalog). Optional: saved `siteId` improves country match. |
| eBay | **App ID + Cert ID** (user settings or `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET` on the server). User OAuth improves token path but is **not** strictly required if application token works. |
| Amazon | Full catalog credentials as implemented in `AmazonService.searchCatalog` (user row with required fields). |

## AliExpress

AliExpress (affiliate / session) drives **supplier discovery and cost**, not marketplace comparables.

## How to verify in production

1. **Backend logs** — search for `[competitor-analyzer]` warnings on failed marketplace calls.
2. **Response body** — items should include `commercialTruth.competitionSources` when comparables succeeded (e.g. `mercadolibre_public_catalog`).
3. **Cache** — after OAuth save, opportunities keys for that user should be invalidated; if using Redis, pattern `opportunities:<userId>:*`.
4. **Stale UI** — run a search with `refresh=1` query param if the client supports it, or wait past `OPPORTUNITIES_CACHE_TTL_SECONDS`.

## Common false negatives

- **Region** mismatch (e.g. `us` default while operator expects Chile): set regional default or pass `region=cl` so ML uses `MLC`.
- **No eBay app keys** in env or DB: eBay comparables skipped.
- **Amazon** incomplete row: Amazon branch skipped; ML/eBay may still provide `exact` suggested price.

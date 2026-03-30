# Opportunities — exact vs estimated (runtime fix summary)

This document ties the **field-level contract** to what the runtime does after the intelligence pipeline fix.

## Contract (source of truth)

See `docs/OPPORTUNITIES_EXACT_VS_ESTIMATED_CONTRACT.md` for definitions of `commercialTruth` fields.

## Runtime behavior (implemented)

1. **Mercado Libre comparables:** public site search (`MercadoLibreService.searchSiteCatalogPublic`) — no seller OAuth required.
2. **eBay comparables:** `EbayService.searchProducts` falls back to **application** client-credentials token when user OAuth is absent; competitor uses App ID + Cert ID from DB or env.
3. **Redis:** saving marketplace credentials invalidates `opportunities:{userId}:*` (`MarketplaceService.saveCredentials`).
4. **Payload:** each opportunity item includes `commercialTruth` and `competitionSources` when comparables succeed.
5. **UI:** `Opportunities.tsx` shows **Real** vs **Estimado** from `commercialTruth`, with legacy fallback to `estimatedFields`.

## If production still shows “Estimado”

1. Confirm backend deployment includes `88283c7` (or later) for competitor + opportunity-finder changes.
2. Confirm region/site (e.g. `cl` → `MLC`) matches the catalog you expect.
3. Confirm eBay App ID + Cert ID exist (env or Settings).
4. Run search with `refresh=1` (Opportunities already forces fresh search on **Search** per UI copy).

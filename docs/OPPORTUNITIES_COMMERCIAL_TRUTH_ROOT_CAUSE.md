# Opportunities commercial truth — root cause

## Symptom

The Opportunities table showed **Estimado** for suggested price, margin, and ROI, plus notes implying that **Amazon / eBay / Mercado Libre OAuth** was required for “real competition,” even after operators refreshed **AliExpress** and **Mercado Libre** OAuth.

## Root causes (verified in code)

### 1. Mercado Libre competition required user credentials that were often “invalid” for `getCredentials`

`MarketplaceService.getCredentials` marks Mercado Libre rows with `issues` when any of `clientId`, `clientSecret`, `accessToken`, `refreshToken` is missing. The competitor analyzer **skipped ML entirely** when `issues.length > 0`.

Mercado Libre **site search** (`GET /sites/{SITE_ID}/search`) is a **public catalog API** and does **not** require the seller’s OAuth token. The pipeline was incorrectly coupling “read comparables” to “seller credentials valid.”

### 2. eBay Browse search required user OAuth, while app credentials were enough

`EbayService.searchProducts` threw if the **user** access token was missing, even though the same codebase already had `getOAuthToken()` (client credentials) used by `searchProductsForArbitrage`. The competitor path used `searchProducts`, so eBay comparables failed unless seller OAuth was perfect.

The analyzer also **skipped eBay** when `getCredentials` reported generic `issues` (e.g. missing user token), even when **App ID + Cert ID** were present for application tokens.

### 3. Silent failures in the competitor loop

`competitor-analyzer.service.ts` swallowed errors in an empty `catch`, so API failures produced **no** analysis object and the pipeline fell back to **heuristic** pricing without observable errors in logs.

### 4. Misleading follow-on messaging

When comparables existed, **credential warnings** from `credentialDiagnostics` were still appended to `estimationNotes`, which read like “everything is estimated.”

### 5. Stale Redis cache

`GET /api/opportunities` caches responses (`opportunities:{userId}:...`). Saving new marketplace credentials did **not** invalidate that cache, so users could see **old estimated-only** payloads after OAuth refresh until TTL expired or `refresh=1` was used.

### 6. `competitionLevel` was always `unknown` in the opportunity row

Even when comparables existed, the built `OpportunityItem` hard-coded `competitionLevel: 'unknown'`, weakening operator trust in the row.

## Files involved (trace)

| Layer | File |
|--------|------|
| UI | `frontend/src/pages/Opportunities.tsx` |
| API | `backend/src/api/routes/opportunities.routes.ts` |
| Orchestration | `backend/src/services/opportunity-finder.service.ts` |
| Competitors | `backend/src/services/competitor-analyzer.service.ts` |
| ML API | `backend/src/services/mercadolibre.service.ts` |
| eBay API | `backend/src/services/ebay.service.ts` |
| Credentials | `backend/src/services/marketplace.service.ts` |
| Cache | `backend/src/services/cache.service.ts` |

## Related (duplicate import UX)

Importar la misma URL de AliExpress devolvía **409** con mensaje útil en el backend, pero el cliente podía interpretar la respuesta como fallo genérico o mostrar texto incorrecto sobre “falta ID”. Ver `docs/OPPORTUNITIES_DUPLICATE_IMPORT_RUNTIME_FIX.md` y `docs/OPPORTUNITIES_DUPLICATE_IMPORT_UI_FLOW.md`.

## Runtime fixes (exact vs estimated)

Implementación y contrato de campos: `docs/OPPORTUNITIES_MARKET_INTELLIGENCE_PIPELINE_FIX.md`, `docs/OPPORTUNITIES_EXACT_VS_ESTIMATED_CONTRACT.md`, `docs/OPPORTUNITIES_EXACT_VS_ESTIMATED_RUNTIME_FIX.md`.

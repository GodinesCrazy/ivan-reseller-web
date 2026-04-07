# P89 — Web preflight readiness contract

## Endpoint

`GET /api/products/:id/publish-preflight?marketplace=mercadolibre&environment=production|sandbox`

- **Auth:** same as other product routes (JWT).  
- **Scope:** `marketplace=mercadolibre` only (other values return 400 — extensible later).

## Payload (`schemaVersion: 1`)

Implemented in `backend/src/services/mercadolibre-publish-preflight.service.ts`.

| Field | Meaning |
|--------|---------|
| `overallState` | Single primary blocker enum (see below) |
| `publishAllowed` | `true` only when `overallState === 'ready_to_publish'` |
| `nextAction` | Human-readable next step |
| `blockers` | Machine-oriented list (includes duplicates for UX/traceability) |
| `warnings` | Non-blocking (e.g. webhook event flow not proven) |
| `listingSalePriceUsd` | `MarketplaceService.getEffectiveListingPrice` (same rule as publish) |
| `canonicalPricing` | Output of `mlcCanonicalPricingFromEconomicsCore` |
| `images` | `resolveMercadoLibrePublishImageInputs` — **same gate as publisher** |
| `language` | `getMarketplaceContext` + listing language policy |
| `credentials` | ML credential presence/issues from `getCredentials` |
| `mercadoLibreApi` | `MercadoLibrePublisher.testConnection()` |
| `postsale` | Webhook secret configured, connector summary, honest fulfill notes |

## `overallState` values

- `ready_to_publish`  
- `blocked_product_status` — not `VALIDATED_READY`  
- `blocked_missing_source_data` — no `aliexpressUrl`  
- `blocked_credentials` — ML credentials missing/inactive/issues  
- `blocked_marketplace_connection` — `testConnection` failed  
- `blocked_language` — destination/language policy not satisfied  
- `blocked_images` — `publishSafe === false`  
- `blocked_pricing` — `runPreventiveEconomicsCore` failed  
- `blocked_postsale_readiness` — strict webhook env on and secret missing  

**Precedence:** product status → missing URL → credentials → API → language → images → pricing → postsale.

# E2E — Publish readiness (truth layer)

## Layers

1. **Workflow status**: ML preflight requires `VALIDATED_READY` (configurable product lifecycle).
2. **Credentials**: ML active + `testConnection` success for chosen environment.
3. **Language / site**: MLC context must be supported (`getMarketplaceContext`).
4. **Images**: `resolveMercadoLibrePublishImageInputs` → `publishSafe`, pack approval for required assets.
5. **Economics**: `runPreventiveEconomicsCore` — supplier, shipping, fees, profit floors (env-tunable in pre-publish validator).
6. **Postsale gate**: If `ML_WEB_PUBLISH_REQUIRE_ML_WEBHOOK_SECRET` is true, **`WEBHOOK_SECRET_MERCADOLIBRE`** must be configured or preflight blocks with `blocked_postsale_readiness`.

## Single contract

`GET /api/products/:id/publish-preflight?marketplace=mercadolibre` returns **`publishAllowed`** only when `overallState === 'ready_to_publish'`.

## UI enforcement

`ProductPreview` disables **Publicar** when `preflight.publishAllowed === false` for `mercadolibre`.

## Hardening delivered in this audit

- **Canary** metadata on the same payload — helps sort SKUs without changing gate semantics.

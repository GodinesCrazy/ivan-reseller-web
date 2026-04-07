# P89 — Fail-closed web publish flow

## Layers

1. **Product status** — `VALIDATED_READY` required (`publishProduct`).  
2. **Preventive prepare** — `prepareProductForSafePublishing` (images + economics + profit floors).  
3. **Price drift guard** — `publishToMercadoLibre` compares `resolveListingPrice` to `productData.preventivePublish.listingSalePriceUsd` when `preventivePublish.marketplace === 'mercadolibre'` (tolerance USD 0.02). Prevents publish after metadata/price skew without re-validation.  
4. **Optional webhook gate** — `ML_WEB_PUBLISH_REQUIRE_ML_WEBHOOK_SECRET` (see env).  
5. **Image gate** — `MercadoLibrePublisher` / `resolveMercadoLibrePublishImageInputs` unchanged (fail-closed).  

## Blocker visibility

- Preflight returns structured `blockers` + `overallState`.  
- Publish errors return `AppError` messages (HTTP 400) for drift, webhook, prepare failures.

## Not changed

- Intelligent Publisher approval queue still front-loads workflow; backend remains authoritative for actual ML create listing.

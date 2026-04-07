# P91 — Controlled web publish check

## Intended web paths

- **Preview / gate:** `ProductPreview` → preflight card; “Publicar” disabled if `publishAllowed === false`.  
- **Queue:** `POST /api/publisher/send_for_approval/:id` → Intelligent Publisher.  
- **Direct API publish:** `POST /api/marketplace/publish` with `productId`, `marketplace: 'mercadolibre'`, `environment`.

## Fail-closed rules (unchanged)

- `VALIDATED_READY`, `prepareProductForSafePublishing`, image `publishSafe`, canonical economics (`runPreventiveEconomicsCore`), optional `ML_WEB_PUBLISH_REQUIRE_ML_WEBHOOK_SECRET`, price snapshot drift on ML publish (`marketplace.service.ts`).

## Execution for candidate 1005009130509159 / gray

**NOT EXECUTED.** No publish attempt was made: no listing id, no ML API response, no timestamp.

## Publish decision (evidence)

| Question | Answer |
|----------|--------|
| Is web publish **allowed** for this candidate right now? | **Unknown / N/A** — no product id under test |
| Exact blocker | **No prepared `Product` + no preflight green proof** |
| Is fail-closed behavior correct to withhold publish? | **Yes** — system requires validated product + economics + images |

## Evidence artifact

None (no HTTP trace, no `listingId`).

# P99 — Controlled real publish (product 32714)

## Scope

- **Product:** 32714 only (Mercado Libre Chile, production credentials).
- **Publish path (same as app/API):** `MarketplaceService.publishProduct` → `publishToMercadoLibre` → `MercadoLibreService.createListing` (POST `/items` on ML API after image pre-upload).

## Pre-publish recheck (runtime)

Executed immediately before publish via `buildMercadoLibrePublishPreflight` in script `backend/scripts/p99-controlled-publish-32714.ts`.

| Check | Result |
| --- | --- |
| `overallState` | `ready_to_publish` |
| `publishAllowed` | `true` |
| `blockers` | `[]` |
| `listingSalePriceUsd` | `12` |
| ML `testConnectionOk` | `true` |
| Images `publishSafe` / `packApproved` | `true` / `true` |

Snapshot fields are captured in `p99-publish-result.json` under `prePublishSnapshot` and `preflightRecheck`.

## Image handling for this run

- **Preflight** resolves the approved pack on disk (`artifacts/ml-image-packs/product-32714/`).
- **Publish** historically read only HTTP(S) URLs from `product.images` (`parseImageUrls`), so local pack paths were dropped and publish failed with “at least one image”.
- **Fix (production-aligned):** `MarketplaceService.prepareImagesForMarketplace` now, for `mercadolibre` only, falls back to `parseMercadoLibreLocalFilesystemImagePaths` when no HTTP URLs parse — matching `MercadoLibreService.uploadImage` local-file support.
- **Script:** Temporarily updates `products.images` to a JSON array of absolute paths to `cover_main.png` and `detail_mount_interface.png`, calls `publishProduct`, then restores original AliExpress URLs in `finally`.

## Gates

- `BLOCK_NEW_PUBLICATIONS`: unset at runtime (`null` in snapshot).
- `ENABLE_ML_PUBLISH`: set to `true` for the script process (same pattern as other controlled ML scripts).

## Payload shape sent to ML (integration)

After pre-upload, `createListing` sends a body shaped like:

- `title`, `category_id`, `price`, `currency_id` (site-derived, MLC → CLP), `available_quantity`, `condition`, `buying_mode`, `description.plain_text`, `pictures: [{ id }...]`, optional `attributes`, `shipping` (MLC default `me2`), `listing_type_id` (tries `gold_special`, then fallbacks).

See `mercadolibre.service.ts` (`createListing`). Picture `id` values come from ML’s picture upload API, not raw URLs.

## Full artifact

Machine-readable run output: **`p99-publish-result.json`** (repo root; written when `cwd` is `backend/`).

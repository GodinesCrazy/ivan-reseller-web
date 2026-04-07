# P99 — Persistence verification (product 32714)

Verified after successful publish using Prisma queries in `p99-controlled-publish-32714.ts` (same DB as production for this run).

## `products` row (32714)

After publish:

| Column | Value |
| --- | --- |
| `id` | `32714` |
| `status` | `PUBLISHED` |
| `isPublished` | `true` |
| `publishedAt` | `2026-03-27T00:09:52.002Z` |
| `images` | Restored to original JSON array of **7** AliExpress HTTPS URLs (script `finally` block) |

No partial state: publish completed; `images` field was not left pointing at local pack paths.

## `marketplace_listings` row (latest for user + product + ML)

| Column | Value |
| --- | --- |
| `id` | `1366` |
| `userId` | `1` |
| `productId` | `32714` |
| `marketplace` | `mercadolibre` |
| `listingId` | `MLC3804135582` |
| `listingUrl` | `https://articulo.mercadolibre.cl/MLC-3804135582-rotating-table-cell-phone-holder-support-desktop-stand-fo-_JM` |
| `status` | `active` |
| `publishedAt` | `2026-03-27T00:09:49.659Z` |

External listing id and permalink are persisted and align with ML GET item and `PublishResult`.

## Raw snapshot

See `p99-publish-result.json` → `persistence`.

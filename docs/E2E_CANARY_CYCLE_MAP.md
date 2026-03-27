# E2E — Canary cycle map (as implemented)

## Intended real canary (Mercado Libre Chile)

1. **Discover / import** a product with clean supplier data (scrape, research, or manual create).
2. **Validate economically** — preventive economics + freight truth (pre-publish validator / preflight).
3. **Image readiness** — ML asset pack / remediation; preflight `images.publishSafe`.
4. **Move to `VALIDATED_READY`** — workflow status required for ML preflight publish gate.
5. **Web preview** — `/products/:id/preview?marketplace=mercadolibre` → read preflight + **canary tier**.
6. **Publish** — from UI: “Publicar” sends to Intelligent Publisher flow, or approved publish path; backend enforces credentials + pre-publish validation on actual publish.
7. **Listing persistence** — `marketplaceListing` row with `listingId`; optional reconciliation workers with Redis.
8. **Third-party purchase** on ML → **webhook** `POST /api/webhooks/mercadolibre`.
9. **`recordSaleFromWebhook`** — resolves listing → product → creates `Order` (status `PAID`), sets `productUrl` from `product.aliexpressUrl`.
10. **`orderFulfillmentService.fulfillOrder`** — capital check → AliExpress purchase → `PURCHASED` → `saleService.createSaleFromOrder` (on success path).
11. **Observation** — `/orders`, notifications, `PendingPurchases`, AliExpress order id on `Order`.

## Code anchors

| Step | Code |
|------|------|
| Preflight | `mercadolibre-publish-preflight.service.ts`, `GET /api/products/:id/publish-preflight` |
| Canary ranking | `e2e-mercadolibre-canary-candidates.service.ts`, `GET /api/products/canary/mlc` |
| Publish API | `marketplace.routes.ts` → `marketplaceService.publishProduct` |
| Pre-publish | `pre-publish-validator.service.ts` → called from publish pipeline |
| Webhook | `webhooks.routes.ts` → `recordSaleFromWebhook` |
| Fulfillment | `order-fulfillment.service.ts` |
| Supplier URL fallback | `marketplaceListing` query `marketplace in ['mercadolibre','ebay']` |

## DB entities

- `Product`, `MarketplaceListing`, `Order`, `Sale`, `ApiCredential`, `User`.

## UI screens

- **Products** — canary table + link to preview.
- **ProductPreview** — ML preflight, canary heuristic, publish CTA.
- **Intelligent Publisher** — approval queue.
- **Orders / Sales** — post-sale state.

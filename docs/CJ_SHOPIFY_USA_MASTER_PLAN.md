# CJ -> Shopify USA - Master Plan

## Current State (updated 2026-04-20)
Closed and confirmed live. These points are not being reopened without new evidence:

- Shopify auth = PASS
- `missingScopes = []`
- required scopes granted live
- readiness = `true`
- webhooks = PASS
- Discover page = REAL
- controlled publish already verified live
- frontend production is working
- `CJ -> Shopify USA` block is visible in production

Operational evidence added on `2026-04-20`:

- A serious live search sweep was executed against production across 10 USA-oriented niche families, pages `1` and `2`, `20` results per page.
- That sweep surfaced `400` raw CJ search results and evaluated `40` candidates from production Discover.
- The deployed production Discover path falsely rejected every evaluated candidate as zero-stock because it trusted stale `variant.stock` from `getProductById()` instead of live stock from `getStockForSkus(cjVid)`.
- The local fix now enriches live stock during:
  - `discover/evaluate`
  - `discover/import-draft`
  - `listings/buildDraft`
  - `listings/publish`
- That fix was deployed to Railway production on `2026-04-20` in commit `93f9777`.
- Production was revalidated after deploy:
  - `GET /discover/search?keyword=travel pillow&page=1&pageSize=10` returned `10` results
  - `POST /discover/evaluate` for `479E2C57-73CA-4F63-B77E-6ABC5B2F32D5` returned `APPROVED`
  - production now exposes `5` eligible variants for that product, led by stock `14432`
- After applying that stock-truth fix locally against the same real DB and real CJ credentials, the first stock-backed commercial flow was completed:
  - CJ product: `479E2C57-73CA-4F63-B77E-6ABC5B2F32D5`
  - title: `Neck Pillow Travel Pillow`
  - selected SKU: `CJJJJFZT00492-Pink`
  - selected variant stock: `14432`
  - shipping: `$6.11`, `USPS+VIP`, `7` days, origin `US`
  - Shopify product: `gid://shopify/Product/9145755435220`
  - Shopify handle: `neck-pillow-travel-pillow-cjjjjfzt00492-pink`
- The product exists correctly in Shopify, but buyer-facing PDP access is still blocked by the Shopify storefront password page.

See `docs/CJ_SHOPIFY_USA_LIVE_PRODUCT_VALIDATION.md` for the full evidence trail.

## Architecture Decisions

### Secrets vs DB
- Env / secret manager only
  - `SHOPIFY_CLIENT_ID`
  - `SHOPIFY_CLIENT_SECRET`
- DB metadata only
  - `shopifyStoreUrl`
  - `shopifyLocationId`
  - pricing / margin / operational settings
- Not used anymore for auth
  - `shopifyAccessToken` remains legacy schema only

### Shopify Auth Model
- Auth mode: `client_credentials`
- Token lifetime: short-lived and refreshed by repeating the exchange
- Token storage: in-memory cache only
- API surface used by the backend: Shopify GraphQL Admin API

## What Is Implemented

### Backend foundations
- Typed env support for Shopify + module flags
- `cjShopifyUsaAdminService` for auth, publication, inventory sync, webhooks, orders, fulfillment, and tracking
- Honest readiness checks for module flag, DB, CJ credentials, Shopify auth, scopes, currency, locations, publications, and webhook automation

### Operator surfaces
- Overview, Discover, Products, Listings, Orders, Alerts, Profit, and Logs pages are real
- Discover pipeline is live end-to-end from search to draft creation
- Shopify publish flow is real and writes active products into Shopify
- Order sync endpoint is live and was rechecked after the controlled publish

### Discover stock-truth model
- Search remains a live CJ catalog search
- Evaluate/import now refresh stock with `getStockForSkus(cjVid[])` before selecting an eligible variant
- Draft/publish refresh stock again immediately before quantity validation and Shopify publish
- This removes the false-negative stock behavior seen in the deployed production Discover path

## Primary Blockers Now

1. `Storefront password gate` 🔒 **CONFIRMADO ACTIVO**
   - **Estado:** El password gate está ACTIVO y bloqueando acceso público
   - **Evidencia:** URL final redirige a `/password` con marcadores "Opening soon"
   - **Producto afectado:** `neck-pillow-travel-pillow-cjjjjfzt00492-pink`
   - **Impacto:** PDP no es buyer-facing, checkout bloqueado
   - **Solución:** Acción manual requerida en Shopify Admin (Online Store > Preferences)
   - **Referencia:** Ver `docs/CJ_SHOPIFY_USA_BUYER_FLOW_VALIDATION.md` para procedimiento completo

2. `Controlled order validation`
   Order ingestion, tracking, and fulfillment cannot be validated as a buyer flow until public PDP / checkout access is available.
   - **Preparación:** Completa (producto publicado, webhooks activos, endpoint sync listo)
   - **Bloqueo:** Esperando levantamiento del password gate

## Next Correct Steps

### Inmediato (P0 - Bloqueante)
1. **Lift storefront password gate** - Acción manual requerida
   ```
   1. Acceder https://ivanreseller-2.myshopify.com/admin
   2. Online Store > Preferences
   3. Desmarcar "Enable password"
   4. Guardar
   ```
   Alternativa CLI: `shopify store:disable-password --store=ivanreseller-2.myshopify.com`

### Post-Gate (P1 - Preparado)
2. Place one controlled order against the published product and verify:
   - Shopify order visibility
   - webhook / manual sync ingestion
   - tracking / fulfillment propagation
3. Capture the first real profit snapshot after the order exists.

### Buyer Flow Verification Endpoint
```
GET /api/cj-shopify-usa/storefront-status?productHandle=neck-pillow-travel-pillow-cjjjjfzt00492-pink
```
Ver documentación completa en: `docs/CJ_SHOPIFY_USA_BUYER_FLOW_VALIDATION.md`

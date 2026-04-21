# CJ -> Shopify USA - Live Product Validation

**Validation date:** 2026-04-20

## Scope

This validation intentionally did **not** reopen already closed Shopify setup questions. The following remained confirmed and were treated as settled unless new evidence appeared:

- Shopify auth = PASS
- `missingScopes = []`
- required scopes granted live
- readiness = `true`
- webhooks = PASS
- Discover page = REAL
- controlled publish already verified live
- frontend production working

## Evidence sources

- `backend/cj-shopify-usa-live-validation-results.json`
- `backend/cj-shopify-usa-hybrid-run-result.json`
- live backend responses from production
- local fixed-service candidate scan against real CJ credentials and the same real DB

## Phase 1 - Broad live search

The required keyword-family sweep was executed against production with:

- pages: `1` and `2`
- page size: `20`
- destination postal code: `10001`
- max evaluations per keyword: `4`

### Keyword matrix

| Keyword family | Page 1 | Page 2 |
|---------------|-------:|-------:|
| `phone accessories` | `20` | `20` |
| `home organization` | `20` | `20` |
| `kitchen gadgets` | `20` | `20` |
| `beauty tools` | `20` | `20` |
| `pet accessories` | `20` | `20` |
| `fitness accessories` | `20` | `20` |
| `office accessories` | `20` | `20` |
| `car accessories` | `20` | `20` |
| `led gadgets` | `20` | `20` |
| `travel accessories` | `20` | `20` |

Broad-search totals:

- raw CJ results surfaced: `400`
- candidates evaluated from the production Discover path: `40`
- viable candidates selected by deployed production Discover: `0`

That `0` result was investigated and is **not** accepted as a market conclusion.

## Phase 1.1 - What got discarded and why

Sample real discards from the production Discover run:

| Keyword | Product | Why discarded |
|--------|---------|---------------|
| `phone accessories` | `U Mobile Phone Clip Hose Bracket Mobile Phone Accessories` | `Evaluate found no variant with stock >= 1` |
| `phone accessories` | `Car accessories car phone navigation bracket` | `Evaluate found no variant with stock >= 1` |
| `home organization` | `Home Storage Organization Pendant Durable Practical` | `Evaluate found no variant with stock >= 1` |
| `home organization` | `Oxford Cloth Foldable Storage Box For Home Clothes Organization` | `Evaluate found no variant with stock >= 1` |
| `kitchen gadgets` | `Wine Aerator Kitchen Gadgets` | `Evaluate found no variant with stock >= 1` |
| `kitchen gadgets` | `Kitchen gadgets garlic peeler` | `Evaluate found no variant with stock >= 1` |
| `led gadgets` | one evaluated candidate | `CJ freightCalculate returned no shipping options (empty data array)` |
| `travel accessories` | top evaluated candidates in the sweep | `Evaluate found no variant with stock >= 1` |

Observed pattern:

- the search side was returning many products
- the evaluate side was collapsing into stock `0`
- the rejection pattern was too uniform to be a real market signal

## Root cause found

The deployed production `CJ -> Shopify USA` Discover flow was using stale stock from `adapter.getProductById()`.

Exact issue:

- `discover/evaluate` selected variants from `detail.variants[].stock`
- `discover/import-draft` persisted `stockLastKnown` from that same stale source
- `buildDraft` / `publishListing` depended on `stockLastKnown`

Real fix applied locally:

- refresh stock with `adapter.getStockForSkus(cjVid[])`
- use the refreshed stock in evaluate, import-draft, draft validation, and publish validation

Deployment outcome:

- pushed to `main`
- Railway backend deploy succeeded on `2026-04-20`
- backend commit: `93f9777`

Conclusion:

- broad search was real
- the prior zero-stock conclusion was false
- the true blocker was stock-source quality, not lack of CJ candidates for USA

## Phase 1.2 - Fixed-service candidate scan

After switching to live stock truth, targeted keyword scans produced multiple approved candidates immediately.

### Approved candidates found

| Keyword | Candidate | Top stock | Shipping | Suggested sell |
|--------|-----------|----------:|----------|----------------|
| `travel pillow` | `Neck Pillow Travel Pillow` | `14432` | `$6.11`, `USPS+VIP`, `US`, `7d` | `$14.84` |
| `travel pillow` | `Travel pillow inflatable pillow` | `13503` | `$4.85`, `USPS+VIP`, `US`, `7d` | `$7.12` |
| `travel pillow` | `Travel U-shaped pillow eye protection neck pillow cervical pillow neck pillow travel portable pillow` | `14343` | `$7.43`, `USPS+VIP`, `US`, `7d` | `$16.36` |
| `car phone holder` | `Car Phone Holder Car Holder Air Outlet Phone Holder` | `40000` | `$7.64`, `USPS+VIP`, `US`, `7d` | `$22.54` |
| `car phone holder` | `Car Phone Holder Car Car Mount For Phone Navigation Holder` | `7888` | `$5.76`, `USPS+VIP`, `US`, `7d` | `$9.80` |
| `drawer organizer` | `Drawer organizer` | `14261` | `$5.03`, `USPS+VIP`, `US`, `7d` | `$7.45` |
| `facial roller` | `Ice Roller Massager Facial Ice Head Roller Massage` | `14761` | `$5.88`, `USPS+VIP`, `US`, `7d` | `$9.13` |
| `dog leash` | `Dog leash dog leash pet leash` | `14808` | `$5.88`, `USPS+VIP`, `US`, `7d` | `$8.32` |
| `resistance bands` | `Fabric Resistance Bands` | `33334` | `$9.41`, `USPS+VIP`, `US`, `7d` | `$19.20` |

## Product chosen for the controlled flow

Chosen product:

- title: `Neck Pillow Travel Pillow`
- CJ product ID: `479E2C57-73CA-4F63-B77E-6ABC5B2F32D5`
- selected variant:
  - `cjVid = EA821FE6-E766-4F1E-9A50-04D7FBB313B7`
  - `cjSku = CJJJJFZT00492-Pink`
  - stock `14432`

Why this one was chosen:

- multiple variants with strong stock, not just one fragile SKU
- `US` fulfillment origin
- known shipping method and delivery window
- mid-range sell price more usable for a first controlled Shopify test than ultra-cheap novelty items
- cleaner candidate to survive `Discover -> Evaluate -> Draft -> Publish`

Additional top live variant stocks:

- `CJJJJFZT00492-Black` = `12654`
- `CJJJJFZT00492-Gery` = `11702`
- `CJJJJFZT00492-Green` = `11638`
- `CJJJJFZT00492-Navy` = `11059`

## Phase 2 - Controlled full flow

### 1. Discover

Search and candidate selection succeeded with live-stock-aware evaluation.

### 2. Evaluate

Result:

- decision: `APPROVED`
- supplier cost: `$5.40`
- shipping cost: `$6.11`
- total cost: `$11.51`
- suggested sell price: `$14.84`
- shipping method: `USPS+VIP`
- estimated days: `7`
- fulfillment origin: `US`

### 3. Import Draft

Result:

- `dbProductId = 5`
- `listing.id = 3`
- `status = DRAFT`
- `listedPriceUsd = 14.62`
- `shopifySku = CJJJJFZT00492-Pink`

### 4. Listings check

After draft creation and publish, Listings showed:

- listing `3` = `ACTIVE`
- listing `2` remained `ACTIVE`
- no regression to the already existing Shopify listing

### 5. Publish

Production publish endpoint result:

- `ok = true`
- `shopifyProductId = gid://shopify/Product/9145755435220`
- `shopifyVariantId = gid://shopify/ProductVariant/47823252390100`
- `shopifyHandle = neck-pillow-travel-pillow-cjjjjfzt00492-pink`
- `publishedAt = 2026-04-20T18:11:49.218Z`

### 6. Shopify evidence

The product exists in Shopify and is attached to an active listing.

Confirmed listing state:

- listing status: `ACTIVE`
- product title: `Neck Pillow Travel Pillow`
- SKU: `CJJJJFZT00492-Pink`
- handle: `neck-pillow-travel-pillow-cjjjjfzt00492-pink`

## Phase 2.1 - Post-deploy production revalidation

After the backend deploy, production was rechecked directly without the hybrid workaround for search/evaluate:

- `GET /discover/search?keyword=travel pillow&page=1&pageSize=10` returned `10` results
- top three production titles:
  - `Neck Pillow Travel Pillow`
  - `Travel pillow inflatable pillow`
  - `Travel U-shaped pillow eye protection neck pillow cervical pillow neck pillow travel portable pillow`
- `POST /discover/evaluate` for `479E2C57-73CA-4F63-B77E-6ABC5B2F32D5` returned:
  - decision `APPROVED`
  - shipping `$6.11`
  - method `USPS+VIP`
  - origin `US`
  - `5` eligible variants
  - top stocks `14432`, `12654`, `11702`, `11638`, `11059`

## Phase 3 - PDP buyer-facing verification

### Verificación Realizada (2026-04-20)

Storefront check result:

- URL checked: `https://ivanreseller-2.myshopify.com/products/neck-pillow-travel-pillow-cjjjjfzt00492-pink`
- HTTP status: `200`
- final URL: `https://ivanreseller-2.myshopify.com/password`
- `passwordGate = true`
- markers found:
  - `/password`
  - `Opening soon`
  - `password`

### Conclusión Exacta

- the Shopify product is published correctly
- the buyer-facing PDP is **not** accessible publicly
- the exact blocker is the Shopify storefront password gate
- **Verificación automatizada:** Script `cj-shopify-usa-buyer-flow-validation.ts` ejecutado
- **Endpoint de verificación:** `GET /api/cj-shopify-usa/storefront-status`

### Evidencia Técnica

```json
{
  "storefrontCheck": {
    "storeDomain": "ivanreseller-2.myshopify.com",
    "storefrontUrl": "https://ivanreseller-2.myshopify.com/products/neck-pillow-travel-pillow-cjjjjfzt00492-pink",
    "status": 200,
    "finalUrl": "https://ivanreseller-2.myshopify.com/password",
    "passwordGate": true,
    "markers": ["/password", "Opening soon", "password"]
  }
}
```

## Phase 4 - Next real blocker

### Bloqueador Actual: Shopify Storefront Password Gate 🔒

**Estado:** ACTIVO y confirmado mediante verificación automatizada

Why this is the main blocker now:

- a real stock-backed CJ product has already been found
- Discover, Evaluate, Import Draft, and Publish have already been completed
- the listing exists in Shopify
- the buyer cannot reach the PDP because the storefront redirects to `/password`
- **password gate NO puede ser levantado vía API** - requiere acción manual

### Acción Requerida para Desbloquear

```
PASO MANUAL OBLIGATORIO:
1. Acceder a: https://ivanreseller-2.myshopify.com/admin
2. Navegar a: Online Store > Preferences
3. En sección "Password protection", desmarcar "Enable password"
4. Guardar cambios

Alternativa (CLI):
shopify store:disable-password --store=ivanreseller-2.myshopify.com
```

### Documentación Completa

Ver: `docs/CJ_SHOPIFY_USA_BUYER_FLOW_VALIDATION.md`

## Phase 5 - Controlled order preparation

### Current Status

- `POST /api/cj-shopify-usa/orders/sync` is live and works
- sync result after publish: `ok = true`, `count = 0`
- no Shopify orders exist yet for this vertical
- **Order de prueba:** Preparada y lista para ejecución post-gate

### Preparación Completada

| Paso | Estado | Detalle |
|------|--------|---------|
| Producto seleccionado | ✅ | Neck Pillow Travel Pillow |
| Stock verificado | ✅ | 14432 unidades |
| Shipping calculado | ✅ | $6.11 USPS+VIP, 7 días |
| Precio de venta | ✅ | $14.84 USD |
| Producto publicado | ✅ | Shopify Product ID: 9145755435220 |
| Webhooks registrados | ✅ | ORDERS_CREATE, APP_UNINSTALLED |
| Order sync endpoint | ✅ | POST /api/cj-shopify-usa/orders/sync |

### What blocks a real buyer-order validation right now:

- the storefront password gate prevents a normal buyer-facing PDP / checkout path
- **NO es un problema técnico del sistema** - es configuración Shopify

### Procedimiento Post-Gate

Therefore:

- a controlled order should be executed only after the password gate is removed or controlled public access is provided
- once that happens, the next exact validation should be:
  1. **Verify storefront public:** Use `GET /api/cj-shopify-usa/storefront-status`
  2. **Place one order:** On the published travel pillow product
  3. **Verify order ingestion:** `POST /api/cj-shopify-usa/orders/sync` or webhook
  4. **Check order in backend:** `GET /api/cj-shopify-usa/orders`
  5. **Verify tracking / fulfillment sync** via CJ integration

## Validation summary

| Componente | Estado | Notas |
|------------|--------|-------|
| readiness live | ✅ PASS | `ready: true` |
| discover live with broad keyword sweep | ✅ PASS | 400 resultados, 40 evaluados |
| evaluate live | ✅ PASS | Después de stock-truth correction |
| import-draft live | ✅ PASS | Funcional |
| listings live | ✅ PASS | Funcional |
| publish live | ✅ PASS | Producto publicado correctamente |
| production Discover/Evaluate after deploy | ✅ PASS | commit `93f9777` |
| Shopify product existence | ✅ PASS | `gid://shopify/Product/9145755435220` |
| **buyer-facing PDP** | 🔒 **BLOCKED** | Password gate activo en `/password` |
| storefront password gate | 🔒 **ACTIVE** | Requiere acción manual en Shopify Admin |
| controlled order | ⏸️ **PENDING** | Esperando levantamiento del gate |
| order ingestion endpoint | ✅ READY | `POST /api/cj-shopify-usa/orders/sync` |
| storefront verification endpoint | ✅ NEW | `GET /api/cj-shopify-usa/storefront-status` |

### Evidencia de bloqueo

- **URL verificada:** `https://ivanreseller-2.myshopify.com/products/neck-pillow-travel-pillow-cjjjjfzt00492-pink`
- **URL final:** `https://ivanreseller-2.myshopify.com/password`
- **Marcadores:** `/password`, `Opening soon`, `password`
- **Status HTTP:** 200 (pero con redirección a password page)

### Referencias

- Documentación buyer flow: `docs/CJ_SHOPIFY_USA_BUYER_FLOW_VALIDATION.md`
- Script de verificación: `backend/scripts/cj-shopify-usa-buyer-flow-validation.ts`
- Endpoint de verificación: `GET /api/cj-shopify-usa/storefront-status`

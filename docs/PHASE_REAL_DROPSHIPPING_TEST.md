# Phase — REAL MercadoLibre Chile E2E dropshipping test (runbook)

**Role:** Autonomous dropshipping QA + profit safety  
**Target:** Mercado Libre **Chile (MLC)** | **Supplier cost &lt; 10 USD** | **Real buyer in Chile**  
**Rules:** No mocks for go/no-go decisions; use **real APIs**; **STOP** on any failed gate.

---

## Current automated preflight (operator)

Run from `backend/`:

```bash
BASE_URL=https://ivan-reseller-backend-production.up.railway.app \
INTERNAL_RUN_SECRET=<secret> \
JWT=<optional_bearer_for_stage_2> \
npm run real-dropshipping:preflight
```

**Publicar en ML Chile vía internal (tras deploy con `capabilities.mlcSearchToPublish`):**

```bash
INTERNAL_RUN_SECRET=<secret> npm run internal:mlc-search-publish:dry   # solo crea + aprueba
INTERNAL_RUN_SECRET=<secret> npm run internal:mlc-search-publish        # publica en ML (real)
```

**Importante:** El handler debe llamar a `publishProduct` con el mismo `marketplace` que el body (`mercadolibre`). Si siempre se forzaba `ebay`, Phase 53 validaba destino/credenciales como eBay y el flujo ML fallaba de forma confusa. **Credenciales AliExpress Dropshipping** están ligadas al **userId**: si el primer usuario activo no es quien hizo OAuth, usa `MLC_USER_ID=<id>` (o `body.userId`).

Si el workflow del usuario está en **sandbox** pero ML/eBay reales están en **production**, el script `internal:mlc-search-publish` envía por defecto `credentialEnvironment: production` (o `MLC_CREDENTIAL_ENV=sandbox` para forzar sandbox). `getCredentials` prueba **ambos** entornos en orden (preferido primero), así las credenciales ML guardadas solo en **sandbox** siguen funcionando aunque el script pida **production**.

**Railway sin credenciales ML en la base de datos:** el backend acepta fallback desde env (como eBay): `MERCADOLIBRE_CLIENT_ID`, `MERCADOLIBRE_CLIENT_SECRET`, **`MERCADOLIBRE_ACCESS_TOKEN`**, **`MERCADOLIBRE_REFRESH_TOKEN`**, `MERCADOLIBRE_SITE_ID=MLC`, `MERCADOLIBRE_REDIRECT_URI`. Los tokens salen del flujo OAuth de Mercado Libre (o del panel de desarrolladores); sin ellos la publicación seguirá fallando aunque exista Client ID/Secret.

**Last run (agent, UTC ~2026-03-20T01:30Z, production URL):**

| Check | Result |
|--------|--------|
| `GET /health` | **200** `status: ok` |
| `GET /api/debug/ping` | **200** |
| `GET /api/debug/db-health` | **200** `db: ok` |
| `POST /api/internal/active-listings-risk-scan` `{dryRun:true}` | **200** `scanned: 0`, all summary zeros |
| `GET /api/system/readiness-report` | **Skipped** (requires JWT) |

**Stage 1 (listings):** DB scan via Phase 54 reports **0 active** `marketplace_listings` — consistent with “clean” for new test.  
**MercadoLibre live catalog:** not verified from this script — confirm in ML seller center (no stray `active` items).

---

## Stage map → system (this repo)

| Stage | Requirement | How in Ivan Reseller |
|-------|-------------|------------------------|
| **1** | Clean state | `POST /api/internal/active-listings-risk-scan` `{dryRun:true}`; ML seller UI; exclude test orders via real-orders filters (`orders-real-filter`, finance exclusions). |
| **2** | System health | `GET /api/system/readiness-report` (**Bearer JWT**). Check `health.database`, `redis`, `bullmq`, `marketplaceApi`, `supplierApi`. |
| **3** | Discovery ≤ $10 | Authenticated flows: `/api/opportunities/*`, product research / `opportunity-finder.service.ts`. Filter **source price ≤ 10 USD**, prefer simple SKU set, **ship_to CL** in Affiliate/DS params where applicable. |
| **4** | Supplier validation | **AliExpress Dropshipping** `getProductInfo(productId, { localCountry: 'CL', ... })` (`aliexpress-dropshipping-api.service.ts`). Require **stock**, **SKU**, **shipping methods** to Chile. |
| **5** | Full cost + ≥20% margin | `cost-calculator.service.ts` / `computeProfitAfterFees` in `pre-publish-validator.service.ts`. Set **`PRE_PUBLISH_MIN_MARGIN_RATIO=0.2`** for ≥20% net margin / sale. |
| **6** | Pre-publish | `evaluatePrePublishValidation` → **`SAFE` only** for strict test: set **`PRE_PUBLISH_REJECT_RISKY=true`** + **`PRE_PUBLISH_SHIPPING_FALLBACK=false`** on Railway so **RISKY/UNSHIPPABLE/UNPROFITABLE/CONFIG** block publish (`assertProductValidForPublishing` in `marketplace.service.ts`). |
| **7** | Create listing | `POST /api/products/:id/publish` or Marketplace flow with `marketplace: mercadolibre`, **MLC** credentials (`MERCADOLIBRE_SITE_ID=MLC`). Store `aliexpressSku`, `aliexpressUrl`, shipping in product + `MarketplaceListing`. |
| **8** | Verify listing | ML API / `MercadoLibreService` + DB `marketplace_listings`; optional `POST /api/publisher/listings/run-reconciliation-audit` (JWT). |
| **9** | Wait for purchase | Human buys; **`syncMercadoLibreOrdersForUser`** / webhooks create **`Order`**. |
| **10** | Order validation | `GET /api/orders` (JWT); compare to ML order detail (id, buyer, Chile address, total). |
| **11** | Auto fulfillment | `order-fulfillment.service.ts` → `placeOrder` (`aliexpress-dropshipping-api.service.ts`) with **CL** address + validated **SKU**. |
| **12** | Failures | `SKU_NOT_EXIST` / stock → `aliexpress-alternative-product.service.ts` or Phase 48 **smart-supplier** on manual path; funds → `MANUAL_ACTION_REQUIRED`; retries in DS client. |
| **13** | Success | `Order.status` **PURCHASED**, `aliexpressOrderId` set. |
| **14** | Tracking | Fulfillment tracking sync services; verify carrier + Chile destination. |
| **15** | Profit | `GET /api/finance/real-profit?days=30` (JWT); confirm line not negative after real fees. |
| **16** | This report | Fill tables below during the run. |

---

## Railway env (strict E2E — recommended for this test)

```env
MERCADOLIBRE_SITE_ID=MLC
PRE_PUBLISH_REJECT_RISKY=true
PRE_PUBLISH_SHIPPING_FALLBACK=false
PRE_PUBLISH_MIN_MARGIN_RATIO=0.2
PRE_PUBLISH_MIN_NET_PROFIT=0.01
BLOCK_NEW_PUBLICATIONS=false
```

*If `PRE_PUBLISH_SHIPPING_FALLBACK=false` and AliExpress returns no shipping line costs, publish will fail until API returns methods — intentional for “real shipping” safety.*

---

## Execution log (fill during test)

### Product selected

| Field | Value |
|--------|--------|
| AliExpress URL / productId | |
| Chosen SKU | |
| Supplier unit (USD) | |
| Shipping (source) | API / fallback |

### Cost breakdown

| Line | USD (or CLP) |
|------|----------------|
| Product | |
| Shipping | |
| ML fee | |
| Payment fee | |
| Tax | |
| **Sale price** | |
| **Net profit** | |
| **Margin %** | |

### Listing

| Field | Value |
|--------|--------|
| MarketplaceListing id | |
| ML item id / URL | |
| Price listed | |

### Order

| Field | Value |
|--------|--------|
| Order id (internal) | |
| ML order id | |
| Buyer / address | |
| Fulfillment status | |

### Final

| Question | Answer |
|----------|--------|
| Profitable after real fees? | |
| Shipped to correct CL address? | |
| **SYSTEM READY?** | YES / NO |

---

## STOP conditions (failure = not production-ready)

- Wrong shipping country vs buyer
- No stock at `placeOrder`
- Cost model wrong → negative real profit
- Order not fulfilled or stuck without escalation

---

## Final verdict template

- **SYSTEM_STATUS:** `SAFE_TO_OPERATE` | `NOT_SAFE`  
- **Evidence:** link to ML listing, internal order id, finance export, tracking id.

---

*Generated as part of real E2E test planning; preflight section updated from live production checks where noted.*

---

## Ejecución directa (agente, producción Railway, 2026-03-20)

1. **Deploy** `6472442`: `GET /api/internal/health` incluye `capabilities.mlcSearchToPublish: true`.
2. **Dry run** `POST .../test-full-cycle-search-to-publish` con `marketplace: mercadolibre`, `maxPriceUsd: 10`, `dryRun: true` → **200**, `productId: 32676`, `marketplace: mercadolibre`.
3. **Publicación real** mismo endpoint `dryRun: false` → **500**, `productId: 32677`, error Phase 53:
   - `Product not valid for publishing: AliExpress Dropshipping API is not connected; cannot validate supplier`

**Conclusión:** el pipeline hasta producto aprobado funciona; **no se publicó en ML** hasta conectar **AliExpress Dropshipping** (credenciales del **mismo `userId`** que publica, o fija `MLC_USER_ID` en el script).

**Siguiente paso operativo:** en la app / Railway, completar OAuth **aliexpress-dropshipping** para el usuario reseller; re-ejecutar:

`INTERNAL_RUN_SECRET=... npm run internal:mlc-search-publish`

(Opcional: `MLC_USER_ID=1` si el usuario con token no es el `findFirst` activo.)

Productos **32676** y **32677** quedaron creados en BD (32676 solo dry run, 32677 falló al publicar): revisar en admin si conviene archivar/eliminar.

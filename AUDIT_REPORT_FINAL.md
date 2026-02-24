# AUDIT REPORT ? IVAN RESELLER (FINAL)

**Fecha:** 2026-02-22  
**Alcance:** backend, frontend, scripts, prisma, config, vercel, railway  
**Restricción:** NO romper nada existente

---

## ESTADO DE CADA COMPONENTE

| Componente | Estado | Evidencia técnica |
|------------|--------|-------------------|
| **AliExpress Affiliate API** | WORKING | `aliexpress-affiliate-api.service.ts`: app_key/app_secret, HMAC-SHA256, searchProducts, getProductDetails |
| **AliExpress OAuth** | WORKING | `aliexpress-oauth.service.ts`, `aliexpress-signature.service.ts` (token/create SHA256); callback en `/aliexpress/callback` |
| **AliExpress Dropshipping OAuth** | WORKING | `aliexpress-dropshipping-api.service.ts`, `marketplace-oauth.routes.ts` (callback directo), CredentialsManager |
| **eBay OAuth** | WORKING | `marketplace-oauth.routes.ts`: authorize/ebay, oauth/start/ebay, oauth/callback/:marketplace (ebay) con exchangeCodeForToken |
| **eBay Token Storage** | WORKING | `marketplaceService.saveCredentials()` ? ApiCredential (api_credentials) con token, refreshToken, expiresAt en JSON credentials |
| **eBay Publication** | WORKING | `ebay.service.ts`: createInventoryItem, createListing (offer + publish), Authorization Bearer; `marketplace.service.ts` updateProductMarketplaceInfo ? MarketplaceListing |
| **PayPal** | WORKING | `paypal-checkout.service.ts` (createOrder, captureOrder), `paypal-payout.service.ts` (sendPayout); PAYPAL_CLIENT_ID/SECRET |
| **Payoneer** | PARTIAL | `User.payoneerPayoutEmail` existe; NO hay payoneer.service.ts, PayoneerAccount, receivePayment/withdrawFunds/getBalance |
| **Autopilot Engine** | WORKING | `autopilot.service.ts`: start(), runSingleCycle(), scheduleNextCycle(), searchOpportunities, processOpportunities, publishToMarketplace |
| **Scheduler** | WORKING | scheduleNextCycle() con setTimeout, cycleIntervalMinutes, backoff en fallos; autopilot-init.ts carga config y llama start() si enabled |
| **Opportunity Finder** | WORKING | `opportunity-finder.service.ts`: searchOpportunities, Affiliate API + fallback scraping |
| **Publication Engine** | WORKING | `marketplace.service.ts` publishToMultipleMarketplaces ? EbayService.createListing; guarda en MarketplaceListing |
| **Purchase Engine** | WORKING | `purchase-retry.service.ts` attemptPurchase; `order-fulfillment.service.ts` fulfillOrder ? attemptPurchase ? PURCHASED ? createSaleFromOrder |
| **Order Tracking** | WORKING | Order (status CREATED?PAID?PURCHASING?PURCHASED), PurchaseLog, Sale.trackingNumber |
| **Finance Engine** | WORKING | `sale.service.ts` createSale, createSaleFromOrder, sendPayout (admin+user); Commission, PlatformConfig |
| **CredentialsManager** | WORKING | `credentials-manager.service.ts`: getCredentials (DB + env fallback), saveCredentials, api_credentials |
| **MarketplaceService** | WORKING | getCredentials, getEbayOAuthStartUrl, publishProduct, publishToMultipleMarketplaces, updateProductMarketplaceInfo |
| **Database Models** | WORKING | Prisma: User, Product, Sale, Order, ApiCredential, MarketplaceListing, MarketplacePublication, Opportunity, PurchaseLog, etc. |
| **Frontend Opportunities** | WORKING | `Opportunities.tsx`: api.get('/api/opportunities/search'), aliexpressUrl, images, profitMargin, roiPercentage |
| **Frontend Products** | WORKING | `Products.tsx`: api.get('/api/products'), imageUrl, status, marketplaceUrl |
| **Frontend Autopilot** | WORKING | `Autopilot.tsx`: api /api/autopilot/status, start, stop, run-cycle |
| **Frontend FinanceDashboard** | WORKING | `FinanceDashboard.tsx` existente |

---

## FASES VALIDADAS

### FASE 2 ? OAuth eBay

- **STEP 1:** GET /api/marketplace-oauth/authorize/ebay ? `https://auth.ebay.com/oauth2/authorize` con client_id, redirect_uri, response_type=code, scope
- **STEP 2:** Callback recibe code en `/api/marketplace-oauth/oauth/callback/ebay`
- **STEP 3:** `ebay.exchangeCodeForToken(code, redirectUri)` ? POST https://api.ebay.com/identity/v1/oauth2/token
- **STEP 4:** `marketplaceService.saveCredentials(userId, 'ebay', newCreds, environment)` ? api_credentials (credentials JSON: token, refreshToken, expiresAt)
- **STEP 5:** Autopilot usa `marketplaceService.getCredentials()` ? EbayService con token

**Resultado:** COMPLETO

### FASE 3 ? Publicación eBay real

- `EbayService` usa `Authorization: Bearer ${credentials.token}` (interceptor)
- PUT /sell/inventory/v1/inventory_item/{sku}
- POST /sell/inventory/v1/inventory_item/{sku}/offer
- POST /sell/inventory/v1/offer/{offerId}/publish
- `updateProductMarketplaceInfo()` ? MarketplaceListing (listingId, listingUrl, publishedAt)
- Product: status=PUBLISHED, isPublished=true vía productService.updateProductStatusSafely

**Resultado:** COMPLETO

### FASE 4 ? Autopilot

- `start(userId)` activa scheduler
- `scheduleNextCycle()` ? setTimeout ? runSingleCycle()
- runSingleCycle: searchOpportunities ? filterAffordable ? processOpportunities ? publishToMarketplace
- Persistencia: SystemConfig (autopilot_config, autopilot_stats)
- Logs: AutopilotCycleLog, eventos cycle:started, cycle:completed

**Resultado:** COMPLETO

### FASE 5 ? Ciclo post-venta

- Orden eBay: flujo actual es PayPal Checkout ? capture-order ? Order PAID ? fulfillOrder
- eBay Fulfillment API para detectar ventas: NO implementado explícitamente; el flujo es checkout propio (PayPal)
- fulfillOrder: PAID ? PURCHASING ? attemptPurchase (AliExpress) ? PURCHASED ? createSaleFromOrder
- createSaleFromOrder crea Sale, commission, sendPayout
- Sale: buyerEmail, buyerName, shippingAddress (de Order)
- trackingNumber en Sale

**Nota:** Detección de ventas en eBay vía webhooks/API no está implementada. El flujo actual es: cliente paga vía checkout propio (PayPal) ? Order ? fulfillment. Para ventas directas en eBay, haría falta webhook/API de eBay Orders.

**Resultado:** PARTIAL (checkout propio OK; webhook eBay orders MISSING)

---

## ELEMENTOS FALTANTES

| Elemento | Estado |
|----------|--------|
| Payoneer API (receivePayment, withdrawFunds, getBalance) | PARTIAL (payoneer.service.ts stub; env PAYONEER_* required) |
| PayoneerAccount model | ADDED (prisma migration 20250221000000_add_payoneer_account) |
| eBay Orders webhook / detección ventas eBay | MISSING |
| FinanceTransaction model | NO existe (no requerido por schema actual) |

---

## ARCHIVOS CLAVE REVISADOS

- `backend/src/api/routes/marketplace-oauth.routes.ts`
- `backend/src/services/ebay.service.ts`
- `backend/src/services/marketplace.service.ts`
- `backend/src/services/autopilot.service.ts`
- `backend/src/services/credentials-manager.service.ts`
- `backend/src/services/order-fulfillment.service.ts`
- `backend/src/services/sale.service.ts`
- `backend/prisma/schema.prisma`
- `frontend/src/pages/Opportunities.tsx`, `Products.tsx`, `Autopilot.tsx`
- `vercel.json`, `backend/railway.json`

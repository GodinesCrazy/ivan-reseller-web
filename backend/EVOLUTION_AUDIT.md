# Ivan Reseller ? Evolution System Audit

## 1. Where Pricing is Calculated

| Location | File | Description |
|----------|------|-------------|
| Cost breakdown | `src/services/cost-calculator.service.ts` | `calculate()`, `calculateAdvanced()` ? marketplaceFee, paymentFee, shippingCost, importTax, totalCost, netProfit, margin |
| Profit guard | `src/services/profit-guard.service.ts` | `checkProfitGuard()` ? sellingPriceUsd vs supplierPriceUsd + platformFees + paypalFees + tax + shipping |
| Opportunity pricing | `src/services/opportunity-finder.service.ts` | Uses costCalculator.calculate() for suggestedPriceUsd, profitMargin, roiPercentage |
| Product model | `prisma/schema.prisma` | Product: aliexpressPrice, suggestedPrice, finalPrice, shippingCost, importTax, totalCost |
| Pricing tiers | `src/services/pricing-tiers.service.ts` | Tier-based pricing logic |
| Competitor analysis | `src/services/competitor-analyzer.service.ts` | competitivePrice from eBay/Amazon/MercadoLibre listings |
| Profitability module | `src/modules/profitability/profitability.service.ts` | Profitability calculations |

## 2. Where Supplier Purchase Happens

| Location | File | Description |
|----------|------|-------------|
| Order fulfillment | `src/services/order-fulfillment.service.ts` | `fulfillOrder()` ? calls aliexpressCheckoutService.placeOrder() |
| AliExpress checkout | `src/services/aliexpress-checkout.service.ts` | `placeOrder()` ? AliExpressAutoPurchaseService (browser) or stub |
| Auto purchase | `src/services/aliexpress-auto-purchase.service.ts` | Puppeteer-based purchase flow |
| Dropshipping API | `src/services/aliexpress-dropshipping-api.service.ts` | API-based order creation (aliexpress.dropshipping.order.create) |
| PayPal capture | `src/api/routes/paypal.routes.ts` | `/capture-order` ? creates Order, calls orderFulfillmentService.fulfillOrder() |
| Internal test | `src/api/handlers/test-full-dropshipping-cycle.handler.ts` | Full cycle including sale ? paypalCapture ? aliexpressPurchase |

## 3. Where Credentials/Accounts are Stored

| Location | File | Description |
|----------|------|-------------|
| API credentials | `prisma/schema.prisma` | ApiCredential model (userId, apiName, environment, credentials JSON) |
| Credentials manager | `src/services/credentials-manager.service.ts` | getCredentials(), saveCredentials() ? encrypted storage |
| AliExpress token | `src/services/aliexpress-token.store.ts` | In-memory + file: accessToken, refreshToken, expiresAt |
| AliExpress token DB | `prisma/schema.prisma` | AliExpressToken model (global) |
| Marketplace auth | `src/services/marketplace-auth-status.service.ts` | MarketplaceAuthStatus per user/marketplace |
| Env fallback | Various | ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, EBAY_*, PAYPAL_*, etc. |

## 4. Where Autopilot Loop Runs

| Location | File | Description |
|----------|------|-------------|
| Main cycle | `src/services/autopilot.service.ts` | `runSingleCycle()` ? selectQuery ? searchOpportunities ? filterAffordable ? processOpportunities |
| Start/schedule | `src/services/autopilot.service.ts` | `start(userId)` ? runSingleCycle, scheduleNextCycle() |
| Search | `src/services/autopilot.service.ts` | `searchOpportunities()` ? calls opportunityFinder |
| Process | `src/services/autopilot.service.ts` | `processOpportunities()` ? publish, approval flow |
| Cycle log | `src/services/autopilot-cycle-log.service.ts` | Logs cycle results |
| Init | `src/autopilot-init.ts` | Autopilot startup |
| Routes | `src/api/routes/autopilot.routes.ts` | REST API for autopilot control |

## 5. Where Opportunity Scoring Happens

| Location | File | Description |
|----------|------|-------------|
| Confidence score | `src/services/opportunity-finder.service.ts` | confidenceScore, competitionLevel, marketDemand in OpportunityItem |
| ROI/margin | `src/services/opportunity-finder.service.ts` | profitMargin, roiPercentage from costCalculator |
| Competitor analysis | `src/services/competitor-analyzer.service.ts` | competitivePrice, listingsFound ? feeds opportunity pricing |
| Filter affordable | `src/services/autopilot.service.ts` | `filterAffordableOpportunities()` ? minProfitUsd, minRoiPct |
| Select optimal query | `src/services/autopilot.service.ts` | `selectOptimalQuery()` ? category performance |
| AI learning | `src/services/ai-learning.service.ts` | Learning from operations |
| Publication optimizer | `src/services/publication-optimizer.service.ts` | Category performance tracking |

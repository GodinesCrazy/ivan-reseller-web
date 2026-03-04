# Database Audit ? Ivan Reseller

**Purpose:** Verify Prisma schema models and whether the system stores published products, sales, profits, and winning products.

---

## 1. Models Present in Schema

| Model | Purpose |
|-------|---------|
| **User** | Users: balance, totalEarnings, totalSales, paypalPayoneer emails, onboarding, marketplace flags (ebayConnected, etc.). |
| **Product** | Catalog: aliexpressUrl, title, prices (aliexpressPrice, suggestedPrice, finalPrice), shippingCost, importTax, totalCost, targetCountry, status, isPublished, approvalId. |
| **Opportunity** | Business opportunities: costUsd, suggestedPriceUsd, profitMargin, roiPercentage, confidenceScore, status (PENDING/APPROVED/REJECTED/PUBLISHED), targetMarketplaces (JSON). |
| **Sale** | Sales: orderId, marketplace, salePrice, aliexpressCost, marketplaceFee, grossProfit, commissionAmount, netProfit, currency, status, trackingNumber, isCompleteCycle, payout ids. |
| **ApiCredential** | Marketplace/API credentials: userId, apiName (ebay, mercadolibre, amazon, paypal, aliexpress-dropshipping, etc.), environment, credentials (encrypted JSON), scope. |
| **UserWorkflowConfig** | Per-user workflow: environment, workflowMode, stage modes (scrape, analyze, publish, purchase, fulfillment, customerService), autoApproveThreshold, workingCapital, minProfitUsd, minRoiPct. |
| **UserSettings** | Per-user UI settings: language, timezone, dateFormat, currencyFormat, theme. |
| **AutopilotWorkflow** | Custom autopilot workflows: userId, name, type (search, analyze, publish, reprice, custom), schedule (cron), conditions/actions (JSON), lastRun, nextRun, runCount, logs. |
| **AutopilotCycleLog** | Per-cycle logs: userId, cycleId, stage, success, message, opportunitiesFound/Processed, productsPublished/Approved, capitalUsed, errors, metadata, durationMs. |
| **SystemConfig** | Key-value: e.g. autopilot_config, autopilot_stats, category_performance, autopilot_global_pause, listing_lifetime_optimizer. |
| **MarketplaceListing** | Published listings: productId, userId, marketplace, listingId, listingUrl, sku, publishedAt. |
| **MarketplacePublication** | Publication history: productId, userId, marketplace, listingId, publishStatus, publishMode, rawResponse. |
| **Commission** | User commission per sale: userId, saleId, amount, status (PENDING/SCHEDULED/PAID/FAILED). |
| **AdminCommission** | Admin commission from user sales. |
| **SuccessfulOperation** | Completed cycles: userId, productId, saleId, totalProfit, expectedProfit, profitAccuracy, hadReturns, etc. |
| **Order** | Checkout orders: userId, productId, title, price, customerName, shippingAddress, status (CREATED/PAID/PURCHASING/PURCHASED/FAILED), paypalOrderId, aliexpressOrderId. |
| **PurchaseLog** | Purchase attempts: userId, saleId, orderId, productId, supplierUrl, purchaseAmount, status, supplierOrderId, trackingNumber. |
| **DynamicPriceHistory** | Repricing history: productId, oldPrice, newPrice, reason. |
| **DynamicPriceLog** | Extended price log: productId, orderId, previousPriceUsd, newPriceUsd, costUsd, competitorMin/Avg, reason. |
| **ProductPerformance** | Views, clicks, conversions, revenue by product (optional analytics). |
| **LearningScore** | Learning engine: userId, category, priceRange, conversionRate, avgProfit, learningScore. |
| **PlatformConfig** | Platform-wide commission and admin PayPal. |
| **AccessRequest** | Registration/access requests. |
| **MeetingRoom** | Meeting rooms. |
| **ReportHistory, ScheduledReport** | Reports. |
| **RefreshToken, PasswordResetToken** | Auth. |
| **APIStatusHistory, APIStatusSnapshot** | API health. |
| **MarketplaceAuthStatus** | Per-user marketplace auth status. |
| **ManualAuthSession** | Manual auth (e.g. captcha). |
| **CompetitionSnapshot** | Competition data per opportunity. |
| **AISuggestion** | AI suggestions. |
| **AccountCluster, MarketplaceAccount, PayPalAccount, AliExpressAccount** | Account clustering. |
| **AliExpressToken** | AliExpress Affiliate token (global). |
| **PayoneerAccount** | Payoneer API account. |

There is **no** dedicated model named **MarketplaceCredential** (credentials are in **ApiCredential**). **AutopilotStats** is not a table; stats are stored in **SystemConfig** (`autopilot_stats`). There is **no** **PricingRules** or **UserConfig** table (config is in UserWorkflowConfig, UserSettings, SystemConfig).

---

## 2. Stored Data Verification

| Data | Stored? | Where |
|------|--------|--------|
| **Productos publicados** | Yes | **MarketplaceListing** (productId, userId, marketplace, listingId, publishedAt); **MarketplacePublication** (history). **Product** has isPublished, publishedAt, approvalId. |
| **Ventas** | Yes | **Sale**: orderId, marketplace, salePrice, aliexpressCost, grossProfit, netProfit, status, trackingNumber. |
| **Ganancias** | Yes | **Sale.grossProfit**, **Sale.netProfit**, **Commission.amount**, **AdminCommission.amount**, **SuccessfulOperation.totalProfit**. **User.totalEarnings**, **User.balance**. |
| **Productos ganadores** | Derived, not a table | No **WinningProduct** table. ?Winning? is computed in **product-performance.engine** from **Sale** + **Product** (winningScore, shouldRepeatWinner). Results are not persisted as a dedicated entity; they could be cached or recomputed. |

---

## 3. Models Missing (Optional for Production)

- **PricingRules** ? Not present. Pricing rules (e.g. min margin, repricing rules) could live in SystemConfig or a new table if needed.
- **UserConfig** ? Not a single table; split across **UserWorkflowConfig**, **UserSettings**, and SystemConfig (autopilot_config). A dedicated **AutopilotUserConfig** (or extended UserWorkflowConfig) could hold per-user autopilot strategy (max listings, categories, etc.) if desired.
- **WinningProduct** ? Not present. Winning is computed on the fly from sales/product data; a materialized table or cache could be added for performance.

---

## 4. Conclusion

The schema supports the core business: **User**, **Product**, **Opportunity**, **Sale**, **ApiCredential** (marketplace credentials), **UserWorkflowConfig**, **AutopilotWorkflow**, **AutopilotCycleLog**, **SystemConfig** (autopilot stats/config), **MarketplaceListing**, **MarketplacePublication**, **Order**, **PurchaseLog**, **Commission**, **SuccessfulOperation**. Published products, sales, and profits are stored. ?Winning products? are derived from existing data, not stored in a dedicated table. Optional additions: **PricingRules** and/or per-user autopilot strategy tables if the product roadmap requires them.

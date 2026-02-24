# Ivan Reseller — Evolution System Report

## Overview

Four production-grade systems added to the dropshipping platform:

- **A)** Dynamic Pricing Engine — Recalculate selling price every 6 hours based on competition and margins
- **B)** Automatic Purchase Retry & Supplier Fallback — Never lose a sale when AliExpress checkout fails
- **C)** Account Cluster & Rotation — Scale without bans via lowest-usage healthy account selection
- **D)** Learning Engine — Product performance intelligence (conversionRate × revenuePerView)

---

## Architecture

```
Trends → Opportunity (learning bias) → Dynamic Price → Publish → Sale
  → Purchase Retry (primary → mirror → external) → Learning Feedback
```

### System A: Dynamic Pricing
- **Inputs:** productId, supplierPriceUsd, marketplace (ebay|amazon|mercadolibre)
- **Process:** Fetch competitor prices via competitor-analyzer → targetPrice = min(avgCompetitor × 0.98, maxAllowedPrice)
- **Enforce:** Profit Guard (sellingPriceUsd > supplierPriceUsd + all fees)
- **Output:** newSuggestedPriceUsd, DynamicPriceHistory row

### System B: Purchase Retry
- **Chain:** AliExpress primary → mirror listing → external supplier API → local warehouse
- **Config:** Max 5 retries, exponential backoff, PurchaseAttemptLog per attempt

### System C: Account Rotation
- **Logic:** Select lowest dailyUsage among healthy (isActive, !isBlocked, dailyUsage < maxDailyUsage)
- **Actions:** incrementUsage() on success, markUnhealthy() on failure

### System D: Learning Engine
- **ProductPerformance:** productId, category, views, clicks, conversions, revenue
- **Score:** conversionRate × revenuePerView per category
- **Top Categories:** GET /api/internal/top-categories

---

## Files Added/Changed

| File | Change |
|------|--------|
| `src/services/dynamic-pricing.service.ts` | repriceByProduct(), competitor fetch, DynamicPriceHistory |
| `src/services/purchase-retry.service.ts` | 5 retries, exponential backoff, PurchaseAttemptLog |
| `src/services/order-fulfillment.service.ts` | Pass orderId to attemptPurchase |
| `src/services/account-rotation.service.ts` | Lowest usage selection, incrementUsage, markUnhealthy |
| `src/services/learning-engine.service.ts` | ProductPerformance, recordPerformance, getTopCategories |
| `src/services/scheduled-tasks.service.ts` | Dynamic pricing queue, worker, 6-hour schedule |
| `src/api/routes/internal.routes.ts` | reprice-product, account-health, top-categories, test-* endpoints |
| `prisma/schema.prisma` | DynamicPriceHistory, PurchaseAttemptLog, ProductPerformance, dailyUsage/maxDailyUsage |
| `prisma/migrations/20250206000000_evolution_v2_tables/` | New migration |
| `scripts/test-dynamic-pricing.ts` | Verifier |
| `scripts/test-purchase-retry.ts` | Verifier |
| `scripts/test-account-rotation.ts` | Verifier |
| `scripts/test-learning-engine.ts` | Verifier |
| `scripts/test-evolution-cycle.ts` | Master verifier |
| `package.json` | test-dynamic-pricing, test-purchase-retry, test-account-rotation, test-learning-engine |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `INTERNAL_RUN_SECRET` | Yes (internal endpoints) | Secret for /api/internal/* |
| `DYNAMIC_PRICING_INTERVAL_HOURS` | No | Default 6 |
| `EXTERNAL_SUPPLIER_API_URL` | No | Fallback supplier API for purchase retry |
| `VERIFIER_TARGET_URL` | No | Override API URL for verifiers (default localhost:4000) |

---

## How to Test

```bash
cd backend
npm ci
npx prisma migrate deploy
npx prisma generate
# Ensure .env.local has INTERNAL_RUN_SECRET, DATABASE_URL
npm run dev   # Terminal 1
npm run test-evolution-cycle   # Terminal 2
```

**Success:** Exit 0, output:
```json
{
  "success": true,
  "dynamicPricing": true,
  "retrySystem": true,
  "accountRotation": true,
  "learningEngine": true
}
Evolution cycle PASSED
```

### Individual Verifiers
- `npm run test-dynamic-pricing` — Repricing + DynamicPriceHistory row
- `npm run test-purchase-retry` — PurchaseAttemptLog created
- `npm run test-account-rotation` — Account health + getNextAccount
- `npm run test-learning-engine` — getLearningScore + getTopCategories

### Internal Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/internal/reprice-product | Dynamic repricing |
| GET | /api/internal/account-health | Account health by type |
| GET | /api/internal/top-categories | Top categories by score |
| POST | /api/internal/test-evolution-cycle | Master verifier |
| POST | /api/internal/test-purchase-retry | Purchase retry verifier |
| POST | /api/internal/test-account-rotation | Account rotation verifier |
| POST | /api/internal/test-learning-engine | Learning engine verifier |

---

## Sample Logs

### Dynamic Pricing
```
[DYNAMIC-PRICING] Repriced by product { productId: 1, oldPrice: 15, newPrice: 16.8 }
```

### Purchase Retry
```
[PURCHASE-RETRY] ATTEMPT 1/5 { source: 'original', url: '...' }
[PURCHASE-RETRY] ATTEMPT 2/5 { source: 'alternative', ... }
[PURCHASE-RETRY] FINAL FAILURE { attempts: 2 }
```

### Account Rotation
```
[ACCOUNT-ROTATION] Marked unhealthy { accountId: 1, type: 'aliexpress' }
```

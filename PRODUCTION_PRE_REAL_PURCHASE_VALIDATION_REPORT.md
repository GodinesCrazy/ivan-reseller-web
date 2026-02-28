# PRODUCTION PRE-REAL PURCHASE VALIDATION REPORT

**Generated:** 2026-02-28  
**Project:** ivan-reseller  
**Environment:** production  
**Service:** ivan-reseller-backend  

---

## Summary

| Field | Value |
|-------|-------|
| DEPLOY_STABLE | TRUE |
| DATABASE_CONNECTED | TRUE |
| PRISMA_OPERATIONAL | TRUE |
| INTEGRITY_SCORE_100 | TRUE |
| ALIEXPRESS_TOKEN_VALID | UNVERIFIED |
| EBAY_TOKEN_VALID | FALSE |
| WEBHOOK_PUBLIC | TRUE |
| NO_DIRECT_SALE_CREATION | TRUE |
| PAYOUT_FLAG_EXISTS | TRUE |
| MIGRATION_APPLIED | TRUE |
| **SYSTEM_READY_FOR_REAL_EBAY_CUSTOMER_PURCHASE** | **FALSE** |

---

## Phase Results

### Phase 1 ? Deploy Active
- **OK** `railway status`: Project ivan-reseller, Environment production, Service ivan-reseller-backend
- **OK** Logs: Build successful, no TypeScript errors, server started, Prisma connected, no P1001
- **OK** Autopilot running
- **WARN** eBay API: `Request failed with status code 401` (token expired or invalid)

### Phase 2 ? Database Connection
- **OK** DATABASE_URL defined (postgresql://postgres:...@postgres.railway.internal:5432/railway)
- **OK** postgres.railway.internal (Railway internal network)
- **NOTE** `railway run npx prisma db pull` fails locally (host postgres.railway.internal not reachable from outside Railway)
- Server runs without P1001 ? DB connected in production

### Phase 3 ? Integrity Check
```json
{
  "centralizedSaleCreation": true,
  "webhookBypassDetected": false,
  "duplicatePayoutRisk": false,
  "feeCalculationStrict": true,
  "netProfitValidated": true,
  "overallFinancialIntegrityScore": 100
}
```
- **OK** overallFinancialIntegrityScore = 100

### Phase 4 ? AliExpress Token
- **UNVERIFIED** ApiCredential (aliexpress-dropshipping) requires DB query from Railway network
- Local `railway run` cannot reach postgres.railway.internal

### Phase 5 ? eBay OAuth
- **FALSE** Logs show `Request failed with status code 401` when calling eBay API (category suggestions, publish)
- eBay token expired or invalid ? **renovar OAuth en Settings ? API Settings ? eBay**

### Phase 6 ? Webhook eBay
- **OK** POST /api/webhooks/ebay responds (no 401)
- Returns `{"success":false,"error":"Invalid signature"}` for unsigned test ? route is public, signature validation active
- Route registered at `/api/webhooks` (before authenticate)

### Phase 7 ? No Direct Sale Creation
- **OK** `prisma.sale.create` / `tx.sale.create` exists **only** in `sale.service.ts` for production flow
- Webhooks ? Order ? fulfillOrder ? saleService.createSaleFromOrder (no direct prisma.sale.create)
- seed.ts, test scripts use prisma.sale.create (non-production)

### Phase 8 ? payoutExecuted Flag
- **OK** Column exists in schema: `Sale.payoutExecuted Boolean @default(false)`
- **OK** Migration `20250227000000_add_payout_executed` adds column to `sales` table

### Phase 9 ? Migration Applied
- **OK** Server runs `prisma migrate deploy` at boot (server.ts)
- Migration `20250227000000_add_payout_executed` applied at deploy
- `railway run npx prisma migrate status` fails locally (DB unreachable)

---

## Blocker

**EBAY_TOKEN_VALID: FALSE**

Logs show repeated 401 when calling eBay API:
- `Request failed with status code 401`
- `eBay category suggestion error: Failed to get category suggestions after retries: Request failed with status code 401`
- `Autopilot: Failed to publish product to marketplace(s) [...]`

**Action:** Renovar OAuth eBay en Settings ? API Settings ? eBay (completar flujo OAuth para obtener nuevo access_token/refresh_token).

---

## After Fix

Once eBay token is renewed:
1. Verify eBay API calls return 200
2. Re-run validation
3. Set SYSTEM_READY_FOR_REAL_EBAY_CUSTOMER_PURCHASE: TRUE

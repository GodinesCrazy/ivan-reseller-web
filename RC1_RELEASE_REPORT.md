# RC1 Release Report - Ivan Reseller

**Date:** 2025-02-06  
**Version:** 1.0.0-RC1

## Files changed

| File | Change |
|------|--------|
| RELEASE_LOCK.md | New - Release lock, commit, modules list |
| scripts/release-check.mjs | New - Master release validation script |
| package.json | Added `release-check` script |
| backend/src/middleware/error.middleware.ts | Added ErrorCode: PAYPAL_NOT_CONFIGURED, EBAY_AUTH_REQUIRED, ALIEXPRESS_REAUTH_REQUIRED, INSUFFICIENT_MARGIN, AFFILIATE_PERMISSION_MISSING, MAX_DAILY_LIMIT_REACHED |
| frontend/src/utils/errorMessages.ts | Added friendly messages for RC1 error codes |
| backend/src/api/routes/system.routes.ts | Added GET /api/system/status |
| frontend/src/pages/SystemStatus.tsx | New - System status panel (PayPal, eBay, AliExpress, Autopilot, Profit Guard) |
| frontend/src/App.tsx | Added SystemStatus route, lazy import |
| frontend/src/components/layout/Sidebar.tsx | Added "Estado del sistema" nav item |
| backend/src/api/handlers/test-full-dropshipping-cycle.handler.ts | Block skipPostSale when AUTOPILOT_MODE=production |
| INSTALL.md | New - Installation guide |
| DEPLOY_RAILWAY.md | New - Railway deployment summary |
| BACKUP_RESTORE.md | New - Backup and restore guide |

## How to run release-check

```bash
# From project root
npm run release-check
```

Runs sequentially:
1. type-check (backend)
2. build (backend)
3. build (frontend)
4. test-production-cycle (requires backend server + env)
5. test-evolution-cycle
6. test-platform-commission

Exit 0 only if all succeed. The test-* scripts require the backend server to be running and environment variables configured.

## RC1 READY FOR PRODUCTION

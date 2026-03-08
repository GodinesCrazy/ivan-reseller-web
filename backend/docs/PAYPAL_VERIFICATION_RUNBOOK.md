# PayPal API Verification Runbook

Plan: Revisión PayPal API - Configuración y Funcionamiento

## Quick Verification

```bash
cd backend
npm run verify:paypal
```

Runs `paypal-verification-report.ts` and reports:
- A) Env vars (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENVIRONMENT, PAYPAL_WEBHOOK_ID)
- B) OAuth token (v1/oauth2/token)
- C) Create order (v2/checkout/orders)
- D) Webhook configuration status

## Individual Scripts

| Script | Purpose |
|--------|---------|
| `npx tsx scripts/verify-paypal-credentials.ts` | OAuth token validation |
| `npx tsx scripts/check-env-vars.ts` | Env var presence |
| `npx tsx scripts/verify-paypal-balance.ts [userId]` | Balance check (uses production by default) |
| `npx tsx scripts/test-paypal-create-order.ts` | Create order test |

## E2E Checkout Flow (Manual)

1. Start backend and frontend
2. Go to `/checkout`
3. Fill product URL, title, price, customer details
4. Submit → create order → redirect to PayPal sandbox
5. Complete payment in sandbox
6. Return to `/checkout?token=XXX` → capture runs automatically
7. Confirm Order created and fulfillment triggered

## Configuration Checklist

- [ ] `PAYPAL_CLIENT_ID` set
- [ ] `PAYPAL_CLIENT_SECRET` set
- [ ] `PAYPAL_ENVIRONMENT` = `sandbox` or `production`
- [ ] `PAYPAL_WEBHOOK_ID` set (required for webhook verification)
- [ ] Return/Cancel URLs in PayPal app match app domain (e.g. `https://ivanreseller.com/checkout`)

## Production Webhook URL

For backend deployed at Railway, configure in PayPal Developer Dashboard:

- **Correct:** `https://ivan-reseller-backend-production.up.railway.app/api/paypal/webhook`
- **Incorrect (typo):** `.../webhoo` (missing `k`)

Use "Manage Webhooks" → set URL to the **correct** endpoint above.

## Production Backend Verification

Backend URL: `https://ivan-reseller-backend-production.up.railway.app` (hyphen between `backend` and `production`).

**Test create-order (PowerShell):**
```powershell
Invoke-RestMethod -Uri "https://ivan-reseller-backend-production.up.railway.app/api/paypal/create-order" `
  -Method POST -ContentType "application/json" `
  -Body '{"amount":1.99,"currency":"USD","productTitle":"Test Product"}'
```

Expected: `success: true`, `approveUrl` using `www.paypal.com` (production).

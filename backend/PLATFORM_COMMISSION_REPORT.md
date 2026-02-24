# Platform Commission Report

## Overview

- **Platform commission** (default 10%) is deducted from **user profit** on every successful dropshipping sale.
- Commission is automatically paid to the **admin PayPal account**; user profit is paid to the **user PayPal payout email**.
- Both payouts must succeed; if either fails, the sale is marked `PAYOUT_FAILED` and in-app balances are not updated.

---

## Schema Changes

### User
- **paypalPayoutEmail** (nullable): PayPal email where the user receives their profit payouts.

### PlatformConfig (new table)
- **id**: Primary key (singleton row id=1).
- **platformCommissionPct**: DECIMAL(5,2), default 10.00.
- **adminPaypalEmail**: TEXT, admin PayPal for commission.

### Sale
- **adminPayoutId** (nullable): PayPal batch ID for commission payout to admin.
- **userPayoutId** (nullable): PayPal batch ID for user profit payout.
- **status**: May be `PAYOUT_FAILED` if payout step fails.

---

## Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | User.paypalPayoutEmail; PlatformConfig model; Sale.adminPayoutId, userPayoutId |
| `prisma/migrations/20250207000000_platform_commission/` | New migration |
| `src/services/platform-config.service.ts` | **New**: getCommissionPct(), getAdminPaypalEmail(), update() |
| `src/services/sale.service.ts` | Platform commission from config; dual payout (admin + user); PAYOUT_FAILED handling |
| `src/services/user.service.ts` | updateUser() accepts paypalPayoutEmail |
| `src/api/routes/admin.routes.ts` | GET/PATCH /api/admin/platform-config; GET /api/admin/platform-revenue |
| `src/api/routes/users.routes.ts` | updateUserSchema: paypalPayoutEmail |
| `src/api/routes/internal.routes.ts` | POST /api/internal/test-platform-commission |
| `scripts/test-platform-commission.ts` | **New**: verifier script |
| `package.json` | npm run test-platform-commission |

---

## Logic

1. **Profit split**
   - `grossProfit = salePrice - totalCost`
   - `commission = grossProfit * (platformCommissionPct / 100)`
   - `userProfit = grossProfit - commission`
   - (netProfit may also subtract platformFees.)

2. **Dual payout** (after Sale record is created)
   - Payout to **admin**: `adminPaypalEmail`, amount = commission.
   - Payout to **user**: `user.paypalPayoutEmail`, amount = userProfit (netProfit).
   - If either payout fails: Sale status set to `PAYOUT_FAILED`, no balance updates.
   - If both succeed: Sale updated with `adminPayoutId`, `userPayoutId`; user and admin balances updated.

3. **Security**
   - Only **ADMIN** can change platform commission % and admin PayPal email (PATCH /api/admin/platform-config).
   - Users can set their own **paypalPayoutEmail** (PUT /api/users/:id).
   - USER cannot see other users? data (existing behavior).

---

## How to Test

### 1. Migrate and run backend

```bash
cd backend
npm ci
npx prisma migrate deploy
npx prisma generate
npm run dev
```

### 2. Configure

- **.env** (or .env.local): `INTERNAL_RUN_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT=sandbox` (or production).
- **Platform config**: Set admin PayPal email (e.g. PATCH /api/admin/platform-config as ADMIN).
- **User**: Set `paypalPayoutEmail` for at least one USER (e.g. PUT /api/users/:id with body `{ "paypalPayoutEmail": "user@example.com" }`).

### 3. Run verifier

```bash
npm run test-platform-commission
```

**Success:** Exit code 0 and response:

```json
{
  "success": true,
  "commissionApplied": true,
  "adminPaid": true,
  "userPaid": true,
  "saleId": 123,
  "commissionAmount": 1.2,
  "netProfit": 10.8
}
```

For `success === true`, both PayPal payouts must succeed (sandbox or production). If `paypalPayoutEmail` is missing for the test user, the endpoint returns `success: false` with a message about `paypalPayoutEmail` or `TEST_PAYPAL_PAYOUT_EMAIL`.

### 4. Dashboard

- **User:** GET /api/dashboard/stats ? `sales.totalCommissions` / `sales.platformCommissionPaid`, `sales.totalProfit`.
- **Admin:** GET /api/admin/platform-revenue ? `totalPlatformRevenue`, `totalCommissionsCollected`, `perUser` (per-user revenue table).

---

## Required Env Vars

| Variable | Purpose |
|----------|--------|
| `INTERNAL_RUN_SECRET` | Auth for POST /api/internal/test-platform-commission |
| `PAYPAL_CLIENT_ID` | PayPal Payouts API (platform account sending payouts) |
| `PAYPAL_CLIENT_SECRET` | PayPal Payouts API |
| `PAYPAL_ENVIRONMENT` | `sandbox` or `production` |
| `TEST_PAYPAL_PAYOUT_EMAIL` | (Optional) Used by test when user has no paypalPayoutEmail |
| `VERIFIER_TARGET_URL` | (Optional) API base URL for script (default localhost:4000) |

---

## Sample Logs

- Sale created with platform commission: `[SALE] ... commissionAmount, netProfit ...`
- Admin payout: `Sending PayPal payout { recipient: admin@..., amount: 1.2 }`
- User payout: `Sending PayPal payout { recipient: user@..., amount: 10.8 }`
- Payout failed: `[SALE] Admin payout failed` or `[SALE] User payout failed`; Sale status set to `PAYOUT_FAILED`.

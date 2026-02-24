# REAL PRODUCTION ACTIVATION CHECKLIST

---

## STEP 1 — VERIFY CHROMIUM

**Exact command to verify chromium exists**

- Railway Shell (if available): `which chromium`
- No Shell: in deployment logs, search for: `Chromium executable ready:` or `Chromium encontrado` or `Chromium obtenido` (after first request that uses browser, or at startup if env not set).

**Expected output**

- With Shell: path string, e.g. `/nix/store/.../bin/chromium` or `/usr/bin/chromium`.
- Logs: line containing a path after `Chromium executable ready:` or `Chromium encontrado` / `Chromium obtenido`.

---

## STEP 2 — CONFIGURE ENV VARIABLES

**Exact variables to configure in Railway**

| Variable | Value |
|----------|--------|
| `ALLOW_BROWSER_AUTOMATION` | `true` |
| `ALIEXPRESS_USER` | AliExpress login (email or username) |
| `ALIEXPRESS_PASS` | AliExpress password |
| `INTERNAL_RUN_SECRET` | Secret string for internal API (e.g. 32+ chars) |

**Exact values format**

- `ALLOW_BROWSER_AUTOMATION`: `true` (lowercase).
- `ALIEXPRESS_USER`, `ALIEXPRESS_PASS`, `INTERNAL_RUN_SECRET`: plain string in Railway Variables (no quotes in UI).
- Do not set `DISABLE_BROWSER_AUTOMATION` to `true` (leave unset or set to `false`).

**Optional (only if Chromium not found in STEP 1/4)**

- `PUPPETEER_EXECUTABLE_PATH`: full path to Chromium binary.

---

## STEP 3 — VERIFY ENV LOADED

**Exact method to confirm backend reads variables**

1. Redeploy backend after changing variables.
2. Request: `GET https://<BACKEND_URL>/api/internal/health`
3. Header: `x-internal-secret: <INTERNAL_RUN_SECRET>`
4. Expect: HTTP 200, body JSON with `"hasSecret": true`.

---

## STEP 4 — VERIFY PUPPETEER CAN LAUNCH

**Exact log or test endpoint to confirm puppeteer launches**

- No dedicated endpoint. Trigger STEP 5; then check Railway logs.
- Expected log lines (in order): `Chromium encontrado` or `Chromium obtenido` or `Chromium executable ready:`; then `[AutoPurchase] Puppeteer loaded successfully`.
- Failure: log contains `Browser automation is disabled` or `Failed to load puppeteer` or Puppeteer launch error.

---

## STEP 5 — EXECUTE FIRST REAL PURCHASE TEST

**Exact API endpoint to call**

```
POST https://<BACKEND_URL>/api/internal/test-post-sale-flow
```

**Headers**

- `Content-Type: application/json`
- `x-internal-secret: <INTERNAL_RUN_SECRET>`

**Exact payload**

```json
{
  "productUrl": "https://www.aliexpress.com/item/<REAL_PRODUCT_ID>.html",
  "price": 10.99,
  "customer": {
    "name": "John Doe",
    "email": "john@test.com",
    "address": "123 Main St, Miami, FL, US"
  }
}
```

Replace `<BACKEND_URL>` and `<REAL_PRODUCT_ID>` with real values.

**Expected logs**

- `[INTERNAL] POST /api/internal/test-post-sale-flow`
- `[FULFILLMENT] START`
- `[FULFILLMENT] Status → PURCHASING`
- Chromium/Puppeteer lines
- `[FULFILLMENT] ALIEXPRESS OK` or `[FULFILLMENT] PURCHASED` with `aliexpressOrderId`
- Response: `"finalStatus": "PURCHASED"`, `"aliexpressOrderId": "<non-simulated>"`

**Expected database state change**

- Table `orders`: new row with `status` = `PURCHASED`, `aliexpress_order_id` = real AliExpress order id (not `SIMULATED_ORDER_ID`).

---

## STEP 6 — VERIFY SALE CREATION

**Exact database table change expected**

- Table: `sales`.
- For orders **with** `user_id` (e.g. from PayPal capture): after fulfillment, one new row in `sales` where `order_id` = that order’s `id`.
- For STEP 5 test (`test-post-sale-flow`): order has no `user_id` → no new row in `sales` (expected).
- Verification query when order has userId: `SELECT * FROM sales WHERE order_id = '<order_id>';` → one row.

---

## STEP 7 — VERIFY PAYOUT EXECUTION

**Exact logs and database changes expected**

- Logs: `[SALE] Admin payout` and/or `[SALE] User payout` (or Payoneer) with `saleId`.
- Database: table `sales`, columns `admin_payout_id` and/or `user_payout_id` populated (non-null) for the sale row after payout.

---

## FINAL EXPECTED STATE

System generating real automatic revenue.

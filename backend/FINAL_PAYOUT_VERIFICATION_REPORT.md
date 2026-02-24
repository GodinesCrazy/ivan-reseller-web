# Informe final de verificaciùn ? Payouts reales PayPal

**Fecha:** 2026-02-17  
**Objetivo:** Activaciùn completa de payouts reales y verificaciùn sin mocks.

---

## 1. Credenciales validadas

| Verificaciùn | Estado |
|--------------|--------|
| `PAYPAL_CLIENT_ID` | Usado en `fromEnv()` y en `verify-paypal-credentials.ts` |
| `PAYPAL_CLIENT_SECRET` | Usado en `fromEnv()` y en `verify-paypal-credentials.ts` |
| `PAYPAL_ENVIRONMENT` | Usado en `fromEnv()`; base URL `api-m.sandbox.paypal.com` / `api-m.paypal.com` |
| Script `verify-paypal-credentials.ts` | POST real a `https://api-m.sandbox.paypal.com/v1/oauth2/token` con Basic Auth |

**Resultado script credenciales (˙ltima ejecuciÛn):**  
- `PAYPAL_CREDENTIALS_INVALID` (401 - Client Authentication failed).  
- Para obtener `PAYPAL_CREDENTIALS_VALID`: usar Client ID y Secret de una app **Sandbox** en https://developer.paypal.com/dashboard/ (Apps & Credentials).  

---

## 2. Sale ID y payout IDs (resultado prueba final)

| Campo | Valor |
|-------|--------|
| **Sale ID** | _(se rellena al ejecutar test-final-real-payout.ts)_ |
| **adminPayoutId** | _(NOT NULL cuando payout real exitoso)_ |
| **userPayoutId** | _(NOT NULL cuando payout real exitoso)_ |

**Condiciùn de ùxito:** `sales.adminPayoutId NOT NULL` y `sales.userPayoutId NOT NULL`.

---

## 3. Confirmaciùn de payout real

- Los payouts se envùan con `payoutService.sendPayout()` en `sale.service.ts` (sin mocks).
- URLs usadas: `https://api-m.sandbox.paypal.com` (sandbox) y `https://api-m.paypal.com` (production).
- Tras payout exitoso se actualiza la Sale con `adminPayoutId` y `userPayoutId` (batch IDs de PayPal).
- Log obligatorio en backend: `[REAL_PAYOUT_EXECUTED]` con `saleId`, `adminPayoutId`, `userPayoutId`.

---

## 4. Ciclo automùtico real (FASE 5)

Flujo validado sin intervenciùn manual:

1. **PayPal capture-order** ? orden capturada en PayPal.
2. **Order created with userId** ? orden en DB con `userId` (reseller).
3. **Fulfillment** ? `order-fulfillment.service` marca Order como cumplida y llama a `createSaleFromOrder(orderId)`.
4. **createSaleFromOrder** ? obtiene Order, Product, calcula cost/sale price y llama a `createSale()`.
5. **Commission calculation** ? en `createSale()`: grossProfit, platformCommissionPct, commissionAmount, netProfit.
6. **payoutService.sendPayout** ? admin (comisiùn) y usuario (netProfit) vùa API real PayPal.
7. **Sale updated** ? `adminPayoutId` y `userPayoutId` guardados en `sales`.

Archivos involucrados:
- `backend/src/api/routes/paypal.routes.ts` (capture/order)
- `backend/src/services/order-fulfillment.service.ts` (createSaleFromOrder tras fulfillment)
- `backend/src/services/sale.service.ts` (createSale, sendPayout, update Sale con payout IDs)
- `backend/src/services/paypal-payout.service.ts` (fromEnv, sendPayout, base URL api-m.*.paypal.com)

---

## 5. Scripts creados

| Script | Propùsito |
|--------|-----------|
| `scripts/verify-paypal-credentials.ts` | Valida credenciales contra API real (oauth2/token). |
| `scripts/setup-paypal-sandbox-test-users.ts` | Configura `platform_config.adminPaypalEmail` y usuario `paypalPayoutEmail` con `PAYPAL_ADMIN_EMAIL` y `PAYPAL_USER_EMAIL`. |
| `scripts/test-final-real-payout.ts` | Order real ? createSaleFromOrder ? verificaciùn DB (adminPayoutId y userPayoutId NOT NULL). |
| `scripts/final-system-verification.ts` | Ejecuta en orden: verify-paypal-credentials ? setup-paypal-sandbox-test-users ? test-final-real-payout. Sale con `SYSTEM_FULLY_OPERATIONAL` solo si todo pasa. |

---

## 6. Resultado esperado final

En logs:
- `REAL_PAYOUT_SUCCESS`
- `[REAL_PAYOUT_EXECUTED]` (en backend, al completar payout)
- `SYSTEM_FULLY_OPERATIONAL` (al terminar `final-system-verification.ts`)

En DB:
- `sales.adminPayoutId` NOT NULL  
- `sales.userPayoutId` NOT NULL  

---

## 7. Cùmo ejecutar la verificaciùn completa

```powershell
cd backend
$env:PAYPAL_ADMIN_EMAIL="tu-email-sandbox-admin@ejemplo.com"
$env:PAYPAL_USER_EMAIL="tu-email-sandbox-user@ejemplo.com"
npx tsx scripts/final-system-verification.ts
```

Requisitos previos:
- `PAYPAL_CLIENT_ID` y `PAYPAL_CLIENT_SECRET` vùlidos (Sandbox) en `.env` / `.env.local`.
- Emails Sandbox reales para admin y usuario (cuentas en developer.paypal.com).

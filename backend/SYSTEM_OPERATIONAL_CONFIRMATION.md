# Confirmación de sistema operativo ? Payouts PayPal reales

**Objetivo:** Order ? Fulfillment ? Sale ? PayPal Payout ? Confirmación DB ? Confirmación PayPal Sandbox (sin mocks).

---

## Estado actual

### 1. Credenciales extraídas desde APIS2.txt

- **Script:** `scripts/extract-paypal-from-apis2.ts` lee `APIS2.txt` (raíz del repo o `backend/`) y extrae:
  - **Client ID Sandbox** (línea bajo "Sandbox:")
  - **Secret Key** (línea "secret Key ...")
- **Salida:** Se escriben en `backend/.env.local`:
  - `PAYPAL_CLIENT_ID`
  - `PAYPAL_CLIENT_SECRET`
  - `PAYPAL_ENVIRONMENT=sandbox`
- **Verificación:** Si al ejecutar `npx tsx scripts/verify-paypal-credentials.ts` obtienes **401 (invalid_client)**, el Secret en APIS2 no coincide con la app Sandbox actual. En [developer.paypal.com](https://developer.paypal.com) ? Sandbox ? Tu app ? "Secret" genera/muestra el Secret correcto, actualiza la línea "secret Key" en APIS2.txt y vuelve a ejecutar `npx tsx scripts/extract-paypal-from-apis2.ts`.

### 2. Logs de entorno

- En `paypal-payout.service.ts` (cuando se carga el servicio):
  - `[PAYPAL_ENV_READY]` con `clientIdPresent`, `secretPresent`, `environment`
  - `[PAYPAL_ENV_FINAL_CHECK]` con longitudes (no valores)

### 3. Emails Sandbox (obligatorios para payout)

- **platform_config.adminPaypalEmail:** Se configura con `PAYPAL_ADMIN_EMAIL` (o `ADMIN_PAYPAL_EMAIL`) al ejecutar `setup-paypal-sandbox-test-users.ts`.
- **users.paypalPayoutEmail:** Se configura con `PAYPAL_USER_EMAIL` (o `USER_PAYPAL_EMAIL`) para un usuario activo.
- **Origen:** APIS2.txt no incluye emails de cuentas Sandbox. Debes crear al menos dos cuentas de prueba en developer.paypal.com ? Sandbox ? Accounts y usar sus emails en `.env.local`:
  - `PAYPAL_ADMIN_EMAIL=tu-cuenta-sandbox-admin@ejemplo.com`
  - `PAYPAL_USER_EMAIL=tu-cuenta-sandbox-user@ejemplo.com`

### 4. Conectividad PayPal

- **Script:** `scripts/test-paypal-auth.ts` (o `verify-paypal-credentials.ts`) hace POST a `https://api-m.sandbox.paypal.com/v1/oauth2/token` con Basic Auth.
- **Éxito:** `PAYPAL_CREDENTIALS_VALID` y `access_token` recibido.
- **Fallo:** Revisar credenciales y Secret en APIS2/developer.paypal.com como en el punto 1.

### 5. Ciclo completo real

- **Script maestro:** `npx tsx scripts/final-system-verification.ts` (desde `backend/`):
  1. Extrae credenciales desde APIS2.txt.
  2. Verifica credenciales PayPal.
  3. Configura emails Sandbox (admin + user) desde env.
  4. Ejecuta prueba real: Order ? createSaleFromOrder ? sendPayout ? verificación en DB.
- **Sin** `SIMULATE_FULFILLMENT`: el flujo usa payout real.
- **Condición de éxito:** `sales.adminPayoutId` y `sales.userPayoutId` NOT NULL.

### 6. Verificación en base de datos

```sql
SELECT id, "orderId", "adminPayoutId", "userPayoutId"
FROM sales
ORDER BY id DESC
LIMIT 5;
```

- **Éxito:** Última sale con `adminPayoutId` y `userPayoutId` no nulos.

### 7. Logs esperados

- `[REAL_PAYOUT_EXECUTED]` (en backend, al completar payout)
- `REAL_PAYOUT_SUCCESS` (salida del script de prueba)
- `SYSTEM_FULLY_OPERATIONAL` (salida del script maestro cuando todo pasa)

### 8. PayPal Sandbox

- En https://www.sandbox.paypal.com (con una cuenta Sandbox) revisar Payouts.
- Debe aparecer el batch/payout correspondiente a `adminPayoutId` y `userPayoutId` de la sale.

---

## Resumen de requisitos para REAL_PAYOUT_SUCCESS y SYSTEM_FULLY_OPERATIONAL

| Requisito | Cómo cumplirlo |
|-----------|----------------|
| PayPal connection verified | Credenciales en APIS2 válidas para Sandbox (o Secret actualizado en APIS2 y re-ejecutar extractor). |
| Real payout executed | Tras auth OK, ejecutar `final-system-verification.ts` con `PAYPAL_ADMIN_EMAIL` y `PAYPAL_USER_EMAIL` seteados. |
| Sale created automatically | Lo hace `createSaleFromOrder` en el script de prueba. |
| Commission executed | Lo hace `sale.service` (admin + user payout). |
| Database updated | Sale con `adminPayoutId` y `userPayoutId` no nulos. |
| System operational end-to-end | Salida del maestro: `SYSTEM_FULLY_OPERATIONAL`. |

---

## Cómo dejar el sistema completamente operativo

1. **Credenciales Sandbox válidas**
   - En developer.paypal.com ? Sandbox ? tu app, comprobar Client ID y Secret.
   - Si el Secret de APIS2 no funciona (401), copiar el Secret actual de la app en APIS2.txt (línea "secret Key") y ejecutar:
     - `cd backend && npx tsx scripts/extract-paypal-from-apis2.ts`
   - Comprobar: `npx tsx scripts/verify-paypal-credentials.ts` ? `PAYPAL_CREDENTIALS_VALID`.

2. **Emails Sandbox**
   - Crear dos cuentas Sandbox (por ejemplo Business y Personal) en developer.paypal.com.
   - En `backend/.env.local`:
     - `PAYPAL_ADMIN_EMAIL=...`
     - `PAYPAL_USER_EMAIL=...`

3. **Ejecutar verificación completa**
   - `cd backend`
   - `npx tsx scripts/final-system-verification.ts`
   - Salida esperada: `REAL_PAYOUT_SUCCESS`, `SYSTEM_FULLY_OPERATIONAL` y en DB payout IDs no nulos.

Cuando los pasos 1 y 2 estén correctos, el sistema quedará operativo de punta a punta y este documento servirá como confirmación de la configuración y del flujo real.

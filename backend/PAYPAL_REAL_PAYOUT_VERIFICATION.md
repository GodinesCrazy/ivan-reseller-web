# Verificaciùn del ciclo real de Payout PayPal ? Ivan Reseller

**Fecha:** 2026-02-17  
**Objetivo:** Order ? Sale ? Commission ? PayPal payout admin ? PayPal payout user (sin mocks).

---

## 1. Resultado del script

| Concepto | Valor |
|----------|--------|
| Script ejecutado | `npx tsx scripts/test-real-payout-cycle.ts` |
| **REAL_PAYOUT_SUCCESS** | **No** (exit code 1) |
| Motivo | PayPal API devolviù **401 Unauthorized** (autenticaciùn fallida). |

### Salida relevante del test

```
[PAYPAL_ENV_CHECK] { clientIdPresent: true, secretPresent: true, env: undefined }
[REAL-PAYOUT] Order creado: cmlq0rjtq0001ct5hi0lyiuhp
...
PayPal authentication failed: Request failed with status code 401
[SALE] Admin payout failed { saleId: 1561, error: "..." }
[REAL-PAYOUT] createSaleFromOrder retornù null.
```

- Las variables de entorno **estùn presentes** (clientId y secret = true).
- El flujo llega hasta **envùo real** a la API de PayPal; el fallo es **credenciales invùlidas o expiradas**, no cùdigo.

---

## 2. Sale ID y payout IDs

| Sale ID | orderId | userId | adminPayoutId | userPayoutId | status |
|---------|---------|--------|----------------|--------------|--------|
| 1561 | cmlq0rjtq0001ct5hi0lyiuhp | 396 | **null** | **null** | PAYOUT_FAILED |

**Condiciùn de ùxito (no cumplida):** `adminPayoutId != NULL` y `userPayoutId != NULL`.

---

## 3. Verificaciùn SQL (ùltimas 5 sales)

```sql
SELECT id, "orderId", "userId", "adminPayoutId", "userPayoutId", status
FROM sales
ORDER BY id DESC
LIMIT 5;
```

**Resultado ejecutado (resumen):**

| id   | orderId | userId | adminPayoutId | userPayoutId | status       |
|------|---------|--------|---------------|--------------|-------------|
| 1561 | cmlq0rjtq0001ct5hi0lyiuhp | 396 | null | null | PAYOUT_FAILED |
| 1560 | cmlq07tf30001g8uxzbwatgbh | 396 | null | null | PAYOUT_FAILED |
| 1559 | cmlpzsq2h00014wrear1t98z6 | 396 | null | null | PAYOUT_FAILED |
| 1558 | cmlpzrl2p0001kfaxia9qucnx | 396 | null | null | PENDING      |
| 1555 | test-platform-commission-... | 396 | null | null | PAYOUT_FAILED |

Ninguna sale tiene ambos payout IDs rellenados; por tanto, **aùn no se ha logrado REAL_PAYOUT_SUCCESS** en DB.

---

## 4. Logs obligatorios [REAL_PAYOUT_EXECUTED]

- **Estado:** No aparecen en esta ejecuciùn porque el payout **no se completù** (fallo 401 antes de guardar `adminPayoutId`/`userPayoutId`).
- **Dùnde estù el log:** `backend/src/services/sale.service.ts`, despuùs de actualizar la Sale con `adminPayoutId` y `userPayoutId`.
- Cuando un payout **sù** se ejecute con ùxito, verùs:
  - `[REAL_PAYOUT_EXECUTED]` con `saleId`, `adminPayoutId`, `userPayoutId`.

---

## 5. Confirmaciùn en PayPal Sandbox

- **URL:** https://www.sandbox.paypal.com/payouts  
- **Estado:** No aplicable en esta verificaciùn: al haber 401 no se crearon payouts en PayPal.
- Cuando **sù** tengas REAL_PAYOUT_SUCCESS:
  - Debe existir **1 payout al admin** y **1 payout al usuario** en Sandbox.

---

## 6. Configuraciùn aplicada en esta verificaciùn

- **FASE 1:** Log `[PAYPAL_ENV_CHECK]` a?adido en `paypal-payout.service.ts` (fromEnv). Variables comprobadas: presentes.
- **FASE 2:** `platform_config` con `adminPaypalEmail` configurado (vùa script `setup-payout-config.ts`).
- **FASE 3:** Usuario activo (id 396) con `paypalPayoutEmail` configurado (mismo script).
- **FASE 4:** `sale.service.ts` ejecuta `sendPayout` para admin y usuario y guarda `adminPayoutId`/`userPayoutId`; log `[REAL_PAYOUT_EXECUTED]` existe y no estù deshabilitado.
- **FASE 5:** Test ejecutado; fallo por 401.
- **FASE 6:** SQL de verificaciùn ejecutado (script `query-sales-payouts.ts` / `verify-payouts.sql`).
- **FASE 7:** Logs REAL_PAYOUT_EXECUTED no aparecen hasta que un payout complete con ùxito.
- **FASE 8:** Pendiente de comprobar en Sandbox cuando haya payouts exitosos.

---

## 7. Pasos para lograr REAL_PAYOUT_SUCCESS

1. **Credenciales PayPal Sandbox vùlidas**
   - En https://developer.paypal.com/dashboard/ ? Apps & Credentials ? Sandbox ? tu App.
   - Copiar **Client ID** y **Secret**.
   - En `backend/.env.local` (o variables en Railway):
     - `PAYPAL_CLIENT_ID=<Client ID de Sandbox>`
     - `PAYPAL_CLIENT_SECRET=<Secret de Sandbox>`
     - `PAYPAL_ENVIRONMENT=sandbox` (recomendado; si no est·, el cÛdigo usa `sandbox` por defecto)

2. **Emails de destino reales de Sandbox**
   - Crear o usar cuentas Sandbox (Personal/Business) en https://developer.paypal.com/dashboard/accounts.
   - Configurar:
     - **Admin:** `platform_config.adminPaypalEmail` = email de una cuenta Sandbox (ej. negocio).
     - **Usuario:** `users.paypalPayoutEmail` = email de otra cuenta Sandbox (ej. personal).
   - Opciùn rùpida: ejecutar de nuevo el setup con tus emails:
     - `PAYPAL_ADMIN_EMAIL=tu-admin-sandbox@ejemplo.com`
     - `PAYPAL_USER_EMAIL=tu-user-sandbox@ejemplo.com`
     - `npx tsx scripts/setup-payout-config.ts`

3. **Volver a ejecutar el test**
   ```powershell
   cd backend
   $env:SIMULATE_FULFILLMENT="1"
   npx tsx scripts/test-real-payout-cycle.ts
   ```
   - Si todo es correcto: salida **REAL PAYOUT SUCCESS** y exit code 0.
   - En logs del backend: `[REAL_PAYOUT_EXECUTED]` con `saleId`, `adminPayoutId`, `userPayoutId`.
   - En DB: ùltima sale con `adminPayoutId` y `userPayoutId` no nulos.
   - En https://www.sandbox.paypal.com/payouts: 1 payout al admin y 1 al usuario.

---

## 8. Resumen

| Requisito | Estado |
|-----------|--------|
| Variables PAYPAL_* presentes | Sù |
| platform_config.adminPaypalEmail | Configurado (valor placeholder; sustituir por email Sandbox real) |
| users.paypalPayoutEmail | Configurado (valor placeholder; sustituir por email Sandbox real) |
| Flujo sale.service ? sendPayout | Correcto |
| Log [REAL_PAYOUT_EXECUTED] | Presente en cùdigo |
| REAL_PAYOUT_SUCCESS en ejecuciùn | No (401 por credenciales PayPal) |
| adminPayoutId / userPayoutId en DB | Null en sales recientes |

**Conclusiùn:** El flujo de payout estù implementado y verificado hasta la llamada real a PayPal. Para obtener **REAL_PAYOUT_SUCCESS** es necesario usar **credenciales Sandbox vùlidas** y **emails de destino Sandbox reales** en `platform_config` y en el usuario.

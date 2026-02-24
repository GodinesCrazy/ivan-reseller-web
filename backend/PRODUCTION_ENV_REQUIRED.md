# Production env variables required for real automatic purchases

Set these in Railway (backend service → Variables). No code changes needed.

## Lista exacta requerida

| Variable | Valor | Obligatorio |
|----------|--------|-------------|
| `ALLOW_BROWSER_AUTOMATION` | `true` | Sí |
| `DISABLE_BROWSER_AUTOMATION` | `false` | Opcional (si no se setea, con `ALLOW_BROWSER_AUTOMATION=true` el código ya usa false) |
| `AUTOPILOT_MODE` | `production` | Sí |
| `ALIEXPRESS_USER` | Email o usuario de cuenta AliExpress | Sí |
| `ALIEXPRESS_PASS` | Contraseña de cuenta AliExpress | Sí |
| `INTERNAL_RUN_SECRET` | Secreto fuerte para API interna (ej. 32+ caracteres) | Sí |

## Opcional

- `PUPPETEER_EXECUTABLE_PATH`: ruta absoluta al binario Chromium (solo si no se resuelve automáticamente en Railway).

## No configurar

- `DISABLE_BROWSER_AUTOMATION` = `true` (bloquearía compras reales). Si quieres desactivar browser en producción, no pongas `ALLOW_BROWSER_AUTOMATION=true`.

## Para generación de Sale y payout (flujo completo de ingresos)

- Orders deben tener `userId` (ej. creados por PayPal capture con userId).
- PayPal: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`; PlatformConfig con `adminPaypalEmail`; User con `paypalPayoutEmail` (o Payoneer: `PAYOUT_PROVIDER=payoneer` y `payoneerPayoutEmail`).

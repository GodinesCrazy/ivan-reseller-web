# Configurar emails Sandbox para payouts reales

Para que **REAL_PAYOUT_SUCCESS** y **SYSTEM_FULLY_OPERATIONAL** funcionen, necesitas **dos emails de cuentas Sandbox** en `backend/.env.local`.

## Pasos

1. Abre **https://developer.paypal.com/dashboard/**
2. Ve a **Sandbox ? Accounts**
3. Usa dos cuentas existentes o crea:
   - **Cuenta Business** (admin que recibe la comisión) ? copia su email
   - **Cuenta Personal** (usuario que recibe el beneficio) ? copia su email
4. Edita **backend/.env.local** y agrega (con tus emails reales):

```env
PAYPAL_ADMIN_EMAIL=email_business_sandbox@ejemplo.com
PAYPAL_USER_EMAIL=email_personal_sandbox@ejemplo.com
```

5. Guarda el archivo y ejecuta de nuevo:

```bash
cd backend
npx tsx scripts/setup-payout-config.ts
npx tsx scripts/final-system-verification.ts
```

Sin estos emails reales de Sandbox, el payout fallará (recipient inválido).

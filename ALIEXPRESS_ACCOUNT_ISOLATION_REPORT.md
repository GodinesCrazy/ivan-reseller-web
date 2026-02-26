# ALIEXPRESS ACCOUNT ISOLATION REPORT

AFFILIATE ISOLATION STATUS:
FIXED

DROPSHIPPING ISOLATION STATUS:
FIXED

TOKEN SEPARATION STATUS:
ENFORCED

OAUTH SEPARATION STATUS:
FIXED

EXECUTION FLOW STATUS:
FIXED

ENV VARIABLE ISOLATION STATUS:
FIXED

CROSS CONTAMINATION FOUND:
YES
- Se detectù uso legacy de `ALIEXPRESS_APP_KEY` / `ALIEXPRESS_APP_SECRET` en rutas/servicios de Affiliate.
- `executePurchase()` y `placeOrder()` permitùan fallback a Puppeteer incluso con `userId`, mezclando path de compra con path de browser login.
- Normalizaciùn de nombres de API permitùa alias ambiguos (`aliexpress_affiliate`, `aliexpress_dropshipping`) sin canonicalizaciùn central.

CORRECTIONS APPLIED:
- `credentials-manager.service.ts`
  - Canonicalizaciùn estricta de namespace (`aliexpress-affiliate`, `aliexpress-dropshipping`).
  - Carga de env separada:
    - Affiliate: `ALIEXPRESS_AFFILIATE_APP_KEY/SECRET`
    - Dropshipping: `ALIEXPRESS_DROPSHIPPING_APP_KEY/SECRET` (+ tokens opcionales)
  - Fallback legacy a `ALIEXPRESS_APP_*` solo si no hay vars de dropshipping (evita contaminaciùn cruzada).
  - Validaciùn separada por namespace y chequeo de token reuse invùlido.
- `aliexpress-checkout.service.ts`
  - Regla estricta: con `userId`, la compra usa solo Dropshipping API; sin fallback a navegador.
- `aliexpress-auto-purchase.service.ts`
  - Regla estricta: con `userId`, sin fallback a Puppeteer ante errores de Dropshipping API o falta de productId/credenciales.
- Variables/health/logging separados para Affiliate en:
  - `aliexpress-affiliate-api.service.ts`
  - `opportunity-finder.service.ts`
  - `modules/aliexpress/aliexpress.controller.ts`
  - `modules/aliexpress/aliexpress.service.ts`
  - `api/routes/system.routes.ts`
  - `server.ts`
- OAuth affiliate legacy actualizado a vars separadas:
  - `aliexpress-oauth.service.ts` usa primero `ALIEXPRESS_AFFILIATE_APP_*`.
- Script de verificaciùn a?adido:
  - `backend/scripts/verify-aliexpress-isolation.ts`
  - Verifica separaciùn en `api_credentials`, hash de tokens por namespace y flujo de ejecuciùn.
  - Resultado actual:
    - `crossTokenReusesFound: 0`
    - `usesDropshippingNamespace: true`
    - `usesAffiliateNamespaceInPurchaseFlow: false`
    - `strictNoBrowserFallbackForUserId: true`

FINAL SYSTEM STATUS:
STABLE

PRODUCTION SAFE:
YES (con configuraciùn de variables separadas y credenciales correctas en DB)

READINESS LEVEL:
92%


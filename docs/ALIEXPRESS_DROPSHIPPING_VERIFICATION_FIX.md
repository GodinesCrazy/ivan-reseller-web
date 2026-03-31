# AliExpress Dropshipping — verificación post-OAuth

## Problema

`aliexpress.ds.account.get` → **InvalidApiPath** (API path inválido en TOP actual).

## Solución

- Nuevo método **`verifyOAuthTokenWithProductProbe`**: lectura de producto con `aliexpress.offer.ds.product.simplequery` y fallback `aliexpress.dropshipping.product.info.get`.
- Product ID por defecto `1005009130509159` (usado en scripts internos); override con **`ALIEXPRESS_DROPSHIPPING_VERIFY_PRODUCT_ID`**.
- `getAccountInfo` delega al probe por compatibilidad.
- Callbacks OAuth en `marketplace-oauth.routes.ts` llaman al probe explícito.

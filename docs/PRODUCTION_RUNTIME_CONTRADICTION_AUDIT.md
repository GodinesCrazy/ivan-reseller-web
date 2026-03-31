# Auditoría — contradicciones runtime producción

## Hallazgos

1. **Mercado Libre:** Catálogo público (`/sites/{id}/search`) puede devolver **403** desde IP de hosting; OAuth `/users/me` puede seguir OK → “integración verde” vs comparables degradados.
2. **AliExpress boot:** El log `[ALIEXPRESS] Disabled` mezclaba ausencia de env global con “sistema apagado”, aunque **App Key/Secret y token vivan en `api_credentials` por usuario**.
3. **Dropshipping post-OAuth:** `aliexpress.ds.account.get` → **InvalidApiPath** en TOP actual; el OAuth era válido pero la verificación posterior era inválida.
4. **`/api/auth-status`:** `SAFE_AUTH_STATUS_MODE` lee DB; no sustituye a `/api/credentials/status` para probes comparables.

## Ajustes aplicados (código)

- Orden ML: **OAuth search antes que público** en `competitor-analyzer` y en probe de `api-availability`.
- Boot: mensajes separados **affiliate env** vs **redirect env**, sin “Disabled” global engañoso.
- Verificación DS: **product probe** (`simplequery` → `dropshipping.product.info.get`) + env `ALIEXPRESS_DROPSHIPPING_VERIFY_PRODUCT_ID`.
- Auth-status: campo `_integrationTruthHint` apuntando a `/api/credentials/status`.
- Dropshipping `checkAliExpressDropshippingAPI(..., forceRefresh=true)`: product probe opcional.

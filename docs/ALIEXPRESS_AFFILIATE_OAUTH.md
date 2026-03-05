# AliExpress Affiliate API ? OAuth y Redirect URI

OAuth de **AliExpress Affiliate** usa un flujo y una URL de callback **distintos** a los de AliExpress Dropshipping. No uses la misma Redirect URI para ambas apps.

---

## Redirect URI (callback)

- **Affiliate:** `{BACKEND_URL}/api/aliexpress/callback`
- **Dropshipping:** `{BACKEND_URL}/api/marketplace-oauth/callback` (ver [ALIEXPRESS_DROPSHIPPING_OAUTH_GUIA.md](ALIEXPRESS_DROPSHIPPING_OAUTH_GUIA.md))

La app **Affiliate** en AliExpress Open Platform debe tener configurada **exactamente** la URL de Affiliate, no la de Dropshipping.

---

## Variables de entorno (backend)

| Variable | Uso |
|----------|-----|
| `ALIEXPRESS_REDIRECT_URI` | URL de callback de la app **Affiliate**. Debe coincidir **carácter por carácter** con la configurada en la consola de AliExpress (incluyendo protocolo, host y path). Recomendado: `https://<BACKEND_URL>/api/aliexpress/callback`. |
| `BACKEND_URL` | Si no se define `ALIEXPRESS_REDIRECT_URI`, el backend deriva el callback como `{BACKEND_URL}/api/aliexpress/callback`. En producción, `BACKEND_URL` es necesario si no usas `ALIEXPRESS_REDIRECT_URI`. |
| `ALIEXPRESS_AFFILIATE_APP_KEY` | App Key de la app Affiliate (o `ALIEXPRESS_APP_KEY` legacy). |
| `ALIEXPRESS_AFFILIATE_APP_SECRET` | App Secret de la app Affiliate (o `ALIEXPRESS_APP_SECRET` legacy). |

**Importante:** No uses la URL de Dropshipping (`/api/marketplace-oauth/callback`) como `ALIEXPRESS_REDIRECT_URI`. Si Affiliate y Dropshipping usan la misma URL, el callback tratará el código como Dropshipping y fallará con "missing access_token" o "IncompleteSignature".

---

## Configuración en AliExpress (app Affiliate)

En [AliExpress Open Platform](https://open.aliexpress.com/) ? tu app **Affiliate** ? Configuración ? **Authorized Redirect URI**:

- Añade exactamente: `https://<tu-backend>/api/aliexpress/callback`  
  (mismo valor que `ALIEXPRESS_REDIRECT_URI` o que `BACKEND_URL` + `/api/aliexpress/callback`). En **API Settings** la tarjeta AliExpress Affiliate API muestra esta URL y un botón para copiarla.
- Sin barra final, sin diferencias de protocolo (http vs https) ni de dominio.
- Si solo tienes la app Dropshipping (p. ej. IvanReseller), crea una segunda app para Affiliate en AliExpress y configura en ella esta Callback URL; o añade esta URL como segunda Callback si la consola lo permite.

---

## Autorizar desde la app

1. **API Settings** ? **AliExpress Affiliate API**
2. Guardar **App Key** y **App Secret**
3. Pulsar **Autorizar OAuth** (o usar el botón del recuadro ámbar si aparece "Paso 1/2 completado")
4. Completar el flujo en AliExpress; al volver, el callback debe ser `.../api/aliexpress/callback?code=...`
5. El estado debería pasar a **Configurado y funcionando**

Si tras autorizar ves "Error de autorización" con "missing access_token" o "IncompleteSignature", comprueba que la Redirect URI de la app Affiliate en AliExpress coincida con la que usa el backend (y que no estés usando la URL de Dropshipping).

---

## Problemas frecuentes

- **"missing access_token" y la URL tiene `provider=aliexpress-dropshipping`**  
  Significa que el navegador llegó al callback de **Dropshipping** (no al de Affiliate). Para **Affiliate**, la Redirect URI en la consola de AliExpress debe ser exactamente `https://<BACKEND_URL>/api/aliexpress/callback` (con **/api**). No uses `/aliexpress/callback` ni `/api/marketplace-oauth/callback`.

- **BACKEND_URL**  
  Debe ser la URL del **backend** (donde corre la API), no la del frontend (p. ej. no uses ivanreseller.com si tu API está en otro host como Railway).

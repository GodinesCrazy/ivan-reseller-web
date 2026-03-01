# Gu�a: AliExpress Dropshipping OAuth

Pasos para completar la autorizaci�n OAuth de AliExpress Dropshipping y activar la compra automatizada.

---

## Configuración actual (IvanResellerDS2)

| Campo | Valor |
|-------|--------|
| App Key | `528624` |
| App Secret | `nj9CX0uDjcSNrUE9yoX0Gh1uY4LLnGZ6` |
| Callback URL | `https://ivanreseller.com/api/marketplace-oauth/callback` |
| rail.txt | Incluye APP_KEY, APP_SECRET, REDIRECT_URI para IvanResellerDS2 |
| inject-apis | Ya ejecutado; .env.local tiene estas variables |

---

## Requisitos previos

1. **App en AliExpress Open Platform** (Dropshipping)
   - Tener App Key (Client ID) y App Secret
   - Configurar permisos Dropshipping
   - Registrar la **Redirect URI** exacta

2. **Variables de entorno en Railway**
   - `BACKEND_URL` = URL p�blica del backend (ej. `https://ivan-reseller-backend.up.railway.app`)
   - O bien `ALIEXPRESS_DROPSHIPPING_REDIRECT_URI` = URL completa del callback

---

## Paso 1: Registrar Redirect URI en AliExpress

La Redirect URI que usa el backend es:

```
{BACKEND_URL}/api/marketplace-oauth/callback
```

Ejemplo: `https://tu-backend.railway.app/api/marketplace-oauth/callback`

En [AliExpress Open Platform](https://open.aliexpress.com/) ? Tu app ? Configuraci�n ? **Authorized Redirect URI**, a?ade esa URL exacta (sin barra final).

---

## Paso 2: Guardar App Key y App Secret en API Settings

1. Ir a **API Settings** ? **AliExpress Dropshipping API**
2. Completar:
   - **App Key** (Client ID)
   - **App Secret**
3. Pulsar **Guardar**

> Sin estos campos guardados, el bot�n "Autorizar OAuth" fallar� con "Credenciales incompletas".

---

## Paso 3: Autorizar OAuth

1. En la tarjeta de **AliExpress Dropshipping API**
2. Pulsar el bot�n **Autorizar OAuth**
3. Se abrir� la p�gina de autorizaci�n de AliExpress
4. Iniciar sesi�n (si hace falta) y aceptar los permisos
5. Tras autorizar, volver�s a API Settings
6. El estado deber�a pasar a **Configurada y funcionando**

---

## Paso 4: Verificar

- En API Settings, la tarjeta de AliExpress Dropshipping deber�a estar en verde
- Opcional: `GET /api/debug/aliexpress-dropshipping-credentials` (autenticado) para comprobar que hay accessToken en BD

---

## Problemas frecuentes

| Problema | Soluci�n |
|----------|----------|
| "Credenciales no encontradas" | Guardar App Key y App Secret antes de OAuth |
| "Invalid redirect_uri" | A?adir la misma URL en AliExpress Open Platform |
| "IncompleteSignature" / "missing access_token" | App Key y App Secret deben ser del MISMO app. Si auth muestra client_id=528624 (IvanResellerDS2), usa su App Secret. Si usas 522578 (IvanReseller), usa su App Secret. Callback: `https://ivanreseller.com/api/marketplace-oauth/callback`. No mezcles apps. Ver tambi�n 2026-02-27 en OAUTH_ACTIVATION_REPORT.md |
| Sesi�n perdida al volver | Verificar `return_origin` y que BACKEND_URL coincida con el dominio |

---

## URL del callback

El backend usa `getAliExpressDropshippingRedirectUri()`:

- Si existe `ALIEXPRESS_DROPSHIPPING_REDIRECT_URI` ? se usa
- Si no ? `{BACKEND_URL}/api/marketplace-oauth/callback`

En producci�n, `BACKEND_URL` debe estar configurado (o la variable expl�cita).

# Guía: AliExpress Dropshipping OAuth

Pasos para completar la autorización OAuth de AliExpress Dropshipping y activar la compra automatizada.

---

## Requisitos previos

1. **App en AliExpress Open Platform** (Dropshipping)
   - Tener App Key (Client ID) y App Secret
   - Configurar permisos Dropshipping
   - Registrar la **Redirect URI** exacta

2. **Variables de entorno en Railway**
   - `BACKEND_URL` = URL pública del backend (ej. `https://ivan-reseller-backend.up.railway.app`)
   - O bien `ALIEXPRESS_DROPSHIPPING_REDIRECT_URI` = URL completa del callback

---

## Paso 1: Registrar Redirect URI en AliExpress

La Redirect URI que usa el backend es:

```
{BACKEND_URL}/api/marketplace-oauth/callback
```

Ejemplo: `https://tu-backend.railway.app/api/marketplace-oauth/callback`

En [AliExpress Open Platform](https://open.aliexpress.com/) ? Tu app ? Configuración ? **Authorized Redirect URI**, a?ade esa URL exacta (sin barra final).

---

## Paso 2: Guardar App Key y App Secret en API Settings

1. Ir a **API Settings** ? **AliExpress Dropshipping API**
2. Completar:
   - **App Key** (Client ID)
   - **App Secret**
3. Pulsar **Guardar**

> Sin estos campos guardados, el botón "Autorizar OAuth" fallará con "Credenciales incompletas".

---

## Paso 3: Autorizar OAuth

1. En la tarjeta de **AliExpress Dropshipping API**
2. Pulsar el botón **Autorizar OAuth**
3. Se abrirá la página de autorización de AliExpress
4. Iniciar sesión (si hace falta) y aceptar los permisos
5. Tras autorizar, volverás a API Settings
6. El estado debería pasar a **Configurada y funcionando**

---

## Paso 4: Verificar

- En API Settings, la tarjeta de AliExpress Dropshipping debería estar en verde
- Opcional: `GET /api/debug/aliexpress-dropshipping-credentials` (autenticado) para comprobar que hay accessToken en BD

---

## Problemas frecuentes

| Problema | Solución |
|----------|----------|
| "Credenciales no encontradas" | Guardar App Key y App Secret antes de OAuth |
| "Invalid redirect_uri" | A?adir la misma URL en AliExpress Open Platform |
| "IncompleteSignature" | Ver actualización 2026-02-27 en OAUTH_ACTIVATION_REPORT.md |
| Sesión perdida al volver | Verificar `return_origin` y que BACKEND_URL coincida con el dominio |

---

## URL del callback

El backend usa `getAliExpressDropshippingRedirectUri()`:

- Si existe `ALIEXPRESS_DROPSHIPPING_REDIRECT_URI` ? se usa
- Si no ? `{BACKEND_URL}/api/marketplace-oauth/callback`

En producción, `BACKEND_URL` debe estar configurado (o la variable explícita).

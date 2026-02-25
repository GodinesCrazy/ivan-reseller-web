# Auditoría OAuth eBay ? No regresa al software tras autorizar

**Fecha:** 2025-02-24  
**Contexto:** Usuario reporta que tras intentar autorizar OAuth (eBay) la aplicación no regresa al software; errores 500, invalid_scope, unauthorized_client y 400 en callback.

---

## Hallazgos

### 1. **invalid_scope (eBay)**

- **Causa:** En `GET /api/marketplace/auth-url/ebay` se enviaban scopes en formato corto (`sell.inventory.readonly`, `sell.inventory`, etc.). eBay OAuth 2.0 exige scopes en **URL completa** (p. ej. `https://api.ebay.com/oauth/api_scope/sell.inventory`).
- **Evidencia:** Página "Authorization Error: eBay returned an error: invalid_scope" y callback con error.

### 2. **Callback devolvía 400 en errores**

- **Causa:** Cuando eBay redirigía al callback con `?error=invalid_scope` (o sin `code`), el backend respondía con `res.status(400).send(html)`. El navegador mostraba "400 Bad Request" y la experiencia de "no regresar" al flujo.
- **Evidencia:** Consola del navegador: `GET .../oauth/callback/ebay?state=... 400 (Bad Request)`.

### 3. **Poca claridad al volver a la app**

- **Causa:** Las páginas de error del callback no tenían un enlace claro ni mismo estilo; el usuario no sabía cómo volver a API Settings.

### 4. **unauthorized_client (Sandbox)**

- **Causa:** En Sandbox, si solo hay credenciales de Producción guardadas (o el App ID enviado es de Producción mientras la URL es `auth.sandbox.ebay.com`), eBay responde "No se encontró el cliente OAuth" (401).
- **Recomendación:** Usar entorno **Producción** en la UI y credenciales de producción (APIS2.txt: `IvanMart-IVANRese-PRD-...`, RuName `Ivan_Marty-IvanMart-IVANRe-cgcqu`). Para Sandbox, tener credenciales SBX guardadas y entorno Sandbox seleccionado.

### 5. **Error 500 y "Redirect URI (RuName) contiene caracteres inválidos"**

- **Causa:** El campo "Redirect URI (RuName)" tenía la URL completa en lugar del RuName. La validación en backend rechaza `:`, `/`, `.`, etc.
- **Estado:** Ya corregido en cambios anteriores (backend no devuelve URL como RuName; frontend valida y muestra hint). Asegurar que en API Settings solo se use el RuName (ej. `Ivan_Marty-IvanMart-IVANRe-cgcqu`).

### 6. **Mensaje de error global sin identificar API**

- **Causa:** Al fallar la petición de auth-url (p. ej. 500), `setError` no siempre se llamaba y el mensaje no indicaba qué API había fallado (eBay vs AliExpress).
- **Corrección:** Se prefija el mensaje con `[apiName]` y se llama a `setError` también en el `catch` del flujo OAuth.

---

## Correcciones aplicadas

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `backend/src/api/routes/marketplace.routes.ts` | Scopes eBay en formato URL completo: `https://api.ebay.com/oauth/api_scope`, `.../sell.inventory.readonly`, `.../sell.inventory`, `.../sell.marketing.readonly`, `.../sell.marketing`, `.../sell.account`, `.../sell.fulfillment`. Evita `invalid_scope`. |
| 2 | `backend/src/api/routes/marketplace-oauth.routes.ts` | Callback con `error` (p. ej. invalid_scope): respuesta **200** con HTML y enlace "Volver a API Settings" (mismo dominio desde `WEB_BASE_URL`). |
| 3 | `backend/src/api/routes/marketplace-oauth.routes.ts` | Callback sin `code` o con state inválido: respuesta **200** (no 400) con la misma página de error y enlace de vuelta. |
| 4 | `backend/src/services/marketplace.service.ts` | En `getEbayOAuthStartUrl` se a?aden scopes `sell.account` y `sell.fulfillment` en formato URL completo para alineación con auth-url. |
| 5 | `frontend/src/pages/APISettings.tsx` | Al fallar OAuth (auth-url o error en respuesta): `setError(\`[${apiName}] ${message}\`)` para que el banner muestre qué API falló; y `setError` también en el `catch` del flujo OAuth. |

---

## Configuración recomendada (APIS2.txt / rail.txt)

- **Producción:**  
  - App ID: `IvanMart-IVANRese-PRD-febbdcd65-626be473`  
  - RuName: `Ivan_Marty-IvanMart-IVANRe-cgcqu`  
  - En eBay Developer, la URL del RuName debe ser: `https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/ebay` (o la de tu backend si usas proxy).
- **Sandbox (solo si se usa):**  
  - App ID: `IvanMart-IVANRese-SBX-1eb10af0a-358ddf27`  
  - RuName: `Ivan_Marty-IvanMart-IVANRe-vxcxlakn`  
  - En API Settings, seleccionar entorno "Sandbox" y tener guardadas solo credenciales SBX.
- **Variables de entorno (Railway/producción):**  
  - `EBAY_RUNAME=Ivan_Marty-IvanMart-IVANRe-cgcqu`  
  - `WEB_BASE_URL=https://www.ivanreseller.com` (para enlaces de vuelta en callback).

---

## Pasos para el usuario

1. En **API Settings ? eBay**, elegir **Producción** y en "Redirect URI (RuName)" poner **solo** `Ivan_Marty-IvanMart-IVANRe-cgcqu`. Guardar.
2. Pulsar **Autorizar OAuth**. Completar el flujo en eBay.
3. Si eBay muestra "invalid_scope", en el portal de desarrollador de eBay comprobar que la aplicación tenga asignados los scopes de venta (sell.inventory, sell.marketing, sell.account, sell.fulfillment).
4. Si tras el callback aparece la página de error, usar el botón **"Volver a API Settings"** (ya no se devuelve 400).

---

## Scopes eBay utilizados (referencia)

- `https://api.ebay.com/oauth/api_scope`
- `https://api.ebay.com/oauth/api_scope/sell.inventory.readonly`
- `https://api.ebay.com/oauth/api_scope/sell.inventory`
- `https://api.ebay.com/oauth/api_scope/sell.marketing.readonly`
- `https://api.ebay.com/oauth/api_scope/sell.marketing`
- `https://api.ebay.com/oauth/api_scope/sell.account`
- `https://api.ebay.com/oauth/api_scope/sell.fulfillment`

Deben estar asignados al keyset (Producción o Sandbox) en [eBay Developer](https://developer.ebay.com/my/keys).

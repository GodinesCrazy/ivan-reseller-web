# eBay OAuth End-to-End - Implementación Completa

## RESUMEN

Implementación real (sin mocks) del flujo OAuth de eBay para que el sistema Ivan Reseller pueda publicar productos automáticamente.

---

## ENDPOINTS CREADOS/MODIFICADOS

### 1. GET /api/marketplace-oauth/oauth/start/ebay
- **Función**: Redirige automáticamente a eBay OAuth
- **Auth**: Requerida (authenticate middleware)
- **Query**: `?environment=sandbox|production` (opcional)
- **Respuesta**: 302 redirect a `https://auth.ebay.com/oauth2/authorize` (o sandbox)

### 2. GET /api/marketplace-oauth/oauth/callback/ebay
- **Función**: Recibe `code`, intercambia por tokens, guarda en DB
- **Auth**: Pública (eBay redirige aquí)
- **Flujo**:
  1. Recibe `code` y `state`
  2. Valida state (userId, firma)
  3. POST a `https://api.ebay.com/identity/v1/oauth2/token`
  4. Guarda `token`, `refreshToken`, `expiresAt` en api_credentials

### 3. GET /api/system/diagnostics
- **Función**: Diagnóstico global en tiempo real
- **Respuesta**:
```json
{
  "database": { "connected": true },
  "ebay": {
    "connected": true,
    "tokenValid": true,
    "expiresAt": "2025-02-20T...",
    "envReady": true
  },
  "aliexpress": { "connected": true, "tokenValid": true },
  "paypal": { "connected": true },
  "autopilot": {
    "running": false,
    "lastCycle": null,
    "productsPublished": 0
  },
  "EBAY_OAUTH_READY": true,
  "EBAY_PUBLICATION_READY": true,
  "AUTOPILOT_PUBLICATION_READY": true,
  "SYSTEM_PRODUCTION_READY": true
}
```

---

## TOKENS EN BASE DE DATOS

- **Tabla**: `api_credentials`
- **Campos guardados** (JSON cifrado): `token`, `refreshToken`, `expiresAt`, `appId`, `certId`, `redirectUri`, `sandbox`
- **Refresh automático**: `EbayService.ensureAccessToken()` usa refresh_token cuando el token expira

---

## VARIABLES DE ENTORNO OBLIGATORIAS

```
EBAY_APP_ID=...
EBAY_CERT_ID=...
EBAY_REDIRECT_URI=...
```

O equivalentes: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RUNAME`

---

## FLUJO COMPLETO

1. Usuario: `GET /api/marketplace-oauth/oauth/start/ebay` (autenticado)
2. Redirect a eBay ? usuario autoriza
3. eBay redirige a `.../oauth/callback/ebay?code=...&state=...`
4. Backend intercambia code por tokens, guarda en api_credentials
5. Autopilot: antes de publicar, carga credenciales, refresca si expirado, publica

---

## SCRIPT DE PRUEBA

```bash
npx ts-node scripts/test-ebay-publication.ts
```

Verifica: env vars, credenciales en DB, testConnection.

---

## VALIDACIÓN FINAL

- `EBAY_OAUTH_READY`: env + tokens en DB
- `EBAY_PUBLICATION_READY`: tokens válidos (no expirados o con refreshToken)
- `AUTOPILOT_PUBLICATION_READY`: eBay listo + DB conectada
- `SYSTEM_PRODUCTION_READY`: DB + eBay + AliExpress

---

## RAILWAY DEPLOYMENT

1. Configurar env: EBAY_APP_ID, EBAY_CERT_ID, EBAY_REDIRECT_URI
2. Redirect URI en eBay Developer: `https://tu-app.railway.app/api/marketplace-oauth/oauth/callback/ebay`
3. Usuario completa OAuth una vez
4. Autopilot publica automáticamente

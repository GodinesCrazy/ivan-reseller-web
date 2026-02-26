# Variables para Railway (desde APIS2.txt y rail.txt)

Configura estas variables en **Railway → tu servicio backend → Variables**. Los valores están en `APIS2.txt` y `rail.txt` en la raíz del proyecto. **No pegues secretos en este archivo ni los commitees.**

## Cómo aplicar todo de una vez (local)

Desde la carpeta **backend**:

```bash
npx tsx scripts/configure-apis-from-apis2.ts
```

Eso lee `APIS2.txt` y `rail.txt` (en la raíz del repo), extrae todas las claves y escribe `backend/.env.local`. Para Railway, copia las mismas variables desde tu `.env.local` o desde los archivos fuente.

---

## Lista de variables (nombre → dónde está el valor)

| Variable | Origen |
|----------|--------|
| `GROQ_API_KEY` | APIS2: línea `groq : gsk_...` |
| `OPENAI_API_KEY` | APIS2: bloque OpenAI, `sk-proj-...` |
| `GEMINI_API_KEY` | APIS2: `GEMINI_API_KEY AIzaSy...` |
| `SERP_API_KEY` | APIS2: `SerpAPI Key ...` |
| `SENDGRID_API_KEY` | APIS2: `SENDGRID_API_KEY ...` |
| `SCRAPERAPI_KEY` | APIS2: `ScraperAPI Key : ...` |
| `ZENROWS_API_KEY` | APIS2: `ZenRows API: ...` |
| `EBAY_SANDBOX_APP_ID` | APIS2: eBay (SandBox) → App ID |
| `EBAY_SANDBOX_DEV_ID` | APIS2: eBay (SandBox) → Dev ID |
| `EBAY_SANDBOX_CERT_ID` | APIS2: eBay (SandBox) → Cert ID |
| `EBAY_SANDBOX_REDIRECT_URI` | APIS2: eBay (SandBox) → Redirect URI (RuName) |
| `EBAY_PRODUCTION_APP_ID` | APIS2: eBay producción → App ID |
| `EBAY_PRODUCTION_DEV_ID` | APIS2: eBay producción → Dev ID |
| `EBAY_PRODUCTION_CERT_ID` | APIS2: eBay producción → Cert ID |
| `EBAY_PRODUCTION_REDIRECT_URI` | APIS2: eBay producción → Redirect URI (RuName) |
| `PAYPAL_CLIENT_ID` | APIS2: PayPal Sandbox → Client ID (par con Secret EEKi...) |
| `PAYPAL_CLIENT_SECRET` | APIS2: PayPal Sandbox → Secret |
| `PAYPAL_ENVIRONMENT` | `sandbox` o `production` según entorno |
| `PAYPAL_SANDBOX_CLIENT_ID` / `PAYPAL_SANDBOX_CLIENT_SECRET` | APIS2: PayPal Sandbox |
| `PAYPAL_PRODUCTION_CLIENT_ID` / `PAYPAL_PRODUCTION_CLIENT_SECRET` | APIS2: PayPal Live |
| `STRIPE_PUBLIC_KEY` | APIS2: clave `pk_test_...` |
| `STRIPE_SECRET_KEY` | APIS2: clave `sk_test_...` |
| `ALIEXPRESS_DROPSHIPPING_APP_KEY` | APIS2: Drop Shipping → AppKey (522578) |
| `ALIEXPRESS_DROPSHIPPING_APP_SECRET` | APIS2: Drop Shipping → App Secret |
| `ALIEXPRESS_APP_KEY` | APIS2: Affiliates API → AppKey (524880) |
| `ALIEXPRESS_APP_SECRET` | APIS2: Affiliates API → App Secret |
| `ALIEXPRESS_AFFILIATE_APP_KEY` / `ALIEXPRESS_AFFILIATE_APP_SECRET` | Igual que APP_KEY/APP_SECRET Affiliate |
| `ALIEXPRESS_AFFILIATE_TRACKING_ID` | APIS2: `ALIEXPRESS_AFFILIATE_TRACKING_ID=...` |
| `ALIEXPRESS_DROPSHIPPING_TRACKING_ID` | APIS2: `ALIEXPRESS_DROPSHIPPING_TRACKING_ID=...` |
| `ALLOW_BROWSER_AUTOMATION` | rail.txt: `ALLOW_BROWSER_AUTOMATION=true` |
| `ALIEXPRESS_USER` | rail.txt: email AliExpress |
| `ALIEXPRESS_PASS` | rail.txt: contraseña AliExpress |
| `INTERNAL_RUN_SECRET` | APIS2 o rail.txt: `INTERNAL_RUN_SECRET=...` |

Además, en Railway debes tener ya configuradas:

- `DATABASE_URL` (PostgreSQL)
- `JWT_SECRET`
- `CORS_ORIGIN` (URL del frontend, p. ej. tu app en Vercel)
- `API_URL` (URL pública del backend, p. ej. `https://ivan-reseller-web-production.up.railway.app`)

---

## PayPal en producción

Para pagos reales en Railway:

- `PAYPAL_CLIENT_ID` = Client ID **Live**
- `PAYPAL_CLIENT_SECRET` = Client Secret **Live**
- `PAYPAL_ENVIRONMENT` = `production` (o `live`)

Tras cambiar variables, redeploy en Railway.

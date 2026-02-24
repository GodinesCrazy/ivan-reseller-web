# Referencia de APIs ? Fuente: APIS2.txt

Este documento indica **qué variables de entorno** usar y **en qué sección de APIS2.txt** está cada valor.  
**No incluye los valores reales**; copialos desde APIS2.txt según la sección indicada.

---

## PayPal (payouts y pagos)

| Variable | Ubicación en APIS2.txt | Uso |
|----------|------------------------|-----|
| `PAYPAL_CLIENT_ID` | Sección **PayPal ? Sandbox ? Client ID** (línea ~75) | Sandbox: desarrollo y pruebas de payouts |
| `PAYPAL_CLIENT_SECRET` | Sección **PayPal** ? buscar "secret Key" (línea ~81). En Sandbox suele ser un **Secret** distinto del Client ID en developer.paypal.com | Obligatorio para oauth2/token y payouts |
| `PAYPAL_ENVIRONMENT` | Valor: `sandbox` o `production` | `sandbox` por defecto; en producción usar `production` y credenciales Live |

**PayPal Live (producción):**  
- Client ID en **PayPal ? Live ? Client ID** (línea ~77).  
- Secret: en developer.paypal.com, app de **Live**, pesta?a "Secret".

**Para REAL_PAYOUT_SUCCESS:**  
Configurar en `.env` o `.env.local` (nunca commitear):  
`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT=sandbox`.  
Además: `PAYPAL_ADMIN_EMAIL` y `PAYPAL_USER_EMAIL` (emails de cuentas Sandbox que reciben los payouts).

---

## AI Providers

| Variable | Ubicación en APIS2.txt |
|----------|------------------------|
| Groq | Línea ~23: `groq : gsk_...` ? usar como `GROQ_API_KEY` |
| OpenAI | Línea ~26: `sk-proj-...` ? usar como `OPENAI_API_KEY` |
| Gemini | Línea ~31: `GEMINI_API_KEY` + valor |

---

## eBay

| Variable / Uso | Ubicación |
|----------------|-----------|
| Sandbox: App ID (Client ID), Dev ID, Cert ID (Client Secret), Redirect URI (RuName) | Líneas 37-41 |
| Producción: App ID, Dev ID, Cert ID, Redirect URI | Líneas 44-49 |

---

## Scraping

| Variable | Ubicación |
|----------|-----------|
| ScraperAPI Key | Línea 59 |
| ZenRows API | Línea 62 |
| BrightData | Línea 65 |

---

## Stripe

| Variable | Ubicación | Nota en APIS2 |
|----------|-----------|----------------|
| Clave pública (pk_test_...) | Línea 84, etiquetada como STRIPE_SECRET_KEY | En realidad es public key |
| Clave secreta (sk_test_...) | Línea 85, STRIPE_WEBHOOK_SECRET | Es la secret key |
| Usar: `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` según corresponda en tu app | | |

---

## Notificaciones

| Variable | Ubicación |
|----------|-----------|
| SendGrid/Twilio | Línea 93: `SENDGRID_API_KEY` |

---

## AliExpress

| Variable / Uso | Ubicación |
|----------------|-----------|
| Dropshipping: AppKey, App Secret, Callback URL | Líneas 120-128 |
| Affiliates: AppKey, App Secret | Líneas 132-134 |
| SerpAPI Key | Línea 137 |
| `ALIEXPRESS_AFFILIATE_TRACKING_ID` | Línea 139 |
| `ALIEXPRESS_DROPSHIPPING_TRACKING_ID` | Línea 140 |

---

## Exchange Rate

| Variable | Ubicación |
|----------|-----------|
| Exchange API Key | Línea 101 |

---

## URLs del proyecto (APIS2.txt)

- Producción (Railway): `https://ivan-reseller-web-production.up.railway.app/`
- Frontend (Vercel): `https://ivan-reseller-3allv4lmr-ivan-martys-projects.vercel.app/login`

---

**Importante:** APIS2.txt contiene credenciales sensibles. No subas APIS2.txt a repositorios públicos. Usa este documento solo como guía de **qué variable corresponde a cada sección** y configura los valores en `.env` / `.env.local` o en las variables de tu plataforma (Railway, Vercel, etc.).

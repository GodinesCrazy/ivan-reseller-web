# RAILWAY ENV ROTATION CHECKLIST

**Date:** 2025-02-24  
**Purpose:** After rotating exposed secrets, set these variables in **Railway ? your backend service ? Variables**. Never commit real values to the repo.

---

| VARIABLE | STATUS | REQUIRES UPDATE | SOURCE |
|----------|--------|----------------|--------|
| `DATABASE_URL` | Set in Railway (PostgreSQL) | YES if compromised | Railway PostgreSQL plugin or manual connection string |
| `JWT_SECRET` | Must be ?32 chars, cryptographically random | YES | Run `node backend/scripts/rotate-secrets-env.js` locally; copy value to Railway |
| `INTERNAL_RUN_SECRET` | Required for internal/verifier endpoints | YES | Same script as JWT_SECRET |
| `ENCRYPTION_KEY` | Required for credential encryption | YES | Same script |
| `ALIEXPRESS_APP_KEY` | AliExpress Affiliate/Dropshipping App Key | YES if exposed | New key from AliExpress Open Platform (or rotated key) |
| `ALIEXPRESS_APP_SECRET` | AliExpress App Secret | YES if exposed | New secret from AliExpress Open Platform |
| `ALIEXPRESS_DROPSHIPPING_APP_KEY` | Dropshipping API App Key | YES if exposed | AliExpress Dropshipping API console |
| `ALIEXPRESS_DROPSHIPPING_APP_SECRET` | Dropshipping API App Secret | YES if exposed | AliExpress Dropshipping API console |
| `PAYPAL_CLIENT_ID` | PayPal REST API Client ID | YES if exposed | PayPal Developer Dashboard (Live for production) |
| `PAYPAL_CLIENT_SECRET` | PayPal REST API Client Secret | YES if exposed | PayPal Developer Dashboard (Live for production) |
| `PAYPAL_ENVIRONMENT` | `production` for real payments | Set to `production` | Use `production` or `live` |
| `ALLOW_BROWSER_AUTOMATION` | `false` when using Dropshipping API only | Recommended `false` | Reduces attack surface |
| `AUTOPILOT_MODE` | `production` for real cycle | Set to `production` | Enables real purchases/payouts |
| `CORS_ORIGIN` | Frontend origin URL | Set to your Vercel/frontend URL | e.g. `https://ivan-reseller-xxx.vercel.app` |
| `API_URL` | Public backend URL | Set to Railway URL | e.g. `https://ivan-reseller-web-production.up.railway.app` |

---

## Optional (keep if already set, rotate if exposed)

| VARIABLE | STATUS | REQUIRES UPDATE | SOURCE |
|----------|--------|----------------|--------|
| `SERP_API_KEY` | SerpAPI for trends | YES if exposed | serpapi.com |
| `OPENAI_API_KEY` | OpenAI | YES if exposed | platform.openai.com |
| `STRIPE_SECRET_KEY` | Stripe | YES if exposed | Stripe Dashboard |
| `SENDGRID_API_KEY` | SendGrid | YES if exposed | SendGrid |
| `GROQ_API_KEY` | Groq | YES if exposed | groq.com |
| `EBAY_*` (Sandbox/Production) | eBay OAuth | YES if exposed | eBay Developer |

---

## Verification

After updating Railway variables:

1. Redeploy the backend service.
2. Call `GET https://<RAILWAY_URL>/api/internal/health` with header `x-internal-secret: <INTERNAL_RUN_SECRET>` ? expect 200 and `hasSecret: true`.
3. Log in from frontend ? JWT signed with new JWT_SECRET.
4. Run a test capture-order (sandbox or production) to confirm PayPal and AliExpress paths.

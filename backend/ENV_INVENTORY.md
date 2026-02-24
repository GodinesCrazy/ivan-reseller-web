# Backend Environment Variables Inventory

Scanned from `backend/src` and `backend/src/config/env.ts`.

---

## A) Mandatory for discovery-only cycle

Required for `POST /api/internal/test-full-dropshipping-cycle` with `skipPostSale=true` to return `success: true` (real data only).

| Variable | Purpose | Used in |
|----------|---------|---------|
| `INTERNAL_RUN_SECRET` | Auth for internal endpoints (verifier) | `internal.routes.ts` |
| `SERP_API_KEY` or `GOOGLE_TRENDS_API_KEY` | Real trend keywords (no fallback) | `test-full-dropshipping-cycle.handler.ts`, `google-trends.service.ts` |
| `ALIEXPRESS_APP_KEY` | AliExpress Affiliate API | `aliexpress.service.ts`, `aliexpress-affiliate-api.service.ts`, `opportunity-finder.service.ts` |
| `ALIEXPRESS_APP_SECRET` | AliExpress Affiliate API | Same as above |
| `DATABASE_URL` | PostgreSQL for app and Prisma | `env.ts`, `database.ts` |
| `JWT_SECRET` | Auth (min 32 chars); required by env schema | `env.ts` |
| `ENCRYPTION_KEY` | Credential encryption (or fallback to JWT_SECRET) | `env.ts` |

---

## B) Mandatory for full post-sale cycle

Required when `skipPostSale=false` (PayPal capture + AliExpress purchase).

| Variable | Purpose | Used in |
|----------|---------|---------|
| `PAYPAL_CLIENT_ID` | PayPal REST API | `paypal-checkout.service.ts` |
| `PAYPAL_CLIENT_SECRET` | PayPal REST API | Same |
| `PAYPAL_ENVIRONMENT` or `PAYPAL_ENV` | `sandbox` or `production` | Same |
| `ALLOW_BROWSER_AUTOMATION` | Must be `true` for real AliExpress purchase | `env.ts`, `aliexpress-checkout.service.ts` |
| `ALIEXPRESS_USER` | AliExpress login for auto-purchase | `aliexpress-checkout.service.ts` |
| `ALIEXPRESS_PASS` | AliExpress password | Same |

---

## C) Optional / advanced

| Variable | Purpose | Default / note |
|----------|---------|-----------------|
| `PORT` | Server port | 3000 (env) / 4000 (server.ts) |
| `NODE_ENV` | development / production / test | development |
| `API_URL` | Backend base URL (e.g. for callbacks) | http://localhost:3000 |
| `FRONTEND_URL` | Frontend base URL | ? |
| `CORS_ORIGIN` / `CORS_ORIGINS` | Allowed origins | http://localhost:5173 |
| `REDIS_URL` | Redis connection | redis://localhost:6379 |
| `ALIEXPRESS_TRACKING_ID` | Affiliate tracking id | ivanreseller |
| `ALIEXPRESS_REDIRECT_URI` | OAuth callback URL | (Railway default) |
| `ALIEXPRESS_OAUTH_BASE` | OAuth base URL | https://api-sg.aliexpress.com/oauth |
| `ALIEXPRESS_API_BASE` / `ALIEXPRESS_API_BASE_URL` | Affiliate API base | https://api-sg.aliexpress.com/sync |
| `PAYPAL_WEBHOOK_ID` | PayPal webhook verification | ? |
| `MIN_OPPORTUNITY_MARGIN` | Opportunity filter | 0.10 |
| `SAFE_BOOT` | Disable heavy workers | false |
| `LOG_LEVEL` | error / warn / info / debug | info |
| `SCRAPER_BRIDGE_ENABLED` | Use scraper bridge | true |
| `SCRAPER_BRIDGE_URL` | Scraper bridge URL | http://127.0.0.1:8077 |
| `NATIVE_SCRAPER_URL` | Native scraper service | ? |
| `GROQ_API_KEY` | AI / scraping | ? |
| `SCRAPERAPI_KEY` | ScraperAPI | ? |
| `DISABLE_BROWSER_AUTOMATION` | Disable Puppeteer globally | ? |
| `EBAY_APP_ID`, `EBAY_DEV_ID`, `EBAY_CERT_ID` | eBay API | ? |
| `MERCADOLIBRE_CLIENT_ID`, `MERCADOLIBRE_CLIENT_SECRET` | MercadoLibre API | ? |
| `SMTP_*`, `TWILIO_*`, `SLACK_*`, `DISCORD_*`, `VAPID_*` | Notifications | ? |
| `DEBUG_KEY` | Debug endpoints | ? |
| `SKIP_ENCRYPTION_KEY_VALIDATION` | Skip encryption key check (e.g. tests) | — |

---

## Env template

See `backend/env.local.example`. Copy to `.env.local` and replace `REPLACE_ME` values:

```bash
cd backend && cp env.local.example .env.local
```

**Verifier script:** To force the verifier to hit the local backend instead of `API_URL` from `.env.local`, set `VERIFIER_TARGET_URL=http://localhost:4000` when running the script.

# Verifier setup (test-full-dropshipping-cycle ? success: true)

To get **success: true** in discovery-only mode with **real data** (no fallbacks/mocks):

## 1. Environment variables

Run from `backend/`:

```bash
npm run bootstrap-env   # create .env.local from env.local.example if missing
```

Then edit **`backend/.env.local`** and replace every `REPLACE_ME` with a real value.

### Required for discovery-only

| Variable | Purpose |
|----------|--------|
| `INTERNAL_RUN_SECRET` | Auth for internal verifier endpoint (or run `node scripts/inject-verifier-env.js` to generate) |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Auth tokens (?32 chars; inject script can generate) |
| `ENCRYPTION_KEY` | Encrypt stored credentials (inject script can generate) |
| **`SERP_API_KEY`** or **`GOOGLE_TRENDS_API_KEY`** | **Real trends** ? without one, the verifier reports "Fallback keywords used" and success stays false |
| `ALIEXPRESS_APP_KEY` + `ALIEXPRESS_APP_SECRET` | Used for product search; **Affiliate API also requires OAuth** (see below) |

Optional: `ALIEXPRESS_TRACKING_ID` (defaults to `ivanreseller`).

### Generate secrets

From `backend/`:

```bash
node scripts/inject-verifier-env.js
```

This updates `.env.local`: generates `INTERNAL_RUN_SECRET`, `JWT_SECRET`, `ENCRYPTION_KEY` if missing, and copies from `process.env` (or `.env` / `.env.local`) for API keys and `DATABASE_URL`.

## 2. Trends (real keywords)

- Get a **SerpAPI** key: https://serpapi.com (Google Trends engine).
- Or use a **Google Trends API** key if your trends service supports it.
- Set **one** of: `SERP_API_KEY` or `GOOGLE_TRENDS_API_KEY` in `.env.local` (or `.env` and run `inject-verifier-env.js`).

Without this, the verifier marks trends as non-real and fails the final check.

## 3. Product discovery (real AliExpress results)

The pipeline tries, in order: **bridge** ? **native** ? **affiliate** ? **external**.

- **Affiliate (AliExpress)**  
  `ALIEXPRESS_APP_KEY` and `ALIEXPRESS_APP_SECRET` must be set. The Affiliate API also requires an **OAuth access token** (user completes AliExpress OAuth in the app). If no token is stored, the affiliate source returns 0 products.

- **Bridge / native**  
  Require the scraper bridge or native scraper to be running and configured (e.g. `NATIVE_SCRAPER_URL`, `SCRAPER_BRIDGE_ENABLED`).

- **External (ScraperAPI / ZenRows)**  
  Require credentials stored in the app (CredentialsManager) for the test user (e.g. user id 1), not only env vars.

So for **real products** you need at least one of:

1. **AliExpress OAuth completed** so the affiliate source can use a token, or  
2. **Scraper bridge or native scraper** running and returning results, or  
3. **ScraperAPI or ZenRows** credentials stored in the app for the verifier user.

## 4. Check and run

```bash
cd backend
npm run check-verifier-env   # exit 0 when all required vars are set
npm run dev                  # terminal 1
npm run test-full-dropshipping-cycle   # terminal 2
```

Verifier passes (exit 0) only when:

- Trends use the real API (no "Fallback keywords used").
- At least one discovery source returns products (no NO_REAL_PRODUCTS).
- No simulated/fallback paths in the reported stages.

## 5. Keyword

The verifier uses keyword **`phone case`** by default. Override via env:

```bash
keyword=wireless earbuds npm run test-full-dropshipping-cycle
```

(Use the same env var name your script reads, e.g. `keyword`.)

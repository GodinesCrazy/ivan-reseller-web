# APIS2.txt ? Railway environment variables

For **production Autopilot** to run without credential errors, set the following environment variables in Railway (Dashboard ? your Backend service ? Variables) using the values from your `APIS2.txt` file.

## Required for Autopilot

| Variable | Source in APIS2.txt | Notes |
|----------|---------------------|--------|
| `EBAY_CLIENT_ID` | eBay producción ? App ID (Client ID) | Or use `EBAY_APP_ID` |
| `EBAY_CLIENT_SECRET` | eBay producción ? Cert ID (Client Secret) | Or use `EBAY_CERT_ID` |
| `EBAY_REDIRECT_URI` | eBay producción ? Redirect URI (RuName) | Full URL if required by eBay |
| `SCRAPER_API_KEY` or `SCRAPERAPI_KEY` | ScraperAPI Key | Either name works |
| `ZENROWS_API_KEY` | ZenRows API | Alternative/backup scraping |

## Optional

| Variable | Source |
|----------|--------|
| `EBAY_DEV_ID` | eBay Dev ID (if needed) |
| `PAYPAL_CLIENT_ID` | PayPal Live Client ID |

## Priority

1. **Database credentials** (Settings ? API Settings) take precedence when present.
2. **Environment variables** above are used when DB credentials are not set, so Autopilot can start with env-only configuration.

Do not commit `APIS2.txt` or paste secrets into this repo.

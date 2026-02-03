# AliExpress OAuth Completion Guide

## Current Status

- **Backend**: Running on port 4000
- **APP_KEY**: 524880 (discovered from production)
- **OAuth URL**: Generates correctly with `api-sg.aliexpress.com/oauth/authorize`
- **Fix applied**: Double `/authorize` in URL corrected

## Blockers to Complete Flow

### For Localhost (http://localhost:4000)

1. **AliExpress App Callback URL**: Add `http://localhost:4000/api/aliexpress/callback` in [AliExpress Open Platform](https://portals.aliexpress.com/) ? Your App ? OAuth Settings ? Redirect URIs

2. **APP_SECRET**: Copy from Railway Dashboard ? ivan-reseller-backend ? Variables ? ALIEXPRESS_APP_SECRET, then add to `backend/.env.local`:
   ```
   ALIEXPRESS_APP_SECRET=<paste_real_secret>
   ```

3. Restart backend: `cd backend && npm run dev`

### For Production (Railway)

1. **Railway Variables**: Ensure `ALIEXPRESS_REDIRECT_URI=https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback`

2. Complete OAuth:
   - GET `https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/oauth/url`
   - Open returned URL in browser
   - Click "Buyer login", sign in, authorize
   - Redirect will hit production callback; token stored

3. Verify:
   - GET `/api/aliexpress/oauth/status` ? `hasToken: true`
   - GET `/api/aliexpress/affiliate/debug-search` ? `products.length > 0`

## Quick Test (Production)

```bash
# 1. Get OAuth URL
curl "https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/oauth/url"

# 2. Open the "url" value in browser, approve app

# 3. Check token
curl "https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/oauth/status"

# 4. Test affiliate search
curl "https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/affiliate/debug-search"
```

## Setup Script (Local)

Run to interactively add credentials to `.env.local`:
```powershell
cd backend
.\scripts\setup-aliexpress-credentials.ps1
```

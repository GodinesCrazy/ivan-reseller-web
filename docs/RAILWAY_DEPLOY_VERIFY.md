# Railway Deployment Verification Guide
**Purpose:** Verify that Railway is deploying the correct commit and configuration  
**Last Updated:** 2025-12-18

---

## Quick Verification (From Outside Railway)

### Step 1: Check /version Endpoint

Execute from your local machine:

```powershell
curl.exe -i --max-time 10 https://ivan-reseller-web-production.up.railway.app/version
```

**Expected Response:**
```json
{
  "gitSha": "a2efec2",
  "buildTime": "2025-12-18T...",
  "node": "v20.x.x",
  "env": "production",
  "serviceName": "ivan-reseller-web-backend",
  "uptime": 123.45
}
```

**Also check headers:**
- `X-App-Commit`: Should match the git SHA from GitHub
- `X-App-Build-Time`: Should be recent (within last hour if just deployed)
- `X-App-Node`: Should show Node.js version

### Step 2: Verify Git SHA Matches GitHub

1. Go to GitHub: https://github.com/GodinesCrazy/ivan-reseller-web
2. Check the latest commit SHA on `main` branch
3. Compare with `gitSha` from `/version` endpoint
4. **They should match** (first 7 characters)

---

## Detailed Railway Dashboard Verification

### Step 1: Open Railway Dashboard

1. Go to https://railway.app
2. Login to your account
3. Navigate to project containing "ivan-reseller-web"

### Step 2: Verify Service Configuration

1. Click on the service **"ivan-reseller-web"** (or similar name)
2. Go to **Settings** tab
3. Verify:
   - **Source:** GitHub repository `GodinesCrazy/ivan-reseller-web`
   - **Branch:** `main`
   - **Root Directory:** `/backend`
   - **Auto Deploy:** ON (should be enabled)

### Step 3: Verify Latest Deployment

1. Go to **Deployments** tab
2. Click on the **most recent deployment**
3. Verify:
   - **Status:** Should be "Active" or "Success"
   - **Commit SHA:** Should match the latest commit on GitHub `main` branch
   - **Build Time:** Should be recent (within last hour if just pushed)
4. Click **"View Logs"** and check for:
   - `BOOT gitSha=... buildTime=... port=... host=0.0.0.0`
   - `LISTEN_CALLBACK - Server listening on 0.0.0.0:PORT`
   - **NO errors:** `ERR_HTTP_HEADERS_SENT`, `uncaughtException`, crashes

### Step 4: Verify Domain Configuration

1. Go to **Settings** ? **Networking**
2. Verify:
   - **Public Domain:** `ivan-reseller-web-production.up.railway.app` (or your custom domain)
   - Domain is **attached** to the correct service (backend service, not frontend)

### Step 5: Verify Environment Variables

1. Go to **Variables** tab
2. Verify **CRITICAL** variables are set:
   - `DATABASE_URL` - Should be set (from PostgreSQL service)
   - `JWT_SECRET` - Should be set (>= 32 characters)
   - `ENCRYPTION_KEY` - Should be set (>= 32 characters) OR will use JWT_SECRET as fallback
   - `NODE_ENV` - Should be `production`
   - `PORT` - Should NOT be set manually (Railway assigns automatically)
   - `CORS_ORIGIN` - Should be set to frontend URL (e.g., `https://www.ivanreseller.com`)

---

## Manual Redeploy (If Needed)

If `/version` shows an old commit SHA:

1. Go to **Deployments** tab
2. Click **"Redeploy"** button (or three dots menu ? Redeploy)
3. Wait for deployment to complete (usually 2-5 minutes)
4. Verify `/version` again after deployment completes

---

## Troubleshooting

### Problem: /version returns old commit SHA

**Solution:**
1. Check Railway dashboard ? Deployments ? Latest deployment
2. If latest deployment shows correct SHA but `/version` shows old SHA:
   - Wait 1-2 minutes (Railway may be rolling out)
   - Check if there are multiple deployments in progress
   - Try manual redeploy
3. If latest deployment shows wrong SHA:
   - Check GitHub ? main branch ? verify latest commit
   - Check Railway ? Settings ? Source ? Branch = `main`
   - Check Railway ? Settings ? Auto Deploy = ON
   - If Auto Deploy is OFF, enable it or trigger manual deploy

### Problem: /version returns 502 or timeout

**Solution:**
1. Check Railway ? Deployments ? Latest deployment ? View Logs
2. Look for:
   - `ERR_HTTP_HEADERS_SENT` - Should NOT appear (if it does, see FASE 1 fixes)
   - `Listening on port` - Should appear
   - `uncaughtException` - Should NOT appear
   - Database connection errors - May appear but should not block startup
3. Check Railway ? Variables ? `DATABASE_URL` is set correctly
4. Check Railway ? Variables ? `JWT_SECRET` and `ENCRYPTION_KEY` are set

### Problem: /health returns 502

**Solution:**
1. This should NOT happen after FASE 1 fixes
2. If it still happens:
   - Check Railway logs for `ERR_HTTP_HEADERS_SENT`
   - Verify that `on-headers` package is installed (check `package.json`)
   - Verify that `/health` route is BEFORE compression middleware in `app.ts`

---

## Success Criteria

? **Deployment Verified** when:
1. `/version` endpoint returns 200 with valid JSON
2. `gitSha` from `/version` matches latest commit on GitHub `main` branch
3. `X-App-Commit` header matches `gitSha` from response body
4. `/health` returns 200 in < 1s
5. `/ready` returns 200 or 503 in < 5s (never timeout)
6. Railway dashboard shows latest deployment as "Active" with correct commit SHA

---

## Next Steps

After verification:
1. Run smoke tests: `.\scripts\smoke_railway.ps1`
2. Check evidence: `docs/CERT_EVIDENCE_SMOKE.md`
3. Proceed to FASE 3 (Smoke Test) if all checks pass

---

**Note:** Railway auto-deploys from `main` branch. Any push to `main` should trigger a new deployment within 1-2 minutes.

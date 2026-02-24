# Scraper Bridge - Railway Deployment

Deploy scraper-bridge as a separate Railway service and connect it to the backend.

---

## Step 1: Create New Railway Service

1. Go to [Railway Dashboard](https://railway.app) and select your **ivan-reseller** project.
2. Click **"+ New"** ? **"GitHub Repo"**.
3. Select `GodinesCrazy/ivan-reseller-web` (or your repo).
4. Railway will create a new service. **Do not deploy yet.**

---

## Step 2: Configure Service Settings

1. Select the new service ? **Settings** (gear icon).
2. **Root Directory:** Set to `scraper-bridge`.
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. **Port:** Railway auto-assigns PORT; the app uses `process.env.PORT || 3333`.

---

## Step 3: Deploy and Obtain Public URL

1. Click **Deploy** (or push a commit to trigger deploy).
2. Wait for the build to complete.
3. Go to **Settings** ? **Networking** ? **Generate Domain** (if no domain yet).
4. Copy the **public URL** (e.g. `https://scraper-bridge-production-xxxx.up.railway.app`).

---

## Step 4: Update Backend Environment Variables

1. Select your **backend** service in the project.
2. Go to **Variables** tab.
3. Add or update:
   - `SCRAPER_BRIDGE_ENABLED` = `true`
   - `SCRAPER_BRIDGE_URL` = `<bridge_public_url>` (e.g. `https://scraper-bridge-production-xxxx.up.railway.app`)

   **Important:** Use the full URL without trailing slash (e.g. `https://xxx.up.railway.app`).

---

## Step 5: Restart Backend Service

1. In the backend service, go to **Settings**.
2. Click **Restart** (or redeploy).
3. Confirm the backend restarts and health check passes.

---

## Verification

- **Scraper Bridge health:** `GET <bridge_url>/health` ? `{"data":{"status":"ok"}}`
- **Backend health:** `GET https://ivanreseller.com/api/health` ? `{"status":"healthy"...}`

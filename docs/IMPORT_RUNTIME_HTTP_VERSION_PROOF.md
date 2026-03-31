# Import runtime — HTTP version proof

## Backend

```http
GET https://ivan-reseller-backend-production.up.railway.app/version
GET https://ivan-reseller-backend-production.up.railway.app/api/version
```

**Observed (verification run):**

```json
{
  "gitSha": "99766fb",
  "gitShaFull": "99766fbf65324f5ad4b8bcf7771a714308f5337b",
  "env": "production",
  "serviceName": "ivan-reseller-backend"
}
```

## Frontend

Vercel does not expose git SHA in `index.html` by default. Proof method: **hashed entry asset names** in `index.html` vs local `dist/index.html` after `npm run build` on target commit.

See `docs/VERCEL_FRONTEND_DEPLOY_VERIFICATION.md` for the observed mismatch at verification time.

## Rule

Backend: trust **`gitSha` / `gitShaFull`**.  
Frontend: trust **deployment SHA from Vercel** or **asset hash parity** with local `dist/`.

---

## Verification run — target `271d7b3` (2026-03-30)

### Backend (Railway)

`GET https://ivan-reseller-backend-production.up.railway.app/api/version` still reported the **previous** image until a new deploy completes:

```json
{
  "gitSha": "e3f4f7c",
  "gitShaFull": "e3f4f7c0cd58141c2e997e6f24fc9753b90edda5"
}
```

**Action for operator:** In [Railway](https://railway.app) → service `ivan-reseller-backend` → **Redeploy** (or enable/trigger GitHub deploy from `main`). If using CLI: `railway login` (refresh token), then from `backend/` either rely on Git-connected auto-deploy or run `railway up -d --ci` to upload the tree that contains `271d7b3`. Re-check until `gitShaFull` starts with `271d7b3`.

### Frontend (Vercel)

Production deploy triggered with `vercel --prod --yes` from `frontend/` (CLI user `godinescrazy`). **Observed live HTML** (`https://www.ivanreseller.com/`):

```html
<script type="module" crossorigin src="/assets/index-Bsme3rnm.js"></script>
```

That matches the build output from the deploy (`index-Bsme3rnm.js`). Lazy routes (e.g. Opportunities) load from that entry; inspect **Network** on `/opportunities` for chunk names after navigation.

**Inspect URL (example):** `vercel inspect ivan-reseller-gvc8seddp-ivan-martys-projects.vercel.app` → deployment `dpl_HN99oPW19m6sc13KDhpg4HCrAMcn`, aliases include `www.ivanreseller.com`.

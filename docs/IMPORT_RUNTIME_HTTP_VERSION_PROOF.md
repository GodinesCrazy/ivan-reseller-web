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

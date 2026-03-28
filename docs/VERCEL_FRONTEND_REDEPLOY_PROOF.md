# Vercel frontend — redeploy proof

## Target Git revision (`main`)

| Field | Value |
|--------|--------|
| **Commit** | `3e80250` (tip at push; includes valid `vercel.json` rewrites) |
| **Full SHA** | pull `git rev-parse origin/main` after fetch |

*(Includes `vercel.json` fix so `vercel deploy --prod` no longer fails on invalid `source` pattern.)*

## Expected entry fingerprints (local `npm run build`, `frontend/dist/index.html`)

| Asset | Filename |
|--------|-----------|
| Entry JS | `/assets/index-CiVVXKXt.js` |
| Entry CSS | `/assets/index-BI8lM2P0.css` |

## Live `https://ivan-reseller-web.vercel.app/` (HTTP fetch, verification run)

| Asset | Filename |
|--------|-----------|
| Entry JS | `/assets/index-txt1s9KR.js` |
| Entry CSS | `/assets/index-C2CJxCcL.css` |

**Conclusion:** Production **still stale** relative to current local `dist/` at verification time.

## Blocker removed: invalid `vercel.json` rewrite

`vercel deploy --prod` (CLI 50.19.1) failed with:

`Rewrite at index 1 has invalid source pattern "/((?!api)(.*))"`

**Fix applied in repo:** second rewrite replaced with SPA-safe ordered rules:

1. `/api/:path*` → Railway backend  
2. `/(.*)` → `/index.html`  

Static files under `/assets/` are still served from the deployment filesystem before the catch-all (Vercel default behavior).

## Redeploy procedure (owner)

From `frontend/`:

1. `vercel link` → select project **`ivan-reseller-web`** (not a generic `frontend` name).
2. `vercel deploy --prod`

Or: Vercel Dashboard → **Deployments** → **Redeploy** latest from `main`.

## After redeploy — proof checklist

- [ ] `curl`/browser: `index.html` references **`index-CiVVXKXt.js`** (or newer hashes if source changed).
- [ ] Optional: dashboard shows deployment **Ready** with commit **`9ad1225`** or newer.

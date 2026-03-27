# Publisher pending actions — deploy trace

## Git (reference)

- **Branch:** `main`
- **Commit containing UI + API:** `f319455` — `fix(web): rate-limit JWT context, calmer polling, publisher reject/remove`
- **Remote:** `origin` → `https://github.com/GodinesCrazy/ivan-reseller-web.git` (pushed after that commit)

## Root cause of “only Approve in production”

Production static assets **did not match** `main`:

| Check | Before fix | After redeploy |
|--------|------------|----------------|
| `index.html` entry script | `/assets/index-DWYvvaS5.js` | `/assets/index-DXk0XAqM.js` |
| Lazy chunk name | `IntelligentPublisher-Ogu6rYH1.js` | `IntelligentPublisher-DjoOHBhd.js` |
| String `Rechazar` in chunk | **Absent** | **Present** |
| String `pending/reject` in chunk | **Absent** | **Present** |

**Conclusion:** Vercel **production** had not been rebuilt/redeployed from the commit that added reject/remove. The implementation was in GitHub; the **deployed bundle was stale**.

## Deployment action taken (this audit)

- Ran **`npx vercel deploy --prod --yes`** from repo root (`c:\Ivan_Reseller_Web`), project **`ivan-martys-projects/ivan-reseller-web`**.
- Vercel build output showed **`IntelligentPublisher-DjoOHBhd.js`** and aliased **production** to **`https://www.ivanreseller.com`** (and apex **`https://ivanreseller.com`** updated to the same `index-DXk0XAqM.js`).

## Backend (Railway)

- Smoke: `POST https://ivan-reseller-backend-production.up.railway.app/api/publisher/pending/reject/1` without auth returned **401** (not **404**), indicating the route is registered.
- **Railway deployment SHA** was not queried via Railway API in this pass; if reject returned 404 in the future, redeploy backend from `main`.

## Ongoing recommendation

- Ensure **Git → Vercel** auto-deploy on `main` is enabled, or run **`vercel deploy --prod`** after merging publisher-facing changes.
- Optional: add a CI step or Vercel “Ignored Build Step” audit so `main` pushes always trigger production builds.

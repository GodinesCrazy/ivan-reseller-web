# Vercel frontend: production runtime proof (HTTP)

## Git revision (recorded in repo)

- **Branch:** `main`
- **SHA (includes `vercel.json` CLI fix):** `bfffb2154d9e30143868e867c376409accaff427`

The production CLI deploy that promoted to `www.ivanreseller.com` was executed from a working tree that contained the same `vercel.json` overrides; that state is now identical to `bfffb21` for that file.

## Vercel project

- **Team / scope:** `ivan-martys-projects`
- **Project name:** `ivan-reseller-web`
- **Full name:** `ivan-martys-projects/ivan-reseller-web`

## Deployment artifact

- **Inspect URL:** `https://vercel.com/ivan-martys-projects/ivan-reseller-web/57YK4Uugz7hdtfJiNMgfiMNrvB5g`
- **Deployment hostname:** `https://ivan-reseller-jdja6u65n-ivan-martys-projects.vercel.app`  
  - **Note:** Unauthenticated `curl` received **401 Unauthorized** (deployment protection / SSO). Public proof uses the custom domain.

## Production domains (live HTML)

Fetched with `curl.exe -sL` after deploy:

| URL | Entry script | Stylesheet |
|-----|----------------|------------|
| `https://www.ivanreseller.com/` | `/assets/index-DYu6xa-v.js` | `/assets/index-BI8lM2P0.css` |
| `https://ivanreseller.com/` | `/assets/index-DYu6xa-v.js` | `/assets/index-BI8lM2P0.css` |

## Alignment with Vercel build log

The Vercel remote build for this deployment reported:

- `dist/assets/index-DYu6xa-v.js` (main bundle, ~456 kB)
- `dist/assets/index-BI8lM2P0.css`

**Live `index.html` references match the Vercel-built `dist/index.html` for this deployment.**

## Local build fingerprint (same commit, different machine)

Local `npm run build` on Windows (for comparison only):

- `frontend/dist/index.html`: `/assets/index-CiVVXKXt.js`, `/assets/index-BI8lM2P0.css`

**Interpretation:** JS entry hash differs between local and Vercel builders; **CSS hash matched**. Production is verified against the **deployed** build output and **live HTML**, not solely against local `dist/`.

## Stale baseline (pre-fix)

Prior stale production references cited in investigation included bundles such as `index-txt1s9KR.js` / `index-C2CJxCcL.css`. Current production serves **`index-DYu6xa-v.js`** / **`index-BI8lM2P0.css`**, confirming the public HTML changed to the new deployment.

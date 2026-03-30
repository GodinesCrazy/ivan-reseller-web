# Vercel frontend: CLI link and production deploy

## Scope

Link `frontend/` to the production Vercel project **ivan-reseller-web**, deploy with **Vercel CLI** to **Production**, and fix project settings that break CLI deploys when the upload root is already `frontend/`.

## Preconditions

- Vercel CLI authenticated (`vercel whoami` → `godinescrazy`).
- Repo: `Ivan_Reseller_Web`, frontend at `frontend/`.

## Link

From `frontend/`:

```bash
vercel link --project ivan-reseller-web --yes
```

**Result:** `Linked to ivan-martys-projects/ivan-reseller-web` (creates `frontend/.vercel/project.json`).

## Failure mode fixed: `cd frontend && npm install`

**Symptom:** `vercel deploy --prod` failed with `Command "cd frontend && npm install" exited with 1`.

**Cause:** Dashboard (or inherited) install command assumed a **monorepo root** upload. CLI deploy from `frontend/` uploads files with **no** `frontend/` subdirectory, so `cd frontend` fails.

**Fix:** In `frontend/vercel.json`, set explicit commands and output:

```json
"installCommand": "npm install",
"buildCommand": "npm run build",
"outputDirectory": "dist"
```

Committed on `main` as `bfffb21` (`fix(frontend-web): set Vercel install/build for CLI root deploy`).

## Production deploy

From `frontend/`:

```bash
npm run build
vercel deploy --prod --yes
```

**Successful deploy (example):**

- Inspect: `https://vercel.com/ivan-martys-projects/ivan-reseller-web/57YK4Uugz7hdtfJiNMgfiMNrvB5g`
- Production deployment hostname: `ivan-reseller-jdja6u65n-ivan-martys-projects.vercel.app` (may return **401** if Vercel deployment protection / SSO is enabled; use the **production domain** below for public verification).
- Aliased: `https://www.ivanreseller.com`

## Notes

- `frontend/.vercel/` is local link metadata; do not commit secrets; team members run `vercel link` as needed.
- Remote Vite builds can produce **different chunk filenames** than a local `npm run build` on Windows; compare **live `index.html`** to the **Vercel build log** for the same deployment, not only to local `dist/`.

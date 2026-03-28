# Deploy verification — backend / frontend

## Railway (backend)

| Check | Command / URL | Expected after latest deploy |
|-------|----------------|------------------------------|
| Short SHA | `GET /version` | `gitSha` matches deployed commit (7 chars) |
| Full SHA | `GET /version` or `GET /api/version` | `gitShaFull` present when `RAILWAY_GIT_COMMIT_SHA` is set |
| Health | `GET /api/health` | 200 |

**Observation (audit moment):** Production responded with `gitSha: eb2e8cd` on `/version`. `/api/version` returned **404** on that revision (route added later).

## Vercel (frontend)

- Confirm the production deployment points at `main` and completed after the commit that includes:
  - Opportunities payload: `importSource`, `aliExpressItemId`, `targetMarketplaces`
  - Products delete confirmation modal

- In the browser Network tab, responses from `POST /api/products` should include `data.opportunityImportEnrichment` after the backend change (diagnostics for enrichment `ok` / `reason`).

## Rule

**Merged code ≠ live runtime.** Always compare `/version` (or `/api/version` once deployed) with the expected commit.

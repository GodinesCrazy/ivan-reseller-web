# Import runtime — frontend alignment retest

## Preconditions

1. Vercel production `index.html` entry assets **match** local `frontend/dist/index.html` (see `VERCEL_FRONTEND_REDEPLOY_PROOF.md`).
2. Railway `GET /version` still shows hardened backend (`99766fb` or newer functional equivalent).
3. Logged-in **production** session.

## Authenticated flow

1. **Opportunities** → search.
2. **Importar** on a fresh row.
3. **Network** → `POST /api/products`:
   - Body should include `importSource: "opportunity_search"`, `aliExpressItemId` when available, `targetMarketplaces`.
   - Response: `data.opportunityImportEnrichment` with `ok` and `reason`.
4. **Products** → new row:
   - Prefer **`PENDING`** + honest blockers if enrichment incomplete (not spurious **`LEGACY_UNVERIFIED`** from auto-approve on hollow context).
   - If APIs succeed: `aliexpressSku` / `shippingCost` populated where applicable.

## Record results (fill after you run)

| Check | Result |
|--------|--------|
| `opportunityImportEnrichment.ok` | |
| `opportunityImportEnrichment.reason` | |
| Product `status` | |
| `validationState` / blockers | |
| Delete modal visible on Products | |

## Agent limitation

This retest **cannot** be completed without your browser session and credentials.

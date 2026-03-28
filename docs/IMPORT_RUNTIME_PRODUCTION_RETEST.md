# Import runtime — production re-test (manual)

## Preconditions

1. Backend `GET /version` shows **`99766fb`** (or newer on `main`).
2. Vercel production redeployed so SPA matches `main` (see asset hash check in `VERCEL_FRONTEND_DEPLOY_VERIFICATION.md`).
3. Logged-in production user with **AliExpress Affiliate** and/or **Dropshipping** credentials configured.

## Steps

1. Open **Opportunities** → search.
2. **Importar** a fresh row.
3. In DevTools **Network**, select `POST /api/products`:
   - Confirm response JSON includes `data.opportunityImportEnrichment` with `ok` and `reason`.
4. Open **Products** → locate the new row:
   - If enrichment incomplete and analyze is automatic: expect **`PENDING`** (not forced **`LEGACY_UNVERIFIED`** from auto-approve path).
   - If APIs succeed: expect **`aliexpressSku`** and **`shippingCost`** populated where applicable.

## What this agent cannot do without your session

Authenticated `POST /api/products` and UI navigation require a **browser session / JWT**. Record results in this section after you run the flow:

| Field | Your observation |
|-------|------------------|
| `opportunityImportEnrichment.ok` | |
| `opportunityImportEnrichment.reason` | |
| Product `status` | |
| `missingSku` still? | |

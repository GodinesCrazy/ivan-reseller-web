# Production proof — opportunity import

## Before (observed at `eb2e8cd`)

- Import from Opportunities could still land in `LEGACY_UNVERIFIED` with `missingSku` when:
  - Only Dropshipping was configured, or
  - URL had no extractable item id, or
  - Enrichment failed but **analyze automatic** still approved → reconcile → LEGACY.

## After (this change set — verify post-deploy)

1. `POST /api/products` returns `opportunityImportEnrichment` with explicit `ok` / `reason`.
2. If enrichment `ok === false` and the request is an opportunity import, **auto-approve is skipped** → product stays **`PENDING`** with honest blockers instead of LEGACY.
3. Item id resolvable from more URL shapes (`utils/aliexpress-item-id.ts`).
4. Dropshipping fallback can populate SKU and minimum shipping cost when Affiliate is absent.

## Live checks

```text
GET https://<railway-host>/version
```

Compare `gitSha` to the commit that contains this audit bundle.

```text
POST /api/products with importSource=opportunity_search
```

Inspect JSON: `data.opportunityImportEnrichment`.

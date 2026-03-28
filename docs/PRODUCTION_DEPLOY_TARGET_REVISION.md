# Production deploy — target revision

## Canonical target (repository `main`)

| Field | Value |
|--------|--------|
| **Full SHA** | `99766fbf65324f5ad4b8bcf7771a714308f5337b` |
| **Short SHA** | `99766fb` |
| **Tip commit message** | `docs: pin runtime verdict to b4756cb` |

## Parent chain (functional import/runtime bundle)

The hardened import/runtime behavior lives in **`b4756cb`** (`fix(import): DS fallback, skip auto-approve on failed enrich, delete modal, /api/version`). **`99766fb`** is the current `main` tip (doc-only delta on top of `b4756cb`).

## Contents verified in tree at this tip

- Opportunity import enrichment: Affiliate + **Dropshipping** fallback (`opportunity-import-enrichment.service.ts`)
- Robust item id: `utils/aliexpress-item-id.ts`
- `POST /api/products`: skip auto-approve when opportunity enrichment `ok === false`; response field `opportunityImportEnrichment`
- `GET /version` and `GET /api/version` with `gitSha` / `gitShaFull`
- Products delete confirmation modal (`frontend/src/pages/Products.tsx`)
- Opportunities payload: `importSource`, `aliExpressItemId`, `targetMarketplaces` (`Opportunities.tsx`)

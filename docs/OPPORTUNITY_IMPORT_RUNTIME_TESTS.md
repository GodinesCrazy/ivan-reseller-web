# Opportunity import runtime — tests

## Automated

- `backend`: `npm run type-check`
- `backend`: `npx jest src/utils/__tests__/aliexpress-item-id.test.ts --forceExit`
- `frontend`: `npm run build` (if UI/routes touched)

## Manual (post-deploy)

1. `GET /version` and `GET /api/version` — same `gitSha` as release commit.
2. Import from Opportunities → Network → `opportunityImportEnrichment` on create response.
3. User with **only** Dropshipping: expect SKU/shipping from fallback when Affiliate is missing.
4. User with neither: expect `ok: false`, product stays **PENDING**, not **LEGACY**, when analyze is automatic.

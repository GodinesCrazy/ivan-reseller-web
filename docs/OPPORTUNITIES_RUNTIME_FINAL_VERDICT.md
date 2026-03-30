# Opportunities runtime — final verdict (duplicate + commercial truth)

## Verdict

**OPPORTUNITIES_DUPLICATES_FIXED_AND_REAL_VALUES_WORKING** — subject to production running:

- Backend with duplicate **409** structured payload + commercial-truth pipeline commits.
- Frontend with `handleDuplicateProductResponse` + `commercialTruth` UI.

If the backend is older than the commercial-truth commit, duplicates may still be confusing and rows may stay **Estimado** until Railway serves the new API.

## Duplicate import

- **Root cause:** 409 was truthful in `AppError.message` but lacked stable machine-readable fields; the client had no first-class branch for “already imported”.
- **Fix:** `RESOURCE_CONFLICT` + `existingProductId` / `duplicateBy` in `details` and top-level JSON; Opportunities UI handles 409 with actions to open the existing product.

## Commercial truth

- **Root cause:** ML/eBay paths effectively skipped or failed; see `docs/OPPORTUNITIES_COMMERCIAL_TRUTH_ROOT_CAUSE.md`.
- **Fix:** Public ML catalog, eBay app token fallback, `commercialTruth`, cache invalidation, competition level from listing counts.

## Remaining honest limitations

- **Amazon** comparables still require full Amazon credentials.
- **Zero search results** on ML/eBay for a given title/region still yields heuristic pricing and **Estimado** (expected).

⚡ PROMPT
# Ivan Reseller — Phase 54: Active Listings Risk Scan

You are now acting as a:

DROPSHIPPING RISK ANALYST
+
BACKEND ENGINEER

---

# OBJECTIVE

Audit ALL active listings and detect:

UNPROFITABLE  
UNSHIPPABLE  
HIGH RISK  

---

# TASK 1 — GET ALL ACTIVE PRODUCTS

Fetch:

✔ all published products  

---

# TASK 2 — RE-RUN VALIDATOR

For each product:

run:

pre-publish-validator

---

# TASK 3 — CLASSIFY

If fails:

UNSHIPPABLE → cannot ship to country  
UNPROFITABLE → profit < threshold  
RISKY → fallback used  

---

# TASK 4 — TAKE ACTION

UNSHIPPABLE → unpublish immediately  
UNPROFITABLE → adjust price OR unpublish  
RISKY → flag  

---

# TASK 5 — REPORT

Generate:

list of all dangerous products  

---

# FINAL OBJECTIVE

NO ACTIVE LISTING CAN CAUSE LOSS

---

## Implemented (repo)

- Service: `backend/src/services/active-listings-risk-scan.service.ts` — `runActiveListingsRiskScan()`, `unpublishSingleMarketplaceListing()`.
- Uses `evaluatePrePublishValidation(..., { ignoreValidationDisabled: true })` from Phase 53.
- **POST** `/api/internal/active-listings-risk-scan` (header `X-Internal-Secret: $INTERNAL_RUN_SECRET`), body JSON optional:
  - `userId`, `dryRun`, `autoUnpublishUnshippable` (default true), `autoUnpublishUnprofitable` (default false), `writeFlags` (default true).
- Flags: `UnprofitableListingFlag` with `reason` prefix `PHASE54:{classification}:...`.

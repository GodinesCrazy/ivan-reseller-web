# P77 — End-to-end real SKU validation

## Command

```bash
cd backend && npx tsx scripts/check-ml-image-remediation.ts 32690
```

**Environment:** Local workspace with valid `DATABASE_URL` (run succeeded on 2026-03-25).

## Product

- **ID:** 32690  
- **Title:** Soporte organizador de enchufes montado en la pared…  
- **Source images:** 7 (AliExpress supplier URLs)  
- **Disk pack:** `artifacts/ml-image-packs/product-32690/` — manifest + approved `cover_main` / `detail_mount_interface` from prior internal workflow  

## Honest outcome (not fabricated)

| Field | Value |
|--------|--------|
| **Candidate inventory count** | 5 (after main/detail enumeration) |
| **Ranked candidates** | 5 scored |
| **Direct path** | No candidate passed both gates (`chosenDirectUrl: null`) |
| **Remediation** | `square_white_catalog_jpeg` on remediation order; **5** attempts, **inset** skipped (no `insetCrop`) |
| **Last remediation gate** | `policy=false`, `conv=false` (e.g. edge texture + global dim on supplier-derived output) |
| **`trace.finalOutcome`** | `human_review_required` |
| **`publishSafe`** | **false** |
| **`integrationLayerOutcome`** | `human_review_required` |
| **`compliantPackPresent` / `packApproved`** | **true** (disk pack exists) — **does not** override canonical failure |

**Conclusion:** The real SKU **failed** the canonical dual-gate path end-to-end and correctly **failed closed** for publish despite a pre-existing approved pack. Next operational step is new source imagery, inset override, recipe tuning, or manual asset regeneration — not silent publish.

## Top policy signal on this SKU

`directPathGateEvaluations` consistently included **`text_logo_risk_high_100`** and **`policy_fitness_*_below_68`** on supplier JPEGs — aligned with the original ML portada problem class.

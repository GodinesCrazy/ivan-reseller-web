# P78 — Canonical re-evaluation (32690)

## Command

```bash
cd backend
npx tsx scripts/p78-enable-canonical-local-cover-32690.ts
npx tsx scripts/check-ml-image-remediation.ts 32690
```

## After P78 closure (2026-03-25)

| Field | P77 (before) | P78 (after) |
|-------|----------------|-------------|
| **candidateInventoryCount** | 5 | **6** (local + 5 supplier) |
| **Top ranked** | Supplier URL | **`local:pack:product-32690:cover_main`** |
| **Direct path** | All fail | Local fails policy (`text_logo_risk`, fitness); suppliers unchanged |
| **Remediation path** | Square only; inset skipped | **Square then inset** on local candidate |
| **`trace.finalOutcome`** | `human_review_required` | **`remediated_pass`** |
| **`winningRecipeId`** | null | **`inset_white_catalog_png`** |
| **`publishSafe`** | false | **true** |
| **`integrationLayerOutcome`** | `human_review_required` | **`remediated_pass`** |
| **`handledKind`** | `human_review` | **`pack`** |

## Proof snippet (logs)

`[ML-IMAGE-REMEDIATION] evaluated` includes `integrationLayerOutcome":"remediated_pass"`, `publishSafe":true`, `winningRecipeId":"inset_white_catalog_png"`.

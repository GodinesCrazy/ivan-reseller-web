# P71 — Approval gate

## Command

```bash
cd backend
npx tsx scripts/check-ml-asset-visual-approval.ts 32690 --apply
```

## Result

| Field | Value |
|--------|--------|
| `cover_main` | **approved** (`overallPass: true`) |
| `detail_mount_interface` | **approved** |
| `packApproved` | **true** |
| `goNoGo` | **GO_FOR_ML_IMAGE_REPLACEMENT** |

## Heuristic “stronger than prior”

Automated gate: same hybrid checklist as P70. **P71-specific:** new cover uses **`sd8adf1f1…`** supplier asset (not `s2eee0bfe…`), satisfying **deliberate rotation**; ranking score favored **brighter** native mean vs other untried candidates.

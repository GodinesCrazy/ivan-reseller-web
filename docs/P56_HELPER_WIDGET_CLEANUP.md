# P56 — Helper Widget Cleanup

## Classification

| Widget | Classification | Action |
|--------|----------------|--------|
| **InventorySummaryCard** | canonical_keep (subordinate) | Added subtitle: "Recuentos del inventario API — para verdad canónica (blockers, proof ladder) usa Control Center." |
| **BalanceSummaryWidget** | relabel | Subtitle updated to: "Capital y exposición — snapshot; proof de fondos liberados en Finance" |
| **AutopilotLiveWidget** | relabel | Added line: "Telemetría de ejecución — no sustituye verdad operativa"; phase label "Analizando rentabilidad" → "Analizando rentabilidad (estim.)" |
| **WorkflowSummaryWidget** | remove | Already deprecated (P55 no-op) |
| **ProductWorkflowPipeline** | canonical_keep | Already aligned to operations truth (P55); used in ProductPreview |

## Rationale

- InventorySummaryCard and BalanceSummaryWidget remain useful for quick counts/capital snapshot but must not be read as primary truth.
- AutopilotLiveWidget shows runtime telemetry; must not compete with canonical operator truth.
- No merge or removal of widgets in this sprint; relabeling reduces confusion.

## Files

- `frontend/src/components/InventorySummaryCard.tsx`
- `frontend/src/components/BalanceSummaryWidget.tsx`
- `frontend/src/components/AutopilotLiveWidget.tsx`

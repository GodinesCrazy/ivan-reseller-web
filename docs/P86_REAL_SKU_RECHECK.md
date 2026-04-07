# P86 — Real SKU recheck

## 32690 (current workspace state)

Command:

```bash
cd backend
npx tsx scripts/check-ml-image-remediation.ts 32690
```

**Observed (2026-03-25):** `traceFinalOutcome`: **`direct_pass`** (local approved `cover_main` present). Commercial floor fields: `commercialFinalistFloorEnabled: false`, `commercialFinalistFloorPass: null` — **floor not evaluated** on direct path (by design).

## 32690 forced remediation (analytical recheck)

Using the **same** Good finalist metrics as in `p86_starter_labeled_traces.json`, `evaluateCommercialFinalistFloor` with **P86 defaults** returns **pass** (verified in unit test `passes a strong P84-like winner`).

The **Weak** runner-up metrics **fail** P86 floor (readability, silhouette, center, washout, preference), including **washout** which previously could pass at 0.456 under max 0.52.

## Operational note

To exercise the full pipeline on disk after calibration, temporarily remove/rename pack `cover_main`, rerun the script, restore the file — then expect `commercialFinalistFloorPass: true` for this SKU’s historical winner row.

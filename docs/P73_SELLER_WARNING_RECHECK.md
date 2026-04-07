# P73 — Seller warning recheck

## Prerequisite

**Live** listing must show the **P73** `cover_main.png` (after successful **`p49`**). This sprint **did not** publish due to **ML token failure**.

## Operator flow (immediately after successful `p49`)

1. Seller Center → **`MLC3786354420`** → **Fotos**.
2. Check PORTADA tooltip / banner.

## Classification

| Outcome | When |
|---------|------|
| `warning_cleared` | No photo errors |
| `warning_persists_same_reason` | Still logos/text and/or background complaints |
| `warning_persists_new_reason` | Different ML copy |
| `warning_moved_to_other_slot` | Secondary flagged |
| `unknown_due_missing_operator_confirmation` | Not checked / publish incomplete |

**Current automation:** **`unknown_due_missing_operator_confirmation`** (publish blocked).

# P70 — Seller warning recheck

## Automation limit

This repo **cannot** read Mercado Libre **seller edit UI** strings (“Tienes errores…”) via API. **`items` GET** can improve (here: moved from **`under_review` / `waiting_for_patch`** to **`active` / `[]`**), but that is **not** a guaranteed “photo warning cleared” proof.

## Classification

**`unknown_due_missing_operator_confirmation`** until the operator reopens the listing editor and confirms:

| Outcome | Operator records |
|---------|------------------|
| **No photo warning** | “0 errores” / no yellow photo banner — note **date/time** |
| **Still 1 flagged photo** | Screenshot + **which slot** (portada vs otra) |
| **Different slot flagged** | New slot index + ML message text |

## Minimum operator check

1. Seller Center → listing **`MLC3786354420`** → **editar fotos** (or equivalent).
2. Answer: **¿Sigue apareciendo “errores en 1 de tus fotos”?** Sí / No.
3. If Sí: **¿Sigue siendo la portada?** Sí / No — copy **exact** ML text.

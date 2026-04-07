# P74 — Seller warning recheck

## What must be verified (operator)

In Mercado Libre seller center:

1. Open listing **MLC3786354420** → **Editar publicación** → **Fotos**.  
2. Confirm whether the **portada** slot still shows the **policy / quality warning** (the one that cited logos/text and non-light background).

## Automation limit

The backend can replace pictures and read **API** item snapshots; it **cannot** read the seller-center warning banner text. **Human confirmation** is required for this section’s final classification.

## Classification (pending operator)

**Current automation state:** `unknown_due_missing_operator_confirmation`

When you check, set exactly one:

| Class | Meaning |
|-------|---------|
| `warning_cleared` | Portada warning gone |
| `warning_persists_same_reason` | Same text as before (logos/text, background) |
| `warning_persists_new_reason` | New ML copy (e.g. resolution, authenticity) |
| `warning_moved_to_other_slot` | Warning now on imagen 2+ |
| `unknown_due_missing_operator_confirmation` | Not yet checked in UI |

## Evidence to capture if warning remains

- Exact **Spanish** warning string (screenshot or copy-paste).  
- Which **slot** (1 vs 2) is flagged.

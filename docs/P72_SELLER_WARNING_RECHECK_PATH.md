# P72 — Seller warning recheck path

## Preconditions

Seller recheck is only meaningful **after** the new cover is **live** on `MLC3786354420`. In P72, **`p49` did not complete** (ML token failure) — operator must **first** complete upload (`docs/P72_LISTING_PHOTO_REPLACEMENT.md`), **then** perform this check.

## Operator steps (unchanged)

1. Seller Center → listing **`MLC3786354420`** → **Fotos** / edit.
2. Classify:
   - **`warning_cleared`** — no “errores en fotos”
   - **`warning_persists_on_cover`** — still 1 error, still **PORTADA**
   - **`warning_moved_to_other_slot`** — error references another thumbnail
   - **`unknown_due_missing_operator_confirmation`** — not yet checked

## Automation

**Cannot** read seller UI; API **`items`** state may lag seller copy.

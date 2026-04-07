# P71 — Seller warning recheck path

## Immediate operator steps (after P71 `p49`)

1. Open **Mercado Libre** → **Mis publicaciones** → listing **`MLC3786354420`** → **Editar** / **Fotos**.
2. Read the photo banner:
   - If **no** “**Tienes errores en 1 de tus fotos**” → record **date/time** → classify **`warning_cleared`**.
   - If **yes** and still **PORTADA** → screenshot + copy **exact** ML text → **`warning_persists_on_cover`**.
   - If **yes** but **otra miniatura** → note **slot index** → **`warning_moved_to_other_slot`**.

## Automation classification (until operator acts)

**`unknown_due_missing_operator_confirmation`**

## API context (non-proof)

`items` moved **`under_review` / `waiting_for_patch`** → **`active` / `[]`** after replace — supportive of policy flow, **not** a substitute for seller UI.

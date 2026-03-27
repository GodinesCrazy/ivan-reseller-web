# Intelligent Publisher — marketplace defaults (canary safety)

## Previous risk

- Per-row and bulk UI defaulted **eBay checked**, which invited accidental cross-marketplace publish during a **Mercado Libre Chile canary**.

## Current behavior

### Per row (`PendingProductCard`)

- **eBay, ML, Amazon** all start **unchecked**.
- User must tick at least one marketplace before **Aprobar y publicar** (toast if none).
- **Solo ML** sets only Mercado Libre for that row.
- When the row is **blocked** or **truth loading**, marketplace checkboxes are **disabled** (no false “ready” signal).

### Bulk toolbar

- **`bulkMk`** default: `{ ebay: false, mercadolibre: false, amazon: false }`.
- Amber callout explains **no default marketplace** and that encolar skips **blocked** rows.
- **Preset: solo ML** — sets bulk checkboxes to ML only.
- **Limpiar marketplaces** — all off.

### Encolar / Publicar todo

- Require **≥1 marketplace** selected in the bulk bar.
- Only **non-blocked** product IDs are sent to `/api/jobs/publishing`.

## Backend

Unchanged; credentials and publish validation remain server-side.

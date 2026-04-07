# P65 — Seller + PDP verification

## What automation can verify

### MercadoLibre API (`getItem`)

After replacement, **`p49`** reported **`active`** and **`sub_status: []`**. That is **necessary** but **not sufficient** per sprint rules for seller copy like **“Tienes fotos por revisar”** (that UI is outside our API snapshot).

### CDN JPEG signal (buyer asset pipeline)

`p64-stats-remote-jpeg.ts` on new `-O.jpg` URLs:

| URL label | Bytes | Mean RGB | RGB stdev |
|-----------|-------|----------|-----------|
| `643675-…` | 42 493 | 212.56 | **47.38** |
| `748128-…` | 32 279 | 217.72 | **37.56** |

These match **photographic** spread (contrast), not the **washed** P64-pre-normalize or tiny-stdev synthetic pattern.

### Automated HTML fetch (buyer permalink)

Prior sprints documented **JS challenge shells** on anonymous `fetch` of `articulo.mercadolibre.cl` — automation **still cannot** assert rendered PDP HTML without a real browser session.

## What automation cannot verify (this sprint)

- Whether the **seller edit page** still shows **“Detectamos errores en tus fotos”** / **“Tienes fotos por revisar”** (requires logged-in seller session + UI scrape or manual check).
- Whether a **human buyer** sees a full PDP vs error page after challenge resolution.

## Classification

**`unknown_due_verification_limit`** for **seller-warning** and **buyer PDP fidelity**.

**Not asserted:** `photo_review_cleared_and_pdp_ok` (would require seller UI + headed browser proof).

**Partial positive:** API **`waiting_for_patch` cleared** immediately after replace; new IDs carry **photo-like** CDN statistics.

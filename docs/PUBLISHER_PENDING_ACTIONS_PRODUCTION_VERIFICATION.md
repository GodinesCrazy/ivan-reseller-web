# Publisher pending actions — production verification

## Runtime route

- **URL:** `https://ivanreseller.com/publisher` (and `https://www.ivanreseller.com/publisher`)
- **SPA route:** `path="publisher"` → lazy chunk `IntelligentPublisher-*.js`
- **Not a different component:** `App.tsx` maps `/publisher` only to `IntelligentPublisher`.

## No feature flag

- Reject/remove are **not** gated on product subtype in code; they render for every row in `displayedPending` whenever `loading` is false.

## Bundle proof (after redeploy)

Executed from automation host (PowerShell + `Invoke-WebRequest`):

1. Fetched `https://ivanreseller.com/` and confirmed `script` src **`/assets/index-DXk0XAqM.js`**.
2. Parsed lazy chunk reference **`assets/IntelligentPublisher-DjoOHBhd.js`** from that bundle.
3. Fetched `https://ivanreseller.com/assets/IntelligentPublisher-DjoOHBhd.js` and confirmed substrings:
   - `Rechazar` — **yes**
   - `pending/reject` — **yes**
   - `bulk-reject` — **yes**
   - `Eliminar seleccionados` — **yes**
   - `Aprobar y publicar` — **yes**

## Backend route proof

- `POST /api/publisher/pending/reject/1` on Railway host → **401** without credentials (proves route exists behind `authenticate`).

## Human UI check

After a **hard refresh** (Ctrl+F5) or empty cache, logged-in users on **Publicador inteligente** should see:

- Toolbar: **Rechazar seleccionados**, **Eliminar seleccionados**
- Each pending row: **Rechazar**, **Eliminar** next to **Aprobar y publicar**

If an old chunk is still shown, **immutable** `Cache-Control` on `/assets/*` can keep a prior tab on an old hashed file until refresh.

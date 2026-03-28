# Opportunities — frontend browsing runtime fix

## Page

`frontend/src/pages/Opportunities.tsx` (route `/opportunities` in `App.tsx`).

## Request payload

- `query`, `maxItems` (10 or 20), `page` (1-based), `marketplaces`, `region`
- **`refresh: 1`** only when the user clicks **Search** (or Enter) from the form — bypasses server cache for that call.
- **Anterior / Siguiente** do **not** send `refresh` (allows cache for identical query/page when useful).

## URL sync

After a successful load, the app updates the query string:

`?q=<term>&page=<n>&size=<10|20>`

Initial load reads `q`, `page`, and `size` from the URL (with fallbacks to previous behavior for `query` / `keyword`).

## UX

- Select **20 por página** for the widest slice per request.
- Use **Siguiente** for the next UI page (next provider window).
- Copy/share the URL to reproduce the same slice.

## Copy in UI

Explains Search vs pagination and points at `refresh=1` and URL parameters for support/debugging.

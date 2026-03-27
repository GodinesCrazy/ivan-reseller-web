# Intelligent Publisher — runtime mismatch analysis

## Live symptom (production report)

- Reject / Remove visible (partial deploy).
- Rows that are canonically blocked (e.g. `blockerCode: missingSku`) still showed a primary blue **“Aprobar y publicar”** action.
- eBay appeared **checked** on those rows despite “no default selection” and fail-closed expectations.

## Production-bound row renderer

| Area | Location |
|------|----------|
| Route | `frontend/src/App.tsx` → lazy `path="publisher"` → `IntelligentPublisher` |
| Page | `frontend/src/pages/IntelligentPublisher.tsx` |
| Row UI | `PendingProductCard` in the same file (pending list `displayedPending.map`) |
| Block guard | `isPendingRowPublishBlocked` in `frontend/src/pages/intelligentPublisher/publishRowGuards.ts` |
| Truth fetch | `GET /api/dashboard/operations-truth` via `frontend/src/services/operationsTruth.api.ts` |

## Root causes identified (code-level)

### A. Disabled checkboxes still showed prior selection

Marketplace toggles use local `useState` defaulting to all `false`. When a row **became** blocked (or the user had toggled eBay before truth settled), `disabled={rowBlockedVisual}` still left `checked={marketplaces.ebay}` **true**. Visually this reads as “eBay preselected on a blocked row” even though the control is disabled.

**Fix:** When `isPendingRowPublishBlocked(...)` is true, a `useEffect` resets marketplace state to all `false` so disabled controls are unchecked.

### B. Backend `ids` cap (50) vs long combined id lists

`dashboard.routes.ts` slices `ids` to **50** per request. The page collects ids from **pending + listings**. The client previously issued a **single** request; products beyond the first 50 encoded ids never received truth rows (fail-closed via missing truth, but summary vs row coverage could diverge and debugging was confusing).

**Fix:** `fetchOperationsTruthForProductIds` batches into chunks of 50 and merges `items` + rolls up `summary`.

### C. Map key normalization

`operationsTruthByProduct` now keys strictly with `Number(item.productId)` to avoid string/number `Map` misses if the JSON shape ever varies.

### D. Guard hardening (frontend only; backend unchanged)

`isPendingRowPublishBlocked` now also treats:

- `publicationReadinessState === 'BLOCKED'` as blocked (if `blockerCode` were ever omitted).
- Whitespace-only `blockerCode` as blocked (fail-closed).

## Why production could look “half fixed”

An earlier deploy could ship Reject/Remove while the browser still cached an **older** lazy chunk for `IntelligentPublisher`, or operators observed **checked-but-disabled** eBay (state artifact) and interpreted it as “default selected.” This change removes that visual artifact and batches truth so row-level data matches the intended contract for large id sets.

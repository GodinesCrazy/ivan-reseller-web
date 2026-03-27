# Web fixes — tests and validation

## Commands run (local)

From repository root (adjust if your layout differs):

```bash
cd frontend; npm run build
cd ../backend; npx tsc --noEmit
```

**Local results (this change set):** `npm run build` (frontend) and `npx tsc --noEmit` (backend) completed successfully.

## Automated tests

- **`frontend/src/hooks/useLiveData.test.tsx`** — Vitest coverage for `skipInitialRun` (no duplicate mount fetch) and default immediate run.  
  Command: `cd frontend && npx vitest run src/hooks/useLiveData.test.tsx` (passed locally).
- Recommended follow-up: supertest coverage for `POST /api/publisher/pending/bulk-reject` and `bulk-remove` (auth + PENDING guard + skip non-pending).

## Manual smoke checks

1. **Products**
   - Load page: single initial load (no obvious duplicate spinner).
   - Leave tab in background: reduced polling behavior.
2. **Intelligent publisher**
   - Open page: **one** loading cycle (no double fetch storm).
   - **Rechazar** / **Eliminar** on one row: confirm dialogs, list updates, toasts.
   - Select multiple → **Rechazar seleccionados** / **Eliminar seleccionados**.
3. **Control center / admin**
   - Navigate between sections; confirm no immediate 429 under normal single-user admin use.

## Regression targets

- Product listing and filters.
- Approve / publish flow (including job-queued path).
- Canary selection flows (unchanged in this work).
- Dashboard health views.

# Publisher pending actions — tests and validation

## Commands (local)

```powershell
Set-Location c:\Ivan_Reseller_Web\frontend
npm run build
```

```powershell
Set-Location c:\Ivan_Reseller_Web\backend
npx tsc --noEmit
```

## Focused checks performed during deploy audit

| Check | Result |
|-------|--------|
| `npm run build` (frontend) | Success (local and on Vercel remote build) |
| Production `IntelligentPublisher-*.js` contains `pending/reject` | **Yes** after `vercel deploy --prod` |
| Backend `POST .../pending/reject/1` | **401** (route registered) |

## Automated tests in repo

- `frontend/src/hooks/useLiveData.test.tsx` — unrelated to publisher buttons; general polling hygiene.
- **Gap:** No Playwright/Vitest test yet that asserts `IntelligentPublisher` renders **Rechazar** / **Eliminar** (recommended follow-up).

## Manual smoke (logged in)

1. Open **Publicador inteligente** with at least one pending item.
2. Confirm row actions: **Rechazar** (confirm → status `REJECTED`, leaves queue) vs **Eliminar** (confirm → delete rules).
3. Select two rows → **Rechazar seleccionados** / **Eliminar seleccionados**.

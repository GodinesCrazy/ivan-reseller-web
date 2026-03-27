# Intelligent Publisher — canary safety tests & validation

## Automated

```bash
cd frontend
npx vitest run src/pages/intelligentPublisher/publishRowGuards.test.ts
```

Covers:

- Loading → blocked.
- Missing truth → blocked.
- `blockerCode` (e.g. `missingSku`) → blocked.
- `agentTrace.blocking` → blocked.
- Clean truth → not blocked.
- `isMlCanaryCandidateRow` (unblocked + positive ML margin).

## Build

```bash
cd frontend && npm run build
```

## Backend

No API contract changes for this UX pass; `npx tsc --noEmit` in `backend` optional.

## Manual smoke (logged-in admin)

1. Pending row **with** `missingSku` (or any `blockerCode`): see **No publicable (bloqueado)**, no blue approve, Rechazar/Eliminar work, **Vista previa / resolver** opens.
2. Pending row **without** blocker: choose **ML** only → **Aprobar y publicar** enabled.
3. Bulk: no MP selected → encolar shows error; **Preset: solo ML** then encolar only **unblocked** selected rows.
4. **Seleccionar solo bloqueados** → bulk reject/remove with confirm.
5. Filter **Solo ML publicables** lists only unblock + positive ML margin.

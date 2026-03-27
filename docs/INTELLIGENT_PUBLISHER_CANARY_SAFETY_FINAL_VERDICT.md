# Intelligent Publisher — canary safety final verdict

## Verdict

**READY_FOR_SAFE_ML_CANARY_SELECTION** (frontend behavior; operators must still confirm live credentials and backend gates).

## What changed

- **Fail-closed publish** when operations truth is loading, missing, has `blockerCode`, or `agentTrace.blocking`.
- **No default marketplace** on rows or bulk bar; **Preset: solo ML** for intentional canary path.
- **Bulk encolar / publicar todo** skips blocked IDs with explicit toasts.
- **ML canary** filter + sort to surface unblock + ML-positive candidates first.
- **Seleccionar solo bloqueados** for mass reject/remove cleanup.
- **Vista previa / resolver** always available (unless row busy) to fix catalog issues.

## Honest limits

- UI safety depends on **operations-truth batch** returning correct `blockerCode` / agent trace; if the API lags, rows stay non-publishable until loaded (intentional).
- “Solo ML publicables” needs **ML margin** on the pending payload; otherwise use **Todos** + sort.

## Deploy

Push `main` and run **Vercel production deploy** so `ivanreseller.com` matches this bundle.

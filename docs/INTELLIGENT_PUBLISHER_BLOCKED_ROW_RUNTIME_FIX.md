# Intelligent Publisher — blocked row runtime fix

## Intended behavior

- If operations truth is loading for a non-empty pending list → fail-closed (no primary publish).
- If truth is missing → fail-closed.
- If `blockerCode` is present (after trim rules) or `publicationReadinessState === 'BLOCKED'` → fail-closed.
- If `agentTrace.blocking === true` → fail-closed.

## UI behavior

- **Primary action:** `rowBlockedVisual` → disabled **“No publicable (bloqueado)”** (or **“Verificando…”** while loading), not the blue approve button.
- **Reject / Remove:** Remain enabled (only gated by `rowBusy`).
- **Marketplaces:** Disabled when blocked; local checkbox state cleared when blocked so nothing appears “preselected.”

## Code changes

| File | Change |
|------|--------|
| `frontend/src/pages/intelligentPublisher/publishRowGuards.ts` | `hasCanonicalBlocker`: trim + whitespace-only + `BLOCKED` readiness |
| `frontend/src/pages/IntelligentPublisher.tsx` | `rowBlockedVisual = isPendingRowPublishBlocked(operationsTruth, truthLoading)` inside `PendingProductCard`; effect clears marketplaces when blocked; stable `key={\`pending-${String(p.id)}\`}` |

## Tests

`frontend/src/pages/intelligentPublisher/publishRowGuards.test.ts` — cases for `missingSku`, `BLOCKED` readiness without `blockerCode`, whitespace-only `blockerCode`.

# Intelligent Publisher — blocked row safety

## Definition (UI, fail-closed)

A pending row is **not publishable** from this screen when `isPendingRowPublishBlocked` is true (`frontend/src/pages/intelligentPublisher/publishRowGuards.ts`):

1. **Truth still loading** for a non-empty pending list (`operationsTruth` fetch in flight).
2. **Missing truth item** for the product (error or gap).
3. **`blockerCode` present** on the operations-truth row (e.g. `missingSku`, `ml_image_pack_not_approved`, listing states, etc. — sourced from `backend/src/services/operations-truth.service.ts` → `deriveBlocker`).
4. **`agentTrace.blocking === true`** (e.g. ML remediation `publishSafe === false`).

This mirrors canonical operational truth; **backend publish gates are unchanged**.

## Row UI behavior

| State | Primary action | Marketplaces | Reject / Remove | Extra |
|-------|----------------|--------------|-----------------|-------|
| Publishable | **Aprobar y publicar** (requires ≥1 MP checked) | Enabled; **none** preselected | Enabled | **Solo ML** shortcut |
| Blocked | Disabled **No publicable (bloqueado)** | Disabled (no “ready” implication) | Enabled | **Vista previa / resolver** + blocker code/message |
| Truth loading | Disabled **Verificando…** | Disabled | Enabled | Amber banner |

## Parent guard

`approve()` also refuses blocked rows and empty marketplace arrays (toast), so API is not called optimistically.

## Bulk publish / encolar

**Encolar** and **Publicar todo (sin bloqueados)** only send jobs for IDs that pass `filterPublishableProductIds` (same blocked logic). Skipped blocked IDs surface a toast.

## Operator note

Blocked rows use a **red left border** and muted marketplace row so they read as “cleanup / fix”, not “ship”.

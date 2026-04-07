# P90 — Web preflight closure check

## Verdict (sufficiency for operator use)

**Contract + API + UI are sufficient** for a controlled operator to see **real backend truth** before pushing publish flows, for **Mercado Libre** SKUs wired through P89.

## Evidence reviewed

| Requirement | Status | Where |
|-------------|--------|--------|
| Live API | Yes | `GET /api/products/:id/publish-preflight` (`products.routes.ts`) |
| Images / `publishSafe` | Yes | `resolveMercadoLibrePublishImageInputs` in `mercadolibre-publish-preflight.service.ts` |
| Pricing (canonical) | Yes | `runPreventiveEconomicsCore` → `mlcCanonicalPricingFromEconomicsCore` |
| Language / destination | Yes | `getMarketplaceContext` + policy fields in payload |
| Credentials | Yes | `getCredentials` + issues surfaced |
| Post-sale readiness (honest) | Yes | `postsale.*`, `warnings` for event-flow not proven |
| Primary blocker enum | Yes | `overallState`, `publishAllowed`, `blockers`, `nextAction` |
| ProductPreview surface | Yes | `ProductPreview.tsx` — card + disabled “Publicar” when `publishAllowed === false` |

## Limitations (not regressions)

- Preflight is **mercadolibre-only** on the dedicated endpoint (by design).  
- **Does not** replace deep proof in Control Center / logs for long traces.  
- Frontend repo-wide `tsc` may still fail on unrelated files (pre-existing); Product Preview change is localized.

## Closure check outcome

**CLOSED** for “web preflight system is truthful and usable for ML” at the **software** level. This does **not** by itself close **operational** webhook/fulfill proof (see P90 webhook + order docs).

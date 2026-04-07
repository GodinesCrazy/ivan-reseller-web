# Auditoría Frontend — Estado Real de Armonización
**Fecha:** 2026-04-06  
**Fase:** 5B

---

## Resumen ejecutivo

- **TypeScript typecheck:** PASS (0 errores)
- **Vite build:** PASS (✓ built in ~13s)
- **Tests unitarios (vitest):** 34/34 PASS
- **ESLint:** 0 errores, ~110 warnings (aceptables — `any` types, `no-console`, unused imports en páginas ML)
- **E2E (Playwright):** correctamente aislados — no corren bajo vitest

---

## Censo de páginas

### ALINEADAS — Flujo de compra controlada

| Página | Estado | Notas |
|---|---|---|
| `Orders.tsx` | ✅ Alineada | Lifecycle completo, fulfillment status, marketplace ID |
| `PendingPurchases.tsx` | ✅ Alineada | Capital, precio, costo AliExpress, buyer info, dirección |
| `OrderDetail.tsx` | ✅ Alineada | Estado completo con retry logic y smart supplier |
| `ControlCenter.tsx` | ✅ Alineada | Health sistema, worker status, readiness, Operations Truth |
| `Autopilot.tsx` | ✅ Alineada | Phases idle→searching→publishing, metrics, logs de ciclo |
| `IntelligentPublisher.tsx` | ✅ Alineada | Row guards, canary state, pilot approvals, ML listing state |
| `Products.tsx` | ✅ Alineada | Validation state, blockers, publish readiness, lifecycle badges |
| `Opportunities.tsx` | ✅ Alineada | Cost breakdown, margin, competencia, CommercialTruthMeta |
| `Sales.tsx` | ✅ Alineada | Fulfillment automation status, tracking, profit breakdown |
| `ProductPreview.tsx` | ✅ Alineada | ML pilot approval, imágenes, pricing, validation state |
| `Diagnostics.tsx` | ✅ Alineada | API connectivity, DB status, worker health |
| `SystemLogs.tsx` | ✅ Alineada | Logs reales en tiempo real |
| `SystemStatus.tsx` | ✅ Alineada | Health OK/degraded/down |

### PARCIALMENTE ALINEADAS — No bloquean compra controlada

| Página | Estado | Deuda |
|---|---|---|
| `Dashboard.tsx` | ⚠️ Parcial | KPIs sin live update; requiere refresh manual |
| `FinanceDashboard.tsx` | ⚠️ Parcial | Capital mostrado; payout detail limitado |
| `WorkflowConfig.tsx` | ⚠️ Parcial | Configuración OK; trace de ejecución limitado |
| `APIConfiguration.tsx` | ⚠️ Parcial | Estado configurado/no-configurado; sin test real-time |
| `RegionalConfig.tsx` | ⚠️ Parcial | Selección de país; sin costo-por-región visualizado |
| `OpportunityDetail.tsx` | ⚠️ Parcial | Costo estimado vs real no diferenciado |

### IRRELEVANTES para compra controlada

| Página | Razón |
|---|---|
| `MeetingRoom.tsx` | Video conferencias — fuera de scope dropshipping |
| `RequestAccess.tsx` | Control de acceso |
| `HelpCenter.tsx`, `DocsList.tsx`, `DocViewer.tsx` | Documentación — útil pero no bloquea |
| `Jobs.tsx` | Jobs background — monitoreo secundario |
| `Reports.tsx` | Analytics — no crítico pre-compra |
| `Commissions.tsx` | Comisiones — post-venta, no pre-compra |
| `InvestorDocsList.tsx`, `InvestorDocViewer.tsx` | Docs inversión |
| `ResolveCaptcha.tsx` | CAPTCHA handling — edge case |

---

## Issues ESLint por página (solo warnings, 0 errores reales)

| Página | Warnings | Tipo |
|---|---|---|
| `Autopilot.tsx` | ~25 | `any`, `no-console`, unused import |
| `Products.tsx` | 17 | `any`, unused `WorkflowProgressBar`, `formatMoney` |
| `Sales.tsx` | ~15 | `any`, `no-console` |
| `Opportunities.tsx` | ~20 | `any`, `no-console` |
| `IntelligentPublisher.tsx` | ~12 | `any`, `no-console` |
| `Commissions.tsx` | ~10 | `any` |

**Todos son warnings, no errores.** No afectan runtime ni el build.

---

## Flujo de compra controlada — cobertura UI

```
Paso                        Página                      Estado
─────────────────────────────────────────────────────────────
1. Buscar oportunidad       Opportunities.tsx           ✅
2. Revisar detalle          OpportunityDetail.tsx       ⚠️ (estimados OK)
3. Preview listing          ProductPreview.tsx          ✅
4. Aprobar pilot            IntelligentPublisher.tsx    ✅
5. Publicar en ML           IntelligentPublisher.tsx    ✅
6. Monitorear listing       Products.tsx                ✅
7. Recibir venta            Sales.tsx                   ✅
8. Comprar en AliExpress    PendingPurchases.tsx        ✅
9. Trackear orden           Orders.tsx → OrderDetail    ✅
10. Monitorear fulfillment  Orders.tsx                  ✅
11. Post-venta              ControlCenter.tsx           ✅
```

**Veredicto:** El flujo completo de una compra controlada tiene cobertura UI real en todas las etapas críticas.

# Auditoría — UI/UX operativa y verdad del sistema

**Método:** Búsqueda en `frontend/src` de patrones `operational`, `truth`, `canonical`, y revisión de páginas clave listadas en el repo.

---

## Superficies revisadas (evidencia)

| Superficie | Archivo(s) | Fidelidad al backend | Riesgo |
|------------|------------|----------------------|--------|
| Dashboard | `Dashboard.tsx`, consumo API dashboard | **Parcial** — mezcla conteos DB y APIs marketplace cuando disponibles | `listingsSource` `marketplace_confirmed` vs `database` documentado en backend |
| Productos / pipeline | `ProductWorkflowPipeline.tsx` | **Buena intención** — muestra operational truth, listing state, remediación | Depende de endpoints y datos poblados |
| Publicación inteligente | `IntelligentPublisher.tsx` | **Parcial** — `resolveListingTruth`, badges estado ML | Requiere datos `listing` + truth; vacíos muestran mensajes genéricos |
| Ventas | `Sales.tsx` | **Honesta** — subtitle advierte que no es “released-funds truth” hasta backend pruebe | Evita falsa seguridad financiera |
| Reportes | `Reports.tsx` | **Explícitamente no operativo** — texto que redirige a truth canónico | **Buena práctica** |
| Control Center / System Status | `ControlCenter.tsx`, `SystemStatus.tsx` | **No verificado** línea a línea en esta sesión | Probable mezcla health + features |
| Autopilot | `Autopilot.tsx` | **Parcial** — modo guided/automatic en backend | Riesgo de expectativa “100% manos libres” |
| Oportunidades | `Opportunities.tsx`, `RealOpportunityDashboard.tsx` | Comentarios “single source of truth backend” | Confianza en que API devuelve números reales |
| Órdenes / postventa | `Orders.tsx`, `OrderDetail.tsx`, `PostSaleProofLadderPanel.tsx` | Ladder de “proof” alineado con narrativa de fases | **Parcial** — verificar que cada escalón mapea a datos reales |

---

## Hallazgos

### U-001
- **Área:** UI / Truth
- **Título:** La UI **documenta** límites entre analytics y operación
- **Estado:** **Verificado** (código)
- **Severidad:** Baja (positivo)
- **Evidencia:** `Reports.tsx` ~705; `Sales.tsx` subtitle.
- **Recomendación:** Mantener; extender mismo patrón a Finance si hay KPIs no respaldados por ledger.
- **Bloquea prueba real:** No.

### U-002
- **Área:** UI / Truth
- **Título:** Operational truth en producto/listing **existe** pero no garantiza cobertura del 100% de campos que el operador necesita para ML Chile
- **Estado:** **Parcialmente verificado**
- **Severidad:** Media
- **Impacto operativo:** Usuario puede no ver `commercialFinalistFloorPass`, `trace` completo de imagen sin ir a metadata/API.
- **Evidencia:** `ProductWorkflowPipeline.tsx` campos truth; script `check-ml-image-remediation.ts` expone más que algunas vistas.
- **Recomendación:** **Prerequisite prueba real (UX):** panel “ML image compliance” en detalle producto con último trace canónico (publishSafe, floor, provisional winner).
- **Bloquea prueba real:** No estrictamente; aumenta riesgo operativo.
- **Bloquea escalado:** Parcial.

### U-003
- **Área:** UI
- **Título:** Oportunidades muestran `suggestedPrice` calculado en backend — coherencia con publish depende de F-003 (pricing)
- **Estado:** **Parcialmente verificado**
- **Severidad:** Media
- **Evidencia:** `Opportunities.tsx` payload `suggestedPriceUsd`, `totalCost`.
- **Recomendación:** Mostrar desglose de fees usado (ML vs eBay) en UI antes de publicar.
- **Bloquea prueba real:** Recomendado.

---

## Respuestas directas (briefing)

1. **¿Qué tan fiel es la UI al backend hoy?** **Parcial** — hay superficies explícitamente honestas (Sales, Reports); otras dependen de datos sincronizados y pueden mostrar vacíos.
2. **¿Qué puede inducir a error?** Asumir que “publicado” = “imagen final aprobada” sin abrir truth; asumir profit sin ladder completa.
3. **¿Qué falta?** Vista única “pre-flight publish” con: imagen publishSafe, floor P86, precio fuente única, idioma policy, credenciales ML+AliExpress OK.
4. **¿Acciones frágiles?** Publicar desde oportunidad sin confirmar pack en disco; autopilot automatic sin revisar working capital.

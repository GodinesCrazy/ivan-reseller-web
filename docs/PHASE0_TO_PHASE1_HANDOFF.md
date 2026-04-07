# PHASE 0 → PHASE 1 HANDOFF
**Date**: 2026-03-31  
**Status**: Fase 0 CERRADA → Fase 1 HABILITADA

---

## Estado final de Phase 0

**Veredicto**: ✅ GO OPERACIONAL

| Dimensión | Estado |
|-----------|--------|
| Código | ✅ Completo — 7 servicios modificados/creados, 18/18 tests pasan |
| Infraestructura | ✅ Sana — backend activo, Redis correcto, DB conectada |
| Variables de entorno | ✅ Aplicadas — 9 vars Phase 0 en Railway |
| Build en producción | ✅ HEAD `97fb18f` activo en Railway |
| Documentación | ✅ Completa |

---

## Qué quedó resuelto en Phase 0

### Motor económico (crítico)
- **Canonical Cost Engine** creado como Single Source of Truth
- **Payment fee corregido**: 2.9% flat → 3.49% + $0.49 fijo (delta: +$0.61 en eBay $20)
- **Marketplace fees correctos**: eBay 12.85%, ML 13.9% (BR 16%), Amazon 15%
- **Import duties ML Chile**: IVA 19% + arancel 6% incluidos en cálculo
- **Divergencia eliminada** entre cost-calculator, profit-guard y pricing-engine

### Competitor data MercadoLibre (robustez)
- **OAuth con auto-refresh** en 401 (antes: sin refresh → credenciales caducaban silenciosamente)
- **Scraper-bridge fallback** implementado para cuando ML da 403 desde IPs Railway
- **Telemetría explícita**: `finalDecision` logueado en cada ciclo de competitor analysis

### Filtros de proveedor AliExpress (calidad)
- Thresholds activados: `MIN_SUPPLIER_ORDERS=100`, `MIN_SUPPLIER_RATING=4.0`, `MIN_SUPPLIER_REVIEWS=10`
- Shipping filtrado: `MAX_SHIPPING_DAYS=30`
- Margen mínimo: `MIN_OPPORTUNITY_MARGIN=0.18` (subido de 0.15)
- Log de thresholds activos al inicio de cada ciclo

### Infraestructura Railway (estabilidad)
- **REDIS_URL corregido**: de `localhost:6379` a URL real del Redis Railway
- **Backend recuperado**: de CRASHED 2/2 a Active y estable
- **Variables Phase 0 aplicadas** en producción

---

## Qué no bloquea pero queda pendiente

| Item | Cuándo se verifica |
|------|-------------------|
| Log `[OPPORTUNITY-FINDER] Active thresholds` en Railway | Primer ciclo real (Fase 1) |
| `finalDecision` ML competitor data en runtime | Primer ciclo real (Fase 1) |
| Flujo E2E oportunidad → producto enriquecido → candidato | Fase 1 ciclo controlado |
| Activar `SCRAPER_BRIDGE_ENABLED` si se dispone de bridge | Cuando bridge esté disponible |

Ver `PHASE0_NON_BLOCKING_PENDING_CHECKS.md` para detalles.

---

## Riesgos remanentes no críticos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| ML 403 desde IPs Railway (public catalog) | Alta | Medio | Fallback implementado; competitor data degradado pero funcional |
| Scraper-bridge no disponible en prod | Alta | Bajo | Sistema opera con precios fallback |
| 0 oportunidades en primer ciclo | Media | Bajo | Diagnóstico en Fase 1 — no es infraestructura |
| Tests pre-existentes fallando (19 suites) | Certeza | Bajo | Pre-existentes, no introducidos por Phase 0 |
| nixpacks.toml tiene healthcheck timeout 120 | Baja | Bajo | railway.json override con 720 — Railway usa JSON |

---

## Objetivo exacto de Phase 1

> **Ejecutar el primer ciclo controlado real de opportunity discovery y preparar UNA publicación controlada si los criterios económicos se cumplen.**

Phase 1 no es un roadmap completo. Es un ciclo concreto y acotado con evidencia real.

---

## Alcance de Phase 1

### Sí incluye
- Validar el motor de oportunidades en runtime real con datos AliExpress + ML
- Confirmar thresholds activos en logs Railway
- Obtener competitor data real de MercadoLibre (cualquier fuente)
- Ejecutar flujo de enriquecimiento con producto real
- Evaluar calidad económica de oportunidades encontradas
- Preparar 1 producto candidato para publicación controlada (si criterios se cumplen)
- Presentar candidato al operador para aprobación manual

### No incluye
- Auto-purchase LIVE (requiere criterios explícitos validados)
- Escalar a operación masiva
- Nuevas integraciones de proveedor
- Cambios de infraestructura salvo fallo real nuevo
- Publicación automática sin aprobación del operador

---

## Dependencias

| Dependencia | Estado |
|-------------|--------|
| Backend Railway activo | ✅ Cumplido |
| Variables Phase 0 en Railway | ✅ Cumplido |
| Credenciales AliExpress configuradas | Asumir OK (no hubo evidencia de fallo) |
| Credenciales ML OAuth configuradas | Asumir OK o degradado a public catalog |
| Usuario de prueba con JWT válido | Requerido para API calls en Fase 1 |

---

## Criterio de éxito de Phase 1

> Al menos 1 oportunidad con margen real ≥ 18% (cálculo canónico), producto enriquecido válido con datos reales de AliExpress, breakdown económico completo, y candidato presentado al operador para publicación.

---

## Criterio de NO-GO de Phase 1

| Condición | Acción |
|-----------|--------|
| Backend crashea de nuevo | Abrir diagnóstico infraestructura — no es de Fase 1 |
| 0 oportunidades pasan filtros | Diagnosticar catálogo AliExpress — no relajar filtros sin evidencia |
| Flujo enriquecimiento falla sistemáticamente | Diagnosticar API AliExpress |
| Margen real < 10% en todas las oportunidades | Revisar pricing vs competencia real en ML |

---

## Prompt maestro de Fase 1

Ver `docs/PHASE1_MASTER_PROMPT.md` — listo para copiar y pegar.

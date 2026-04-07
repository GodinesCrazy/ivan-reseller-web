# PHASE 0 — VERIFICACIONES COMPLEMENTARIAS NO BLOQUEANTES
**Date**: 2026-03-31  
**Status**: Pendiente — a completar durante Fase 1

---

## IMPORTANTE

> **Este documento NO reabre Fase 0.**  
> Fase 0 está cerrada operacionalmente (ver `PHASE0_OPERATIONAL_GO.md`).  
> Los ítems aquí listados son verificaciones de calidad que se completarán de forma natural en el primer ciclo real de Fase 1.

---

## 1. Confirmar línea `[OPPORTUNITY-FINDER] Active thresholds` en logs Railway

**Qué es**: Log emitido por `opportunity-finder.service.ts` al inicio de cada ciclo de `findOpportunities()`. Muestra los valores de filtros activos.

**Por qué no bloquea**: Las variables están aplicadas en Railway (`MIN_OPPORTUNITY_MARGIN=0.18`, `MIN_SUPPLIER_ORDERS=100`, etc.). El log aparecerá automáticamente en el primer ciclo real de oportunidades.

**Cómo verificar**: Railway Dashboard → Deployment activo → Logs → buscar:
```
[OPPORTUNITY-FINDER] Active thresholds { minMargin: 0.18, minSupplierOrders: 100, ... }
```

**Cuándo**: Durante o después del primer ciclo controlado de Fase 1.

---

## 2. Confirmar `finalDecision` de competitor data ML en ejecución real

**Qué es**: Telemetría emitida por `competitor-analyzer.service.ts` indicando qué fuente de datos fue usada para comparables de MercadoLibre.

**Valores posibles**:
- `auth_comparables_used` — ML OAuth funcionó (mejor caso)
- `public_comparables_used` — ML catálogo público OK
- `scraper_bridge_comparables_used` — bridge activo
- `ML_PUBLIC_CATALOG_HTTP_FORBIDDEN` — 403 desde IPs Railway, sin bridge (degradado pero funcional con fallback)

**Por qué no bloquea**: El motor económico es correcto independientemente de la fuente de competitor data. El fallback está implementado.

**Cómo verificar**: Railway Logs → buscar:
```
[competitor-analyzer] ML comparables telemetry { ... finalDecision: "..." }
```

**Cuándo**: Primer ciclo de opportunity discovery en Fase 1.

---

## 3. Validación E2E: flujo oportunidad → producto enriquecido → publicación candidata

**Qué es**: Verificar que el pipeline completo funciona con datos reales de AliExpress:
1. `findOpportunities()` retorna oportunidades con margen ≥ 18%
2. `opportunity-import-enrichment.service.ts` enriquece con SKU y datos de proveedor
3. El producto verificado cumple todos los criterios (orders, rating, shipping days)
4. El cálculo de rentabilidad real incluye fees canónicos

**Por qué no bloquea**: No es bloqueante para el cierre de Fase 0; es el objetivo central de Fase 1.

**Cuándo**: Fase 1, ciclo controlado.

---

## 4. Verificar `NATIVE_SCRAPER_URL` si falla el flujo que depende de native-scraper

**Qué es**: Algunos flujos de obtención de datos de producto pueden depender de un scraper nativo local/remoto.

**Por qué no bloquea ahora**: No hay evidencia de que este flujo esté en uso crítico en Fase 0. Si aparece en Fase 1, se configura entonces.

**Cuándo**: Solo si en Fase 1 se observa error relacionado con `NATIVE_SCRAPER_URL` en logs.

---

## 5. Activar `SCRAPER_BRIDGE_ENABLED=true` si se dispone de bridge productivo

**Qué es**: El scraper-bridge es el fallback para competitor data ML cuando OAuth y catálogo público fallan (403 desde IPs Railway).

**Estado actual**: Código implementado y listo. Variable no activa porque no se tiene URL de bridge productivo confirmada.

**Por qué no bloquea**: ML puede operar con fallback de precios estimados. El bridge mejora la calidad de los comparables pero no es requerido para arrancar.

**Cuándo**: Cuando se tenga un bridge operativo en producción (Railway o externo). Agregar:
```
SCRAPER_BRIDGE_ENABLED=true
SCRAPER_BRIDGE_URL=<url-del-bridge>
```

---

## Resumen

| Check | Bloquea Fase 0 | Bloquea Fase 1 | Cuándo |
|-------|----------------|----------------|--------|
| Log `[OPPORTUNITY-FINDER] Active thresholds` | ❌ No | ❌ No | Primer ciclo real |
| `finalDecision` ML competitor data | ❌ No | ❌ No | Primer ciclo real |
| Flujo E2E oportunidad → producto | ❌ No | ✅ Objetivo de F1 | Fase 1 ciclo controlado |
| `NATIVE_SCRAPER_URL` | ❌ No | ❌ No (condicional) | Solo si hay error |
| `SCRAPER_BRIDGE_ENABLED` | ❌ No | ❌ No (mejora) | Cuando bridge disponible |

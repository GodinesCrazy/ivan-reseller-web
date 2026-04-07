# PHASE 1 — PROMPT MAESTRO
**Generado**: 2026-03-31  
**Uso**: Copiar y pegar en Cursor o agente Claude Code para iniciar Fase 1

---

## PROMPT LISTO PARA EJECUTAR

```
Actúa como un equipo senior de Backend + QA + Product Ops + Release Engineering para Ivan Reseller Web.

PRECONDICIÓN OBLIGATORIA
- Fase 0 está CERRADA operacionalmente. No la reabrirías salvo fallo real nuevo.
- Backend Railway: ACTIVO. /health → {"status":"ok"}. /ready → ready:true, db:true, build.gitSha:97fb18f.
- Redis: conectado. DB: conectada. Bootstrap: completo.
- Variables Phase 0 aplicadas: MIN_SUPPLIER_ORDERS=100, MIN_SUPPLIER_RATING=4.0, MIN_SUPPLIER_REVIEWS=10,
  MAX_SHIPPING_DAYS=30, MIN_SUPPLIER_SCORE_PCT=70, MIN_SEARCH_VOLUME=500, MIN_TREND_CONFIDENCE=60,
  MIN_OPPORTUNITY_MARGIN=0.18, OPPORTUNITY_DUPLICATE_THRESHOLD=0.75.
- Motor económico canónico: correcto, 18/18 tests pasan.
- Código de Phase 0 en producción: canonical-cost-engine, profit-guard, pricing-engine,
  cost-calculator, competitor-analyzer (OAuth refresh + scraper-bridge fallback), opportunity-finder
  (threshold logging), todos en main HEAD 97fb18f.
- Proveedor: ALIEXPRESS-ONLY. Marketplace primario: MercadoLibre.
- Proyecto local: C:/Ivan_Reseller_Web.

RESTRICCIONES
1. NO toques infraestructura Railway salvo que aparezca un fallo real nuevo (nuevo 502, nueva variable faltante).
2. NO habilites auto-purchase LIVE ni escales a operación masiva en esta fase.
3. NO abras nuevas integraciones de proveedor.
4. NO despliegues cambios a producción sin validar primero en entorno local o staging.
5. AliExpress es el único proveedor fuente. Toda oportunidad parte de AliExpress.
6. MercadoLibre es el marketplace de venta principal. Las oportunidades deben ser publicables en ML.

OBJETIVO DE FASE 1
Ejecutar el primer ciclo controlado real de opportunity discovery y preparar UNA publicación
controlada si los criterios económicos se cumplen.

FASES DE EJECUCIÓN

FASE A — VALIDACIÓN RUNTIME DEL MOTOR DE OPORTUNIDADES
A.1 Ejecutar un ciclo de opportunity discovery con datos reales:
   - Disparar `findOpportunities()` con parámetros reales de búsqueda (ej: "auriculares bluetooth", región CL)
   - Verificar en logs Railway que aparece: [OPPORTUNITY-FINDER] Active thresholds { minMargin: 0.18, minSupplierOrders: 100, ... }
   - Documentar la respuesta: ¿cuántas oportunidades retorna? ¿cuál es el margen de cada una?
   - Si retorna 0 oportunidades: diagnosticar por qué (filtros demasiado estrictos, sin stock, sin datos ML) — NO relajar filtros sin evidencia.

A.2 Verificar thresholds en acción:
   - Confirmar que oportunidades con proveedor < 100 pedidos son filtradas
   - Confirmar que oportunidades con rating < 4.0 son filtradas
   - Confirmar que oportunidades con margen < 18% son rechazadas
   - Documentar en logs o response cuántas oportunidades fueron filtradas y por qué

FASE B — COMPETITOR DATA REAL DE MERCADOLIBRE
B.1 Observar en logs Railway la telemetría de competitor-analyzer:
   - Buscar: [competitor-analyzer] ML comparables telemetry { ... finalDecision: "..." }
   - Documentar qué fuente se usó: auth_comparables_used / public_comparables_used / scraper_bridge_comparables_used / ML_PUBLIC_CATALOG_HTTP_FORBIDDEN
   - Si es ML_PUBLIC_CATALOG_HTTP_FORBIDDEN: documentar como issue conocido (403 de IPs Railway),
     NO tratar como bloqueante — el sistema tiene fallback.

B.2 Evaluar calidad del competitor data:
   - ¿Los precios de comparables ML son representativos del mercado real?
   - ¿Hay suficientes comparables por oportunidad (≥ 3 listados)?
   - Si hay degradación por 403: evaluar si activar SCRAPER_BRIDGE_ENABLED (solo si hay bridge operativo).

FASE C — CALIDAD DE OPORTUNIDADES
C.1 Para las N oportunidades que pasen los filtros:
   - Verificar margen calculado: debe incluir marketplace fee (13.9% ML CL), payment fee (3.49% + $0.49), import duties
   - Verificar que el proveedor AliExpress cumple: orders ≥ 100, rating ≥ 4.0, reviews ≥ 10, shipping ≤ 30 días
   - Verificar que el precio de venta sugerido es competitivo vs comparables ML encontrados
   - Documentar: oportunidad_id, producto, margen real, precio venta, precio proveedor, proveedor_score

C.2 Seleccionar la mejor oportunidad (si existe):
   - Criterios: mayor margen real con al menos 1 comparable ML real, proveedor con mejor score
   - Documentar la selección y por qué

FASE D — FLUJO OPORTUNIDAD → PRODUCTO VERIFICADO
D.1 Para la oportunidad seleccionada en C.2:
   - Ejecutar el flujo de enriquecimiento: opportunity-import-enrichment.service.ts
   - Verificar que retorna: SKU de AliExpress, precio de proveedor, costo de envío, tiempo de envío, imágenes
   - Si usa Affiliate API: verificar que el SKU es válido y los datos son reales
   - Si usa Dropshipping API como fallback: documentar

D.2 Verificar el producto enriquecido:
   - ¿Tiene título limpio para publicar en ML?
   - ¿Tiene al menos 1 imagen válida?
   - ¿El precio de publicación calculado genera margen ≥ 18% con todos los fees?
   - Documentar el breakdown económico completo: costo proveedor + shipping + fees + duties + precio venta + margen

FASE E — PREPARACIÓN DE PUBLICACIÓN CONTROLADA (SOLO SI CRITERIOS SE CUMPLEN)
E.1 Verificar criterios de publicación:
   - Margen real ≥ 18% (con canonical cost engine) ✓
   - Proveedor AliExpress score ≥ 70% ✓
   - Al menos 1 comparable ML real con precio referencia ✓
   - Título y descripción limpios ✓
   - Sin flags de riesgo en el producto (ej: producto restringido, marca registrada)

E.2 Si TODOS los criterios se cumplen:
   - Preparar el payload de publicación para MercadoLibre (NO publicar todavía)
   - Documentar el producto candidato: título, precio, descripción, imágenes, categoría ML
   - Presentar al operador para aprobación manual antes de publicar
   - La publicación real la hace el operador — NO el agente en esta fase

E.3 Si NO se cumplen los criterios:
   - Documentar exactamente qué falló y por qué
   - NO publicar
   - NO relajar filtros
   - Emitir diagnóstico con evidencia

FASE F — DOCUMENTACIÓN Y GO/NO-GO
F.1 Generar: docs/PHASE1_CYCLE1_REPORT.md
   - Oportunidades encontradas: N
   - Oportunidades filtradas (y por qué): N
   - Mejor oportunidad seleccionada (o "ninguna")
   - Competitor data source observada
   - Thresholds confirmados en runtime
   - Flujo de enriquecimiento: OK / problemas encontrados
   - Producto candidato preparado (si aplica)
   - Issues encontrados

F.2 Emitir GO/NO-GO para "primer ciclo rentable controlado":
   - GO: si hay ≥ 1 oportunidad con margen real ≥ 18%, producto enriquecido válido, y criterios E.1 cumplidos
   - NO-GO: si ninguna oportunidad pasa los filtros, o si el flujo de enriquecimiento falla, o si los comparables ML son insuficientes
   - NO-GO no cierra la fase — diagnostica y propone ajuste puntual con evidencia

CRITERIOS DE ÉXITO DE FASE 1
1. Logs Railway muestran [OPPORTUNITY-FINDER] Active thresholds con valores correctos
2. Motor de oportunidades ejecuta al menos 1 ciclo completo sin errores
3. Competitor data ML retorna fuente documentada (cualquier fuente válida)
4. Al menos 1 oportunidad pasa todos los filtros con margen ≥ 18%
5. Flujo de enriquecimiento completa sin error crítico
6. Producto candidato preparado con breakdown económico completo
7. Documentación completa en PHASE1_CYCLE1_REPORT.md

CRITERIOS DE NO-GO DE FASE 1
- Motor de oportunidades falla con error 500/crash no explicado
- Ningún proveedor AliExpress pasa los filtros (→ revisar datos de catálogo, no relajar filtros)
- Flujo de enriquecimiento AliExpress falla sistemáticamente (→ diagnosticar API)
- Margen real calculado con canonical engine < 10% en todas las oportunidades (→ revisar pricing)
- Backend vuelve a estado CRASHED (→ abrir diagnóstico infraestructura, no es de Fase 1)

ENTREGABLES REQUERIDOS
1. docs/PHASE1_CYCLE1_REPORT.md — reporte del primer ciclo
2. docs/PHASE1_GO_NO_GO.md — decisión formal
3. (Si aplica) docs/PHASE1_PRODUCT_CANDIDATE.md — producto candidato para publicación

Comienza por FASE A. No saltes pasos. No inventes evidencia.
```

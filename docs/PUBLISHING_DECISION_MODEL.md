# PUBLISHING DECISION MODEL
**Date**: 2026-04-01  
**Commit**: `c7a8517`  
**Status**: ✅ Implementado, testeado en compilación, desplegado

---

## Tipos

### `PublishingDecision` (enum de 7 estados)

```typescript
type PublishingDecision =
  | 'PUBLICABLE'                     // Todos los gates OK → canPublish: true
  | 'NO_PUBLICABLE'                  // Reservado para veto manual futuro
  | 'NEEDS_MARKET_DATA'              // Margen OK pero sin comparables reales (≥ 3)
  | 'NEEDS_ENRICHMENT'              // Datos de producto incompletos (imágenes / URL / fees)
  | 'REJECTED_LOW_MARGIN'           // profitMargin < minMarginPct
  | 'REJECTED_LOW_SUPPLIER_QUALITY' // Reservado — filtro de proveedor futuro
  | 'REJECTED_NO_COMPETITOR_EVIDENCE'; // 0 comparables y sin bloqueo estructural
```

### `PublishingDecisionResult`

```typescript
interface PublishingDecisionResult {
  decision: PublishingDecision;
  reasons: string[];           // Lista legible de razones
  canPublish: boolean;         // true SOLO para PUBLICABLE
  checkedAt: string;           // ISO timestamp
  comparablesCount: number;    // Listados reales encontrados
  dataSource?: string;         // 'mercadolibre_authenticated_catalog', etc.
  realMarginPct: number;       // profitMargin × 100
  minimumViablePriceUsd: number; // feesConsidered.totalCost
  suggestedPriceUsd: number;
}
```

### `OpportunityItem` (campo añadido)

```typescript
interface OpportunityItem {
  // ... campos existentes ...
  publishingDecision?: PublishingDecisionResult;
}
```

---

## Función `computePublishingDecision()`

**Archivo**: [backend/src/services/opportunity-finder.service.ts](../backend/src/services/opportunity-finder.service.ts)

### Signatura

```typescript
function computePublishingDecision(params: {
  opp: OpportunityItem;
  comparablesCount: number;
  dataSource?: string;
  probeCodes: string[];
  minMarginPct: number;
}): PublishingDecisionResult
```

### Flujo de gates (en orden)

```
Gate 1: images && aliexpressUrl && title
  ❌ → NEEDS_ENRICHMENT

Gate 2: feesConsidered non-empty
  ❌ → NEEDS_ENRICHMENT

Gate 3: profitMargin × 100 >= minMarginPct (18%)
  ❌ → REJECTED_LOW_MARGIN

Gate 4: comparablesCount === 0 && probeCode contains FORBIDDEN|UNAUTHORIZED|NETWORK|TIMEOUT
  ❌ → NEEDS_MARKET_DATA (bloqueo estructural)

Gate 5: comparablesCount === 0 (sin bloqueo detectado)
  ❌ → REJECTED_NO_COMPETITOR_EVIDENCE

Gate 6: comparablesCount < 3 (evidencia insuficiente)
  ❌ → NEEDS_MARKET_DATA

Gate 7: comparablesCount >= 3 && all above OK
  ✅ → PUBLICABLE (canPublish: true)
```

### Invariante crítica

`canPublish === true` si y solo si `decision === 'PUBLICABLE'`.  
El payload de publicación en `importProduct()` / `createAndPublishProduct()` debe verificar `canPublish` antes de llamar al endpoint de publicación.

---

## Integración en pipeline

### Dónde se llama

Al final del bloque de construcción de `opp` en `findOpportunities()`, antes de `opportunities.push(opp)`:

```typescript
publishingDecision: computePublishingDecision({
  opp: { profitMargin, suggestedPriceUsd, feesConsidered, images, aliexpressUrl, title },
  comparablesCount: valid?.listingsFound ?? 0,
  dataSource: valid?.dataSource,
  probeCodes: competitionDiagnostics.map(d => d.probeCode || '').filter(Boolean),
  minMarginPct: effectiveMinMargin * 100,
}),
```

### Qué entra al cálculo

| Parámetro | Fuente |
|-----------|--------|
| `comparablesCount` | `MarketAnalysis.listingsFound` del mejor análisis con datos reales |
| `dataSource` | `MarketAnalysis.dataSource` (`mercadolibre_authenticated_catalog`, etc.) |
| `probeCodes` | `competitionDiagnostics[].probeCode` — uno por marketplace |
| `minMarginPct` | `effectiveMinMargin × 100` — respeta `relaxedMargin` y `MIN_OPPORTUNITY_MARGIN` |
| `profitMargin` | `finalMargin` — recalculado con `totalCost` canónico |
| `feesConsidered` | `bestBreakdown` — del canonical engine o del análisis real |

---

## Frontend

### Badge component

```tsx
function PublishingDecisionBadge({ result }: { result: PublishingDecisionResult }) {
  // color por decision, texto legible en español
  // hover muestra result.reasons como tooltip
  return <span className={...} title={result.reasons.join('\n')}>...</span>
}
```

### Colores

| Decision | Color |
|----------|-------|
| PUBLICABLE | Verde |
| NEEDS_MARKET_DATA | Amarillo |
| NEEDS_ENRICHMENT | Naranja |
| REJECTED_LOW_MARGIN | Rojo |
| REJECTED_NO_COMPETITOR_EVIDENCE | Gris |
| NO_PUBLICABLE | Rojo |
| REJECTED_LOW_SUPPLIER_QUALITY | Rojo |

### Posición en UI

- Badge aparece en columna "Acciones" de la tabla de oportunidades, encima del botón Importar
- Primera razón visible inline bajo el badge
- Razones completas en tooltip (hover)
- Botón "Importar" siempre habilitado — guarda en Products para revisión
- Publicación directa bloqueada a nivel de decisión (no a nivel de UI solo)

---

## Estado por contexto de despliegue

| Escenario | Decisión esperada |
|-----------|------------------|
| ML 403 Railway (actual) | `NEEDS_MARKET_DATA` + probeCode en reasons |
| ML OAuth configurado + ≥ 3 comparables + margen OK | `PUBLICABLE` |
| eBay configurado + ≥ 3 comparables + margen OK | `PUBLICABLE` |
| Scraper-bridge activo + ≥ 3 comparables + margen OK | `PUBLICABLE` |
| Margen < 18% (cualquier fuente) | `REJECTED_LOW_MARGIN` |
| Sin imágenes | `NEEDS_ENRICHMENT` |

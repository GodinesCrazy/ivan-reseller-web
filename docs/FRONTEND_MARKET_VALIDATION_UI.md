# FRONTEND — MARKET VALIDATION UI
**Date**: 2026-04-01  
**Build**: `c7a8517`  
**Archivo**: `frontend/src/pages/Opportunities.tsx`

---

## Cambios implementados

### 1. Tipos añadidos

```typescript
type PublishingDecision =
  | 'PUBLICABLE' | 'NO_PUBLICABLE' | 'NEEDS_MARKET_DATA'
  | 'NEEDS_ENRICHMENT' | 'REJECTED_LOW_MARGIN'
  | 'REJECTED_LOW_SUPPLIER_QUALITY' | 'REJECTED_NO_COMPETITOR_EVIDENCE';

interface PublishingDecisionResult {
  decision: PublishingDecision;
  reasons: string[];
  canPublish: boolean;
  checkedAt: string;
  comparablesCount: number;
  dataSource?: string;
  realMarginPct: number;
  minimumViablePriceUsd: number;
  suggestedPriceUsd: number;
}

// OpportunityItem extended:
publishingDecision?: PublishingDecisionResult;
```

### 2. Mapas de etiquetas y colores

```typescript
const PUBLISHING_DECISION_LABELS: Record<PublishingDecision, string> = {
  PUBLICABLE: 'Publicable',
  NO_PUBLICABLE: 'No publicable',
  NEEDS_MARKET_DATA: 'Sin datos de mercado',
  NEEDS_ENRICHMENT: 'Datos incompletos',
  REJECTED_LOW_MARGIN: 'Margen insuficiente',
  REJECTED_LOW_SUPPLIER_QUALITY: 'Calidad de proveedor baja',
  REJECTED_NO_COMPETITOR_EVIDENCE: 'Sin comparables reales',
};

const PUBLISHING_DECISION_COLORS: Record<PublishingDecision, string> = {
  PUBLICABLE: 'bg-green-100 text-green-800 border-green-300',
  NEEDS_MARKET_DATA: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  NEEDS_ENRICHMENT: 'bg-orange-100 text-orange-800 border-orange-300',
  REJECTED_LOW_MARGIN: 'bg-red-100 text-red-800 border-red-300',
  REJECTED_NO_COMPETITOR_EVIDENCE: 'bg-gray-100 text-gray-700 border-gray-300',
  // ...
};
```

### 3. Componente `PublishingDecisionBadge`

```tsx
function PublishingDecisionBadge({ result }: { result: PublishingDecisionResult }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${colors}`}
      title={result.reasons.join('\n')}   // ← tooltip con razones completas
    >
      {result.canPublish ? '✓' : '○'} {label}
    </span>
  );
}
```

### 4. Celda de Acciones actualizada

```tsx
<td className="p-3 text-center">
  <div className="flex flex-col gap-2 items-center">

    {/* Badge de decisión */}
    {it.publishingDecision && (
      <PublishingDecisionBadge result={it.publishingDecision} />
    )}

    {/* Botón Importar — siempre habilitado */}
    <button
      type="button"
      onClick={() => importProduct(it)}
      disabled={publishing[idx]}
      className="px-4 py-1.5 bg-green-600 text-white rounded ..."
    >
      <Download /> Importar
    </button>

    {/* Primera razón visible si no es publicable */}
    {it.publishingDecision && !it.publishingDecision.canPublish && (
      <p className="text-xs text-gray-500 max-w-[140px] text-center leading-tight">
        {it.publishingDecision.reasons[0]}
      </p>
    )}

  </div>
</td>
```

---

## Comportamiento en UI por estado

| Decision | Badge | Color | Razón visible | Importar |
|----------|-------|-------|---------------|---------|
| PUBLICABLE | ✓ Publicable | Verde | — | ✅ Habilitado |
| NEEDS_MARKET_DATA | ○ Sin datos de mercado | Amarillo | Sí (primera) | ✅ Habilitado |
| NEEDS_ENRICHMENT | ○ Datos incompletos | Naranja | Sí | ✅ Habilitado |
| REJECTED_LOW_MARGIN | ○ Margen insuficiente | Rojo | Sí | ✅ Habilitado |
| REJECTED_NO_COMPETITOR_EVIDENCE | ○ Sin comparables reales | Gris | Sí | ✅ Habilitado |

> **Nota de diseño**: El botón "Importar" permanece habilitado en todos los estados porque importar guarda en `Products` para revisión posterior. La gating de publicación directa ocurre en el backend, no en la UI de Importar.

---

## Información ya existente (sin cambios necesarios)

Los campos siguientes ya se renderizaban correctamente:

| Campo | Dónde se muestra |
|-------|-----------------|
| `feesConsidered` | Columna Precio sugerido → tooltip/breakdown |
| `competitionDiagnostics` | Columna Competencia → badge + detail |
| `commercialTruth` | Badges "Estimado" en Precio y Margen |
| `suggestedPriceUsd` | Columna Precio sugerido |
| `profitMargin` | Columna Margen % |
| `roiPercentage` | Columna ROI % |
| `images` | Columna Imagen (carrusel) |

---

## Razones completas en tooltip

El hover sobre el badge muestra **todas** las razones en texto plano (atributo `title`).  
En el estado actual (ML 403), las razones incluyen el probe code específico:

```
Sin acceso a datos de mercado — bloqueo estructural de plataforma (ej: ML 403 desde IPs Railway)
Precio $13.94 es el mínimo rentable canónico, no el precio de mercado real
Para publicar: configurar ML OAuth real o scraper-bridge en producción
Probe: ML_PUBLIC_CATALOG_HTTP_FORBIDDEN
```

---

## Estado de compilación

- Frontend TypeScript: errores pre-existentes en otros archivos, ninguno en `Opportunities.tsx`
- Backend TypeScript: ✅ 0 errores (`npx tsc --noEmit` limpio)
- Commit: `c7a8517` pusheado a `main`

# ML Chile Business Truth Model
**Fecha:** 2026-04-04  
**Service:** `backend/src/services/ml-chile-import-compliance.service.ts`  
**Endpoints:** `GET /api/workflow/ml-chile-truth/:productId`, `GET /api/workflow/ml-chile-checklist/:productId`

---

## Definición del Truth Model

El **Business Truth Model** es el conjunto de hechos operativos verificados sobre un producto importado vendido en Mercado Libre Chile. Es la fuente de verdad interna que el sistema usa para:
- Determinar qué se publica en la descripción
- Auditar el estado de cada listing
- Decidir si el fulfillment puede ser automático o requiere intervención manual
- Informar al operador sobre el estado real del negocio

---

## Estructura: `MLChileBusinessTruth`

```typescript
interface MLChileBusinessTruth {
  originCountry: string;           // 'CN' para AliExpress/China
  sourcingType: 'dropshipping_aliexpress' | 'local_stock' | 'unknown';
  eta: {
    minDays: number;               // ETA mínimo (días calendario)
    maxDays: number;               // ETA máximo (días calendario)
    label: string;                 // "20-40 días"
    basis: 'configured' | 'product_data' | 'default';
  };
  shippingTruth: {
    status: ShippingTruthStatus;   // Ver tabla abajo
    mode: string;                  // 'me2' | 'not_specified'
    handlingTimeDays: number;      // Días de despacho declarados
    freeShipping: boolean;
    knownLimitation: string | null; // Texto explicativo si hay limitación
  };
  taxTruth: {
    ivaIncluded: boolean;          // Siempre true para MLC (ML gestiona IVA)
    ivaRate: number;               // 0.19
    ivaHandledBy: 'mercadolibre_platform' | 'buyer_at_customs';
    estimatedIvaOnSalePrice: number | null; // USD, sólo interno
  };
  legalCompliance: {
    legalTextsAppended: boolean;
    guaranteeIncluded: boolean;
    retractoIncluded: boolean;
    importedProductDeclared: boolean;
    ivaClauseIncluded: boolean;
  };
  fulfillmentReadiness: {
    aliexpressUrlPresent: boolean;
    profitabilityGateOk: boolean | null;
    manualInterventionRequired: boolean;
    notes: string[];
  };
  overallReadiness: 'ready' | 'partial' | 'not_ready';
  operatorSummary: string[];
}
```

---

## Campos del Truth Model — Detalle

### `originCountry`
**Fuente:** `Product.originCountry` (campo en DB). Si es `null`, default `'CN'` (AliExpress = China).  
**Uso:** Se muestra en el footer como "Producto importado de {China}".

### `sourcingType`
**Fuente:** Presencia de `Product.aliexpressUrl`.  
- `dropshipping_aliexpress` → URL AliExpress presente → compra automática posible
- `unknown` → Sin URL → compra requiere intervención manual

### `eta`
**Fuente (por prioridad):**
1. `mlHandlingTimeDays` del workflow config (si ≠ 30, indica valor explícitamente configurado)
2. `productData.estimatedDeliveryDays` del scraping de AliExpress
3. Default: 20–40 días (estándar CN→CL dropshipping)

**Basis labels:**
- `configured` → El operador configuró explícitamente los días en WorkflowConfig
- `product_data` → AliExpress proveyó estimado durante el scraping
- `default` → Sin datos específicos; se usa el rango conservador 20–40d

### `shippingTruth.status`

| Status | Significado | Cuando ocurre |
|---|---|---|
| `me2_enforced` | ML me2 mode activo y confirmado via API | me2 se pudo setear correctamente |
| `me2_attempted_not_enforced` | me2 intentado, ML revertió a not_specified | ML Chile revierte me2 en algunas categorías (limitación plataforma) |
| `not_specified` | Listing opera en modo not_specified | me2 nunca intentado, o revertido permanentemente |
| `unknown` | Estado no verificado aún | Listing recién creado, aún no consultado API |

**NOTA:** `me2_attempted_not_enforced` es la situación más común en MLC. El comprador ve "Entrega a acordar con el vendedor". La descripción siempre incluye el ETA real para compensar.

### `taxTruth`
**Fuente:** Normativa IVA digital Chile (oct 2025).  
- ML Chile cobra 19% IVA directamente en el checkout para importaciones <US$500
- El comprador no paga IVA extra en aduana
- `estimatedIvaOnSalePrice` es cálculo interno para que el operador conozca la carga impositiva implícita (no se cobra extra al comprador)

### `legalCompliance`
**Fuente:** `MarketplaceListing.legalTextsAppended` (persistido en DB al momento de publicar).  
- `true` → El footer legal fue appendeado en esa publicación
- `false` → Listing publicado antes de la implementación del footer, o en modo sin footer

### `fulfillmentReadiness`
**Evaluado en tiempo real** cada vez que se consulta el endpoint:
- `aliexpressUrlPresent` → `Product.aliexpressUrl` no vacío
- `profitabilityGateOk` → `Product.finalPrice/suggestedPrice > Product.totalCost`
- `manualInterventionRequired` → true si algún gate anterior falla
- `notes` → Mensajes específicos para el operador

### `overallReadiness`
| Valor | Condición |
|---|---|
| `ready` | No hay issues críticos ni advertencias |
| `partial` | Solo advertencias (textos legales ausentes, shipping truth no ideal) |
| `not_ready` | URL AliExpress ausente o precio ≤ costo |

---

## Campos en DB (MarketplaceListing)

```prisma
model MarketplaceListing {
  // ... campos existentes ...
  shippingTruthStatus    String?  // me2_enforced | me2_attempted_not_enforced | not_specified | unknown
  legalTextsAppended     Boolean  @default(false)
  importHandlingTimeDays Int?     // días configurados al momento de publicar
}
```

**¿Por qué persisted en DB?**
- Permite auditar listings históricos sin re-consultar la API de ML
- Permite filtrar listings con problemas de compliance desde queries Prisma
- Permite reportar sin depender de disponibilidad de la API de ML

---

## Uso en el Sistema

### Al publicar (`publishToMercadoLibre`)
1. Se construye el footer con ETA y textos legales
2. Se persiste `shippingTruthStatus` basado en el API snapshot post-creación
3. Se persiste `legalTextsAppended = true`
4. Se llama `logMLChilePublishTruth()` para log de auditoría

### Al consultar (endpoints)
- `GET /api/workflow/ml-chile-truth/:productId` → `MLChileBusinessTruth` completo
- `GET /api/workflow/ml-chile-checklist/:productId` → Checklist legible para operador

### En fulfillment (futuro)
- `fulfillmentReadiness.manualInterventionRequired` puede usarse para escalar antes de intentar compra automática

---

## Limitaciones Conocidas y Documentadas

| Limitación | Workaround implementado |
|---|---|
| me2 mode no enforced en MLC (limitación ML) | ETA real siempre en descripción; status `me2_attempted_not_enforced` en DB |
| Tracking AliExpress → comprador no automático | Manual; status MANUAL_ACTION_REQUIRED en orders que requieren tracking |
| `taxCalculatorService` no llamado directamente en publish | IVA incluido en `importTax` en `totalCost`; cláusula IVA en footer |
| ETA exacto no garantizable | Rango conservador 20–40d por defecto; configurable por operador |

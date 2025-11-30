# Plan de Acción: Visualización Completa del Workflow de Dropshipping

## Objetivo
Permitir a todos los usuarios ver claramente y gráficamente:
1. El flujo completo de cada artículo a través de todas las etapas
2. En qué etapa específica se encuentra cada artículo
3. Estado de cada etapa (manual/automático)
4. Ambiente de cada etapa (sandbox/producción)

---

## Análisis de Estado Actual

### Etapas del Workflow Identificadas
1. **SCRAPE** - Búsqueda de Oportunidades
2. **ANALYZE** - Análisis IA
3. **PUBLISH** - Publicación en Marketplace
4. **PURCHASE** - Compra Automática al Proveedor
5. **FULFILLMENT** - Cumplimiento y Envío
6. **CUSTOMER SERVICE** - Atención al Cliente

### Datos Disponibles en Base de Datos
- `Product.status`: PENDING, APPROVED, REJECTED, PUBLISHED, INACTIVE
- `Sale.status`: PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED, RETURNED
- `UserWorkflowConfig`: Configuración de modo (manual/automatic) por etapa
- `UserWorkflowConfig.environment`: sandbox/production
- `MarketplaceListing`: Vincula productos con marketplaces
- `PurchaseLog`: Logs de compras automáticas

---

## Solución Propuesta

### Fase 1: Backend - Endpoint de Estado de Workflow por Producto

**Nuevo Endpoint:** `GET /api/products/:productId/workflow-status`

**Respuesta:**
```typescript
{
  productId: number;
  productStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PUBLISHED' | 'INACTIVE';
  currentStage: 'scrape' | 'analyze' | 'publish' | 'purchase' | 'fulfillment' | 'customerService';
  environment: 'sandbox' | 'production';
  stages: {
    scrape: {
      status: 'completed' | 'pending' | 'skipped' | 'failed';
      mode: 'manual' | 'automatic' | 'guided';
      completedAt?: string;
      nextAction?: string;
    };
    analyze: {
      status: 'completed' | 'pending' | 'skipped' | 'failed';
      mode: 'manual' | 'automatic' | 'guided';
      completedAt?: string;
      nextAction?: string;
    };
    publish: {
      status: 'completed' | 'pending' | 'in-progress' | 'failed';
      mode: 'manual' | 'automatic' | 'guided';
      completedAt?: string;
      listingId?: string;
      marketplace?: string;
      nextAction?: string;
    };
    purchase: {
      status: 'completed' | 'pending' | 'in-progress' | 'failed' | 'not-needed';
      mode: 'manual' | 'automatic' | 'guided';
      completedAt?: string;
      orderId?: string;
      purchaseLogId?: number;
      nextAction?: string;
    };
    fulfillment: {
      status: 'completed' | 'pending' | 'in-progress' | 'failed';
      mode: 'manual' | 'automatic' | 'guided';
      trackingNumber?: string;
      shippedAt?: string;
      estimatedDelivery?: string;
      nextAction?: string;
    };
    customerService: {
      status: 'active' | 'completed' | 'pending' | 'not-needed';
      mode: 'manual' | 'automatic' | 'guided';
      openTickets?: number;
      lastInteraction?: string;
    };
  };
  timeline: Array<{
    stage: string;
    action: string;
    timestamp: string;
    status: string;
    actor?: 'system' | 'user';
  }>;
}
```

**Lógica del Servicio:**
1. Obtener producto y su estado actual
2. Obtener configuración de workflow del usuario
3. Determinar etapa actual basándose en:
   - `Product.status`
   - `MarketplaceListing` (si existe)
   - `Sale[]` (si hay ventas)
   - `PurchaseLog[]` (si hay compras)
4. Construir estado de cada etapa
5. Generar timeline de eventos

**Archivo:** `backend/src/services/product-workflow-status.service.ts`

---

### Fase 2: Frontend - Componente de Visualización de Pipeline

**Nuevo Componente:** `frontend/src/components/ProductWorkflowPipeline.tsx`

**Características:**
- Pipeline visual horizontal/vertical con etapas
- Indicador de etapa actual (highlight)
- Badges de estado por etapa (completado, pendiente, en progreso, fallido)
- Badges de modo (manual/automático) por etapa
- Badge global de ambiente (sandbox/producción)
- Timeline interactiva
- Tooltips informativos
- Responsive (mobile-friendly)

**Diseño Visual:**
```
┌─────────────────────────────────────────────────────────────────┐
│ 🌍 Ambiente: PRODUCTION                        Modo Global: AUTO │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [✓] SCRAPE      [✓] ANALYZE      [●] PUBLISH   [○] PURCHASE   │
│   AUTO ✅         AUTO ✅          AUTO 🔄       AUTO ⏸️        │
│   2h ago          1h ago           En curso      Esperando venta│
│                                                                  │
│                    └─► ETAPA ACTUAL ─┘                          │
│                                                                  │
│  [○] FULFILLMENT  [○] CUSTOMER SERVICE                          │
│   AUTO ⏸️          AUTO ⏸️                                       │
│   Pendiente        Pendiente                                     │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ Timeline de Eventos:                                            │
│ • Hace 2h - Producto encontrado (SCRAPE - AUTO)                │
│ • Hace 1h - Análisis completado (ANALYZE - AUTO)               │
│ • Ahora - Publicando en eBay (PUBLISH - AUTO)                  │
└─────────────────────────────────────────────────────────────────┘
```

**Estados Visuales:**
- ✅ **Completado**: Verde con check
- 🔄 **En Progreso**: Azul con spinner
- ⏸️ **Pendiente**: Gris con pausa
- ❌ **Fallido**: Rojo con X
- ⚠️ **Requiere Atención**: Amarillo con warning

**Badges de Modo:**
- `AUTO` - Azul (automático)
- `MANUAL` - Naranja (manual)
- `GUIDED` - Morado (guiado)

**Badge de Ambiente:**
- `PRODUCTION` - Verde oscuro
- `SANDBOX` - Amarillo/Naranja

---

### Fase 3: Integración en Páginas Existentes

**1. Página de Productos (`Products.tsx`)**
- Agregar columna "Workflow Status" con miniatura del pipeline
- Click para abrir modal con pipeline completo

**2. Página de Detalle de Producto (`ProductPreview.tsx`)**
- Agregar sección completa de "Workflow Status" en la parte superior
- Mostrar pipeline completo y timeline

**3. Página de Ventas (`Sales.tsx`)**
- Mostrar estado de workflow relacionado con cada venta
- Indicar etapa de fulfillment y customer service

**4. Dashboard Principal (`Dashboard.tsx`)**
- Widget de resumen de workflows activos
- Gráfico de distribución de etapas

---

### Fase 4: Backend - Servicio de Cálculo de Estado

**Archivo:** `backend/src/services/product-workflow-status.service.ts`

**Método Principal:**
```typescript
async getProductWorkflowStatus(productId: number, userId: number): Promise<ProductWorkflowStatus>
```

**Lógica de Determinación de Etapa:**

1. **SCRAPE:**
   - Completado si: Producto existe
   - Fecha: `Product.createdAt`

2. **ANALYZE:**
   - Completado si: `Product.status !== 'PENDING'`
   - Fecha: `Product.updatedAt` cuando cambió de PENDING

3. **PUBLISH:**
   - Completado si: `Product.isPublished === true`
   - En progreso si: `Product.status === 'APPROVED' && !isPublished`
   - Fecha: `Product.publishedAt` o `MarketplaceListing.publishedAt`

4. **PURCHASE:**
   - Completado si: Existe `PurchaseLog` con `status === 'SUCCESS'`
   - En progreso si: Existe `Sale` con `status === 'PENDING' || 'PROCESSING'`
   - Pendiente si: Hay ventas pero no compras
   - No necesario si: No hay ventas aún

5. **FULFILLMENT:**
   - Completado si: `Sale.status === 'DELIVERED'`
   - En progreso si: `Sale.status === 'SHIPPED'`
   - Pendiente si: Compra completada pero no enviado
   - Tracking: `Sale.trackingNumber`

6. **CUSTOMER SERVICE:**
   - Activo si: Hay tickets abiertos o devoluciones
   - Completado si: No hay tickets y venta completada
   - No necesario si: No hay ventas

---

### Fase 5: Timeline de Eventos

**Construcción de Timeline:**
- Eventos de base de datos (creación, actualizaciones)
- Eventos de logs (PurchaseLog, Activity)
- Eventos calculados (cambios de etapa)
- Ordenados por timestamp descendente

**Eventos a Incluir:**
- Creación de producto
- Aprobación/rechazo
- Publicación
- Venta recibida
- Compra automática iniciada
- Compra completada
- Envío
- Entrega
- Tickets de soporte

---

## Implementación Técnica

### Backend - Estructura de Archivos

```
backend/src/
├── services/
│   └── product-workflow-status.service.ts (NUEVO)
├── api/
│   └── routes/
│       └── products.routes.ts (MODIFICAR - agregar endpoint)
└── types/
    └── product-workflow.types.ts (NUEVO)
```

### Frontend - Estructura de Archivos

```
frontend/src/
├── components/
│   └── ProductWorkflowPipeline.tsx (NUEVO)
│   └── WorkflowStageBadge.tsx (NUEVO)
│   └── WorkflowTimeline.tsx (NUEVO)
├── pages/
│   ├── Products.tsx (MODIFICAR - agregar columna)
│   ├── ProductPreview.tsx (MODIFICAR - agregar sección)
│   ├── Sales.tsx (MODIFICAR - agregar workflow status)
│   └── Dashboard.tsx (MODIFICAR - agregar widget)
└── types/
    └── product-workflow.types.ts (NUEVO)
```

---

## Plan de Implementación por Fases

### ✅ Fase 1: Backend - Servicio y Endpoint (Prioridad Alta)
1. Crear `product-workflow-status.service.ts`
2. Implementar lógica de cálculo de estado por etapa
3. Implementar construcción de timeline
4. Crear endpoint `GET /api/products/:productId/workflow-status`
5. Agregar tipos TypeScript
6. Tests unitarios

**Tiempo estimado:** 2-3 horas

### ✅ Fase 2: Frontend - Componentes Base (Prioridad Alta)
1. Crear `ProductWorkflowPipeline.tsx`
2. Crear `WorkflowStageBadge.tsx`
3. Crear `WorkflowTimeline.tsx`
4. Estilos y responsive design
5. Tooltips y ayuda contextual

**Tiempo estimado:** 3-4 horas

### ✅ Fase 3: Integración en Páginas (Prioridad Media)
1. Integrar en `Products.tsx` (columna + modal)
2. Integrar en `ProductPreview.tsx` (sección completa)
3. Integrar en `Sales.tsx` (badge por venta)
4. Integrar en `Dashboard.tsx` (widget resumen)

**Tiempo estimado:** 2-3 horas

### ✅ Fase 4: Mejoras y Optimización (Prioridad Baja)
1. Caché de estados (evitar recalcular constantemente)
2. WebSocket para actualizaciones en tiempo real
3. Exportar timeline a PDF
4. Filtros y búsqueda por etapa

**Tiempo estimado:** 2-3 horas

---

## Consideraciones de Diseño

### Colores y Estados

**Estados de Etapa:**
- ✅ Completado: `green-500`
- 🔄 En Progreso: `blue-500` con animación
- ⏸️ Pendiente: `gray-400`
- ❌ Fallido: `red-500`
- ⚠️ Requiere Atención: `yellow-500`

**Badges de Modo:**
- `AUTO`: `blue-100` / `blue-700`
- `MANUAL`: `orange-100` / `orange-700`
- `GUIDED`: `purple-100` / `purple-700`

**Badges de Ambiente:**
- `PRODUCTION`: `green-700` / `green-50`
- `SANDBOX`: `yellow-600` / `yellow-50`

### Iconografía

- SCRAPE: `Search`
- ANALYZE: `Brain` / `Sparkles`
- PUBLISH: `Send` / `Upload`
- PURCHASE: `ShoppingCart`
- FULFILLMENT: `Package` / `Truck`
- CUSTOMER SERVICE: `MessageCircle` / `HeadphonesIcon`

---

## Respetando la Regla de Oro

### ✅ No Romper Funcionalidad Existente

1. **Cambios Aditivos:**
   - Solo agregar nuevos componentes y endpoints
   - No modificar lógica existente de productos/ventas
   - Endpoint nuevo, no modificar existentes

2. **Compatibilidad:**
   - Si falla el cálculo de estado, mostrar "Estado no disponible" en lugar de error
   - Fallback a información básica si no hay datos suficientes

3. **Performance:**
   - Caché de estados calculados (evitar recálculos innecesarios)
   - Lazy loading de timeline (cargar solo al expandir)

4. **Testing:**
   - Tests para casos edge (productos sin ventas, sin listings, etc.)
   - Validar que no afecta endpoints existentes

---

## Ejemplo Visual Final

```
┌──────────────────────────────────────────────────────────────────────┐
│ Estado del Workflow - Producto #123                                  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  🌍 PRODUCTION                    🔧 Modo: Automático                │
│                                                                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                │
│  │ ✓ SCRAPE│──│ ✓ ANALYZE│──│ ● PUBLISH│──│ ○ PURCHASE│             │
│  │ AUTO ✅ │  │ AUTO ✅ │  │ AUTO 🔄 │  │ AUTO ⏸️ │                │
│  │ 2h ago  │  │ 1h ago  │  │ En curso│  │ Esperando│                │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘                │
│                        ↑                                              │
│                   ETAPA ACTUAL                                        │
│                                                                       │
│  ┌─────────┐  ┌─────────┐                                           │
│  │ ○ FULFILL│──│ ○ SERVICE│                                          │
│  │ AUTO ⏸️ │  │ AUTO ⏸️ │                                          │
│  │ Pendiente│  │ Pendiente│                                          │
│  └─────────┘  └─────────┘                                           │
│                                                                       │
│  ────────────────────────────────────────────────────────────────    │
│  Timeline:                                                           │
│  • Hace 2h - Producto encontrado en AliExpress (SCRAPE)            │
│  • Hace 1h - Análisis de rentabilidad completado (ANALYZE)         │
│  • Ahora - Publicando en eBay... (PUBLISH)                          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Métricas de Éxito

1. ✅ Usuarios pueden ver claramente en qué etapa está cada producto
2. ✅ Usuarios pueden ver si cada etapa es manual o automática
3. ✅ Usuarios pueden ver el ambiente (sandbox/production)
4. ✅ Timeline clara de eventos
5. ✅ No se rompe funcionalidad existente
6. ✅ Performance aceptable (<500ms para calcular estado)

---

## Siguiente Paso

¿Procedo con la implementación comenzando por la Fase 1 (Backend)?


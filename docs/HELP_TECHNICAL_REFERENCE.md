# 🔧 Referencia Técnica para Desarrolladores - IvanReseller

**Versión:** 2.0  
**Última actualización:** 2025-01-28

---

## 📑 Índice

1. [Estructura del Job Scheduler (BullMQ)](#1-estructura-del-job-scheduler-bullmq)
2. [Validación y Lógica de IA](#2-validación-y-lógica-de-ia)
3. [Base de Datos - Campos y Relaciones](#3-base-de-datos---campos-y-relaciones)
4. [Flujos de Automatización](#4-flujos-de-automatización)

---

## 1. Estructura del Job Scheduler (BullMQ)

### 1.1. Arquitectura General

**Tecnología:** BullMQ + Redis  
**Ubicación:** `backend/src/services/scheduled-tasks.service.ts`

#### 📊 Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                    REDIS (BullMQ)                           │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │    QUEUES        │  │    WORKERS       │               │
│  │                  │  │                  │               │
│  │ - financial-     │  │ - financial-     │               │
│  │   alerts         │  │   alerts         │               │
│  │ - commission-    │  │ - commission-    │               │
│  │   processing     │  │   processing     │               │
│  │ - ali-auth-      │  │ - ali-auth-      │               │
│  │   health         │  │   health         │               │
│  │ - fx-rates-      │  │ - fx-rates-      │               │
│  │   refresh        │  │   refresh        │               │
│  │ - listing-       │  │ - listing-       │               │
│  │   lifetime-      │  │   lifetime-      │               │
│  │   optimizer      │  │   optimizer      │               │
│  │ - product-       │  │ - product-       │               │
│  │   unpublish      │  │   unpublish      │               │
│  └──────────────────┘  └──────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### 1.2. Colas Implementadas

#### 📋 Tabla de Colas

| Cola | Frecuencia | Propósito | Concurrencia |
|------|------------|-----------|--------------|
| `financial-alerts` | Diario (6:00 AM) | Alertas financieras (capital bajo, ganancia negativa, etc.) | 1 |
| `commission-processing` | Semanal (Viernes 00:00) | Procesar y pagar comisiones acumuladas | 1 |
| `ali-auth-health` | Cada 6 horas | Verificar salud de autenticación AliExpress | 1 |
| `fx-rates-refresh` | Cada hora | Actualizar tasas de cambio de moneda | 1 |
| `listing-lifetime-optimizer` | Diario (3:00 AM) | Optimizar tiempo de publicación de productos | 1 |
| `product-unpublish` | Cada 6 horas | Despublicar productos automáticamente según criterios | 2 |

#### 📋 Patrones de Cron

```typescript
// Patrones utilizados:
'0 6 * * *'      // 6:00 AM todos los días
'0 0 * * FRI'    // Viernes a las 00:00
'0 */6 * * *'    // Cada 6 horas
'0 * * * *'      // Cada hora
'0 3 * * *'      // 3:00 AM todos los días
```

### 1.3. Workers y Procesamiento

#### 🔄 Flujo de Procesamiento

```typescript
// Estructura típica de un Worker
const worker = new Worker(
  'queue-name',
  async (job) => {
    logger.info('Processing job', { jobId: job.id });
    return await processJob(job.data);
  },
  {
    connection: redisConnection,
    concurrency: 1  // Número de jobs procesados simultáneamente
  }
);

// Event listeners
worker.on('completed', (job) => {
  logger.info('Job completed', { jobId: job.id });
});

worker.on('failed', (job, err) => {
  logger.error('Job failed', { jobId: job?.id, error: err.message });
});
```

#### ⚠️ Consideraciones de Concurrencia

| Cola | Concurrencia | Razón |
|------|--------------|-------|
| `financial-alerts` | 1 | Evitar procesamiento duplicado de alertas |
| `commission-processing` | 1 | Transacciones financieras deben ser secuenciales |
| `product-unpublish` | 2 | Balance entre velocidad y carga en BD |

### 1.4. Gestión de Tareas Programadas

#### 📋 Ejemplo: Agregar Nueva Tarea

```typescript
// 1. Crear cola
private myNewQueue: Queue | null = null;

private initializeQueues(): void {
  this.myNewQueue = new Queue('my-new-queue', {
    connection: this.bullMQRedis as any
  });
}

// 2. Crear worker
private myNewWorker: Worker | null = null;

private initializeWorkers(): void {
  this.myNewWorker = new Worker(
    'my-new-queue',
    async (job) => {
      return await this.processMyNewTask(job.data);
    },
    {
      connection: this.bullMQRedis as any,
      concurrency: 1
    }
  );
}

// 3. Programar tarea
private scheduleTasks(): void {
  this.myNewQueue?.add(
    'my-new-task',
    {},
    {
      repeat: {
        pattern: '0 */12 * * *'  // Cada 12 horas
      },
      removeOnComplete: 10,
      removeOnFail: 5
    }
  );
}

// 4. Implementar procesamiento
private async processMyNewTask(data: any): Promise<any> {
  logger.info('Processing my new task');
  // Lógica aquí
  return { success: true };
}
```

### 1.5. Monitoreo y Logging

**Todos los jobs incluyen:**
- ✅ Logging de inicio (`jobId`)
- ✅ Logging de completado (`jobId`, `duration`)
- ✅ Logging de errores (`jobId`, `error`, `stack`)
- ✅ Retry automático (configurable por cola)

**Retención:**
- `removeOnComplete: 10` - Mantiene últimos 10 jobs completados
- `removeOnFail: 5` - Mantiene últimos 5 jobs fallidos

---

## 2. Validación y Lógica de IA

### 2.1. Validación de Imágenes

**Ubicación:** `backend/src/services/image-validation.service.ts`

#### 📋 Criterios de Validación

| Criterio | Valor | Configurable |
|----------|-------|--------------|
| **Resolución mínima** | 500x500px | ✅ `MIN_IMAGE_WIDTH`, `MIN_IMAGE_HEIGHT` |
| **Resolución máxima** | 5000x5000px | ✅ `MAX_IMAGE_WIDTH`, `MAX_IMAGE_HEIGHT` |
| **Tamaño máximo** | 10MB | ✅ `MAX_IMAGE_SIZE` |
| **Formatos permitidos** | JPEG, PNG, WebP | ✅ `ALLOWED_IMAGE_FORMATS` |
| **Ratio de aspecto** | 0.5 - 2.0 | ✅ `MIN_IMAGE_ASPECT_RATIO`, `MAX_IMAGE_ASPECT_RATIO` |

#### 🔄 Flujo de Validación

```typescript
async validateImage(imageUrl: string): Promise<ImageValidationResult> {
  // 1. Fetch image buffer
  const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  const imageBuffer = Buffer.from(response.data);
  
  // 2. Get metadata using sharp
  const metadata = await sharp(imageBuffer).metadata();
  
  // 3. Validate resolution
  if (metadata.width < MIN_WIDTH || metadata.height < MIN_HEIGHT) {
    errors.push('Resolución mínima requerida...');
  }
  
  // 4. Validate format
  if (!ALLOWED_FORMATS.includes(metadata.format)) {
    errors.push('Formato no permitido...');
  }
  
  // 5. Validate size
  if (imageBuffer.length > MAX_SIZE) {
    errors.push('Tamaño máximo excedido...');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    details: { width, height, format, sizeKB }
  };
}
```

### 2.2. Validación de Oportunidades de Negocio

**Ubicación:** `backend/src/services/ai-opportunity.service.ts`

#### 📊 Criterios de Validación

| Criterio | Lógica | Threshold |
|----------|--------|-----------|
| **Margen mínimo** | `(precioVenta - costoTotal) / costoTotal` | 30% (configurable) |
| **ROI mínimo** | `(ganancia / costoTotal) * 100` | 40% (configurable) |
| **Precio sugerido** | `costoTotal * 2.0` (mínimo) | 2.0x costo |
| **Deduplicación** | Similitud de título + precio | 85% similitud |

#### 🔄 Algoritmo de Deduplicación

```typescript
private calculateSimilarity(a: OpportunityItem, b: OpportunityItem): number {
  // Título: 40% peso
  const titleSimilarity = this.textSimilarity(a.title, b.title) * 0.4;
  
  // URL: 30% peso
  const urlSimilarity = this.urlSimilarity(a.aliexpressUrl, b.aliexpressUrl) * 0.3;
  
  // Precio: 20% peso
  const priceSimilarity = this.priceSimilarity(a.costUsd, b.costUsd) * 0.2;
  
  // Categoría: 10% peso
  const categorySimilarity = (a.category === b.category) ? 0.1 : 0;
  
  return titleSimilarity + urlSimilarity + priceSimilarity + categorySimilarity;
}

// Si similitud >= 0.85 (85%) → Considerar duplicado
```

### 2.3. Validación de Viabilidad con Google Trends

**Ubicación:** `backend/src/services/google-trends.service.ts`  
**Integración:** `backend/src/services/ai-opportunity.service.ts`

#### 📊 Métricas de Viabilidad

```typescript
interface TrendData {
  date: string;
  value: number;  // Search interest score (0-100)
}

// Análisis de tendencia
const lastMonthAvg = lastMonthData.reduce((sum, d) => sum + d.value, 0) / lastMonthData.length;
const prevMonthAvg = prevMonthData.reduce((sum, d) => sum + d.value, 0) / prevMonthData.length;

// Clasificación
if (lastMonthAvg > prevMonthAvg * 1.1) {
  trend = 'rising';      // Tendencia en aumento
  confidence = 80;
} else if (lastMonthAvg < prevMonthAvg * 0.9) {
  trend = 'declining';   // Tendencia en declive
  confidence = 40;
} else {
  trend = 'stable';      // Tendencia estable
  confidence = 60;
}
```

#### ⚠️ Fallback Automático

Si Google Trends no está disponible:
- ✅ Usa análisis de datos internos (ventas, productos similares)
- ✅ Asume viabilidad moderada (confidence: 50)
- ✅ No bloquea la creación de productos

---

## 3. Base de Datos - Campos y Relaciones

### 3.1. Modelos Principales

#### 📋 Tabla: `Product`

**Campos Relevantes:**

| Campo | Tipo | Descripción | Validación |
|-------|------|-------------|------------|
| `id` | Int (PK) | ID único del producto | Auto-increment |
| `userId` | Int (FK) | Usuario propietario | Required |
| `aliexpressUrl` | String | URL del producto en AliExpress | Required, URL válida |
| `title` | String | Título del producto | Required, max 255 chars |
| `description` | String? | Descripción del producto | Optional |
| `aliexpressPrice` | Decimal(18,2) | Precio en AliExpress | Required, > 0 |
| `suggestedPrice` | Decimal(18,2) | Precio sugerido de venta | Required, > aliexpressPrice |
| `finalPrice` | Decimal(18,2)? | Precio final (opcional) | Optional |
| `currency` | String | Moneda (USD, CLP, EUR, etc.) | Default: "USD" |
| `images` | String | JSON array de URLs de imágenes | JSON válido, min 1 imagen |
| `shippingCost` | Decimal(18,2)? | Costo de envío | Optional |
| `importTax` | Decimal(18,2)? | Impuestos de importación | Optional |
| `totalCost` | Decimal(18,2)? | Costo total (precio + envío + impuestos) | Calculado |
| `targetCountry` | String? | País destino | Optional (CL, US, ES, etc.) |
| `status` | String | Estado del producto | Enum: PENDING, APPROVED, REJECTED, PUBLISHED, INACTIVE |
| `isPublished` | Boolean | Si está publicado en marketplace | Default: false |
| `publishedAt` | DateTime? | Fecha de publicación | Optional |
| `createdAt` | DateTime | Fecha de creación | Auto |
| `updatedAt` | DateTime | Fecha de actualización | Auto |

**Relaciones:**
```typescript
Product {
  user → User (many-to-one)
  sales → Sale[] (one-to-many)
  listings → Listing[] (one-to-many)
}
```

#### 📋 Tabla: `Sale`

**Campos Relevantes:**

| Campo | Tipo | Descripción | Validación |
|-------|------|-------------|------------|
| `id` | Int (PK) | ID único de la venta | Auto-increment |
| `userId` | Int (FK) | Usuario vendedor | Required |
| `productId` | Int (FK) | Producto vendido | Required |
| `orderId` | String (UNIQUE) | ID de orden del marketplace | Required, unique |
| `marketplace` | String | Marketplace (eBay, Amazon, MercadoLibre) | Required |
| `salePrice` | Decimal(18,2) | Precio de venta | Required, > 0 |
| `aliexpressCost` | Decimal(18,2) | Costo en AliExpress | Required |
| `marketplaceFee` | Decimal(18,2) | Fee del marketplace | Calculado |
| `grossProfit` | Decimal(18,2) | Ganancia bruta | Calculado: salePrice - aliexpressCost - marketplaceFee |
| `commissionAmount` | Decimal(18,2) | Comisión del admin (20% de grossProfit) | Calculado |
| `netProfit` | Decimal(18,2) | Ganancia neta | Calculado: grossProfit - commissionAmount |
| `status` | String | Estado de la venta | Enum: PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED |
| `trackingNumber` | String? | Número de tracking | Optional |
| `createdAt` | DateTime | Fecha de creación | Auto |
| `updatedAt` | DateTime | Fecha de actualización | Auto |

**Relaciones:**
```typescript
Sale {
  user → User (many-to-one)
  product → Product (many-to-one)
  commission → Commission? (one-to-one, optional)
}
```

#### 📋 Tabla: `PurchaseLog`

**Campos Relevantes:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Int (PK) | ID único |
| `orderId` | String | ID de orden relacionada |
| `productId` | Int (FK) | Producto comprado |
| `userId` | Int (FK) | Usuario que realizó la compra |
| `status` | String | PENDING, PROCESSING, SUCCESS, FAILED |
| `attempts` | Int | Número de intentos |
| `error` | String? | Mensaje de error si falló |
| `purchaseDate` | DateTime? | Fecha de compra exitosa |
| `createdAt` | DateTime | Fecha de creación |
| `updatedAt` | DateTime | Fecha de actualización |

**Uso:** Tracking de compras automáticas post-venta.

### 3.2. Relaciones Principales

#### 📊 Diagrama de Relaciones

```
User
  ├── Product[] (one-to-many)
  │     ├── Sale[] (one-to-many)
  │     └── Listing[] (one-to-many)
  ├── Sale[] (one-to-many)
  │     └── Commission? (one-to-one, optional)
  ├── ApiCredential[] (one-to-many)
  └── UserWorkflowConfig (one-to-one)

Commission
  ├── Sale (many-to-one)
  └── User (many-to-one, admin)

PurchaseLog
  ├── Sale (many-to-one, via orderId)
  └── User (many-to-one)
```

### 3.3. Campos Calculados

#### 💰 Cálculo de Gross Profit

```typescript
const grossProfit = salePrice - aliexpressCost - marketplaceFee;
```

#### 💰 Cálculo de Commission Amount

```typescript
const commissionAmount = grossProfit * 0.20;  // 20% configurable
```

#### 💰 Cálculo de Net Profit

```typescript
const netProfit = grossProfit - commissionAmount;
```

#### 💰 Cálculo de Total Cost

```typescript
const totalCost = aliexpressPrice + shippingCost + importTax;
```

---

## 4. Flujos de Automatización

### 4.1. Flujo Post-Venta Automático

**Ubicación:** `backend/src/services/automation.service.ts`

#### 📋 Secuencia de Ejecución

```typescript
async executeAutomatedFlow(order: AutomatedOrder): Promise<Result> {
  // 1. Validar capital de trabajo
  const availableCapital = await calculateAvailableCapital(userId);
  if (availableCapital < requiredCapital) {
    throw new Error('Capital insuficiente');
  }
  
  // 2. Validar saldo PayPal (si está disponible)
  const paypalBalance = await paypalService.checkPayPalBalance();
  if (paypalBalance && paypalBalance.available < requiredCapital) {
    throw new Error('Saldo PayPal insuficiente');
  }
  
  // 3. Crear PurchaseLog
  const purchaseLog = await createPurchaseLog({
    orderId,
    productId,
    userId,
    status: 'PENDING'
  });
  
  // 4. Ejecutar compra automática (Puppeteer)
  try {
    const result = await aliExpressPurchaseService.executePurchase({
      productUrl,
      quantity,
      shippingAddress
    });
    
    // 5. Actualizar PurchaseLog
    await updatePurchaseLog(purchaseLog.id, {
      status: 'SUCCESS',
      purchaseDate: new Date()
    });
    
  } catch (error) {
    // 6. Manejar error
    await updatePurchaseLog(purchaseLog.id, {
      status: 'FAILED',
      attempts: purchaseLog.attempts + 1,
      error: error.message
    });
    
    // 7. Enviar alerta
    await sendPuppeteerFailureAlert(userId, { error: error.message });
  }
}
```

### 4.2. Flujo de Despublicación Automática

**Ubicación:** `backend/src/services/scheduled-tasks.service.ts`

#### 📋 Criterios de Despublicación

```typescript
async processListingLifetimeOptimization(): Promise<Result> {
  const products = await getPublishedProducts();
  
  for (const product of products) {
    // Criterio 1: Capital insuficiente
    if (product.totalCost > availableCapital * 0.8) {
      await unpublishProduct(product.id, 'INSUFFICIENT_CAPITAL');
      continue;
    }
    
    // Criterio 2: Baja conversión
    if (product.conversionRate < 0.005) {  // 0.5%
      await unpublishProduct(product.id, 'LOW_CONVERSION_RATE');
      continue;
    }
    
    // Criterio 3: Sin ventas recientes
    const daysSinceLastSale = calculateDaysSinceLastSale(product);
    if (daysSinceLastSale > 60) {
      await unpublishProduct(product.id, 'NO_RECENT_SALES');
      continue;
    }
  }
}
```

### 4.3. Validación de Capital de Trabajo

**Ubicación:** `backend/src/services/workflow-config.service.ts`

#### 📋 Cálculo de Capital Disponible

```typescript
async calculateAvailableCapital(userId: number): Promise<number> {
  // 1. Obtener capital total configurado
  const userConfig = await getUserConfig(userId);
  const totalCapital = userConfig.workingCapital || 500;
  
  // 2. Calcular capital comprometido (ventas pendientes)
  const pendingSales = await getPendingSales(userId);
  const committedCapital = pendingSales.reduce((sum, sale) => {
    return sum + sale.aliexpressCost;
  }, 0);
  
  // 3. Calcular capital disponible
  const availableCapital = totalCapital - committedCapital;
  
  return availableCapital;
}
```

#### ⚠️ Buffer de 20%

```typescript
const requiredCapitalWithBuffer = purchaseCost * 1.20;  // 20% buffer
if (availableCapital < requiredCapitalWithBuffer) {
  throw new Error('Capital insuficiente con buffer');
}
```

---

## 📝 Notas para Desarrolladores

### ⚠️ Mejores Prácticas

| Práctica | Razón |
|----------|-------|
| **Usar transacciones para operaciones financieras** | Garantiza consistencia de datos |
| **Validar siempre antes de procesar** | Evita errores en producción |
| **Logging detallado** | Facilita debugging y auditoría |
| **Manejo de errores robusto** | Sistema debe continuar funcionando ante fallos |
| **Retry automático en jobs críticos** | Aumenta confiabilidad |

### 🔄 Patrones de Diseño Utilizados

- **Service Pattern:** Cada funcionalidad tiene su servicio dedicado
- **Repository Pattern:** Prisma como capa de acceso a datos
- **Queue Pattern:** BullMQ para tareas asíncronas
- **Circuit Breaker:** Para APIs externas (si está implementado)

---

**Última actualización:** 2025-01-28  
**Versión del documento:** 2.0


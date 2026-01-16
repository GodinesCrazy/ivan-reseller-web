# 📘 RUNBOOK: Operación Completa Dropshipping en Ivan_Reseller_Web

**Versión:** 1.0  
**Fecha:** 2025-01-28  
**Proyecto:** Ivan_Reseller_Web

---

## 📋 Índice

1. [Búsqueda de Oportunidades](#a-búsqueda-de-oportunidades)
2. [Generación de Listing/Publicación](#b-generación-de-listingpublicación)
3. [Simulación/Ejemplo de Venta](#c-simulacionejemplo-de-venta)
4. [Ciclo Automatizado Compra/Envío](#d-ciclo-automatizado-compraenvío)
5. [Manejo de Incidencias](#e-manejo-de-incidencias)
6. [Endpoints y Estructura de Datos](#f-endpoints-y-estructura-de-datos)

---

## A) Búsqueda de Oportunidades

### Descripción

El sistema busca productos en AliExpress que tengan potencial de venta en marketplaces como eBay, Amazon o MercadoLibre, calculando márgenes de ganancia, competencia y demanda.

### Flujo Completo

#### 1. Iniciar Búsqueda

**Pantalla UI:** `Opportunities` (`/opportunities`)

**Acción del usuario:**
1. Ingresar término de búsqueda (ej: "wireless earbuds")
2. Seleccionar marketplaces objetivo (eBay, Amazon, MercadoLibre)
3. Configurar filtros opcionales:
   - Margen mínimo (por defecto: 10%)
   - Región (US, UK, MX, etc.)
   - Cantidad máxima de resultados (1-10)

**Endpoint interno:**
```
POST /api/opportunities/search
```

**Payload:**
```json
{
  "query": "wireless earbuds",
  "maxItems": 10,
  "marketplaces": ["ebay", "amazon"],
  "region": "us",
  "environment": "production"
}
```

#### 2. Proceso Interno de Búsqueda

**Servicio:** `OpportunityFinderService` (`backend/src/services/opportunity-finder.service.ts`)

**Pasos:**

1. **Verificar credenciales de AliExpress Affiliate API:**
   - Si están configuradas → Usar API oficial (más rápido y confiable)
   - Si no están → Usar scraping nativo (Puppeteer) como fallback

2. **Buscar productos en AliExpress:**
   - **Método 1 (Prioridad):** AliExpress Affiliate API
     - Endpoint: `https://gw.api.taobao.com/router/rest`
     - Método: `aliexpress.affiliate.product.search`
     - Parámetros:
       - `keywords`: Término de búsqueda
       - `trackingId`: `ivanreseller` (configurado)
       - `pageSize`: 10-50 productos
   - **Método 2 (Fallback):** Scraping nativo con Puppeteer
     - Navega a AliExpress
     - Extrae productos de la página de resultados

3. **Obtener detalles de cada producto:**
   - Precio (USD)
   - Imágenes
   - Título
   - Rating y número de ventas
   - Costo de envío
   - SKUs disponibles

4. **Analizar competencia en marketplaces:**
   - Para cada marketplace configurado (eBay, Amazon, MercadoLibre):
     - Buscar productos similares
     - Obtener precios de competidores
     - Calcular nivel de competencia (bajo/medio/alto)

5. **Calcular rentabilidad:**
   - **Costo total:**
     ```
     Costo Total = Precio Producto + Envío + Impuestos de Importación
     ```
   - **Precio sugerido:**
     ```
     Precio Sugerido = Costo Total × (1 + Margen Mínimo + Margen Competitivo)
     ```
   - **Ganancia estimada:**
     ```
     Ganancia = Precio Sugerido - Costo Total - Fees Marketplace
     ```
   - **ROI:**
     ```
     ROI = (Ganancia / Costo Total) × 100
     ```

6. **Validar demanda con Google Trends (opcional):**
   - Si SerpAPI está configurado:
     - Consultar tendencias de búsqueda
     - Validar si la demanda está creciendo, estable o declinando
     - Calcular tiempo estimado hasta primera venta

7. **Filtrar oportunidades:**
   - Margen mínimo: 10% (configurable)
   - Volumen de búsqueda mínimo: 100 búsquedas/mes
   - Confianza de tendencia: 30% mínimo
   - Tiempo hasta primera venta: Máximo 60 días

8. **Deduplicar oportunidades:**
   - Comparar títulos, URLs y precios
   - Eliminar duplicados con similitud > 85%

#### 3. Resultados

**Estructura de datos retornada:**

```typescript
interface OpportunityItem {
  productId?: string;
  title: string;
  sourceMarketplace: 'aliexpress';
  aliexpressUrl: string;
  image?: string;
  images?: string[];
  costUsd: number;
  costAmount: number;
  costCurrency: string;
  baseCurrency: string;
  suggestedPriceUsd: number;
  suggestedPriceAmount: number;
  suggestedPriceCurrency: string;
  profitMargin: number; // 0-1 (ej: 0.15 = 15%)
  roiPercentage: number; // 0-100
  competitionLevel: 'low' | 'medium' | 'high' | 'unknown';
  marketDemand: string;
  confidenceScore: number; // 0-100
  targetMarketplaces: string[];
  feesConsidered: Record<string, number>;
  generatedAt: string;
  shippingCost?: number;
  importTax?: number;
  totalCost?: number;
  targetCountry?: string;
  trendData?: {
    trend: 'rising' | 'stable' | 'declining';
    searchVolume: number;
    validation: {
      viable: boolean;
      confidence: number;
      reason: string;
    };
  };
  estimatedTimeToFirstSale?: number; // días
  breakEvenTime?: number; // días
}
```

**Ejemplo de respuesta:**

```json
{
  "opportunities": [
    {
      "productId": "1005001234567890",
      "title": "Wireless Bluetooth Earbuds Noise Cancelling",
      "aliexpressUrl": "https://www.aliexpress.com/item/1005001234567890.html",
      "image": "https://ae01.alicdn.com/kf/...",
      "images": ["https://ae01.alicdn.com/kf/...", "..."],
      "costUsd": 12.50,
      "costAmount": 12.50,
      "costCurrency": "USD",
      "baseCurrency": "USD",
      "suggestedPriceUsd": 29.99,
      "suggestedPriceAmount": 29.99,
      "suggestedPriceCurrency": "USD",
      "profitMargin": 0.58,
      "roiPercentage": 140,
      "competitionLevel": "medium",
      "marketDemand": "High demand, stable trend",
      "confidenceScore": 85,
      "targetMarketplaces": ["ebay", "amazon"],
      "feesConsidered": {
        "ebay": 2.50,
        "paypal": 0.90,
        "shipping": 0
      },
      "generatedAt": "2025-01-28T10:30:00Z",
      "shippingCost": 0,
      "importTax": 0,
      "totalCost": 12.50,
      "targetCountry": "US",
      "trendData": {
        "trend": "stable",
        "searchVolume": 5000,
        "validation": {
          "viable": true,
          "confidence": 75,
          "reason": "Stable demand with good search volume"
        }
      },
      "estimatedTimeToFirstSale": 15,
      "breakEvenTime": 30
    }
  ],
  "diagnostics": {
    "ebay": {
      "issues": [],
      "warnings": []
    },
    "amazon": {
      "issues": ["No encontramos credenciales activas de amazon para tu usuario."],
      "warnings": []
    }
  }
}
```

#### 4. Criterios de Selección

**Filtros aplicados automáticamente:**

- ✅ **Margen mínimo:** 10% (configurable vía `MIN_OPPORTUNITY_MARGIN`)
- ✅ **Volumen de búsqueda:** Mínimo 100 búsquedas/mes
- ✅ **Confianza de tendencia:** Mínimo 30%
- ✅ **Tiempo hasta primera venta:** Máximo 60 días
- ✅ **Tiempo hasta break-even:** Máximo 90 días

**Ordenamiento:**

1. Mayor ROI
2. Mayor confianza
3. Menor competencia
4. Mayor demanda

---

## B) Generación de Listing/Publicación

### Descripción

Una vez seleccionada una oportunidad, el sistema genera automáticamente título, descripción, precio y publica el producto en el marketplace objetivo.

### Flujo Completo

#### 1. Seleccionar Oportunidad

**Pantalla UI:** `OpportunityDetail` (`/opportunities/:id`)

**Acción del usuario:**
1. Revisar detalles de la oportunidad
2. Seleccionar marketplace objetivo (eBay, Amazon, MercadoLibre)
3. Hacer clic en "Generate Listing" o "Publish"

**Endpoint interno:**
```
POST /api/opportunities/:id/generate-listing
```

**Payload:**
```json
{
  "marketplace": "ebay",
  "opportunityId": "opp_123",
  "customizations": {
    "title": "Custom title (opcional)",
    "description": "Custom description (opcional)",
    "price": 29.99
  }
}
```

#### 2. Generación de Contenido

**Servicio:** `AIOpportunityEngine` (`backend/src/services/ai-opportunity.service.ts`)

**Pasos:**

1. **Generar título optimizado:**
   - **Input:** Título original de AliExpress + keywords del marketplace
   - **Modelo AI:** Groq (o OpenAI como fallback)
   - **Prompt:**
     ```
     Genera un título optimizado para [marketplace] que:
     - Sea atractivo y descriptivo
     - Incluya keywords relevantes
     - Tenga máximo 80 caracteres (eBay) o 200 (Amazon)
     - Sea SEO-friendly
     
     Título original: [título de AliExpress]
     Keywords: [keywords extraídos]
     ```
   - **Output:** Título optimizado

2. **Generar descripción:**
   - **Input:** Descripción original + imágenes + especificaciones
   - **Modelo AI:** Groq
   - **Prompt:**
     ```
     Genera una descripción de producto para [marketplace] que:
     - Sea profesional y atractiva
     - Incluya características principales
     - Use formato HTML (si aplica)
     - Sea optimizada para SEO
     - Cumpla con políticas del marketplace
     ```
   - **Output:** Descripción HTML/texto

3. **Calcular precio final:**
   - **Fórmula:**
     ```
     Precio Base = Costo Total × (1 + Margen Mínimo)
     Precio Competitivo = Precio de Competidores × 0.95 (5% más barato)
     Precio Final = min(Precio Base, Precio Competitivo)
     ```
   - **Ajustes:**
     - Si competencia es alta → Reducir 5-10%
     - Si competencia es baja → Aumentar 5-10%
     - Si demanda es alta → Aumentar 5%

4. **Generar link de afiliado:**
   - **Servicio:** `AliExpressAffiliateAPIService`
   - **Método:** `generatePromotionLink()`
   - **Parámetros:**
     - `productId`: ID del producto en AliExpress
     - `trackingId`: `ivanreseller` (configurado)
     - `country`: País destino
   - **Output:** URL de afiliado con tracking ID

**Ejemplo de link generado:**
```
https://www.aliexpress.com/item/1005001234567890.html?aff_platform=promotion&sk=abc123&aff_trace_key=ivanreseller&terminal_id=xyz789
```

#### 3. Publicación en Marketplace

**Servicio:** `MarketplaceService` + `EbayService` / `AmazonService` / `MercadoLibreService`

**Para eBay:**

1. **Preparar datos del listing:**
   ```typescript
   {
     title: "Wireless Bluetooth Earbuds Noise Cancelling - Premium Quality",
     description: "<p>High-quality wireless earbuds...</p>",
     price: 29.99,
     currency: "USD",
     quantity: 1,
     condition: "New",
     categoryId: "11233", // Electronics > Audio
     images: ["https://ae01.alicdn.com/kf/..."],
     shipping: {
       service: "StandardShipping",
       cost: 0, // Free shipping
       locations: ["US"]
     },
     returnPolicy: {
       returnsAccepted: true,
       returnsWithin: "30 Days",
       refundMethod: "MoneyBack"
     }
   }
   ```

2. **Crear listing:**
   - **Endpoint eBay:** `POST /api/ebay/listings`
   - **Método interno:** `EbayService.createListing()`
   - **API eBay:** `Trading API - AddItem`

3. **Obtener Item ID:**
   - eBay retorna `ItemID` único
   - Guardar en base de datos con estado `ACTIVE`

**Para Amazon:**

1. **Preparar datos del listing:**
   - Similar a eBay pero con formato de Amazon SP-API
   - Requiere UPC/EAN si es producto nuevo

2. **Crear listing:**
   - **Endpoint Amazon:** `POST /api/amazon/listings`
   - **Método interno:** `AmazonService.createListing()`
   - **API Amazon:** `SP-API - Listings API`

**Para MercadoLibre:**

1. **Preparar datos del listing:**
   - Similar pero adaptado a formato de MercadoLibre

2. **Crear listing:**
   - **Endpoint MercadoLibre:** `POST /api/mercadolibre/listings`
   - **Método interno:** `MercadoLibreService.createListing()`
   - **API MercadoLibre:** `MercadoLibre API - POST /items`

#### 4. Estructura de Datos del Listing

**Modelo en base de datos:**

```typescript
interface Listing {
  id: string;
  userId: number;
  opportunityId: string;
  marketplace: 'ebay' | 'amazon' | 'mercadolibre';
  marketplaceItemId: string; // Item ID del marketplace
  title: string;
  description: string;
  price: number;
  currency: string;
  quantity: number;
  images: string[];
  status: 'DRAFT' | 'ACTIVE' | 'SOLD' | 'ENDED' | 'CANCELLED';
  aliexpressUrl: string;
  aliexpressProductId: string;
  affiliateLink: string; // Link con tracking ID
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}
```

---

## C) Simulación/Ejemplo de Venta

### Descripción

Cuando un cliente compra el producto en el marketplace, el sistema recibe una notificación y procesa la orden.

### Flujo Completo

#### 1. Notificación de Venta

**Webhook recibido:**

**eBay:**
```
POST /api/webhooks/ebay
```

**Payload:**
```json
{
  "eventType": "OrderCreated",
  "orderId": "1234567890",
  "itemId": "ebay_item_123",
  "buyer": {
    "name": "John Doe",
    "email": "john@example.com",
    "address": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001",
      "country": "US"
    },
    "phone": "+1-555-123-4567"
  },
  "amount": {
    "total": 29.99,
    "currency": "USD"
  },
  "quantity": 1,
  "timestamp": "2025-01-28T14:30:00Z"
}
```

**Amazon:**
```
POST /api/webhooks/amazon
```

**MercadoLibre:**
```
POST /api/webhooks/mercadolibre
```

#### 2. Procesamiento de la Orden

**Servicio:** `AutomatedBusinessService` (`backend/src/services/automated-business.service.ts`)

**Pasos:**

1. **Validar orden:**
   - Verificar que el Item ID existe en nuestra base de datos
   - Verificar que el listing está activo
   - Verificar que hay stock disponible

2. **Crear transacción:**
   ```typescript
   {
     id: "txn_123",
     type: "sale",
     productId: "prod_123",
     productTitle: "Wireless Bluetooth Earbuds",
     marketplace: "ebay",
     buyerInfo: {
       name: "John Doe",
       address: "123 Main St, New York, NY 10001",
       email: "john@example.com",
       phone: "+1-555-123-4567"
     },
     amounts: {
       salePrice: 29.99,
       purchasePrice: 12.50,
       profit: 15.09, // 29.99 - 12.50 - 2.40 (fees)
       fees: 2.40
     },
     status: "pending",
     timestamps: {
       created: "2025-01-28T14:30:00Z"
     }
   }
   ```

3. **Actualizar estado del listing:**
   - Cambiar estado a `SOLD`
   - Reducir cantidad disponible

4. **Notificar al usuario:**
   - Enviar email/notificación push
   - Mostrar en dashboard: "Nueva venta recibida"

---

## D) Ciclo Automatizado Compra/Envío

### Descripción

Una vez recibida la orden, el sistema crea automáticamente la orden en AliExpress con los datos del comprador.

### Flujo Completo

#### 1. Crear Orden en AliExpress

**Servicio:** `AliExpressAutoPurchaseService` (`backend/src/services/aliexpress-auto-purchase.service.ts`)

**Prioridad:** Intentar usar Dropshipping API primero, luego Puppeteer como fallback

**Método 1: Dropshipping API (Recomendado)**

1. **Obtener credenciales:**
   - `ALIEXPRESS_DROPSHIPPING_APP_KEY`
   - `ALIEXPRESS_DROPSHIPPING_APP_SECRET`
   - `ALIEXPRESS_DROPSHIPPING_ACCESS_TOKEN` (vía OAuth)

2. **Crear orden:**
   - **Servicio:** `AliExpressDropshippingAPIService`
   - **Método:** `placeOrder()`
   - **Endpoint API:** `aliexpress.trade.order.create`
   - **Parámetros:**
     ```typescript
     {
       productId: "1005001234567890",
       skuId: "sku_123", // Opcional
       quantity: 1,
       shippingAddress: {
         fullName: "John Doe",
         addressLine1: "123 Main St",
         addressLine2: "Apt 4B",
         city: "New York",
         state: "NY",
         zipCode: "10001",
         country: "US",
         phoneNumber: "+1-555-123-4567",
         email: "john@example.com"
       },
       shippingMethodId: "standard", // Opcional
       buyerMessage: "Please ship quickly" // Opcional
     }
     ```

3. **Respuesta de AliExpress:**
   ```json
   {
     "orderId": "1234567890123456",
     "orderNumber": "AE1234567890",
     "totalAmount": 12.50,
     "currency": "USD",
     "status": "WAIT_BUYER_PAY",
     "estimatedDelivery": "2025-02-15",
     "paymentInfo": {
       "paymentUrl": "https://payment.aliexpress.com/...",
       "paymentDeadline": "2025-01-29T14:30:00Z"
     }
   }
   ```

4. **Procesar pago:**
   - Si el sistema tiene método de pago configurado:
     - Realizar pago automáticamente
     - Confirmar orden
   - Si no:
     - Notificar al usuario para pago manual
     - Guardar `paymentUrl` para acceso manual

**Método 2: Puppeteer (Fallback)**

Si Dropshipping API no está disponible:

1. **Iniciar navegador:**
   - Usar Puppeteer con Stealth Plugin
   - Navegar a AliExpress

2. **Login:**
   - Usar credenciales de AliExpress (si están configuradas)
   - Manejar 2FA si es necesario

3. **Agregar producto al carrito:**
   - Navegar a URL del producto
   - Seleccionar SKU (si aplica)
   - Agregar al carrito

4. **Completar checkout:**
   - Ir a carrito
   - Ingresar dirección de envío (datos del comprador)
   - Seleccionar método de envío
   - Completar pago (requiere método de pago guardado)

5. **Obtener número de orden:**
   - Extraer de página de confirmación
   - Guardar en base de datos

#### 2. Actualizar Estado de la Transacción

**Base de datos:**

```typescript
{
  id: "txn_123",
  status: "processing",
  supplierInfo: {
    name: "AliExpress Seller",
    url: "https://www.aliexpress.com/item/...",
    orderId: "1234567890123456",
    orderNumber: "AE1234567890"
  },
  timestamps: {
    purchaseCompleted: "2025-01-28T15:00:00Z"
  },
  automation: {
    wasAutomated: true,
    triggerRule: "auto-purchase-on-sale",
    actions: ["order_created", "payment_processed"]
  }
}
```

#### 3. Tracking y Logística

**Obtener información de tracking:**

1. **Consultar tracking:**
   - **Servicio:** `AliExpressDropshippingAPIService`
   - **Método:** `getTrackingInfo()`
   - **Endpoint API:** `aliexpress.trade.order.gettrackinginfo`
   - **Parámetros:**
     ```typescript
     {
       orderId: "1234567890123456"
     }
     ```

2. **Respuesta:**
   ```json
   {
     "orderId": "1234567890123456",
     "orderNumber": "AE1234567890",
     "status": "SHIPPED",
     "trackingNumber": "YT1234567890123456",
     "shippingCompany": "Yanwen",
     "events": [
       {
         "date": "2025-01-29T10:00:00Z",
         "status": "SHIPPED",
         "description": "Package has been shipped",
         "location": "Shenzhen, China"
       },
       {
         "date": "2025-01-30T14:00:00Z",
         "status": "IN_TRANSIT",
         "description": "Package is in transit",
         "location": "Shanghai, China"
       }
     ]
   }
   ```

3. **Actualizar transacción:**
   ```typescript
   {
     status: "fulfilled",
     trackingInfo: {
       trackingNumber: "YT1234567890123456",
       carrier: "Yanwen",
       status: "IN_TRANSIT",
       estimatedDelivery: "2025-02-15"
     },
     timestamps: {
       shipped: "2025-01-29T10:00:00Z"
     }
   }
   ```

4. **Notificar al comprador:**
   - Enviar email con número de tracking
   - Actualizar estado en marketplace (si aplica)

#### 4. Actualización de Estado

**Estados posibles:**

- `pending` → Orden recibida, esperando procesamiento
- `processing` → Orden creada en AliExpress, esperando pago
- `fulfilled` → Orden pagada y enviada, tracking disponible
- `completed` → Producto entregado al comprador
- `cancelled` → Orden cancelada
- `error` → Error en el proceso

**Actualizaciones automáticas:**

- **Cada 6 horas:** Consultar tracking de órdenes en tránsito
- **Cada 24 horas:** Verificar entregas completadas
- **Webhooks:** Actualizar inmediatamente cuando AliExpress notifica cambios

---

## E) Manejo de Incidencias

### 1. Sin Stock Disponible

**Escenario:** AliExpress indica que el producto no está disponible

**Proceso:**

1. **Detectar falta de stock:**
   - Al intentar crear orden, API retorna error: `PRODUCT_OUT_OF_STOCK`
   - O al consultar producto, `stock: 0`

2. **Acciones automáticas:**
   - Cancelar orden en marketplace (si es posible)
   - Reembolsar al comprador
   - Notificar al usuario: "Producto sin stock, orden cancelada"
   - Actualizar estado: `cancelled` con razón: `out_of_stock`

3. **Prevención:**
   - Verificar stock antes de publicar listing
   - Actualizar cantidad disponible en listing
   - Si stock = 0, pausar listing automáticamente

### 2. Retrasos en Envío

**Escenario:** El envío se retrasa más de lo esperado

**Proceso:**

1. **Detectar retraso:**
   - Comparar `estimatedDelivery` con fecha actual
   - Si fecha actual > `estimatedDelivery + 7 días` → Retraso detectado

2. **Acciones:**
   - Notificar al comprador: "Tu pedido está retrasado, disculpa las molestias"
   - Consultar tracking actualizado
   - Si retraso > 14 días, ofrecer reembolso parcial o completo

3. **Logs:**
   ```typescript
   {
     incidentType: "shipping_delay",
     orderId: "1234567890123456",
     originalDeliveryDate: "2025-02-15",
     currentStatus: "IN_TRANSIT",
     daysDelayed: 10,
     actions: ["customer_notified", "tracking_updated"]
   }
   ```

### 3. Refund/Devolución

**Escenario:** El comprador solicita reembolso

**Proceso:**

1. **Recibir solicitud:**
   - Marketplace notifica vía webhook: `REFUND_REQUESTED`
   - O usuario solicita manualmente desde dashboard

2. **Procesar reembolso:**
   - **Si producto no ha sido enviado:**
     - Cancelar orden en AliExpress (si es posible)
     - Reembolsar al comprador
     - Actualizar estado: `cancelled` con razón: `refund_requested`
   - **Si producto ya fue enviado:**
     - Procesar reembolso al comprador
     - Intentar cancelar envío (si es posible)
     - Si no es posible, el producto se entrega al comprador

3. **Actualizar transacción:**
   ```typescript
   {
     status: "cancelled",
     cancellationReason: "refund_requested",
     refundAmount: 29.99,
     refundProcessed: true,
     timestamps: {
       refunded: "2025-01-30T10:00:00Z"
     }
   }
   ```

### 4. Producto Defectuoso o Incorrecto

**Escenario:** El comprador recibe producto defectuoso o incorrecto

**Proceso:**

1. **Recibir reporte:**
   - Comprador reporta vía marketplace
   - O usuario reporta manualmente

2. **Acciones:**
   - Ofrecer reembolso completo o reemplazo
   - Si reemplazo:
     - Crear nueva orden en AliExpress
     - Enviar producto de reemplazo
   - Si reembolso:
     - Procesar reembolso completo
     - No requerir devolución del producto (costos de envío muy altos)

3. **Prevención:**
   - Verificar reviews del vendedor en AliExpress antes de publicar
   - Solo trabajar con vendedores con rating > 4.5
   - Verificar que el producto coincida con la descripción

---

## F) Endpoints y Estructura de Datos

### Endpoints Principales

#### Búsqueda de Oportunidades

```
POST /api/opportunities/search
GET /api/opportunities/:id
GET /api/opportunities
```

#### Generación de Listings

```
POST /api/opportunities/:id/generate-listing
POST /api/listings
GET /api/listings
GET /api/listings/:id
PATCH /api/listings/:id
DELETE /api/listings/:id
```

#### Órdenes y Transacciones

```
GET /api/transactions
GET /api/transactions/:id
POST /api/transactions/:id/cancel
POST /api/transactions/:id/refund
```

#### Tracking

```
GET /api/transactions/:id/tracking
POST /api/tracking/update
```

#### Webhooks

```
POST /api/webhooks/ebay
POST /api/webhooks/amazon
POST /api/webhooks/mercadolibre
```

### Estructura de Datos en Base de Datos

**Tabla: `opportunities`**
```sql
CREATE TABLE opportunities (
  id VARCHAR PRIMARY KEY,
  user_id INTEGER NOT NULL,
  query VARCHAR NOT NULL,
  product_id VARCHAR,
  title VARCHAR NOT NULL,
  aliexpress_url VARCHAR NOT NULL,
  cost_usd DECIMAL NOT NULL,
  suggested_price_usd DECIMAL NOT NULL,
  profit_margin DECIMAL NOT NULL,
  roi_percentage DECIMAL NOT NULL,
  confidence_score INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Tabla: `listings`**
```sql
CREATE TABLE listings (
  id VARCHAR PRIMARY KEY,
  user_id INTEGER NOT NULL,
  opportunity_id VARCHAR,
  marketplace VARCHAR NOT NULL,
  marketplace_item_id VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL NOT NULL,
  currency VARCHAR NOT NULL,
  quantity INTEGER NOT NULL,
  status VARCHAR NOT NULL,
  aliexpress_url VARCHAR NOT NULL,
  affiliate_link VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP
);
```

**Tabla: `transactions`**
```sql
CREATE TABLE transactions (
  id VARCHAR PRIMARY KEY,
  user_id INTEGER NOT NULL,
  listing_id VARCHAR NOT NULL,
  marketplace VARCHAR NOT NULL,
  marketplace_order_id VARCHAR NOT NULL,
  buyer_name VARCHAR NOT NULL,
  buyer_address TEXT NOT NULL,
  buyer_email VARCHAR NOT NULL,
  sale_price DECIMAL NOT NULL,
  purchase_price DECIMAL NOT NULL,
  profit DECIMAL NOT NULL,
  fees DECIMAL NOT NULL,
  status VARCHAR NOT NULL,
  aliexpress_order_id VARCHAR,
  tracking_number VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  shipped_at TIMESTAMP,
  delivered_at TIMESTAMP
);
```

### Logs Esperados

**Búsqueda de oportunidades:**
```
[INFO] Búsqueda de oportunidades iniciada { query: "wireless earbuds", userId: 123 }
[INFO] AliExpress Affiliate API credentials found - API will be attempted first
[INFO] Found 10 products from AliExpress
[INFO] Analyzing competition on eBay
[INFO] Calculated profitability for 8 opportunities
[INFO] Filtered to 5 viable opportunities
```

**Generación de listing:**
```
[INFO] Generating listing for opportunity opp_123
[INFO] Generated title: "Wireless Bluetooth Earbuds Noise Cancelling - Premium Quality"
[INFO] Generated description (length: 500 chars)
[INFO] Calculated final price: $29.99
[INFO] Generated affiliate link with tracking ID: ivanreseller
[INFO] Publishing to eBay...
[INFO] Listing created successfully: ItemID=1234567890
```

**Creación de orden:**
```
[INFO] New sale received: OrderID=1234567890, ItemID=ebay_item_123
[INFO] Creating order in AliExpress for product 1005001234567890
[INFO] Using Dropshipping API (preferred method)
[INFO] Order created in AliExpress: OrderID=1234567890123456
[INFO] Payment processed successfully
[INFO] Order status: WAIT_SELLER_SEND_GOODS
```

**Tracking:**
```
[INFO] Checking tracking for order 1234567890123456
[INFO] Tracking number received: YT1234567890123456
[INFO] Order status updated: SHIPPED
[INFO] Estimated delivery: 2025-02-15
```

### Validaciones y Puntos Críticos

**Validaciones antes de publicar:**
- ✅ Stock disponible en AliExpress
- ✅ Precio competitivo vs competencia
- ✅ Margen mínimo cumplido
- ✅ Credenciales de marketplace configuradas
- ✅ Imágenes válidas y accesibles

**Validaciones antes de crear orden:**
- ✅ Orden válida en marketplace
- ✅ Datos del comprador completos
- ✅ Credenciales de AliExpress Dropshipping configuradas
- ✅ Stock disponible en AliExpress
- ✅ Método de pago configurado (si es automático)

**Puntos críticos:**
- 🔴 **Sin credenciales de AliExpress Affiliate:** No se pueden buscar productos (usa scraping como fallback)
- 🔴 **Sin credenciales de AliExpress Dropshipping:** No se pueden crear órdenes automatizadas (requiere intervención manual)
- 🔴 **Sin OAuth de Dropshipping:** No se pueden crear órdenes (requiere completar OAuth)
- 🟡 **Sin credenciales de marketplace:** No se pueden publicar productos (requiere configurar eBay/Amazon/MercadoLibre)
- 🟡 **Sin método de pago:** No se pueden pagar órdenes automáticamente (requiere pago manual)

---

## 📊 Resumen del Flujo Completo

```
1. BÚSQUEDA
   Usuario busca → Sistema busca en AliExpress → Analiza competencia → Calcula rentabilidad → Filtra oportunidades

2. PUBLICACIÓN
   Usuario selecciona oportunidad → Sistema genera título/descripción → Calcula precio → Genera link afiliado → Publica en marketplace

3. VENTA
   Cliente compra → Marketplace notifica → Sistema crea transacción → Notifica al usuario

4. COMPRA AUTOMATIZADA
   Sistema crea orden en AliExpress → Procesa pago → Obtiene tracking → Actualiza estado

5. SEGUIMIENTO
   Sistema consulta tracking periódicamente → Actualiza estado → Notifica al comprador → Marca como completado
```

---

**Última actualización:** 2025-01-28  
**Próxima revisión:** Al completar OAuth de Dropshipping


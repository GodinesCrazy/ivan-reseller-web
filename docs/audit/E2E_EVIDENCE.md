# 🔬 E2E EVIDENCE - Pruebas End-to-End Reproducibles

**Fecha:** 2025-01-28  
**Objetivo:** Documentar pruebas específicas y reproducibles para validar cada claim (A-E)

---

## 📋 PREREQUISITOS

### Configuración Mínima Requerida

```bash
# Backend
cd backend
npm install
npm run build

# Frontend
cd frontend
npm install
npm run build

# Database
# PostgreSQL + Redis running
# .env configurado con variables mínimas
```

### Variables de Entorno Mínimas

```env
# Backend .env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
ENCRYPTION_KEY=...

# Opcionales (para tests completos):
GROQ_API_KEY=...
SERP_API_KEY=...
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_ENVIRONMENT=sandbox
```

---

## ✅ CLAIM A: BÚSQUEDA DE OPORTUNIDADES CON IA Y GOOGLE TRENDS

### Test 1: Búsqueda Básica de Oportunidades

**Endpoint:** `GET /api/opportunities`

**Prerequisitos:**
- Usuario autenticado
- `GROQ_API_KEY` configurado (opcional, funciona sin IA con análisis básico)
- `SERP_API_KEY` configurado (opcional, Google Trends fallback si no está)

**Request:**
```bash
curl -X GET "http://localhost:3000/api/opportunities?query=iPhone&maxItems=3&marketplaces=ebay,amazon,mercadolibre&region=us" \
  -H "Cookie: token=<token>" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "items": [
    {
      "productId": "...",
      "title": "...",
      "aliexpressPrice": 100.00,
      "suggestedPriceUsd": 150.00,
      "roiPercentage": 50.0,
      "profitMargin": 33.3,
      "bestMarketplace": "ebay",
      "imageUrl": "...",
      "trendData": {
        "searchVolume": 5000,
        "trend": "rising",
        "viable": true
      },
      "competitionLevel": "medium",
      "marketDemand": "high"
    }
  ],
  "count": 3
}
```

**Evidencia de código:**
- `backend/src/api/routes/opportunities.routes.ts:26` - Handler del endpoint
- `backend/src/services/opportunity-finder.service.ts:78` - Lógica de búsqueda
- `backend/src/services/google-trends.service.ts:100` - Validación Google Trends

**Assertions:**
- ✅ Response `success: true`
- ✅ Array `items` no vacío (si hay resultados)
- ✅ Cada item tiene `title`, `aliexpressPrice`, `suggestedPriceUsd`, `roiPercentage`
- ✅ Si `GROQ_API_KEY` está, `trendData` debe estar presente
- ✅ Si `SERP_API_KEY` está, `trendData.searchVolume` debe ser > 0

---

### Test 2: Validación Google Trends

**Endpoint:** `GET /api/opportunities` (mismo endpoint, con validación explícita)

**Prerequisitos:**
- `SERP_API_KEY` configurado
- O credenciales de usuario para SerpAPI en DB

**Request:**
```bash
curl -X GET "http://localhost:3000/api/opportunities?query=wireless+earbuds&maxItems=1&marketplaces=ebay&region=us" \
  -H "Cookie: token=<token>"
```

**Expected Logs (backend):**
```
[OPPORTUNITY-FINDER] Validando demanda real con Google Trends
[OPPORTUNITY-FINDER] Resultado validación Google Trends: { viable: true, searchVolume: 8000, trend: 'rising' }
```

**Evidencia de código:**
- `backend/src/services/opportunity-finder.service.ts:1275` - Llamada a Google Trends
- `backend/src/services/google-trends.service.ts:100` - Método `validateProductViability`

**Assertions:**
- ✅ Si Google Trends está configurado, logs muestran validación
- ✅ Items descartados si `trendsValidation.validation.viable === false` (log: "Producto descartado - baja demanda")
- ✅ Items con baja confianza si Google Trends falla (log: "Error validando con Google Trends, continuando con advertencia")

---

### Test 3: Análisis IA (Groq)

**Endpoint:** `GET /api/opportunities` (mismo endpoint)

**Prerequisitos:**
- `GROQ_API_KEY` configurado

**Request:**
```bash
curl -X GET "http://localhost:3000/api/opportunities?query=laptop&maxItems=2&marketplaces=ebay,amazon&region=us" \
  -H "Cookie: token=<token>"
```

**Expected Response Fields:**
```json
{
  "items": [
    {
      "aiConfidence": 0.85,
      "reasoning": [
        "Margen de ganancia calculado: 45.2%",
        "Precio sugerido: $299.99",
        "Competencia estimada: medium",
        "Tendencia de mercado (Google Trends): rising - Alta demanda",
        "Volumen de búsqueda: 12000"
      ],
      "risks": ["...", "..."],
      "recommendations": ["...", "..."]
    }
  ]
}
```

**Evidencia de código:**
- `backend/src/services/ai-opportunity.service.ts:873` - Método `analyzeOpportunity`
- Usa Groq AI para análisis profundo

**Assertions:**
- ✅ Si `GROQ_API_KEY` está, items tienen `aiConfidence`, `reasoning`, `risks`, `recommendations`
- ✅ `aiConfidence` es número entre 0 y 1
- ✅ `reasoning` es array de strings con explicaciones

---

## ✅ CLAIM B: ANÁLISIS AUTOMÁTICO DE RENTABILIDAD

### Test 4: Cálculo de ROI y Profit Margin

**Endpoint:** `GET /api/opportunities` (análisis automático en resultados)

**Request:**
```bash
curl -X GET "http://localhost:3000/api/opportunities?query=smartphone&maxItems=1&marketplaces=ebay&region=us" \
  -H "Cookie: token=<token>"
```

**Expected Response:**
```json
{
  "items": [
    {
      "aliexpressPrice": 200.00,
      "suggestedPriceUsd": 299.99,
      "roiPercentage": 50.0,
      "profitMargin": 33.3,
      "breakdownCosts": {
        "sourcePrice": 200.00,
        "marketplaceFee": 30.00,
        "paymentFee": 8.70,
        "shippingCost": 5.00,
        "grossProfit": 99.99,
        "netProfit": 56.29
      }
    }
  ]
}
```

**Evidencia de código:**
- `backend/src/services/ai-opportunity.service.ts:707` - `calculateProfitMargin`
- `backend/src/services/autopilot.service.ts:744` - `calculateROI`

**Assertions:**
- ✅ `roiPercentage` = (netProfit / sourcePrice) * 100
- ✅ `profitMargin` = (netProfit / suggestedPriceUsd) * 100
- ✅ `breakdownCosts` incluye todos los costos desglosados
- ✅ `netProfit` = `grossProfit` - fees - costs

---

### Test 5: Análisis de Competencia

**Endpoint:** `GET /api/opportunities` (competencia analizada automáticamente)

**Prerequisitos:**
- Credenciales de eBay configuradas (para análisis de competencia real)

**Request:**
```bash
curl -X GET "http://localhost:3000/api/opportunities?query=gaming+mouse&maxItems=1&marketplaces=ebay&region=us" \
  -H "Cookie: token=<token>"
```

**Expected Response:**
```json
{
  "items": [
    {
      "competitionLevel": "medium",
      "marketplacePrices": {
        "ebay": {
          "minPrice": 25.99,
          "maxPrice": 89.99,
          "averagePrice": 45.50,
          "listingsFound": 150
        }
      },
      "competitorCount": 150
    }
  ]
}
```

**Evidencia de código:**
- `backend/src/services/competitor-analyzer.service.ts:36` - `analyzeCompetition`
- `backend/src/services/ebay.service.ts` - `searchProducts` (si credenciales disponibles)

**Assertions:**
- ✅ Si credenciales de marketplace están, `marketplacePrices` contiene datos reales
- ✅ `competitionLevel` es 'low' | 'medium' | 'high'
- ✅ `listingsFound` es número > 0 si hay credenciales, o estimado si no

---

## ⚠️ CLAIM C: PUBLICACIÓN SIMULTÁNEA

### Test 6: Publicación a Múltiples Marketplaces

**Endpoint:** `POST /api/marketplace/publish-multiple`

**Prerequisitos:**
- Usuario autenticado
- Producto en estado `APPROVED` (productId existente)
- Credenciales de marketplaces configuradas (eBay, Amazon, MercadoLibre)
- Ambiente: `sandbox` o `production`

**Request:**
```bash
curl -X POST "http://localhost:3000/api/marketplace/publish-multiple" \
  -H "Cookie: token=<token>" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": 123,
    "marketplaces": ["ebay", "amazon", "mercadolibre"],
    "environment": "sandbox"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "marketplace": "ebay",
      "listingId": "123456789",
      "listingUrl": "https://www.ebay.com/itm/123456789"
    },
    {
      "success": true,
      "marketplace": "mercadolibre",
      "listingId": "MLA123456789",
      "listingUrl": "https://articulo.mercadolibre.com.mx/MLA123456789"
    },
    {
      "success": false,
      "marketplace": "amazon",
      "error": "Amazon SP-API credentials not configured"
    }
  ]
}
```

**Evidencia de código:**
- `backend/src/api/routes/marketplace.routes.ts:216` - Handler `POST /publish-multiple`
- `backend/src/services/marketplace.service.ts:409` - `publishToMultipleMarketplaces`
- `backend/src/services/marketplace.service.ts:435` - `publishToEbay`
- `backend/src/services/marketplace.service.ts:677` - `publishToMercadoLibre`
- `backend/src/services/marketplace.service.ts:800+` - `publishToAmazon` (verificar línea exacta)

**Assertions:**
- ✅ Si credenciales están, publicación exitosa a cada marketplace
- ✅ Si falla un marketplace, otros continúan
- ✅ Cada resultado tiene `success`, `marketplace`, y `listingId`/`error`
- ✅ Producto se marca como `isPublished: true` solo si al menos una publicación exitosa

---

### Test 7: Test Connection (Validación de Credenciales)

**Endpoint:** `POST /api/marketplace/test-connection`

**Request:**
```bash
curl -X POST "http://localhost:3000/api/marketplace/test-connection" \
  -H "Cookie: token=<token>" \
  -H "Content-Type: application/json" \
  -d '{
    "marketplace": "ebay",
    "environment": "sandbox"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Connection successful"
}
```

**Evidencia de código:**
- `backend/src/services/marketplace.service.ts:253` - `testConnection`
- `backend/src/services/ebay.service.ts` - `testConnection`
- `backend/src/services/mercadolibre.service.ts` - `testConnection`
- `backend/src/services/amazon.service.ts` - `testConnection`

**Assertions:**
- ✅ Si credenciales válidas, `success: true`
- ✅ Si credenciales inválidas/faltantes, `success: false` con mensaje descriptivo

---

## ✅ CLAIM D: COMPRA AUTOMÁTICA CON VALIDACIÓN DE CAPITAL

### Test 8: Validación de Capital Antes de Compra

**Endpoint:** Webhook de venta → Flujo automático

**Prerequisitos:**
- Webhook configurado (eBay, Amazon, MercadoLibre)
- Producto publicado
- Capital configurado en `UserWorkflowConfig.workingCapital`
- `stagePurchase: 'automatic'` en workflow config

**Simulación de Venta (Webhook):**
```bash
curl -X POST "http://localhost:3000/api/webhooks/ebay" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "sale",
    "orderId": "12345",
    "productId": 123,
    "buyer": {
      "name": "Test Buyer",
      "email": "buyer@test.com"
    },
    "shipping": {
      "address": {
        "street": "123 Main St",
        "city": "New York",
        "state": "NY",
        "zip": "10001",
        "country": "US"
      }
    },
    "items": [
      {
        "productId": 123,
        "quantity": 1,
        "price": 299.99
      }
    ]
  }'
```

**Expected Logs (backend):**
```
[AutomationService] Validando capital de trabajo
[AutomationService] Capital disponible: 500.00, Costo requerido: 200.00
[AutomationService] Capital suficiente, procediendo con compra automática
[AutomationService] Ejecutando compra en AliExpress
[AliExpressAutoPurchase] Compra exitosa, Order ID: AE123456789
```

**O si capital insuficiente:**
```
[AutomationService] Capital disponible: 50.00, Costo requerido: 200.00
[AutomationService] Error: Insufficient capital: Available 50.00, Required 200.00
```

**Evidencia de código:**
- `backend/src/api/routes/webhooks.routes.ts` - Handler de webhooks
- `backend/src/services/automation.service.ts:309` - Validación de capital
- `backend/src/services/automation.service.ts:417` - Ejecución de compra

**Assertions:**
- ✅ Si capital suficiente, compra se ejecuta automáticamente
- ✅ Si capital insuficiente, error claro y no se ejecuta compra
- ✅ `PurchaseLog` creado con estado `PENDING` antes de comprar
- ✅ `PurchaseLog` actualizado a `SUCCESS` si compra exitosa

---

### Test 9: Kill-Switch (Deshabilitar Compras Automáticas)

**Prerequisitos:**
- `UserWorkflowConfig.stagePurchase = 'manual'`

**Simulación de Venta (mismo webhook que Test 8)**

**Expected Behavior:**
- Webhook procesa la venta
- Sale creado en DB
- Compra automática NO se ejecuta (modo manual)
- Notificación al usuario: "Venta recibida, requiere compra manual"

**Evidencia de código:**
- `backend/src/services/workflow-config.service.ts` - `getStageMode(userId, 'purchase')`
- `backend/src/services/automation.service.ts` - Verifica modo antes de comprar

**Assertions:**
- ✅ Si `stagePurchase: 'manual'`, compra no se ejecuta automáticamente
- ✅ Sale se crea normalmente
- ✅ Usuario puede comprar manualmente después

---

### Test 10: Idempotencia (Evitar Compras Duplicadas)

**Prerequisitos:**
- Venta ya procesada (Sale con `orderId` existente)

**Request (mismo webhook dos veces):**
```bash
# Primera vez
curl -X POST "http://localhost:3000/api/webhooks/ebay" -d '{ "orderId": "12345", ... }'
# Segunda vez (mismo orderId)
curl -X POST "http://localhost:3000/api/webhooks/ebay" -d '{ "orderId": "12345", ... }'
```

**Expected Behavior:**
- Primera vez: Sale creado, compra ejecutada
- Segunda vez: Sale NO creado (ya existe), compra NO ejecutada

**Evidencia de código:**
- `backend/src/services/sale.service.ts` - Verifica `orderId` único
- `backend/src/services/automation.service.ts` - Verifica `PurchaseLog` existente

**Assertions:**
- ✅ No se crean Sales duplicados para mismo `orderId`
- ✅ No se ejecutan compras duplicadas
- ✅ Error claro si se intenta procesar venta duplicada

---

## ✅ CLAIM E: GESTIÓN AUTOMÁTICA DE COMISIONES Y PAGOS

### Test 11: Cálculo Automático de Comisiones

**Prerequisitos:**
- Venta creada (vía webhook o manual)

**Simulación de Venta:**
```bash
curl -X POST "http://localhost:3000/api/sales" \
  -H "Cookie: token=<token>" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": 123,
    "quantity": 1,
    "salePrice": 299.99,
    "aliexpressCost": 200.00,
    "platformFees": 30.00
  }'
```

**Expected DB State:**
```sql
-- Sale creado
SELECT * FROM "Sale" WHERE id = <saleId>;

-- Commission creado automáticamente
SELECT * FROM "Commission" WHERE "saleId" = <saleId>;
-- amount = (299.99 - 200.00 - 30.00) * 0.20 = 13.998
-- status = 'PENDING'
```

**Evidencia de código:**
- `backend/src/services/sale.service.ts:49` - Cálculo de comisión
- `backend/src/services/sale.service.ts` - Creación de `Commission` record

**Assertions:**
- ✅ Commission creado automáticamente al crear Sale
- ✅ `amount` = `grossProfit * 0.20` (20% default, configurable)
- ✅ `status` = `'PENDING'`
- ✅ `userId` correcto (del sale)

---

### Test 12: Procesamiento Automático de Payouts (PayPal)

**Endpoint:** `POST /api/commissions/process-payouts` (o cron job)

**Prerequisitos:**
- Comisiones en estado `PENDING`
- `PAYPAL_CLIENT_ID` y `PAYPAL_CLIENT_SECRET` configurados
- `PAYPAL_ENVIRONMENT=sandbox` para testing

**Request (Manual):**
```bash
curl -X POST "http://localhost:3000/api/commissions/process-payouts" \
  -H "Cookie: token=<token>" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "processed": 5,
  "totalAmount": 125.50,
  "paypalProcessed": 5,
  "paypalAmount": 125.50,
  "results": [
    {
      "commissionId": "1",
      "success": true,
      "batchId": "PAYPAL_BATCH_123",
      "transactionId": "PAYPAL_TXN_456"
    }
  ]
}
```

**Expected DB State:**
```sql
-- Comisiones actualizadas
SELECT * FROM "Commission" WHERE id IN (1, 2, 3, 4, 5);
-- status = 'PAID'
-- paidAt = <timestamp>
```

**Evidencia de código:**
- `backend/src/services/scheduled-tasks.service.ts:474` - `processCommissions`
- `backend/src/services/paypal-payout.service.ts:200+` - `sendPayout`
- `backend/src/services/job.service.ts:356` - `processPayoutJob`

**Assertions:**
- ✅ Si PayPal configurado, payouts enviados automáticamente
- ✅ Comisiones actualizadas a `PAID` con `paidAt` timestamp
- ✅ `paypalTransactionId` guardado (en Activity metadata o Commission)
- ✅ Si PayPal no configurado, comisiones quedan en `PENDING` (no falla)

---

### Test 13: Verificación de Estado de Payout (PayPal)

**Endpoint:** `GET /api/commissions/:id/payout-status`

**Prerequisitos:**
- Comisión con `paypalTransactionId` o `batchId`

**Request:**
```bash
curl -X GET "http://localhost:3000/api/commissions/1/payout-status" \
  -H "Cookie: token=<token>"
```

**Expected Response:**
```json
{
  "success": true,
  "batchId": "PAYPAL_BATCH_123",
  "batchStatus": "SUCCESS",
  "items": [
    {
      "payoutItemId": "PAYPAL_ITEM_456",
      "transactionId": "PAYPAL_TXN_789",
      "status": "SUCCESS",
      "recipientEmail": "user@example.com",
      "amount": 25.10
    }
  ]
}
```

**Evidencia de código:**
- `backend/src/services/paypal-payout.service.ts:400+` - `getPayoutStatus`

**Assertions:**
- ✅ Estado de batch correcto (`PENDING` | `PROCESSING` | `SUCCESS`)
- ✅ Estado de cada item correcto
- ✅ Si `status: 'SUCCESS'`, dinero transferido exitosamente

---

## 📊 RESUMEN DE PRUEBAS

| Test | Claim | Estado | Complejidad | Requiere Credenciales |
|------|-------|--------|-------------|----------------------|
| Test 1 | A | ✅ Funcional | Baja | No (básico) |
| Test 2 | A | ✅ Funcional | Media | SerpAPI (opcional) |
| Test 3 | A | ✅ Funcional | Media | Groq API (opcional) |
| Test 4 | B | ✅ Funcional | Baja | No |
| Test 5 | B | ⚠️ Parcial | Media | Marketplace APIs |
| Test 6 | C | ⚠️ Parcial | Alta | eBay, ML, Amazon |
| Test 7 | C | ✅ Funcional | Baja | Marketplace APIs |
| Test 8 | D | ✅ Funcional | Alta | AliExpress |
| Test 9 | D | ✅ Funcional | Media | No |
| Test 10 | D | ✅ Funcional | Baja | No |
| Test 11 | E | ✅ Funcional | Baja | No |
| Test 12 | E | ✅ Funcional | Alta | PayPal |
| Test 13 | E | ✅ Funcional | Media | PayPal |

---

**Última actualización:** 2025-01-28  
**Próximo documento:** `docs/audit/GAPS_TO_PROMISE_BACKLOG.md` (P0/P1/P2)


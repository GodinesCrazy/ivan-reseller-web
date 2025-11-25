# 🔍 AUDITORÍA COMPLETA DE MONEDAS - FASE 1: MAPEO

**Fecha:** 2025-01-27  
**Arquitecto:** Sistema de Auditoría Automatizada  
**Estado:** ✅ COMPLETADO (Solo Análisis - Sin Cambios)

---

## 📋 RESUMEN EJECUTIVO

Este documento mapea **TODO** el sistema de manejo de monedas en Ivan Reseller, identificando:
- Entidades y campos que representan dinero
- Tipos de datos en base de datos
- Servicios de conversión de moneda
- Lógica de cálculo de precios, márgenes y comisiones
- Fuente de verdad de monedas
- Modelo de multi-moneda

**⚠️ IMPORTANTE:** Esta fase es **SOLO ANÁLISIS**. No se han realizado cambios al código.

---

## 1. MAPEO DE ENTIDADES Y CAMPOS MONETARIOS

### 1.1. Base de Datos (Prisma Schema)

#### **Model: User**
```prisma
commissionRate   Float @default(0.20)  // Porcentaje de comisión (0.20 = 20%)
fixedMonthlyCost Float @default(0.00)  // Costo fijo mensual en USD
balance          Float @default(0)      // Balance del usuario
totalEarnings    Float @default(0)      // Ganancias totales acumuladas
totalSales       Int   @default(0)      // Contador de ventas
```

**Tipo en DB:** `DOUBLE PRECISION` (PostgreSQL) / `FLOAT` (SQLite)  
**Unidades:** Decimales (no centavos)  
**Moneda:** Asumida USD (no hay campo `currency`)

#### **Model: Product**
```prisma
aliexpressPrice Float      // Precio en AliExpress
suggestedPrice  Float      // Precio sugerido de venta
finalPrice      Float?     // Precio final (opcional)
```

**Tipo en DB:** `DOUBLE PRECISION` (PostgreSQL) / `FLOAT` (SQLite)  
**Unidades:** Decimales (no centavos)  
**Moneda:** ❌ **NO HAY CAMPO `currency`** - Se asume USD o moneda base del sistema

#### **Model: Sale**
```prisma
salePrice        Float  // Precio de venta
aliexpressCost   Float  // Costo en AliExpress
marketplaceFee   Float  // Fee del marketplace
grossProfit      Float  // Ganancia bruta
commissionAmount Float  // Comisión del admin
netProfit        Float  // Ganancia neta del usuario
```

**Tipo en DB:** `DOUBLE PRECISION` (PostgreSQL) / `FLOAT` (SQLite)  
**Unidades:** Decimales (no centavos)  
**Moneda:** ❌ **NO HAY CAMPO `currency`** - Se asume moneda base

#### **Model: Commission**
```prisma
amount Float  // Monto de la comisión
```

**Tipo en DB:** `DOUBLE PRECISION` (PostgreSQL) / `FLOAT` (SQLite)  
**Unidades:** Decimales (no centavos)  
**Moneda:** ❌ **NO HAY CAMPO `currency`**

#### **Model: AdminCommission**
```prisma
amount Float  // Monto de la comisión del admin
```

**Tipo en DB:** `DOUBLE PRECISION` (PostgreSQL) / `FLOAT` (SQLite)  
**Unidades:** Decimales (no centavos)  
**Moneda:** ❌ **NO HAY CAMPO `currency`**

#### **Model: Opportunity**
```prisma
costUsd            Float  // Costo en USD
suggestedPriceUsd  Float  // Precio sugerido en USD
profitMargin       Float  // Margen de ganancia (0-1)
roiPercentage      Float  // ROI en porcentaje (0-100)
```

**Tipo en DB:** `DOUBLE PRECISION` (PostgreSQL) / `FLOAT` (SQLite)  
**Unidades:** Decimales (no centavos)  
**Moneda:** ✅ **EXPLÍCITA: USD** (sufijo `Usd` en nombre de campo)

#### **Model: CompetitionSnapshot**
```prisma
averagePrice     Float?  // Precio promedio
minPrice         Float?  // Precio mínimo
maxPrice         Float?  // Precio máximo
medianPrice      Float?  // Precio mediano
competitivePrice Float?  // Precio competitivo
currency         String? // ✅ Campo de moneda (opcional)
```

**Tipo en DB:** `DOUBLE PRECISION` (PostgreSQL) / `FLOAT` (SQLite)  
**Unidades:** Decimales (no centavos)  
**Moneda:** ✅ **HAY CAMPO `currency`** (opcional)

#### **Model: UserSettings**
```prisma
currencyFormat String @default("USD")  // ✅ Moneda de formato del usuario
```

**Tipo en DB:** `TEXT`  
**Propósito:** Solo para formateo visual, no para cálculos

#### **Model: UserWorkflowConfig**
```prisma
workingCapital Float @default(500)  // Capital de trabajo en USD
```

**Tipo en DB:** `DOUBLE PRECISION` (PostgreSQL) / `FLOAT` (SQLite)  
**Unidades:** Decimales (no centavos)  
**Moneda:** ❌ **ASUMIDA USD** (comentario en código)

---

### 1.2. Estructuras de Datos en Backend

#### **Interfaces TypeScript (Servicios)**

**`CreateSaleDto`** (`sale.service.ts`):
```typescript
salePrice: number;
costPrice: number;
platformFees?: number;
currency?: string;  // ✅ Campo opcional para moneda de venta
```

**`ProfitCalculationInput`** (`financial-calculations.service.ts`):
```typescript
sourcePrice: number;
targetPrice: number;
sourceCurrency?: string;  // ✅ Moneda origen
targetCurrency?: string;  // ✅ Moneda destino
marketplace?: 'ebay' | 'amazon' | 'mercadolibre';
fees?: { ... };
```

**`PriceResolutionInput`** (`currency.utils.ts`):
```typescript
raw: unknown;
itemCurrencyHints?: Array<unknown>;
textHints?: Array<string | undefined | null>;
fallbackCurrency?: string;
userBaseCurrency?: string;  // ✅ Moneda base del usuario
sourceCurrency?: string;    // ✅ Moneda fuente explícita
```

**`ScrapedProduct`** (`advanced-scraper.service.ts`):
```typescript
price: number;
currency: string;              // ✅ Moneda del precio
sourceCurrency?: string;       // ✅ Moneda fuente
baseCurrency: string;          // ✅ Moneda base
priceRangeSourceCurrency?: string;
```

---

## 2. SERVICIOS DE TIPO DE CAMBIO

### 2.1. FX Service (`backend/src/services/fx.service.ts`)

**Responsabilidad:** Conversión de monedas y gestión de tasas de cambio

**Moneda Base del Sistema:**
- Variable: `private base = (process.env.FX_BASE_CURRENCY || 'USD').toUpperCase()`
- Por defecto: **USD**
- Configurable vía `FX_BASE_CURRENCY`

**Fuente de Tasas de Cambio:**
1. **Provider externo:** `https://open.er-api.com/v6/latest/{base}` (configurable vía `FX_PROVIDER_URL`)
2. **Seed rates:** Valores por defecto hardcodeados:
   ```typescript
   {
     USD: 1,
     EUR: 0.92,
     GBP: 0.79,
     MXN: 18.0,
     CLP: 950,
     BRL: 5.5,
     JPY: 150,
   }
   ```
3. **Variable de entorno:** `FX_SEED_RATES` (JSON string)

**Almacenamiento:**
- **En memoria:** `private rates: Rates = {}` (objeto clave-valor)
- **Caché Redis:** Conversiones individuales (clave: `fx:convert:{from}:{to}:{amount}`)
- **Caché en memoria:** Map de conversiones (TTL: 1 hora)

**Monedas Sin Decimales:**
```typescript
private readonly zeroDecimalCurrencies = new Set(['CLP', 'JPY', 'KRW', 'VND', 'IDR']);
```

**Método Principal:**
```typescript
convert(amount: number, from: string, to: string): number
```
- Convierte `amount` de moneda `from` a moneda `to`
- Redondea según tipo de moneda destino
- Lanza error si falta tasa de cambio

---

### 2.2. Currency Utils (`backend/src/utils/currency.utils.ts`)

**Responsabilidad:** Detección y resolución de monedas desde texto/datos

**Funciones Principales:**
1. `detectCurrencyFromText()` - Detecta moneda desde texto
2. `resolveCurrency()` - Resuelve moneda desde hints
3. `resolvePrice()` - Resuelve precio y convierte a moneda base
4. `resolvePriceRange()` - Resuelve rango de precios
5. `parseLocalizedNumber()` - Parsea números con formato localizado
6. `formatPriceByCurrency()` - Formatea precio según moneda

**Monedas Soportadas:**
- USD, EUR, GBP, JPY, CAD, AUD, MXN, CLP, COP, ARS, BRL, PEN, CHF, CNY, KRW, HKD, INR, TRY, ZAR, VND, PHP, IDR, THB, AED

**Monedas Sin Decimales:**
- CLP, JPY, KRW, VND, IDR

---

## 3. FUENTE DE VERDAD DE MONEDAS

### 3.1. Moneda Base del Sistema

**Fuente:** `FXService.getBase()` → Por defecto **USD**

**Configuración:**
- Variable de entorno: `FX_BASE_CURRENCY` (default: `USD`)
- Se puede cambiar dinámicamente, pero **NO se persiste en DB**

### 3.2. Moneda Base del Usuario

**Fuente:** `UserSettings.currencyFormat` → Por defecto **USD**

**Obtención:**
```typescript
// backend/src/services/user-settings.service.ts
getUserBaseCurrency(userId: number): Promise<string>
```

**Uso:**
- Se usa en `sale.service.ts` para determinar moneda de venta
- Se usa en `currency.utils.ts` para conversiones
- Se usa en `advanced-scraper.service.ts` para scraping

**Prioridad:**
1. `userBaseCurrency` (desde UserSettings)
2. `fxService.getBase()` (USD por defecto)

### 3.3. Moneda de Productos

**Problema Identificado:** ❌ **NO HAY CAMPO `currency` en Product**

**Estado Actual:**
- `aliexpressPrice`, `suggestedPrice`, `finalPrice` → Se asumen en moneda base
- En scraping, se detecta moneda de AliExpress y se convierte a moneda base
- No se guarda la moneda original del producto

**Impacto:**
- Si un producto se scrapea en CLP, se convierte a USD y se guarda
- Se pierde la información de la moneda original
- Si el tipo de cambio cambia, no se puede recalcular el precio original

### 3.4. Moneda de Ventas

**Estado Actual:**
- Campo opcional `currency` en `CreateSaleDto`
- Si no se especifica, se usa `userBaseCurrency` o `USD`
- Los campos `salePrice`, `aliexpressCost`, etc. se guardan sin moneda explícita

**Problema Identificado:** ❌ **NO HAY CAMPO `currency` en Sale model**

**Impacto:**
- Si una venta se registra en CLP, se convierte a USD y se guarda
- Se pierde la información de la moneda original de la venta
- Reportes financieros pueden ser incorrectos si hay múltiples monedas

---

## 4. MODELO DE MULTI-MONEDA

### 4.1. Modelo Actual (Identificado)

**Tipo:** **Moneda Base con Conversión**

**Características:**
- ✅ Sistema tiene una moneda base (USD por defecto)
- ✅ Se pueden detectar y convertir monedas
- ✅ Se soportan múltiples monedas en scraping y oportunidades
- ❌ **NO se guarda moneda original en Product/Sale**
- ❌ **NO hay multi-moneda real por usuario/marketplace**

**Flujo Típico:**
1. Scraping detecta precio en CLP (ej: 25.600 CLP)
2. Se convierte a USD (ej: 25.600 / 950 = 26.95 USD)
3. Se guarda `aliexpressPrice = 26.95` (sin moneda)
4. Usuario ve precio en USD
5. Si usuario tiene `currencyFormat = CLP`, se convierte para mostrar

**Problema:**
- Si el tipo de cambio cambia, el precio guardado no refleja el cambio
- No se puede recalcular el precio original desde la moneda fuente

### 4.2. Modelo Ideal (Recomendación)

**Tipo:** **Multi-moneda Real con Moneda Base**

**Características Deseadas:**
- ✅ Guardar moneda original en Product/Sale
- ✅ Guardar precio en moneda original Y en moneda base
- ✅ Permitir que usuarios trabajen en su moneda preferida
- ✅ Permitir que marketplaces trabajen en su moneda nativa
- ✅ Mantener conversiones actualizadas

**Ejemplo:**
```typescript
Product {
  aliexpressPrice: 25.600,        // Precio original
  aliexpressPriceCurrency: "CLP", // Moneda original
  aliexpressPriceUsd: 26.95,      // Precio en USD (moneda base)
  suggestedPrice: 45.00,          // Precio sugerido
  suggestedPriceCurrency: "USD",  // Moneda del precio sugerido
}
```

---

## 5. CÁLCULOS FINANCIEROS

### 5.1. Servicios de Cálculo

#### **FinancialCalculationsService** (`financial-calculations.service.ts`)
- ✅ Centralizado
- ✅ Soporta multi-moneda (conversión automática)
- ✅ Redondea correctamente (2 decimales o enteros según moneda)

#### **CostCalculatorService** (`cost-calculator.service.ts`)
- ✅ Calcula fees de marketplace
- ✅ Soporta multi-moneda (método `calculateAdvanced`)
- ✅ Redondea margen a 4 decimales

#### **SaleService** (`sale.service.ts`)
- ✅ Convierte monedas antes de calcular
- ✅ Calcula comisiones en moneda de venta
- ⚠️ **Problema:** No guarda moneda de venta en DB

### 5.2. Fórmulas Identificadas

#### **Ganancia Bruta (Gross Profit)**
```typescript
grossProfit = salePrice - costPrice
```
- Ambos deben estar en la misma moneda
- Se convierte `costPrice` a `saleCurrency` si es necesario

#### **Comisión del Admin**
```typescript
adminCommission = grossProfit * user.commissionRate
```
- `commissionRate` es decimal (0.20 = 20%)
- Se calcula sobre `grossProfit` (no sobre `salePrice`)

#### **Ganancia Neta (Net Profit)**
```typescript
netProfit = grossProfit - adminCommission - platformFees
```
- `platformFees` incluye marketplace fees y payment fees

#### **Margen de Ganancia**
```typescript
profitMargin = (netProfit / salePrice) * 100
```
- Se redondea a 2 decimales (o 4 en algunos lugares)

#### **ROI**
```typescript
roi = (netProfit / costPrice) * 100
```
- Se redondea a 2 decimales

---

## 6. PROBLEMAS IDENTIFICADOS (Sin Corregir)

### 6.1. Representación Numérica

**Problema:** Uso de `Float` en lugar de `Decimal`

**Impacto:**
- Errores de precisión en cálculos (ej: 0.1 + 0.2 = 0.30000000000000004)
- Pérdida de precisión en sumas/restas de valores grandes
- Problemas con redondeos

**Ejemplo:**
```typescript
// En DB: salePrice = 50.00 (Float)
// En cálculo: 50.00 - 25.00 = 24.999999999999996
```

### 6.2. Falta de Campos de Moneda

**Problema:** Product y Sale no tienen campo `currency`

**Impacto:**
- No se puede saber en qué moneda está guardado un precio
- No se puede recalcular si cambia el tipo de cambio
- Reportes financieros pueden ser incorrectos

### 6.3. Conversiones Dobles

**Riesgo:** Posible conversión doble si no se valida moneda antes de convertir

**Ejemplo:**
```typescript
// Si salePrice ya está en USD y se convierte de USD a USD
costPriceInSaleCurrency = fxService.convert(costPrice, 'USD', 'USD');
// Funciona, pero es innecesario
```

### 6.4. Inconsistencia en Redondeos

**Problema:** Diferentes lugares usan diferentes precisiones

**Ejemplos:**
- `financial-calculations.service.ts`: Redondea a 2 decimales
- `cost-calculator.service.ts`: Redondea margen a 4 decimales
- `fx.service.ts`: Redondea según tipo de moneda (enteros o 2 decimales)

### 6.5. Formateo en Backend vs Frontend

**Problema:** Algunos lugares formatean en backend, otros en frontend

**Impacto:**
- Inconsistencia visual
- Difícil mantener formato consistente

---

## 7. ARCHIVOS CLAVE IDENTIFICADOS

### Backend
- `backend/prisma/schema.prisma` - Schema de base de datos
- `backend/src/services/fx.service.ts` - Servicio de tipo de cambio
- `backend/src/utils/currency.utils.ts` - Utilidades de moneda
- `backend/src/services/sale.service.ts` - Lógica de ventas
- `backend/src/services/commission.service.ts` - Lógica de comisiones
- `backend/src/services/financial-calculations.service.ts` - Cálculos financieros
- `backend/src/services/cost-calculator.service.ts` - Calculadora de costos
- `backend/src/services/advanced-scraper.service.ts` - Scraping con detección de moneda

### Frontend
- `frontend/src/pages/Settings.tsx` - Configuración de moneda del usuario
- `frontend/src/pages/RegionalConfig.tsx` - Configuración regional con monedas
- `frontend/src/pages/FinanceDashboard.tsx` - Dashboard financiero (formateo hardcodeado a USD)
- `frontend/src/pages/Opportunities.tsx` - Oportunidades (formateo con `formatMoney`)
- `frontend/src/pages/Products.tsx` - Listado de productos

---

## 8. CONCLUSIÓN DE FASE 1

### Estado Actual
- ✅ Sistema tiene infraestructura básica de multi-moneda
- ✅ Servicio de conversión funcional
- ✅ Detección de moneda desde texto
- ❌ Falta persistir moneda original en Product/Sale
- ❌ Uso de Float en lugar de Decimal
- ❌ Inconsistencias en redondeos y formateo

### Próximos Pasos (Fases 2-7)
1. **Fase 2:** Cambiar Float → Decimal en DB y tipos TypeScript
2. **Fase 3:** Agregar campos `currency` a Product y Sale
3. **Fase 4:** Unificar redondeos y formateo
5. **Fase 5:** Centralizar formateo en frontend
6. **Fase 6:** Crear tests de moneda
7. **Fase 7:** Generar informe final

---

**Fin del Mapeo - Fase 1**


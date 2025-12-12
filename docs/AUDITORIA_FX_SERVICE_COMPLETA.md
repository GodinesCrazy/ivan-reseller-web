# 🔍 Auditoría Profunda: FX Service (Tipos de Cambio)

**Fecha**: 2025-12-11  
**Alcance**: Auditoría completa del servicio de tipos de cambio, su configuración, manejo de errores, uso en otros servicios y optimizaciones

---

## 📋 RESUMEN EJECUTIVO

### Problemas Encontrados

1. ⚠️ **CRÍTICO**: La mayoría de servicios que usan `fxService.convert()` NO manejan errores
2. ⚠️ **MEDIO**: El endpoint `/api/currency/convert` no maneja errores de conversión
3. ✅ **BUENO**: Sistema de caché bien implementado
4. ✅ **BUENO**: Fallback para monedas inválidas
5. ✅ **BUENO**: Seed rates previenen fallos si la API externa no responde

---

## 🔧 PROBLEMAS ENCONTRADOS Y CORRECCIONES

### 1. Falta de Manejo de Errores en Servicios ⚠️ CRÍTICO

**Problema**: La mayoría de los servicios que usan `fxService.convert()` no tienen manejo de errores. Si falta una tasa de cambio, el servicio falla completamente.

**Servicios afectados**:
- `opportunity-finder.service.ts` (múltiples llamadas sin try-catch)
- `cost-calculator.service.ts`
- `marketplace.service.ts`
- `sale.service.ts`
- `advanced-scraper.service.ts`
- `currency.utils.ts`

**Servicios que SÍ manejan errores**:
- ✅ `financial-calculations.service.ts` (tiene try-catch)

**Ejemplo del problema**:
```typescript
// ❌ opportunity-finder.service.ts (línea 428)
priceInBase = fxService.convert(sourcePrice, detectedCurrency, baseCurrency);
// Si falta la tasa, lanza error y rompe todo el flujo

// ✅ financial-calculations.service.ts (línea 76-80)
try {
  sourcePriceInTargetCurrency = fx.convert(sourcePrice, sourceCurrency, targetCurrency);
} catch (error) {
  sourcePriceInTargetCurrency = sourcePrice; // Fallback seguro
}
```

**Recomendación**: Agregar manejo de errores en todos los servicios que usan `fxService.convert()`, con fallbacks apropiados.

### 2. Endpoint `/api/currency/convert` sin Manejo de Errores ⚠️ MEDIO

**Problema**: El endpoint no maneja errores de conversión.

**Código actual**:
```typescript
router.post('/convert', (req, res) => {
  const { amount, from, to } = req.body || {};
  if (typeof amount !== 'number' || !from || !to) {
    return res.status(400).json({ success: false, error: 'amount, from, to required' });
  }
  const result = fxService.convert(amount, from, to); // ❌ Puede lanzar error
  return res.json({ success: true, amount, from, to, result });
});
```

**Corrección recomendada**:
```typescript
router.post('/convert', (req, res) => {
  const { amount, from, to } = req.body || {};
  if (typeof amount !== 'number' || !from || !to) {
    return res.status(400).json({ success: false, error: 'amount, from, to required' });
  }
  try {
    const result = fxService.convert(amount, from, to);
    return res.json({ success: true, amount, from, to, result });
  } catch (error: any) {
    return res.status(400).json({ 
      success: false, 
      error: error?.message || 'Conversion failed',
      details: {
        from,
        to,
        amount,
        availableRates: Object.keys(fxService.getRates().rates).slice(0, 20)
      }
    });
  }
});
```

---

## ✅ ASPECTOS POSITIVOS

### 1. Sistema de Caché Bien Implementado ✅

- **Caché en memoria**: Conversiones cacheadas por 1 hora (síncrono)
- **Caché Redis**: Persistencia entre reinicios (async, no bloquea)
- **Límite de caché**: Máximo 1000 entradas (limpia automáticamente)
- **TTL apropiado**: 1 hora (las tasas cambian lentamente)

**Código**:
```typescript
// Caché en memoria (síncrono, rápido)
private conversionCache: Map<string, { value: number; timestamp: number }> = new Map();
private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

// Caché Redis (async, no bloquea)
if (isRedisAvailable) {
  redis.get(cacheKey).then(...) // No bloquea si Redis no está disponible
}
```

### 2. Fallback para Monedas Inválidas ✅

**Problema resuelto**: Si se detecta una moneda inválida (ej: "IOS", "AND", "OR"), usa USD como fallback.

**Código**:
```typescript
const invalidCurrencyCodes = new Set(['IOS', 'AND', 'OR', 'NOT', 'API', 'URL', 'HTML', 'CSS', 'JS']);
if (invalidCurrencyCodes.has(f)) {
  logger.warn('FXService: Invalid currency code detected, using USD as fallback', {
    invalidCode: f,
    to: t,
    amount: numAmount
  });
  if (this.rates['USD'] && this.rates[t]) {
    return this.roundCurrency(numAmount * (this.rates[t] / this.rates['USD']), t);
  }
}
```

### 3. Seed Rates Previenen Fallos ✅

**Ventaja**: Si la API externa falla o no responde, el servicio sigue funcionando con valores por defecto.

**Valores por defecto**:
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

**Configuración**:
- Se pueden configurar valores iniciales con `FX_SEED_RATES` (JSON)
- Si falla el refresh, el servicio no falla completamente

### 4. Redondeo Correcto por Tipo de Moneda ✅

**Monedas sin decimales**: CLP, JPY, KRW, VND, IDR se redondean a enteros.
**Otras monedas**: Se redondean a 2 decimales (centavos).

**Código**:
```typescript
private roundCurrency(amount: number, currency: string): number {
  const currencyCode = currency.toUpperCase();
  if (this.zeroDecimalCurrencies.has(currencyCode)) {
    return Math.round(amount); // Entero
  } else {
    return Math.round(amount * 100) / 100; // 2 decimales
  }
}
```

### 5. Validación de Entrada Robusta ✅

- Maneja `number` y `Prisma.Decimal`
- Valida `Infinity` y valores no finitos (retorna 0)
- Retorna mismo valor si `from === to` (sin conversión innecesaria)

---

## 📊 CONFIGURACIÓN Y VARIABLES DE ENTORNO

### Variables de Entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `FX_BASE_CURRENCY` | `USD` | Moneda base para todas las conversiones |
| `FX_PROVIDER_ENABLED` | `true` | Habilitar/deshabilitar API externa |
| `FX_PROVIDER_URL` | `https://open.er-api.com/v6/latest/{base}` | URL del proveedor de tasas |
| `FX_PROVIDER_SYMBOLS` | `undefined` | Limitar monedas (opcional, ej: "EUR,GBP,CLP") |
| `FX_SEED_RATES` | `undefined` | Valores iniciales en JSON (opcional) |

### Proveedor Actual

**URL**: `https://open.er-api.com/v6/latest/{base}`  
**Formato de respuesta esperado**:
```json
{
  "base": "USD",
  "rates": {
    "EUR": 0.92,
    "GBP": 0.79,
    ...
  },
  "time_last_update_unix": 1234567890
}
```

**Alternativas soportadas**:
- `exchangerate-api.com` (formato `conversion_rates`)
- Otros proveedores con formato similar

---

## 🔍 USO EN OTROS SERVICIOS

### Servicios que Usan FX Service

1. **opportunity-finder.service.ts** (8 usos)
   - ❌ Sin manejo de errores
   - Conversiones de precios, shipping costs, competitive prices

2. **cost-calculator.service.ts** (1 uso)
   - ❌ Sin manejo de errores
   - Conversión de costos para cálculos de profit

3. **marketplace.service.ts** (2 usos)
   - ❌ Sin manejo de errores
   - Conversión de precios sugeridos y costos

4. **sale.service.ts** (1 uso)
   - ❌ Sin manejo de errores
   - Conversión de costo a moneda de venta

5. **financial-calculations.service.ts** (1 uso)
   - ✅ Con manejo de errores (try-catch con fallback)

6. **advanced-scraper.service.ts** (1 uso)
   - ❌ Sin manejo de errores
   - Detección de CLP mal detectado como USD

7. **currency.utils.ts** (3 usos)
   - ❌ Sin manejo de errores
   - Conversiones en utilidades de moneda

---

## 🚨 RIESGOS IDENTIFICADOS

### Riesgo Alto: Falta de Manejo de Errores

**Impacto**: Si falta una tasa de cambio:
- Los servicios que usan `fxService.convert()` fallan completamente
- Las búsquedas de oportunidades pueden fallar
- Los cálculos de costos pueden fallar
- Las publicaciones en marketplaces pueden fallar

**Probabilidad**: Media (las tasas seed cubren las monedas más comunes, pero pueden faltar monedas exóticas)

**Mitigación actual**:
- ✅ Seed rates con monedas comunes
- ✅ Fallback para monedas inválidas
- ❌ Falta manejo de errores en servicios

**Recomendación**: Agregar try-catch en todos los servicios con fallbacks apropiados.

---

## 📁 ARCHIVOS MODIFICADOS (Recomendaciones)

### 1. Corregir Endpoint `/api/currency/convert`
**Archivo**: `backend/src/api/routes/currency.routes.ts`
- Agregar try-catch alrededor de `fxService.convert()`
- Retornar error descriptivo con tasas disponibles

### 2. Agregar Manejo de Errores en Servicios
**Archivos**:
- `backend/src/services/opportunity-finder.service.ts`
- `backend/src/services/cost-calculator.service.ts`
- `backend/src/services/marketplace.service.ts`
- `backend/src/services/sale.service.ts`
- `backend/src/services/advanced-scraper.service.ts`
- `backend/src/utils/currency.utils.ts`

**Patrón recomendado**:
```typescript
try {
  convertedAmount = fxService.convert(amount, from, to);
} catch (error: any) {
  logger.warn('FX conversion failed, using fallback', {
    from,
    to,
    amount,
    error: error?.message
  });
  // Fallback apropiado según el contexto:
  // - Usar amount sin convertir (si from === base currency)
  // - Usar USD como intermediario
  // - Retornar 0 o null según el caso
  convertedAmount = amount; // o fallback apropiado
}
```

---

## ✅ VERIFICACIÓN DE FUNCIONALIDAD

### Tests Existentes

✅ **Tests unitarios**: `backend/src/services/__tests__/fx.service.test.ts`
- ✅ Conversión básica (USD -> CLP)
- ✅ Manejo de Prisma.Decimal
- ✅ Redondeo correcto
- ✅ Manejo de valores extremos (infinito, valores grandes)
- ✅ Error cuando falta tasa

### Funcionalidades Verificadas

1. ✅ **Seed rates**: Funciona correctamente
2. ✅ **Refresh desde API**: Funciona correctamente (con manejo de errores)
3. ✅ **Caché en memoria**: Funciona correctamente
4. ✅ **Caché Redis**: Funciona correctamente (async, no bloquea)
5. ✅ **Redondeo por moneda**: Funciona correctamente
6. ✅ **Fallback para monedas inválidas**: Funciona correctamente
7. ✅ **Validación de entrada**: Funciona correctamente

---

## 🧪 PRUEBAS RECOMENDADAS

### Prueba 1: API Externa Deshabilitada
1. Configurar `FX_PROVIDER_ENABLED=false`
2. **Verificar**: El servicio funciona con seed rates

### Prueba 2: Conversión con Moneda Faltante
1. Intentar convertir a una moneda que no está en las tasas
2. **Verificar**: Lanza error descriptivo con tasas disponibles

### Prueba 3: Conversión con Moneda Inválida
1. Intentar convertir desde "IOS" (código inválido)
2. **Verificar**: Usa USD como fallback automáticamente

### Prueba 4: Refrescar Tasas
1. Llamar `POST /api/currency/rates/refresh`
2. **Verificar**: Tasas actualizadas desde API externa

### Prueba 5: Manejo de Errores en Servicios
1. Simular falta de tasa en `opportunity-finder.service.ts`
2. **Verificar**: Servicio maneja error apropiadamente (después de corrección)

---

## ✅ ESTADO FINAL

### Aspectos Positivos
- ✅ Sistema de caché bien implementado
- ✅ Seed rates previenen fallos totales
- ✅ Fallback para monedas inválidas
- ✅ Redondeo correcto por tipo de moneda
- ✅ Validación de entrada robusta
- ✅ Tests unitarios presentes

### Problemas Identificados
- ⚠️ **CRÍTICO**: Falta manejo de errores en la mayoría de servicios
- ⚠️ **MEDIO**: Endpoint `/api/currency/convert` sin manejo de errores

### Recomendaciones Prioritarias
1. **Alta prioridad**: Agregar manejo de errores en todos los servicios que usan `fxService.convert()`
2. **Media prioridad**: Corregir endpoint `/api/currency/convert` para manejar errores
3. **Baja prioridad**: Documentar patrones de fallback recomendados

---

**Última actualización**: 2025-12-11


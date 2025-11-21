# 💰 ANÁLISIS DE CONSISTENCIA: SISTEMA DE MONEDAS Y TIPOS DE CAMBIO

**Fecha de Revisión:** 2025-11-20  
**Alcance:** Sistema de manejo de monedas, tipos de cambio, precisión decimal y cálculos de márgenes/utilidades  
**Estado:** ⚠️ **INCONSISTENCIAS DETECTADAS**

---

## 📋 RESUMEN EJECUTIVO

Se identificaron **12 inconsistencias críticas** y **7 inconsistencias menores** en el sistema de manejo de monedas y tipos de cambio que pueden causar:
- Conversiones incorrectas entre monedas
- Pérdida de precisión en cálculos decimales
- Márgenes y utilidades calculados incorrectamente
- Inconsistencias entre moneda base del usuario y moneda del sistema
- Problemas con monedas sin decimales (CLP, JPY, etc.)

---

## 🚨 INCONSISTENCIAS CRÍTICAS

### 1. **FALTA DE REDONDEO DESPUÉS DE CONVERSIONES**

**Problema:**
`fx.service.ts` retorna valores con decimales infinitos sin redondear, causando problemas de precisión.

**Ubicaciones:**
- `backend/src/services/fx.service.ts:209-249`

**Código actual:**
```typescript
convert(amount: number, from: string, to: string): number {
  // ...
  const amountInBase = amount / this.rates[f];
  const converted = amountInBase * this.rates[t];
  return converted; // ❌ Sin redondeo
}
```

**Problemas:**
1. CLP/JPY deberían redondearse a enteros (sin decimales)
2. Otras monedas deberían redondearse a 2 decimales (centavos)
3. Valores como `19.9999999` deberían ser `20.00` o `20`

**Impacto:** Alto - Precisión incorrecta en precios y márgenes calculados.

**Ejemplo:**
```typescript
// Conversión: 1000 CLP → USD (tasa 950 CLP = 1 USD)
fx.convert(1000, 'CLP', 'USD') 
// Retorna: 1.0526315789473684
// Debería retornar: 1.05 (USD) o redondeado según moneda destino
```

---

### 2. **INCONSISTENCIA EN PRECISIÓN DECIMAL DE MONEDAS**

**Problema:**
El sistema maneja monedas sin decimales (CLP, JPY) pero no siempre redondea correctamente.

**Ubicaciones:**
- `backend/src/utils/currency.utils.ts:126-158`
- `backend/src/services/opportunity-finder.service.ts:512-517,645,660-661`

**Detalles:**
1. `parseLocalizedNumber` limpia decimales para CLP/JPY solo si no hay separador decimal
2. `opportunity-finder.service.ts` usa `.toFixed(2)` siempre, incluso para CLP
3. `fx.service.ts` no redondea según tipo de moneda destino

**Código problemático:**
```typescript
// opportunity-finder.service.ts:661
suggestedPrice: `${opp.suggestedPriceUsd.toFixed(2)} ${opp.suggestedPriceCurrency}`
// ❌ Usa 2 decimales siempre, incluso para CLP (debería ser 0)
```

**Impacto:** Alto - Precios mostrados incorrectamente (ej: CLP 19.99 en lugar de CLP 20).

---

### 3. **MONEDA BASE INCONSISTENTE ENTRE SERVICIOS**

**Problema:**
Algunos servicios usan `USD` hardcodeado, otros usan `baseCurrency` del usuario.

**Ubicaciones:**
- `backend/src/services/fx.service.ts:13` - Default `USD`
- `backend/src/services/marketplace.service.ts:570` - Hardcodeado `USD`
- `backend/src/services/opportunity-finder.service.ts:153` - Usa `baseCurrency` del usuario
- `backend/src/utils/currency.utils.ts:197,332` - Usa `userBaseCurrency` o `USD` fallback

**Inconsistencias:**
1. `fx.service.ts` tiene `base = USD` hardcodeado
2. `marketplace.service.ts:570` usa `USD` hardcodeado como fallback
3. `opportunity-finder.service.ts` usa `baseCurrency` del usuario (correcto)
4. `currency.utils.ts` usa `userBaseCurrency` o fallback a `USD` (correcto)

**Ejemplo:**
```typescript
// marketplace.service.ts:570
currency: (metadata?.currency || 'USD').toUpperCase(), // ❌ Hardcodeado USD
// Debería usar: currency del usuario o metadata
```

**Impacto:** Medio-Alto - Precios pueden estar en moneda incorrecta.

---

### 4. **CONVERSIÓN SIN VALIDACIÓN DE TASAS FALTANTES**

**Problema:**
Si faltan tasas de cambio, `fx.service.ts` retorna el `amount` sin convertir (warning log).

**Ubicaciones:**
- `backend/src/services/fx.service.ts:216-230`

**Código:**
```typescript
if (!this.rates[f] || !this.rates[t]) {
  logger.warn('FXService: missing rate for conversion', { ... });
  // ...
  return amount; // ❌ Retorna amount sin convertir (incorrecto)
}
```

**Problemas:**
1. Si falta tasa, retorna `amount` sin convertir (asume misma moneda)
2. Intenta refrescar async pero no espera
3. No lanza error - solo warning

**Impacto:** Alto - Conversiones fallidas silenciosamente, precios incorrectos.

**Ejemplo:**
```typescript
// Si falta tasa EUR → CLP
fx.convert(100, 'EUR', 'CLP') // Retorna 100 (incorrecto - debería ser ~95000)
```

---

### 5. **CÁLCULO DE MARGEN SIN REDONDEAR**

**Problema:**
Los márgenes se calculan con decimales infinitos y solo se redondean al mostrar.

**Ubicaciones:**
- `backend/src/services/cost-calculator.service.ts:42,82`
- `backend/src/services/opportunity-finder.service.ts:538,568,644-645`

**Código:**
```typescript
// cost-calculator.service.ts:42
const margin = salePrice > 0 ? netProfit / salePrice : 0;
return { breakdown, netProfit, margin }; // ❌ margin sin redondear

// opportunity-finder.service.ts:645
roiPercentage: Math.round(best.margin * 100), // ✅ Solo al final
// Pero best.margin tiene decimales infinitos
```

**Problemas:**
1. `margin` es float con decimales infinitos (ej: 0.456789123)
2. Solo se redondea cuando se convierte a porcentaje
3. Comparaciones con `minMargin` pueden fallar por precisión

**Impacto:** Medio - Comparaciones de márgenes pueden ser incorrectas por precisión.

---

### 6. **UTILIDADES CALCULADAS EN DIFERENTES MONEDAS**

**Problema:**
Utilidades se calculan mezclando monedas sin conversión consistente.

**Ubicaciones:**
- `backend/src/services/sale.service.ts:56-80`
- `backend/src/services/cost-calculator.service.ts:28-54,56-89`

**Detalles:**
1. `sale.service.ts` asume todo en USD: `grossProfit = salePrice - costPrice`
2. `cost-calculator.calculate()` asume USD: `salePriceUsd`, `sourceCostUsd`
3. `cost-calculator.calculateAdvanced()` convierte correctamente
4. Inconsistencia: algunos lugares usan `calculate()`, otros `calculateAdvanced()`

**Ejemplo:**
```typescript
// sale.service.ts:56
const grossProfit = data.salePrice - data.costPrice;
// ❌ Asume misma moneda, pero puede ser CLP - USD

// cost-calculator.service.ts:73
const costInSaleCurrency = fx.convert(sourceCost, sourceCurrency, saleCurrency);
// ✅ Convierte correctamente
```

**Impacto:** Alto - Utilidades calculadas incorrectamente si monedas difieren.

---

### 7. **FALTA DE VALIDACIÓN DE MONEDA EN CÁLCULOS**

**Problema:**
No se valida que las monedas sean válidas antes de calcular.

**Ubicaciones:**
- `backend/src/services/fx.service.ts:209-249`
- `backend/src/services/cost-calculator.service.ts:28-89`

**Código:**
```typescript
// fx.service.ts:211
const f = from.toUpperCase(); // ✅ Normaliza
const t = to.toUpperCase(); // ✅ Normaliza
// ❌ No valida que sean códigos ISO válidos
```

**Problemas:**
1. No valida códigos ISO 4217 válidos
2. Acepta cualquier string como moneda
3. Puede causar conversiones incorrectas silenciosas

**Impacto:** Medio - Monedas inválidas pueden pasar sin error.

---

### 8. **CONVERSIÓN DOBLE EN ALGUNOS CASOS**

**Problema:**
Algunos precios se convierten dos veces, causando valores incorrectos.

**Ubicaciones:**
- `backend/src/services/opportunity-finder.service.ts:542,586`

**Código:**
```typescript
// opportunity-finder.service.ts:542
priceBase: fxService.convert(a.competitivePrice, a.currency || 'USD', baseCurrency),
// ✅ Convierte competitivePrice a baseCurrency

// Pero a.competitivePrice ya puede estar en baseCurrency si vino del scraper
```

**Problema:**
1. Scraper ya convierte a `baseCurrency`
2. `opportunity-finder` convierte de nuevo
3. Resultado: conversión doble

**Impacto:** Medio - Precios duplican conversión.

---

### 9. **FALTA DE SINCRONIZACIÓN DE TASAS EN TIEMPO REAL**

**Problema:**
Las tasas se refrescan async pero los cálculos no esperan actualizaciones.

**Ubicaciones:**
- `backend/src/services/fx.service.ts:134-207`

**Código:**
```typescript
async refreshRates(base: string = this.base): Promise<void> {
  // ...
  if (this.refreshInFlight) {
    return this.refreshInFlight; // ✅ Retorna promesa existente
  }
  // ...
}
```

**Problemas:**
1. `refreshRates()` es async pero conversiones no esperan
2. Si falta tasa, intenta refrescar pero retorna `amount` inmediatamente
3. Conversiones pueden usar tasas desactualizadas

**Impacto:** Medio - Tasas desactualizadas pueden usarse temporalmente.

---

### 10. **REDONDEO INCONSISTENTE EN FORMATOS DE PRECIO**

**Problema:**
Diferentes lugares redondean precios de forma diferente.

**Ubicaciones:**
- `backend/src/services/opportunity-finder.service.ts:512-517,660-661`
- `backend/src/services/marketplace.service.ts:432,493,560`
- `backend/src/utils/currency.utils.ts:156`

**Inconsistencias:**
1. `opportunity-finder.ts:512-517`: `.toFixed(0)` o `.toFixed(2)` según valor
2. `opportunity-finder.ts:661`: `.toFixed(2)` siempre
3. `marketplace.service.ts`: Sin redondeo explícito
4. `currency.utils.ts:156`: `parseFloat()` sin redondeo

**Ejemplo:**
```typescript
// opportunity-finder.ts:515
value >= 10 ? value.toFixed(0) : value.toFixed(2)
// Lógica heurística inconsistente

// opportunity-finder.ts:661
opp.suggestedPriceUsd.toFixed(2) // Siempre 2 decimales
```

**Impacto:** Medio - Precios formateados inconsistentemente.

---

### 11. **COMISIONES CALCULADAS SIN CONSIDERAR MONEDA**

**Problema:**
Comisiones se calculan asumiendo misma moneda que `grossProfit`.

**Ubicaciones:**
- `backend/src/services/sale.service.ts:73-75`

**Código:**
```typescript
// sale.service.ts:73-75
const adminCommission = grossProfit * user.commissionRate; // Ej: 0.20 = 20%
// ❌ Asume grossProfit y commissionRate en misma moneda
```

**Problemas:**
1. `grossProfit` puede estar en USD
2. `commissionRate` es porcentaje (no depende de moneda)
3. Pero si `salePrice` y `costPrice` están en diferentes monedas, `grossProfit` es incorrecto
4. Comisión calculada sobre valor incorrecto

**Impacto:** Medio - Comisiones incorrectas si monedas difieren.

---

### 12. **FALTA DE MANEJO DE ERRORES EN CONVERSIONES**

**Problema:**
Si una conversión falla, no hay manejo de error consistente.

**Ubicaciones:**
- `backend/src/services/fx.service.ts:216-230`
- `backend/src/utils/currency.utils.ts:222`

**Código:**
```typescript
// fx.service.ts:216-230
if (!this.rates[f] || !this.rates[t]) {
  logger.warn('FXService: missing rate...');
  return amount; // ❌ Retorna sin convertir (no lanza error)
}

// currency.utils.ts:222
const amountInBase = fxService.convert(amount, sourceCurrency, baseCurrency);
// ❌ No verifica si conversión fue exitosa
```

**Impacto:** Medio - Errores silenciosos en conversiones.

---

## ⚠️ INCONSISTENCIAS MENORES

### 13. **TASAS DE SEMILLA DESACTUALIZADAS**
- `fx.service.ts:46-57` - Tasas hardcodeadas pueden estar desactualizadas
- Impacto: Bajo - Solo se usan como fallback si proveedor falla

### 14. **VALORES DE MARGEN SIN LÍMITES**
- `opportunity-finder.service.ts:487` - `margin: -Infinity` inicial
- Impacto: Bajo - Solo inicial, se actualiza rápidamente

### 15. **FALTA DE CACHÉ DE CONVERSIONES**
- Conversiones repetidas no se cachean
- Impacto: Bajo - Performance menor, pero funcionalidad correcta

### 16. **FORMATO DE PRECIO HARDCODEADO**
- `opportunity-finder.ts:661` - Formato fijo: `${amount.toFixed(2)} ${currency}`
- Impacto: Bajo - Formato no localizado

### 17. **FALTA DE VALIDACIÓN DE MONEDA EN USER SETTINGS**
- `user-settings.service.ts:94-99` - Valida contra lista hardcodeada
- Impacto: Bajo - Lista limitada de monedas válidas

### 18. **CONVERSIÓN REDUNDANTE EN FALLBACK**
- `opportunity-finder.ts:586` - Convierte `baseCurrency → baseCurrency`
- Impacto: Bajo - Conversión innecesaria pero no incorrecta

### 19. **LOG DE CONVERSIÓN SOLO PARA MONEDAS ESPECÍFICAS**
- `fx.service.ts:237` - Solo log para CLP o amounts > 1000
- Impacto: Bajo - Debugging limitado

---

## 📊 RESUMEN POR CATEGORÍA

### Precisión Decimal (4 críticas)
- Falta de redondeo después de conversiones
- Inconsistencia en precisión decimal de monedas
- Redondeo inconsistente en formatos de precio
- Márgenes sin redondear

### Conversión de Monedas (4 críticas)
- Moneda base inconsistente entre servicios
- Conversión sin validación de tasas faltantes
- Conversión doble en algunos casos
- Falta de sincronización de tasas en tiempo real

### Cálculos de Utilidades (3 críticas)
- Utilidades calculadas en diferentes monedas
- Comisiones calculadas sin considerar moneda
- Falta de validación de moneda en cálculos

### Manejo de Errores (1 crítica)
- Falta de manejo de errores en conversiones

---

## 🎯 RECOMENDACIONES PRIORITARIAS

### ALTA PRIORIDAD
1. ✅ **Implementar redondeo según tipo de moneda**
   - CLP/JPY: redondear a enteros (0 decimales)
   - Otras: redondear a 2 decimales (centavos)

2. ✅ **Estandarizar moneda base**
   - Usar `baseCurrency` del usuario siempre
   - Eliminar hardcodeados de `USD`

3. ✅ **Validar tasas antes de convertir**
   - Lanzar error si falta tasa
   - No retornar `amount` sin convertir

4. ✅ **Sincronizar monedas en cálculos**
   - Asegurar que `salePrice` y `costPrice` estén en misma moneda
   - Convertir antes de calcular utilidades

### MEDIA PRIORIDAD
5. ✅ **Estandarizar formato de precios**
   - Función centralizada para formatear según moneda
   - Respetar decimales según tipo de moneda

6. ✅ **Evitar conversiones dobles**
   - Validar si precio ya está en moneda base
   - Cachear conversiones

7. ✅ **Mejorar manejo de errores**
   - Lanzar errores explícitos si conversión falla
   - Validar códigos ISO 4217

### BAJA PRIORIDAD
8. ✅ **Actualizar tasas de semilla**
   - Valores más recientes como fallback
   - Refresh automático periódico

9. ✅ **Caché de conversiones**
   - Cachear conversiones repetidas
   - Invalidar cache cuando tasas se actualicen

10. ✅ **Logging mejorado**
    - Log de todas las conversiones importantes
    - Métricas de precisión de tasas

---

## 💡 EJEMPLOS DE INCONSISTENCIAS

### Ejemplo 1: Conversión CLP → USD sin redondeo
```typescript
// Input: 1000 CLP, tasa: 950 CLP = 1 USD
const result = fx.convert(1000, 'CLP', 'USD');
// Resultado actual: 1.0526315789473684
// Resultado esperado: 1.05 (USD con 2 decimales)
// o: 1 (si redondeamos a entero)
```

### Ejemplo 2: Precio mostrado incorrecto para CLP
```typescript
// opportunity-finder.ts:661
suggestedPrice: `${opp.suggestedPriceUsd.toFixed(2)} ${opp.suggestedPriceCurrency}`
// Si suggestedPriceUsd = 20.5 y currency = 'CLP'
// Resultado: "20.50 CLP" (incorrecto - CLP no tiene decimales)
// Debería ser: "21 CLP"
```

### Ejemplo 3: Margen calculado con precisión infinita
```typescript
// cost-calculator.service.ts:42
const margin = netProfit / salePrice;
// Si netProfit = 4.567 y salePrice = 10
// Resultado: 0.45670000000000003 (precisión de float)
// Comparación: margin < 0.20 puede fallar por precisión
```

### Ejemplo 4: Utilidad calculada con monedas mezcladas
```typescript
// sale.service.ts:56
const grossProfit = salePrice - costPrice;
// Si salePrice = 100 (USD) y costPrice = 1000 (CLP ≈ 1.05 USD)
// Resultado: 98.95 (incorrecto - mezcla monedas)
// Debería convertir primero: grossProfit = 100 - 1.05 = 98.95
```

---

## 📝 NOTAS FINALES

**Sin modificaciones realizadas** - Este documento solo identifica inconsistencias para revisión posterior.

**Moneda Base del Sistema:**
- Default: `USD` (hardcodeado en `fx.service.ts`)
- Debería ser: `baseCurrency` del usuario (configurable en Settings)

**Monedas sin Decimales Soportadas:**
- CLP (Peso Chileno)
- JPY (Yen Japonés)
- KRW (Won Surcoreano)
- VND (Dong Vietnamita)
- IDR (Rupia Indonesia)

**Recomendación:** Priorizar corrección de inconsistencias críticas antes de agregar nuevas funcionalidades de moneda.

---

**Documento generado por:** Revisión automática del código  
**Última actualización:** 2025-11-20


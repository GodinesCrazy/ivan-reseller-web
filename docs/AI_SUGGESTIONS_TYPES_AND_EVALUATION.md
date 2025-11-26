# Tipos de Sugerencias IA y Sistema de Evaluación

## Resumen Ejecutivo

El sistema de Sugerencias IA genera **7 tipos diferentes** de sugerencias basadas en **datos reales del negocio** del usuario, analizando oportunidades recientes, productos, operaciones exitosas y tendencias de mercado. Cada sugerencia se evalúa y prioriza según métricas específicas.

---

## Tipos de Sugerencias IA

### 1. **SEARCH** (Búsqueda de Oportunidades) ⭐ **NUEVO**

**Descripción:** Sugerencias de keywords concretas para buscar oportunidades de negocio.

**Fuente de Datos:**
- Oportunidades recientes (últimos 30 días)
- Títulos de productos importados
- Análisis de tendencias por keyword

**Cómo se Genera:**
1. **Extracción de Keywords** (`trend-suggestions.service.ts`):
   - Analiza títulos de oportunidades recientes
   - Extrae palabras individuales (≥4 caracteres)
   - Genera bigramas (2 palabras) y trigramas (3 palabras)
   - Filtra stop words (palabras comunes sin valor)

2. **Análisis de Tendencias:**
   - Agrupa keywords por categoría y segmento
   - Calcula métricas promedio: margen, ROI, confianza
   - Detecta tendencias temporales (creciente/estable/decreciente)
   - Analiza distribución por marketplace

3. **Priorización:**
   - **High:** Margen ≥40% Y ROI ≥50% Y tendencia creciente
   - **Medium:** Margen 20-40% O ROI 30-50%
   - **Low:** Margen <20% O ROI <30%

**Ejemplo:**
```
Keyword: "wireless earbuds"
Categoría: Electrónica
Segmento: Audio & Sound
Razón: "Tendencia creciente: 35% más oportunidades. Alto margen promedio: 42%. ROI atractivo: 55%."
Marketplaces: ["ebay", "amazon"]
Oportunidades estimadas: 15
Confianza: 85%
```

**Evaluación:**
- **Score =** (count × 0.3) + (avgMargin × 100 × 0.3) + (avgROI × 0.2) + (trendStrength × 0.2 si es creciente)
- Se ordenan por score descendente
- Top 10 keywords se convierten en sugerencias

---

### 2. **INVENTORY** (Expansión de Catálogo)

**Descripción:** Sugerencias para expandir el catálogo en segmentos rentables.

**Fuente de Datos:**
- Segmentos detectados en oportunidades recientes (últimos 14 días)
- Top 3 segmentos con mejor score

**Cómo se Genera:**
1. **Análisis de Segmentos:**
   - Extrae segmentos de títulos (ej: "Gaming & Esports", "Home & Kitchen")
   - Agrupa oportunidades por segmento
   - Calcula métricas promedio: margen, ROI, ganancia por unidad

2. **Cálculo de Score:**
   ```
   baseScore = (margin × 120) + roi + (confidence × 80) + (marketDemand === 'real' ? 15 : 0)
   ```

3. **Priorización:**
   - **High:** Margen promedio ≥40% O ROI ≥50%
   - **Medium:** Margen 30-40% O ROI 40-50%

**Ejemplo:**
```
Título: "Expandir catálogo en Gaming & Esports orientado a ebay"
Descripción: "En las últimas 2 semanas detectamos 25 oportunidades en Gaming & Esports con margen promedio 45% y ROI 60%."
Impacto: $15,000 (estimado)
Confianza: 78%
```

**Evaluación:**
- Se ordenan segmentos por score descendente
- Top 3 segmentos generan sugerencias
- Impacto estimado = profitPerUnit × min(opportunityCount, 20)

---

### 3. **PRICING** (Optimización de Precios)

**Descripción:** Sugerencias para optimizar precios de productos existentes.

**Fuente de Datos:**
- Productos "calientes" (hot products) con margen ≥30%
- Top 2 productos con mejor margen y ROI

**Cómo se Genera:**
1. **Identificación de Productos Calientes:**
   - Filtra oportunidades con margen ≥30%
   - Ordena por margen (prioridad) y ROI (desempate)

2. **Cálculo de Confianza:**
   ```
   confidence = min(92, max(55, marginPct + (roiPercentage / 2)))
   ```

3. **Priorización:**
   - **High:** Margen ≥40%
   - **Medium:** Margen 30-40%

**Ejemplo:**
```
Título: "Optimizar pricing para 'Wireless Earbuds Bluetooth 5.0' en ebay, amazon"
Descripción: "El producto presenta un margen del 45% con ROI 65%. Ajusta el precio de venta a $29.99 USD."
Impacto: $2,400 (estimado)
Confianza: 87%
```

**Evaluación:**
- Se ordenan por margen descendente
- Top 2 productos generan sugerencias
- Impacto estimado = profitUnit × min(8, 50)

---

### 4. **AUTOMATION** (Automatización de Operaciones Exitosas)

**Descripción:** Sugerencias para automatizar relanzamiento de productos exitosos.

**Fuente de Datos:**
- Operaciones exitosas (últimos 90 días)
- Top 2 operaciones con mayor ganancia total

**Cómo se Genera:**
1. **Análisis de Operaciones Exitosas:**
   - Filtra `successfulOperation` con `totalProfit > 0`
   - Calcula ROI real: `(totalProfit / investment) × 100`
   - Ordena por ganancia total descendente

2. **Cálculo de Confianza:**
   ```
   confidence = min(90, max(60, roi))
   ```

3. **Priorización:**
   - **High:** ROI ≥60%
   - **Medium:** ROI 40-60%

**Ejemplo:**
```
Título: "Automatizar relanzamiento de 'Smart Watch Fitness Tracker' en ebay"
Descripción: "La última operación completó en 12 días con ROI 75% y beneficio $450. Configura regla para repostear automáticamente cuando ROI ≥60%."
Impacto: $900 (estimado)
Confianza: 75%
```

**Evaluación:**
- Se ordenan por `totalProfit` descendente
- Top 2 operaciones generan sugerencias
- Impacto estimado = totalProfit × min(2, 10)

---

### 5. **MARKETING** (Campañas Promocionales)

**Descripción:** Sugerencias para impulsar visibilidad en marketplaces con demanda creciente.

**Fuente de Datos:**
- Tendencias de demanda por marketplace (comparación últimos 14 días vs. anteriores)
- Marketplace con tendencia creciente (`trend === 'up'`)

**Cómo se Genera:**
1. **Análisis de Demanda:**
   - Compara demanda actual vs. anterior (últimos 14 días)
   - Detecta incremento >15% como tendencia creciente
   - Calcula porcentaje de cambio

2. **Priorización:**
   - Siempre **Medium** (no es crítica pero es oportunidad)

**Ejemplo:**
```
Título: "Impulsar visibilidad en mercadolibre"
Descripción: "mercadolibre incrementó la demanda 28.5% comparado con el período anterior. Lanza campaña promocional."
Impacto: $5,000 (estimado)
Confianza: 70%
```

**Evaluación:**
- Solo se genera si hay marketplace con tendencia creciente
- Impacto estimado = avgProfitPerUnit × min(10, 50)

---

### 6. **OPTIMIZATION** (Optimización General)

**Descripción:** Sugerencias para actualizar estrategia basada en señales recientes.

**Fuente de Datos:**
- Resumen de señales detectadas (`confidenceNotes`)
- Segmentos destacados, tendencias de marketplace, operaciones exitosas

**Cómo se Genera:**
1. **Agregación de Señales:**
   - Segmento top con métricas
   - Tendencias de marketplace (creciente/decreciente)
   - Operación exitosa destacada
   - Mejor categoría histórica

2. **Priorización:**
   - Siempre **Medium**

**Ejemplo:**
```
Título: "Actualizar tablero de inteligencia con señales recientes"
Descripción: "Resumen de señales: Segmento Gaming generó 25 oportunidades con margen 45%. eBay muestra incremento de demanda 15%. Operación exitosa 'Smart Watch' alcanzó ROI 75%."
Impacto: $40 (estimado)
Confianza: 65%
```

**Evaluación:**
- Solo se genera si hay `confidenceNotes.length > 0`
- Impacto fijo: $40 (bajo, es más informativo)

---

### 7. **LISTING** (Optimización de Listados) - Fallback

**Descripción:** Sugerencias para optimizar títulos y descripciones para SEO.

**Fuente de Datos:**
- Datos del negocio del usuario
- Solo se genera si hay ventas pero pocas (<20)

**Cómo se Genera:**
1. **Condición:**
   - `totalSales > 0 && totalSales < 20`

2. **Priorización:**
   - Siempre **Medium**

**Ejemplo:**
```
Título: "Optimizar títulos y descripciones para SEO en marketplaces"
Descripción: "Tus productos tienen 12 ventas. Mejora títulos y descripciones agregando keywords relevantes."
Impacto: $1,250 (estimado)
Confianza: 75%
```

**Evaluación:**
- Solo se genera en fallback (sin datos suficientes)
- Impacto estimado = totalRevenue × 0.25 (limitado a $75k)

---

## Fuentes de Datos

### 1. **Oportunidades Recientes** (Últimos 14-30 días)

**Tabla:** `Opportunity`

**Campos Analizados:**
- `title` → Extracción de keywords y segmentos
- `costUsd`, `suggestedPriceUsd` → Cálculo de margen y ganancia
- `profitMargin`, `roiPercentage` → Métricas de rentabilidad
- `confidenceScore` → Confianza del sistema
- `targetMarketplaces` → Distribución por marketplace
- `marketDemand` → Demanda real vs. estimada
- `createdAt` → Análisis temporal de tendencias

**Filtros:**
- Solo oportunidades del usuario actual (`userId`)
- Últimos 14 días para análisis actual
- Últimos 14 días anteriores para comparación
- Máximo 300 oportunidades por período

---

### 2. **Operaciones Exitosas** (Últimos 90 días)

**Tabla:** `SuccessfulOperation`

**Campos Analizados:**
- `totalProfit` → Ganancia real
- `daysToComplete` → Tiempo de ciclo
- `product.title`, `product.category` → Contexto del producto
- `product.aliexpressPrice`, `product.suggestedPrice` → Inversión
- `sale.marketplace` → Marketplace donde se vendió

**Filtros:**
- Solo operaciones del usuario actual
- `totalProfit > 0`
- Últimos 90 días
- Top 25 ordenadas por ganancia

---

### 3. **Datos del Negocio del Usuario**

**Tablas:** `User`, `Product`, `Sale`

**Métricas Calculadas:**
- `totalSales` → Total de ventas completadas
- `totalRevenue` → Ingresos totales
- `totalProfit` → Ganancia total
- `activeProducts` → Productos en estado `APPROVED`
- `averageProfitMargin` → Margen promedio de ventas
- `bestCategory` / `worstCategory` → Categorías con mejor/peor rendimiento
- `recentOpportunities` → Oportunidades en últimos 30 días

---

### 4. **Productos Importados** (Fallback)

**Tabla:** `Product`

**Uso:**
- Solo cuando no hay suficientes oportunidades recientes
- Extrae keywords de títulos de productos existentes
- Agrupa por categoría para sugerencias genéricas

---

## Sistema de Evaluación y Priorización

### Métricas de Evaluación

#### 1. **Score de Segmento** (para INVENTORY)

```
baseScore = (margin × 120) + roi + (confidence × 80) + (marketDemand === 'real' ? 15 : 0)
```

**Componentes:**
- **Margen (×120):** Peso alto porque es indicador directo de rentabilidad
- **ROI:** Indicador de retorno de inversión
- **Confianza (×80):** Confiabilidad de los datos
- **Demanda Real (+15):** Bonus si la demanda es real vs. estimada

**Ordenamiento:**
- Se ordenan por `score` descendente
- Top 3 segmentos generan sugerencias

---

#### 2. **Score de Keyword** (para SEARCH)

```
score = (opportunityCount × 0.3) + (avgMargin × 100 × 0.3) + (avgROI × 0.2) + (trendStrength × 0.2 si es creciente)
```

**Componentes:**
- **Cantidad de Oportunidades (30%):** Más oportunidades = más potencial
- **Margen Promedio (30%):** Rentabilidad promedio
- **ROI Promedio (20%):** Retorno de inversión
- **Fuerza de Tendencia (20%):** Solo si es creciente

**Ordenamiento:**
- Se ordenan por `score` descendente
- Top 10 keywords se convierten en sugerencias

---

#### 3. **Priorización por Tipo**

**High Priority:**
- **SEARCH:** Margen ≥40% Y ROI ≥50% Y tendencia creciente
- **INVENTORY:** Margen promedio ≥40% O ROI ≥50%
- **PRICING:** Margen ≥40%
- **AUTOMATION:** ROI ≥60%

**Medium Priority:**
- **SEARCH:** Margen 20-40% O ROI 30-50%
- **INVENTORY:** Margen 30-40% O ROI 40-50%
- **PRICING:** Margen 30-40%
- **AUTOMATION:** ROI 40-60%
- **MARKETING:** Siempre medium
- **OPTIMIZATION:** Siempre medium
- **LISTING:** Siempre medium

**Low Priority:**
- **SEARCH:** Margen <20% O ROI <30%

---

### Cálculo de Confianza

**Fórmula General:**
```
confidence = min(95, max(60, baseConfidence))
```

**Por Tipo:**

1. **INVENTORY:**
   ```
   confidence = min(95, max(60, (segment.score / segment.count) || 60))
   ```

2. **PRICING:**
   ```
   confidence = min(92, max(55, marginPct + (roiPercentage / 2)))
   ```

3. **AUTOMATION:**
   ```
   confidence = min(90, max(60, roi))
   ```

4. **SEARCH:**
   ```
   confidence = min(95, avgConfidence × 100)
   ```

5. **MARKETING / OPTIMIZATION:**
   - Fijo: 70% / 65%

---

### Cálculo de Impacto Estimado

**Límites de Seguridad:**
- Todos los cálculos tienen límites máximos para evitar desbordamientos
- Validación de valores finitos antes de calcular

**Por Tipo:**

1. **INVENTORY:**
   ```
   profitPerUnit = min(avgProfitPerUnit, 10000)
   opportunityCount = min(count, 100)
   impact = min(profitPerUnit × min(opportunityCount, 20), 1000000)
   ```

2. **PRICING:**
   ```
   profitUnit = min(targetPrice - costUsd, 10000)
   impact = min(profitUnit × min(8, 50), 500000)
   ```

3. **AUTOMATION:**
   ```
   totalProfit = min(operation.totalProfit, 50000)
   impact = min(totalProfit × min(2, 10), 200000)
   ```

4. **SEARCH:**
   ```
   impact = min(estimatedOpportunities × min(10, 100), 50000)
   ```

5. **MARKETING:**
   ```
   avgProfitPerUnit = min(segments[0].avgProfitPerUnit, 10000)
   impact = min(avgProfitPerUnit × min(10, 50), 100000)
   ```

---

## Flujo de Generación de Sugerencias

### 1. **Análisis de Señales de Mercado** (`analyzeMarketSignals`)

```
1. Obtener oportunidades recientes (últimos 14 días)
2. Obtener oportunidades anteriores (14 días previos)
3. Obtener operaciones exitosas (últimos 90 días)
4. Analizar segmentos:
   - Extraer segmentos de títulos
   - Agrupar por segmento
   - Calcular métricas promedio
5. Identificar productos calientes (margen ≥30%)
6. Analizar demanda por marketplace (comparar períodos)
7. Identificar operaciones exitosas
8. Generar notas de confianza
```

### 2. **Generación de Sugerencias Basadas en Datos** (`buildDataDrivenSuggestions`)

```
1. Generar sugerencias de INVENTORY (top 3 segmentos)
2. Generar sugerencias de PRICING (top 2 productos calientes)
3. Generar sugerencias de AUTOMATION (top 2 operaciones exitosas)
4. Generar sugerencia de MARKETING (si hay marketplace creciente)
5. Generar sugerencia de OPTIMIZATION (si hay confidenceNotes)
```

### 3. **Generación de Sugerencias de Keywords** (`generateKeywordSuggestions`)

```
1. Analizar tendencias (últimos 30 días)
2. Extraer keywords de títulos
3. Agrupar por keyword
4. Calcular métricas: margen, ROI, confianza, tendencia
5. Priorizar por score
6. Convertir a sugerencias tipo SEARCH
```

### 4. **Integración con GROQ (Opcional)**

```
1. Si hay credenciales GROQ configuradas:
   - Construir prompt con datos del negocio y señales
   - Llamar a GROQ API
   - Parsear respuesta JSON
   - Convertir a sugerencias
2. Si no hay GROQ o falla:
   - Usar solo sugerencias basadas en datos
   - Usar fallback si no hay datos suficientes
```

### 5. **Merge y Priorización Final**

```
1. Combinar sugerencias:
   - Sugerencias basadas en datos
   - Sugerencias de keywords
   - Sugerencias de GROQ (si aplica)
2. Eliminar duplicados (por título o keyword)
3. Priorizar:
   - Sugerencias SEARCH primero (top 5)
   - Otras sugerencias después (top 10)
4. Guardar en BD
5. Retornar al frontend
```

---

## Ejemplo Completo de Evaluación

### Caso: Keyword "wireless earbuds"

**Datos de Entrada:**
- 15 oportunidades en últimos 30 días
- Margen promedio: 42%
- ROI promedio: 55%
- Confianza promedio: 0.85
- Tendencia: creciente (35% más que período anterior)
- Marketplaces: ebay (10), amazon (5)

**Cálculo de Score:**
```
score = (15 × 0.3) + (42 × 0.3) + (55 × 0.2) + (35 × 0.2)
     = 4.5 + 12.6 + 11 + 7
     = 35.1
```

**Priorización:**
- Margen 42% ≥ 40% ✅
- ROI 55% ≥ 50% ✅
- Tendencia creciente ✅
- **Priority: HIGH**

**Confianza:**
```
confidence = min(95, 0.85 × 100) = 85%
```

**Impacto Estimado:**
```
estimatedOpportunities = max(5, round(15 × 1.2)) = 18
impact = min(18 × min(10, 100), 50000) = min(180, 50000) = 180
```

**Sugerencia Resultante:**
```json
{
  "type": "search",
  "priority": "high",
  "keyword": "wireless earbuds",
  "reason": "Tendencia creciente: 35% más oportunidades. Alto margen promedio: 42%. ROI atractivo: 55%.",
  "confidence": 85,
  "impact": { "revenue": 180 },
  "targetMarketplaces": ["ebay", "amazon"],
  "estimatedOpportunities": 18
}
```

---

## Limitaciones y Consideraciones

### 1. **Dependencia de Datos**
- Las sugerencias requieren datos históricos suficientes
- Sin oportunidades recientes → se usan sugerencias de fallback genéricas
- Sin operaciones exitosas → no se generan sugerencias de AUTOMATION

### 2. **Precisión de Métricas**
- Las métricas se basan en promedios y estimaciones
- El impacto estimado es conservador (límites máximos)
- La confianza puede variar según calidad de datos

### 3. **Performance**
- Análisis de hasta 500 oportunidades recientes
- Procesamiento en serie para checks críticos (evita SIGSEGV)
- Cache cuando es posible

### 4. **Multi-tenancy**
- Todas las consultas filtran por `userId`
- No hay data leakage entre usuarios
- Cada usuario ve solo sus propias sugerencias

---

## Mejoras Futuras (Opcional)

- [ ] Cache de análisis de tendencias (evitar recalcular constantemente)
- [ ] Machine Learning para mejorar predicción de impacto
- [ ] Integración con APIs externas de tendencias (Google Trends, etc.)
- [ ] Notificaciones cuando se detectan nuevas tendencias
- [ ] Dashboard de visualización de tendencias
- [ ] A/B testing de sugerencias para mejorar precisión

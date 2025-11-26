# Mejoras al Módulo de Sugerencias IA

## Resumen de Cambios

Este documento describe las mejoras implementadas en el módulo de "Sugerencias IA" del Dashboard, incluyendo la corrección del valor desbordado del "Impacto potencial" y la mejora de las sugerencias basadas en tendencias reales.

## Problemas Corregidos

### 1. Valor Desbordado de "Impacto Potencial"

**Problema:**
- El indicador "Impacto potencial" mostraba valores desbordados como `5.0010060060986016e+32`
- El cálculo sumaba `s.impact.revenue` de todas las sugerencias sin validar valores finitos
- No había límites máximos razonables para evitar outliers absurdos

**Solución:**
- **Frontend (`AISuggestionsPanel.tsx`):**
  - Validación de valores finitos antes de sumar
  - Límite máximo razonable de $1 billón (1e9)
  - Formateo usando `Intl.NumberFormat` para evitar notación exponencial
  - Placeholder "—" cuando no hay valores válidos
  - Formato: `$X.XXM` para millones, `$X.XXK` para miles, `$X,XXX` para valores menores

- **Backend (`ai-suggestions.service.ts`):**
  - Límites en todos los cálculos de `estimatedRevenue`:
    - Segmentos: máximo $1M, máximo 20 oportunidades para cálculo
    - Productos calientes: máximo $500k, máximo 50 unidades
    - Operaciones exitosas: máximo $200k, multiplicador máximo 10
    - Keywords: máximo $50k, máximo 100 por oportunidad
    - Marketing: máximo $100k, máximo 50 unidades
    - Fallback: máximo $50k-$100k según tipo

### 2. Sugerencias IA Basadas en Tendencias Reales

**Problema:**
- Las sugerencias mostraban textos genéricos que no ayudaban a decidir qué buscar
- No se basaban en datos reales del sistema

**Solución:**
- **Servicio de Tendencias (`trend-suggestions.service.ts`):**
  - Análisis de oportunidades recientes (últimos 30 días)
  - Extracción de keywords de títulos de productos
  - Agrupación por categoría y segmento
  - Cálculo de métricas: margen promedio, ROI promedio, confianza
  - Detección de tendencias (creciente, estable, decreciente)
  - Distribución por marketplace

- **Integración con Sugerencias IA:**
  - Las sugerencias de keywords se incluyen automáticamente en `generateSuggestions()`
  - Priorización de sugerencias de keywords al inicio
  - Conversión de `KeywordSuggestion` a `AISuggestion` con tipo `'search'`

- **Frontend:**
  - Botón "Nueva sugerencia" ahora genera keywords basadas en tendencias
  - Cada tarjeta de keyword muestra:
    - Keyword sugerida
    - Razón (justificación basada en datos)
    - Métrica de soporte (margen, ROI, demanda, tendencia)
    - Marketplaces objetivo
    - Oportunidades estimadas
  - Botón "Buscar oportunidades con esta keyword" navega a `/opportunities` con keyword precargada

### 3. Conexión Sugerencias IA → /opportunities

**Problema:**
- No había conexión directa entre sugerencias IA y búsqueda de oportunidades
- El usuario tenía que copiar manualmente la keyword

**Solución:**
- **Navegación desde Sugerencias IA:**
  - Botón "Buscar oportunidades con esta keyword" en cada tarjeta de keyword
  - Navegación a `/opportunities?keyword=XXX&marketplaces=YYY&autoSearch=true`
  - Parámetro `autoSearch=true` para ejecutar búsqueda automáticamente

- **Página /opportunities:**
  - Lee parámetros de URL al cargar
  - Pre-llena campo de búsqueda con keyword
  - Pre-selecciona marketplaces si vienen en params
  - Ejecuta búsqueda automáticamente si `autoSearch=true`
  - Limpia params de URL después de leerlos

### 4. Arreglo de /opportunities (Network Error)

**Problema:**
- Aparecía "Network Error" y toast "No se pudieron cargar los estados de credenciales"
- La página se bloqueaba si fallaba el endpoint de credenciales

**Solución:**
- **Backend (`api-credentials.routes.ts`):**
  - Manejo de errores mejorado en `/api/credentials/status`
  - Retorna respuesta válida incluso si hay errores parciales
  - Incluye warnings en lugar de bloquear completamente
  - Timeouts en checks individuales (10s para críticos, 5s para simples)

- **Frontend (`Opportunities.tsx`):**
  - Manejo de errores con `.catch()` que retorna respuesta parcial
  - No bloquea la página si falla el endpoint
  - Muestra warnings pero permite continuar usando la página
  - Estado por defecto vacío si no se pueden cargar credenciales

## Fuentes de Datos para Sugerencias

Las sugerencias IA se basan en:

1. **Oportunidades Recientes:**
   - Últimos 14-30 días de oportunidades encontradas
   - Títulos de productos
   - Márgenes, ROI, confianza
   - Marketplaces objetivo

2. **Productos Importados:**
   - Productos del usuario con estado `APPROVED`
   - Categorías y títulos
   - Historial de ventas

3. **Operaciones Exitosas:**
   - Operaciones completadas en últimos 90 días
   - ROI y ganancias reales
   - Marketplaces donde se vendió

4. **Tendencias de Marketplace:**
   - Comparación de demanda actual vs. anterior (14 días)
   - Detección de tendencias crecientes/decrecientes
   - Distribución por marketplace

## Cálculo del Impacto Potencial

**Fórmula:**
```
Impacto Potencial = Suma de impact.revenue de todas las sugerencias válidas
```

**Validaciones:**
- Solo se suman valores finitos (`isFinite(revenue)`)
- Solo valores >= 0 y < 1e15
- Límite máximo de $1 billón (1e9) para evitar outliers
- Si no hay valores válidos, muestra "—"

**Formateo:**
- >= $1M: `$X.XM` (ej: `$1.5M`)
- >= $1K: `$X.XK` (ej: `$2.3K`)
- < $1K: `$X,XXX` (ej: `$500`)
- Usa `Intl.NumberFormat` para evitar notación exponencial

## Flujo Completo

### Flujo de Sugerencias IA:

1. **Usuario entra a Dashboard → Sugerencias IA**
   - Se cargan sugerencias guardadas desde BD
   - Se muestran métricas (Impacto potencial, Sugerencias activas, etc.)

2. **Usuario hace clic en "Nueva sugerencia"**
   - Backend genera sugerencias basadas en tendencias:
     - Analiza oportunidades recientes
     - Extrae keywords y métricas
     - Genera sugerencias de keywords (tipo `'search'`)
     - Genera sugerencias generales (pricing, inventory, etc.)
   - Frontend muestra nuevas sugerencias

3. **Usuario hace clic en "Buscar oportunidades con esta keyword"**
   - Navega a `/opportunities?keyword=XXX&marketplaces=YYY&autoSearch=true`
   - `/opportunities` lee params y pre-llena campos
   - Ejecuta búsqueda automáticamente
   - Muestra resultados de oportunidades

4. **Usuario importa producto desde oportunidades**
   - Producto se crea con estado `PENDING`
   - Redirige a `/products`
   - Usuario puede ver preview y publicar

## Archivos Modificados

### Backend:
- `backend/src/services/ai-suggestions.service.ts`
  - Cálculos seguros de `estimatedRevenue` con límites
  - Integración con `trendSuggestionsService`
  - Método `generateKeywordSuggestions()`

- `backend/src/services/trend-suggestions.service.ts`
  - Análisis de tendencias de oportunidades
  - Extracción de keywords
  - Generación de sugerencias basadas en datos reales

- `backend/src/api/routes/ai-suggestions.routes.ts`
  - Endpoint `GET /api/ai-suggestions/keywords`
  - Manejo de errores mejorado

- `backend/src/api/routes/api-credentials.routes.ts`
  - Manejo de errores mejorado en `/api/credentials/status`
  - Respuestas parciales en lugar de errores 500

### Frontend:
- `frontend/src/components/AISuggestionsPanel.tsx`
  - Cálculo seguro del "Impacto potencial"
  - Formateo con `Intl.NumberFormat`
  - Botón de búsqueda mejorado
  - Generación de sugerencias mejorada

- `frontend/src/pages/Opportunities.tsx`
  - Lectura de params de URL
  - Auto-búsqueda cuando viene desde sugerencias IA
  - Manejo de errores mejorado para credenciales

## Testing

### Casos de Prueba:

1. **Impacto Potencial:**
   - ✅ Sugerencias con valores normales → muestra suma formateada
   - ✅ Sugerencias con valores muy grandes → limita a $1M y formatea
   - ✅ Sin sugerencias → muestra "—"
   - ✅ Valores NaN o Infinity → se filtran y no se suman

2. **Sugerencias Basadas en Tendencias:**
   - ✅ Con oportunidades recientes → genera keywords reales
   - ✅ Sin oportunidades → genera sugerencias de fallback
   - ✅ Keywords se muestran con información completa
   - ✅ Botón de búsqueda navega correctamente

3. **Flujo Sugerencias → Oportunidades:**
   - ✅ Keyword se pre-llena en `/opportunities`
   - ✅ Marketplaces se pre-seleccionan
   - ✅ Búsqueda se ejecuta automáticamente
   - ✅ Funciona sin romper búsqueda manual

4. **Manejo de Errores:**
   - ✅ Endpoint de credenciales falla → página sigue funcionando
   - ✅ Sin credenciales → muestra warnings pero permite continuar
   - ✅ Error en generación de sugerencias → muestra mensaje claro

## Limitaciones y Consideraciones

1. **Datos Requeridos:**
   - Las sugerencias basadas en tendencias requieren que haya oportunidades recientes
   - Si no hay datos, se generan sugerencias de fallback genéricas

2. **Performance:**
   - El análisis de tendencias procesa hasta 500 oportunidades recientes
   - Se cachean resultados cuando es posible
   - Timeouts en checks de APIs para evitar bloqueos

3. **Límites de Cálculo:**
   - Todos los cálculos de impacto tienen límites máximos razonables
   - Esto previene desbordamientos pero puede subestimar impactos reales muy grandes

4. **Compatibilidad:**
   - No se rompen funcionalidades existentes
   - El flujo manual de búsqueda sigue funcionando igual
   - Las sugerencias generales (no keywords) siguen funcionando

## Próximos Pasos (Opcional)

- [ ] Agregar cache de sugerencias de keywords (evitar regenerar constantemente)
- [ ] Agregar filtros por categoría/segmento en sugerencias
- [ ] Agregar notificaciones cuando se detectan nuevas tendencias
- [ ] Agregar dashboard de tendencias (visualización de keywords más populares)
- [ ] Agregar historial de sugerencias implementadas


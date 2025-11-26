# Optimizador de Tiempo de Publicación (Listing Lifetime Optimizer)

## 📋 Descripción General

El **Optimizador de Tiempo de Publicación** es un sistema inteligente que analiza el rendimiento de los listings publicados en marketplaces y determina el tiempo óptimo que deben permanecer activos. El sistema evalúa métricas como ventas, ganancias, ROI y capital bloqueado para tomar decisiones automatizadas o sugerencias manuales.

## 🎯 Objetivos

- **Maximizar ROI**: Identificar listings que no están generando suficiente retorno de inversión.
- **Optimizar capital**: Liberar capital bloqueado en listings sin ventas o de bajo rendimiento.
- **Mejorar rentabilidad**: Sugerir mejoras o acciones para listings que pueden optimizarse.
- **Automatización**: En modo automático, el sistema puede pausar o despublicar listings según reglas configuradas.

## 🔧 Componentes del Sistema

### 1. Servicio Principal (`listing-lifetime.service.ts`)

**Métodos principales:**

- `getConfig()`: Obtiene la configuración actual del optimizador.
- `setConfig(config)`: Actualiza la configuración del optimizador.
- `calculateMetrics(userId, listingId, marketplace)`: Calcula métricas de rendimiento de un listing.
- `evaluateListing(userId, listingId, marketplace)`: Evalúa un listing y retorna una decisión.
- `evaluateAllUserListings(userId)`: Evalúa todos los listings publicados de un usuario.
- `getProductDecision(userId, productId)`: Obtiene decisiones para todos los listings de un producto.

**Métricas calculadas:**

- `listingAgeDays`: Días desde la publicación.
- `totalSalesUnits`: Número total de ventas.
- `totalNetProfit`: Ganancia neta total.
- `avgDailyProfit`: Ganancia diaria promedio.
- `roiPercent`: Porcentaje de retorno de inversión.
- `stockTurnover`: Rotación de inventario (unidades/día).
- `capitalLocked`: Capital bloqueado en el listing.

**Decisiones posibles:**

- `KEEP`: Mantener el listing activo (rendimiento aceptable o excelente).
- `IMPROVE`: Mejorar el listing (ajustar precio, contenido, etc.).
- `PAUSE`: Pausar el listing temporalmente.
- `UNPUBLISH`: Despublicar el listing (sin ventas o bajo rendimiento).

### 2. API Endpoints (`/api/listing-lifetime`)

**Endpoints disponibles:**

- `GET /api/listing-lifetime/config` (Admin): Obtiene la configuración actual.
- `POST /api/listing-lifetime/config` (Admin): Actualiza la configuración.
- `GET /api/listing-lifetime/product/:productId`: Obtiene decisiones para un producto.
- `GET /api/listing-lifetime/listing/:listingId`: Obtiene decisión para un listing específico.
- `GET /api/listing-lifetime/evaluate-all`: Evalúa todos los listings del usuario.

### 3. Configuración (`SystemConfig`)

**Parámetros configurables:**

- `mode`: `'automatic'` | `'manual'` - Modo de operación.
- `minLearningDays`: Días mínimos de aprendizaje (default: 7).
- `maxLifetimeDaysDefault`: Tiempo máximo por defecto (default: 30 días).
- `minRoiPercent`: ROI mínimo aceptable (default: 10%).
- `minDailyProfitUsd`: Ganancia diaria mínima (default: $0.50).

### 4. Tareas Programadas (`scheduled-tasks.service.ts`)

**Job diario (3:00 AM):**

- Evalúa todos los listings publicados de todos los usuarios.
- En modo automático: Toma acciones (pausar/despublicar) según decisiones.
- En modo manual: Crea sugerencias IA para el usuario.
- Genera sugerencias de tipo `listing` en el dashboard.

### 5. Integración con Frontend

**Product Preview (`/products/:id/preview`):**

- Muestra recomendación de optimización si el producto está publicado.
- Indica modo (KEEP, IMPROVE, PAUSE, UNPUBLISH).
- Muestra razón y confianza de la decisión.
- Muestra métricas relevantes (ROI, ganancia diaria, etc.).

**Settings (`/settings`):**

- Permite a administradores configurar parámetros del optimizador.
- Muestra configuración actual y permite edición.
- Validación de rangos (minLearningDays: 1-30, maxLifetimeDaysDefault: 7-365, etc.).

**AI Suggestions (`/dashboard` → Sugerencias IA):**

- Las sugerencias de tipo `listing` aparecen automáticamente cuando se detecta un listing que necesita optimización.
- Prioridad: `high` para UNPUBLISH, `medium` para IMPROVE/PAUSE.
- Incluye pasos de acción y métricas actuales vs. objetivo.

## 🔄 Flujo de Funcionamiento

### Modo Manual (Default)

1. **Evaluación diaria (3:00 AM):**
   - El sistema evalúa todos los listings publicados.
   - Calcula métricas de rendimiento.
   - Genera decisiones (KEEP, IMPROVE, PAUSE, UNPUBLISH).

2. **Creación de sugerencias:**
   - Si la decisión es IMPROVE, PAUSE o UNPUBLISH, se crea una sugerencia IA.
   - La sugerencia aparece en el dashboard del usuario.
   - El usuario puede revisar y tomar acción manualmente.

3. **Visualización en Preview:**
   - Cuando el usuario abre la preview de un producto publicado, ve la recomendación.
   - Puede ver métricas y razón de la decisión.

### Modo Automático

1. **Evaluación diaria (3:00 AM):**
   - Similar al modo manual, pero con acciones automáticas.

2. **Acciones automáticas:**
   - Si `decision.mode === 'UNPUBLISH'` y `listingAgeDays >= recommendedMaxLifetime`:
     - Despublica el listing del marketplace (eBay: `endListing`, MercadoLibre: `closeListing`).
     - Marca el producto como `INACTIVE`.
   - Si `decision.mode === 'PAUSE'` y se cumple el tiempo máximo:
     - Pausa el listing (MercadoLibre: `pauseListing`).
     - Marca el producto como `INACTIVE`.

3. **Sugerencias para mejoras:**
   - Si `decision.mode === 'IMPROVE'`, se crea una sugerencia IA.
   - El usuario puede revisar y aplicar mejoras sugeridas.

## 📊 Lógica de Decisión

### Período de Aprendizaje

- Si `listingAgeDays < minLearningDays`:
  - Decisión: `KEEP`
  - Razón: "Período de aprendizaje activo"
  - Confianza: 0.7

### Sin Ventas

- Si `totalSalesUnits === 0` y `listingAgeDays < minLearningDays * 2`:
  - Decisión: `KEEP`
  - Razón: "Sin ventas aún, esperar más tiempo"
  - Confianza: 0.6

- Si `totalSalesUnits === 0` y `listingAgeDays >= minLearningDays * 2`:
  - Decisión: `UNPUBLISH`
  - Razón: "Sin ventas después del período de aprendizaje"
  - Confianza: 0.8

### Con Ventas pero Bajo Rendimiento

- Si `roiPercent < minRoiPercent`:
  - Decisión: `IMPROVE`
  - Razón: "ROI bajo, ajustar precio o contenido"
  - Confianza: 0.75

- Si `avgDailyProfit < minDailyProfitUsd`:
  - Decisión: `IMPROVE`
  - Razón: "Ganancia diaria baja, optimizar"
  - Confianza: 0.7

### Rendimiento Aceptable o Excelente

- Si `roiPercent >= minRoiPercent * 1.5` y `avgDailyProfit >= minDailyProfitUsd * 2`:
  - Decisión: `KEEP`
  - Razón: "Rendimiento excelente, mantener y extender"
  - Confianza: 0.9
  - `recommendedMaxLifetime`: Extendido automáticamente

- Si `roiPercent >= minRoiPercent` y `avgDailyProfit >= minDailyProfitUsd`:
  - Decisión: `KEEP`
  - Razón: "Rendimiento aceptable, mantener"
  - Confianza: 0.8

## 🧪 Testing

### Casos de Prueba Recomendados

1. **Listing nuevo (menos de 7 días):**
   - Debe retornar `KEEP` con razón de período de aprendizaje.

2. **Listing sin ventas (más de 14 días):**
   - Debe retornar `UNPUBLISH` con alta confianza.

3. **Listing con ROI bajo:**
   - Debe retornar `IMPROVE` con sugerencias de optimización.

4. **Listing con rendimiento excelente:**
   - Debe retornar `KEEP` con tiempo extendido.

5. **Modo automático:**
   - Verificar que se despublican listings según reglas.
   - Verificar que se crean sugerencias para mejoras.

### Verificación Manual

1. **Configurar modo manual:**
   - Settings → Optimización de Tiempo de Publicación → Modo: Manual
   - Guardar configuración.

2. **Publicar un producto:**
   - Importar producto → Publicar en marketplace.

3. **Esperar evaluación:**
   - El job diario evaluará el listing a las 3:00 AM.
   - O usar endpoint `/api/listing-lifetime/evaluate-all` para forzar evaluación.

4. **Ver sugerencias:**
   - Dashboard → Sugerencias IA → Filtrar por tipo "listing".

5. **Ver recomendación en preview:**
   - Products → Click en ojo → Ver preview.
   - Debe aparecer bloque "Optimización IA de Tiempo de Publicación".

## 📝 Notas Técnicas

### Integración con Marketplaces

- **eBay**: Usa `EbayService.endListing(itemId, reason)` para despublicar.
- **MercadoLibre**: Usa `MercadoLibreService.closeListing(itemId)` para despublicar y `pauseListing(itemId)` para pausar.
- **Amazon**: (Pendiente de implementación)

### Base de Datos

- Las métricas se calculan en tiempo real desde la tabla `Sale`.
- Las decisiones se almacenan temporalmente (no se persisten en BD).
- Las sugerencias IA se almacenan en `AISuggestion`.

### Performance

- El job diario procesa usuarios en serie para evitar saturación.
- Cada usuario se procesa con `Promise.all` para listings en paralelo.
- Timeouts y manejo de errores individuales por listing.

## 🚀 Próximas Mejoras

1. **Integración con APIs de marketplaces:**
   - Obtener `totalViews` y `totalClicks` desde APIs de eBay/MercadoLibre.
   - Mejorar precisión de decisiones con datos de tráfico.

2. **Configuración por marketplace:**
   - Permitir diferentes umbrales por marketplace (eBay vs. MercadoLibre).

3. **Notificaciones:**
   - Enviar notificaciones cuando se despublica un listing automáticamente.
   - Alertar sobre listings que necesitan atención.

4. **Dashboard de métricas:**
   - Gráficos de rendimiento de listings a lo largo del tiempo.
   - Comparación de listings similares.

5. **Machine Learning:**
   - Entrenar modelo para predecir tiempo óptimo basado en histórico.
   - Ajustar automáticamente umbrales según resultados.


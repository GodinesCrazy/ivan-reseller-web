# 📋 PLAN DE TRABAJO: CORRECCIÓN DE INCONSISTENCIAS

**Fecha:** 2025-11-20  
**Objetivo:** Corregir todas las inconsistencias detectadas sin romper funcionalidades existentes  
**Estrategia:** Correcciones incrementales con validación en cada paso

---

## 🎯 PRINCIPIOS DE CORRECCIÓN

1. **No romper funcionalidades existentes** - Validar después de cada cambio
2. **Correcciones incrementales** - Una corrección a la vez
3. **Backward compatibility** - Mantener compatibilidad con datos existentes
4. **Testing continuo** - Validar después de cada fase
5. **Rollback plan** - Cada cambio debe ser reversible

---

## 📊 FASES DE TRABAJO

### **FASE 1: CORRECCIONES CRÍTICAS DE MONEDAS** 🔴 Alta Prioridad

**Objetivo:** Corregir precisión decimal y redondeo de monedas

#### 1.1 Mejorar servicio FX con redondeo según moneda
- **Archivo:** `backend/src/services/fx.service.ts`
- **Cambios:**
  - Agregar función `roundCurrency(amount, currency)`
  - CLP/JPY/KRW/VND/IDR: redondear a enteros
  - Otras: redondear a 2 decimales
  - Actualizar `convert()` para usar redondeo
- **Validación:** Probar conversiones CLP→USD, EUR→CLP, etc.

#### 1.2 Corregir parseLocalizedNumber para monedas sin decimales
- **Archivo:** `backend/src/utils/currency.utils.ts`
- **Cambios:**
  - Mejorar lógica de redondeo para CLP/JPY
  - Asegurar que siempre redondee a enteros para estas monedas
- **Validación:** Probar parsing de "19.99 CLP" → 20

#### 1.3 Corregir formato de precios en opportunity-finder
- **Archivo:** `backend/src/services/opportunity-finder.service.ts`
- **Cambios:**
  - Función para formatear según moneda
  - CLP: 0 decimales, otras: 2 decimales
- **Validación:** Verificar formato en respuesta de oportunidades

---

### **FASE 2: ESTANDARIZAR CONVERSIONES DE MONEDA** 🟠 Alta Prioridad

**Objetivo:** Estandarizar uso de moneda base del usuario

#### 2.1 Estandarizar moneda base en servicios
- **Archivos:**
  - `backend/src/services/marketplace.service.ts`
  - `backend/src/services/fx.service.ts`
- **Cambios:**
  - Eliminar hardcodeados de `USD`
  - Usar siempre `baseCurrency` del usuario
  - Fallback a `USD` solo si no hay settings
- **Validación:** Probar con usuario con baseCurrency = CLP

#### 2.2 Mejorar validación de tasas faltantes
- **Archivo:** `backend/src/services/fx.service.ts`
- **Cambios:**
  - Lanzar error si falta tasa (no retornar `amount`)
  - Mejorar manejo de errores
  - Intentar refrescar tasas antes de fallar
- **Validación:** Probar con moneda sin tasa configurada

#### 2.3 Evitar conversiones dobles
- **Archivo:** `backend/src/services/opportunity-finder.service.ts`
- **Cambios:**
  - Validar si precio ya está en `baseCurrency`
  - No convertir si ya está en moneda correcta
- **Validación:** Verificar que no haya conversiones redundantes

---

### **FASE 3: CORREGIR CÁLCULOS DE UTILIDADES Y MÁRGENES** 🟡 Alta Prioridad

**Objetivo:** Asegurar que todos los cálculos usen misma moneda

#### 3.1 Sincronizar monedas en cálculo de utilidades
- **Archivo:** `backend/src/services/sale.service.ts`
- **Cambios:**
  - Asegurar que `salePrice` y `costPrice` estén en misma moneda
  - Convertir antes de calcular `grossProfit`
  - Validar monedas antes de cálculos
- **Validación:** Probar venta con precios en diferentes monedas

#### 3.2 Corregir cálculo de márgenes con redondeo
- **Archivo:** `backend/src/services/cost-calculator.service.ts`
- **Cambios:**
  - Redondear márgenes a 4 decimales (precisión suficiente)
  - Asegurar conversión de monedas antes de calcular
- **Validación:** Comparar márgenes antes/después

#### 3.3 Corregir cálculo de comisiones
- **Archivo:** `backend/src/services/sale.service.ts`
- **Cambios:**
  - Asegurar que `grossProfit` esté en moneda correcta
  - Comisiones siempre en misma moneda que ganancia
- **Validación:** Verificar comisiones calculadas correctamente

---

### **FASE 4: CORREGIR FLUJO DE ESTADOS DE PRODUCTOS** 🔴 Alta Prioridad

**Objetivo:** Asegurar flujo consistente PENDING → APPROVED → PUBLISHED

#### 4.1 Validar estado antes de publicar
- **Archivo:** `backend/src/services/marketplace.service.ts`
- **Cambios:**
  - Validar que estado sea `APPROVED` antes de publicar
  - Permitir `PENDING` solo si está en flujo de aprobación automática
- **Validación:** Intentar publicar producto en estado PENDING

#### 4.2 Corregir flujo de aprobación y publicación
- **Archivo:** `backend/src/api/routes/publisher.routes.ts`
- **Cambios:**
  - Separar aprobación de publicación
  - No cambiar a PUBLISHED si publicación falla
  - Manejar fallos parciales correctamente
- **Validación:** Probar aprobación sin publicación, publicación con fallos

#### 4.3 Mejorar manejo de fallos parciales
- **Archivo:** `backend/src/services/marketplace.service.ts`
- **Cambios:**
  - Si algunos marketplaces fallan, mantener estado apropiado
  - Rollback de `isPublished` si todos fallan
  - Registrar marketplaces exitosos/fallidos
- **Validación:** Publicar a 3 marketplaces donde 1 falla

---

### **FASE 5: MEJORAR VALIDACIONES DE PUBLICACIÓN** 🟠 Media Prioridad

**Objetivo:** Validaciones más robustas antes de publicar

#### 5.1 Validar precios antes de publicar
- **Archivo:** `backend/src/services/marketplace.service.ts`
- **Cambios:**
  - Validar que `price > aliexpressPrice`
  - Validar margen mínimo antes de permitir publicación
- **Validación:** Intentar publicar con precio menor al costo

#### 5.2 Validar imágenes antes de publicar
- **Archivo:** `backend/src/services/marketplace.service.ts`
- **Cambios:**
  - Validar que existan imágenes
  - Validar que URLs sean accesibles
- **Validación:** Intentar publicar sin imágenes

#### 5.3 Validar estado en autopilot
- **Archivo:** `backend/src/services/autopilot.service.ts`
- **Cambios:**
  - Manejar fallos de publicación correctamente
  - No dejar productos en estado inconsistente
- **Validación:** Probar autopilot con fallo de publicación

---

### **FASE 6: SINCRONIZAR isPublished Y status** 🟡 Media Prioridad

**Objetivo:** Asegurar que campos estén siempre sincronizados

#### 6.1 Crear función helper para sincronizar estado
- **Archivos:**
  - `backend/src/services/product.service.ts`
  - `backend/src/services/marketplace.service.ts`
- **Cambios:**
  - Función `updateProductStatusSafely(id, status, isPublished)`
  - Validar consistencia: PUBLISHED → isPublished=true
- **Validación:** Probar cambios de estado

#### 6.2 Actualizar lugares donde se cambia status
- **Archivos:**
  - `backend/src/services/marketplace.service.ts`
  - `backend/src/api/routes/publisher.routes.ts`
  - `backend/src/services/autopilot.service.ts`
- **Cambios:**
  - Usar función helper para cambiar estado
  - Asegurar sincronización siempre
- **Validación:** Verificar sincronización en todos los flujos

#### 6.3 Crear validación de consistencia
- **Archivo:** `backend/src/services/product.service.ts`
- **Cambios:**
  - Función para validar consistencia de estado
  - Usar en validaciones críticas
- **Validación:** Detectar productos con estado inconsistente

---

### **FASE 7: MEJORAS MENORES Y LIMPIEZA** 🟢 Baja Prioridad

**Objetivo:** Mejoras menores y optimizaciones

#### 7.1 Mejorar manejo de errores
- **Archivos:** Varios
- **Cambios:**
  - Errores más descriptivos
  - Mejor logging
- **Validación:** Verificar mensajes de error

#### 7.2 Actualizar tasas de semilla
- **Archivo:** `backend/src/services/fx.service.ts`
- **Cambios:**
  - Valores más recientes
- **Validación:** Comparar con tasas actuales

#### 7.3 Optimizaciones menores
- **Archivos:** Varios
- **Cambios:**
  - Eliminar código redundante
  - Mejorar comentarios
- **Validación:** Revisar código

---

### **FASE 8: AUDITORÍA FINAL** ✅ Crítica

**Objetivo:** Verificar que todo funciona correctamente

#### 8.1 Auditoría de monedas
- Verificar conversiones
- Verificar precisión decimal
- Verificar cálculos de utilidades

#### 8.2 Auditoría de estados
- Verificar flujo PENDING → APPROVED → PUBLISHED
- Verificar sincronización isPublished/status
- Verificar validaciones

#### 8.3 Auditoría de funcionalidades existentes
- Verificar scraping sigue funcionando
- Verificar publicación a marketplaces
- Verificar creación de ventas
- Verificar cálculo de comisiones

#### 8.4 Documentación
- Actualizar documentación
- Registrar cambios realizados

---

## 🚀 ORDEN DE EJECUCIÓN

1. **Fase 1** - Correcciones críticas de monedas
2. **Fase 2** - Estandarizar conversiones
3. **Fase 3** - Corregir cálculos de utilidades
4. **Fase 4** - Corregir flujo de estados
5. **Fase 5** - Mejorar validaciones
6. **Fase 6** - Sincronizar campos
7. **Fase 7** - Mejoras menores
8. **Fase 8** - Auditoría final

---

## ✅ CHECKLIST DE VALIDACIÓN POR FASE

### Después de cada fase:
- [ ] Código compila sin errores
- [ ] No hay errores de linting
- [ ] Funcionalidades existentes siguen funcionando
- [ ] Nuevas correcciones funcionan según esperado
- [ ] Tests básicos pasan (si existen)

### Validaciones específicas:
- [ ] Scraping sigue funcionando
- [ ] Conversiones de moneda correctas
- [ ] Precios formateados correctamente
- [ ] Estados de productos consistentes
- [ ] Publicación funciona correctamente
- [ ] Cálculos de utilidades correctos

---

## 📝 NOTAS

- **Backward compatibility:** Todas las correcciones deben mantener compatibilidad con datos existentes
- **Testing incremental:** Validar después de cada cambio importante
- **Rollback:** Cada cambio debe ser revisable y reversible
- **Documentación:** Actualizar comentarios y documentación según se avanza

---

**Plan creado:** 2025-11-20  
**Inicio de implementación:** Inmediato  
**Estimación:** 8 fases, validación continua


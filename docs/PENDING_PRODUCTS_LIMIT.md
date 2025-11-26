# Límite de Productos Pendientes

## Descripción

El sistema implementa un mecanismo de control para limitar la cantidad de productos que pueden estar en estado "pendiente de publicación" simultáneamente. Esto ayuda a controlar el uso de recursos del sistema y evitar la acumulación excesiva de productos sin publicar.

## Configuración

### Valor por Defecto
- **Límite predeterminado:** 100 productos pendientes
- **Rango válido:** 10 - 5000 productos
- **Configuración:** Solo administradores pueden modificar este valor

### Dónde Configurar

1. **Navegar a Settings:**
   - Ir a `/settings` en la aplicación
   - Pestaña "General"

2. **Sección "Límite de Productos Pendientes":**
   - Solo visible para usuarios con rol `ADMIN`
   - Muestra:
     - Contador actual: `X / Límite: Y`
     - Barra de progreso visual
     - Campo editable para cambiar el límite
     - Botón "Guardar Límite"

3. **Cambiar el Límite:**
   - Ingresar un valor entre 10 y 5000
   - Hacer clic en "Guardar Límite"
   - El nuevo valor se aplica inmediatamente a todos los flujos de creación de productos

## Comportamiento del Sistema

### ¿Qué se considera "Producto Pendiente"?

Un producto está en estado pendiente cuando:
- Tiene `status = 'PENDING'` en la base de datos
- Aún no ha sido publicado en ningún marketplace
- Está en la cola de aprobación del Intelligent Publisher (si aplica)

### Validación del Límite

El sistema valida el límite **antes** de crear cualquier producto nuevo que quede en estado pendiente:

1. **Cálculo de productos pendientes actuales:**
   - Cuenta todos los productos con `status = 'PENDING'`
   - Si el usuario es admin, cuenta todos los productos pendientes del sistema
   - Si el usuario no es admin, cuenta solo sus propios productos pendientes

2. **Comparación con el límite:**
   - Si `productos_pendientes >= límite`: **BLOQUEAR** la creación
   - Si `productos_pendientes < límite`: **PERMITIR** la creación

3. **Mensaje de error:**
   - Cuando se alcanza el límite, el sistema muestra:
     ```
     "Has alcanzado el límite de productos pendientes de publicación (X). 
     Publica o elimina algunos productos antes de agregar nuevos."
     ```
   - Código HTTP: `429 Too Many Requests`
   - Error code: `PENDING_PRODUCTS_LIMIT_EXCEEDED`

## Puntos de Aplicación

El límite se aplica en **todos** los flujos que crean productos pendientes:

### 1. Importación desde Oportunidades
- **Endpoint:** `POST /api/products`
- **Flujo:** Oportunidades → Importar → Crear Producto
- **Validación:** Antes de crear el producto en BD

### 2. Importación desde Intelligent Publisher
- **Endpoint:** `POST /api/publisher/add_for_approval`
- **Flujo:** Publisher → Agregar producto → Crear Producto
- **Validación:** Antes de crear el producto en BD

### 3. Scraping Jobs (Background)
- **Servicio:** `JobService.processScrapeJob()`
- **Flujo:** Job de scraping → Extraer datos → Crear Producto
- **Validación:** Antes de crear el producto en BD

### 4. Autopilot System
- **Servicio:** `AutopilotSystem.processOpportunity()`
- **Flujo:** Autopilot encuentra oportunidad → Crear Producto
- **Validación:** Antes de crear el producto en BD

### 5. Importación Manual desde AliExpress
- **Endpoint:** `POST /api/publisher/add_for_approval?scrape=true`
- **Flujo:** URL de AliExpress → Scraping → Crear Producto
- **Validación:** Antes de crear el producto en BD

## Implementación Técnica

### Backend

#### Servicio Principal
**Archivo:** `backend/src/services/pending-products-limit.service.ts`

**Métodos principales:**
- `getMaxPendingProducts()`: Obtiene el límite configurado (default: 100)
- `setMaxPendingProducts(limit)`: Configura el nuevo límite
- `countPendingProducts(userId?, isAdmin?)`: Cuenta productos pendientes
- `ensurePendingLimitNotExceeded(userId?, isAdmin?)`: Valida y lanza error si se excede
- `getLimitInfo(userId?, isAdmin?)`: Obtiene información completa del límite

#### Almacenamiento
- **Tabla:** `SystemConfig`
- **Key:** `max_pending_products`
- **Valor:** String (número como string)
- **Tipo:** Configuración global del sistema

#### Endpoints API
- `GET /api/settings/pending-products-limit`: Obtener límite y estado (solo admin)
- `POST /api/settings/pending-products-limit`: Configurar límite (solo admin)

### Frontend

#### Componente Settings
**Archivo:** `frontend/src/pages/Settings.tsx`

**Características:**
- Sección visible solo para admins
- Muestra contador actual y barra de progreso
- Campo editable para cambiar el límite
- Validación en frontend (10-5000)
- Actualización en tiempo real del contador

## Casos de Uso y Testing

### Caso 1: Límite por Defecto (100)

**Pasos:**
1. Configurar límite en 100 (o usar valor por defecto)
2. Verificar cuántos productos pendientes hay actualmente
3. Si hay < 100:
   - Importar productos hasta llegar al límite
   - Confirmar que todos se crean correctamente
4. Intentar importar UN producto más:
   - Debe bloquearse
   - Debe mostrar mensaje de límite alcanzado
   - No debe crearse ninguna fila extra en BD

**Resultado esperado:**
- ✅ Todos los productos hasta el límite se crean correctamente
- ✅ El producto 101 (o superior) es bloqueado
- ✅ Mensaje de error claro al usuario
- ✅ No hay errores en consola ni logs

### Caso 2: Cambio de Límite

**Pasos:**
1. Cambiar límite de 100 a 50 en Settings
2. Confirmar que el nuevo valor se guarda
3. Si ya hay más de 50 pendientes:
   - NO debe borrarse nada automáticamente
   - Solo debe evitar que se agreguen nuevos pendientes
4. Reducir productos pendientes (publicar o eliminar)
5. Una vez que haya < 50, intentar importar nuevo producto
6. Debe permitirse la creación

**Resultado esperado:**
- ✅ El nuevo límite se guarda correctamente
- ✅ Productos existentes no se modifican
- ✅ Solo se bloquean nuevos productos cuando se alcanza el límite
- ✅ Una vez reducido el número, se pueden crear nuevos productos

### Caso 3: Compatibilidad

**Verificar que:**
- ✅ La búsqueda de oportunidades sigue funcionando
- ✅ La importación funciona mientras no se supere el límite
- ✅ Intelligent Publisher funciona correctamente
- ✅ Autopilot sigue funcionando (respetando el límite)
- ✅ Los flujos de publicación a marketplaces no se han roto

## Restricciones y Consideraciones

### Restricciones
- **No afecta productos ya publicados:** El límite solo se aplica a productos pendientes
- **No afecta productos aprobados:** Solo productos con `status = 'PENDING'`
- **No borra productos existentes:** Si hay más productos pendientes que el límite, no se eliminan automáticamente
- **Solo bloquea nuevas creaciones:** El límite previene la creación de nuevos productos pendientes

### Consideraciones
- **Productos antiguos:** Si se reduce el límite y ya hay más productos pendientes que el nuevo límite, el usuario debe publicar o eliminar productos manualmente
- **Múltiples usuarios:** El límite es global del sistema, no por usuario (a menos que se modifique en el futuro)
- **Performance:** El conteo de productos pendientes se realiza en cada creación, pero es una consulta simple y rápida

## Troubleshooting

### Problema: El límite no se aplica
**Solución:**
1. Verificar que el servicio `PendingProductsLimitService` esté siendo llamado
2. Revisar logs del backend para errores en la validación
3. Confirmar que el producto se está creando con `status = 'PENDING'`

### Problema: El contador no se actualiza en Settings
**Solución:**
1. Verificar que el usuario tenga rol `ADMIN`
2. Revisar la consola del navegador para errores de API
3. Confirmar que el endpoint `/api/settings/pending-products-limit` responde correctamente

### Problema: Error 429 pero el límite no se alcanzó
**Solución:**
1. Verificar el valor actual en `SystemConfig` (key: `max_pending_products`)
2. Contar manualmente productos con `status = 'PENDING'` en BD
3. Revisar si hay productos pendientes de otros usuarios (si no es admin)

## Archivos Modificados

### Backend
- `backend/src/services/pending-products-limit.service.ts` (nuevo)
- `backend/src/services/product.service.ts` (modificado)
- `backend/src/api/routes/products.routes.ts` (modificado)
- `backend/src/api/routes/publisher.routes.ts` (modificado)
- `backend/src/services/job.service.ts` (modificado)
- `backend/src/services/autopilot.service.ts` (modificado)
- `backend/src/routes/settings.routes.ts` (modificado)

### Frontend
- `frontend/src/pages/Settings.tsx` (modificado)

### Documentación
- `docs/PENDING_PRODUCTS_LIMIT.md` (este archivo)

## Próximos Pasos (Opcional)

- [ ] Agregar límite por usuario (además del límite global)
- [ ] Agregar notificaciones cuando se acerca al límite (ej: 80%, 90%)
- [ ] Agregar dashboard con estadísticas de productos pendientes
- [ ] Agregar opción para publicar/eliminar productos pendientes en bulk desde Settings


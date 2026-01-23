# ????? Manual Admin/Operador - Ivan Reseller

**Versión:** 1.0.0  
**Última actualización:** 2025-01-23

---

## ?? Índice

1. [Acceso y Primeros Pasos](#acceso-y-primeros-pasos)
2. [Dashboard Operativo](#dashboard-operativo)
3. [Gestión de Productos](#gestión-de-productos)
4. [Búsqueda de Oportunidades](#búsqueda-de-oportunidades)
5. [Publicación en Marketplaces](#publicación-en-marketplaces)
6. [Gestión de Ventas](#gestión-de-ventas)
7. [Sistema Autopilot](#sistema-autopilot)
8. [Configuración de Workflow](#configuración-de-workflow)
9. [Alertas y Notificaciones](#alertas-y-notificaciones)

---

## ?? Acceso y Primeros Pasos

### Login

1. Navegar a: `https://ivanreseller.com`
2. Click en "Login"
3. Ingresar credenciales proporcionadas por el Owner
4. Click en "Iniciar Sesión"

### Configuración Inicial

**Primer paso:** Configurar APIs

1. Menu ? Settings ? API Keys
2. Configurar APIs críticas:
   - **AliExpress Affiliate API** (obligatorio)
   - **Marketplace APIs** (eBay, MercadoLibre, Amazon - al menos una)
   - **GROQ AI API** (recomendado para análisis)
3. Guardar credenciales

**Evidencia:** `frontend/src/pages/APISettings.tsx`

---

## ?? Dashboard Operativo

### Acceso

**Ruta:** `/dashboard`  
**Evidencia:** `frontend/src/pages/Dashboard.tsx`

### Métricas Mostradas

1. **Resumen de Productos**
   - Total de productos
   - Productos pendientes
   - Productos publicados
   - Productos inactivos

2. **Resumen de Ventas**
   - Ventas totales
   - Ventas del mes
   - Ganancias totales
   - Ganancias del mes

3. **Resumen Financiero**
   - Balance actual
   - Comisiones pendientes
   - Comisiones pagadas
   - Capital de trabajo disponible

4. **Actividad Reciente**
   - Últimas ventas
   - Productos publicados
   - Oportunidades encontradas

**Evidencia:** `backend/src/api/routes/dashboard.routes.ts`

---

## ??? Gestión de Productos

### Ver Productos

**Ruta:** `/products`  
**Endpoint:** `GET /api/products`  
**Evidencia:** `backend/src/api/routes/products.routes.ts`

**Filtros disponibles:**
- Por estado (PENDING, APPROVED, REJECTED, PUBLISHED, INACTIVE)
- Por marketplace
- Por fecha
- Por búsqueda de texto

### Crear Producto desde URL

**Ruta:** `/products` ? Botón "Add Product"  
**Endpoint:** `POST /api/products`  
**Evidencia:** `backend/src/api/routes/products.routes.ts:44`

**Proceso:**
1. Click en "Add Product"
2. Seleccionar "From AliExpress URL"
3. Pegar URL de AliExpress
4. Click en "Scrape"
5. Sistema extrae:
   - Título
   - Precio
   - Imágenes
   - Descripción
   - Especificaciones
6. Revisar y ajustar datos
7. Click en "Create Product"

**Evidencia:** `backend/src/services/product.service.ts`

### Crear Producto Manualmente

**Proceso:**
1. Click en "Add Product"
2. Seleccionar "Manual"
3. Completar formulario:
   - Título (requerido)
   - AliExpress URL (requerido)
   - Precio en AliExpress (requerido)
   - Precio sugerido de venta (requerido)
   - Descripción (opcional)
   - Categoría (opcional)
   - Imágenes (opcional)
4. Click en "Create Product"

**Evidencia:** `backend/src/api/routes/products.routes.ts:44`

### Editar Producto

**Endpoint:** `PUT /api/products/:id`  
**Evidencia:** `backend/src/api/routes/products.routes.ts:160`

**Campos editables:**
- Título
- Descripción
- Precio sugerido
- Categoría
- Estado

### Eliminar Producto

**Endpoint:** `DELETE /api/products/:id`  
**Evidencia:** `backend/src/api/routes/products.routes.ts:270`

**?? ADVERTENCIA:** Esto elimina el producto y todos sus datos relacionados.

---

## ?? Búsqueda de Oportunidades

### Acceso

**Ruta:** `/opportunities`  
**Evidencia:** `frontend/src/pages/Opportunities.tsx`

### Buscar Oportunidades

**Endpoint:** `GET /api/opportunities`  
**Evidencia:** `backend/src/api/routes/opportunities.routes.ts`

**Parámetros de búsqueda:**
- `query` - Término de búsqueda (ej: "wireless earbuds")
- `maxItems` - Máximo de resultados (1-10, default: 5)
- `marketplaces` - CSV: `ebay,amazon,mercadolibre`
- `region` - Región: `us,uk,mx,de,es,br`

**Proceso:**
1. Ir a `/opportunities`
2. Ingresar término de búsqueda
3. Seleccionar marketplaces
4. Seleccionar región
5. Click en "Search"
6. Sistema:
   - Scrapea AliExpress
   - Analiza competencia
   - Calcula ROI y margen
   - Muestra resultados ordenados por rentabilidad

**Evidencia:** `backend/src/services/opportunity-finder.service.ts`

### Análisis de Oportunidad

**Información mostrada:**
- Costo en AliExpress
- Precio sugerido
- Margen de ganancia
- ROI
- Nivel de competencia
- Demanda del mercado
- Score de confianza

**Evidencia:** `backend/src/services/ai-opportunity.service.ts`

### Crear Producto desde Oportunidad

1. Seleccionar oportunidad
2. Click en "Create Product"
3. Sistema pre-llena datos
4. Revisar y ajustar
5. Click en "Create"

---

## ?? Publicación en Marketplaces

### Publicar Producto

**Ruta:** `/products` ? Seleccionar producto ? "Publish"  
**Endpoint:** `POST /api/marketplace/publish`  
**Evidencia:** `backend/src/api/routes/marketplace.routes.ts`

**Proceso:**
1. Seleccionar producto
2. Click en "Publish"
3. Seleccionar marketplace(s):
   - eBay
   - MercadoLibre
   - Amazon
4. Revisar datos de publicación
5. Click en "Publish"
6. Sistema:
   - Optimiza título y descripción con IA
   - Publica en marketplace(s)
   - Crea registro de listing
   - Notifica resultado

**Evidencia:** `backend/src/services/marketplace.service.ts`

### Ver Listings Publicados

**Ruta:** `/products` ? Filtro "Published"  
**Endpoint:** `GET /api/marketplace/listings`  
**Evidencia:** `backend/src/api/routes/marketplace.routes.ts`

**Información mostrada:**
- Marketplace
- Listing ID
- URL del listing
- Fecha de publicación
- Estado

### Actualizar Listing

**Endpoint:** `PUT /api/marketplace/listings/:id`  
**Evidencia:** `backend/src/api/routes/marketplace.routes.ts`

**Acciones disponibles:**
- Actualizar precio
- Actualizar inventario
- Pausar listing
- Reanudar listing
- Eliminar listing

---

## ?? Gestión de Ventas

### Ver Ventas

**Ruta:** `/sales`  
**Endpoint:** `GET /api/sales`  
**Evidencia:** `backend/src/api/routes/sales.routes.ts`

**Filtros disponibles:**
- Por estado (PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED)
- Por marketplace
- Por fecha
- Por búsqueda de texto

### Detalles de Venta

**Información mostrada:**
- Order ID
- Producto vendido
- Precio de venta
- Costo en AliExpress
- Margen de ganancia
- Comisión
- Estado
- Tracking number
- Información del comprador

**Evidencia:** `backend/src/services/sale.service.ts`

### Procesar Venta

**Proceso automático (si está configurado):**
1. Sistema recibe webhook de venta
2. Crea registro de Sale
3. Calcula comisiones
4. Si `stagePurchase` = "automatic":
   - Valida capital disponible
   - Compra automática en AliExpress
   - Configura envío directo
   - Actualiza tracking

**Proceso manual:**
1. Ver venta en `/sales`
2. Click en "Process"
3. Si requiere compra:
   - Click en "Purchase from Supplier"
   - Sistema compra en AliExpress
   - Actualiza tracking

**Evidencia:** `backend/src/services/aliexpress-auto-purchase.service.ts`

### Actualizar Tracking

**Endpoint:** `PUT /api/sales/:id/tracking`  
**Evidencia:** `backend/src/api/routes/sales.routes.ts`

**Proceso:**
1. Seleccionar venta
2. Click en "Update Tracking"
3. Ingresar tracking number
4. Click en "Save"
5. Sistema actualiza estado a "SHIPPED"

---

## ?? Sistema Autopilot

### Acceso

**Ruta:** `/autopilot`  
**Evidencia:** `frontend/src/pages/Autopilot.tsx`

### Configurar Autopilot

**Endpoint:** `GET /api/autopilot/config`, `PUT /api/autopilot/config`  
**Evidencia:** `backend/src/api/routes/autopilot.routes.ts`

**Configuraciones:**
- **Habilitar/Deshabilitar** - Activar sistema autónomo
- **Frecuencia de búsqueda** - Cada X horas
- **Términos de búsqueda** - Lista de términos
- **Margen mínimo** - Margen requerido (default: 20%)
- **ROI mínimo** - ROI requerido (default: 50%)
- **Capital máximo** - Capital disponible para operaciones

**Evidencia:** `backend/src/services/autopilot.service.ts`

### Ver Actividad de Autopilot

**Información mostrada:**
- Oportunidades encontradas
- Productos publicados
- Ventas generadas
- Performance del sistema
- Reportes automáticos

---

## ?? Configuración de Workflow

### Acceso

**Ruta:** `/workflow-config`  
**Evidencia:** `frontend/src/pages/WorkflowConfig.tsx`

### Modos de Workflow

**Modos disponibles:**
- **Manual** - Requiere aprobación en cada paso
- **Automatic** - Ejecuta automáticamente
- **Hybrid** - Configuración por etapa

**Evidencia:** `backend/src/services/workflow-config.service.ts`

### Configurar por Etapa

**Etapas configurables:**
1. **SCRAPE** - Búsqueda de oportunidades
   - Manual / Automatic / Guided
2. **ANALYZE** - Análisis de rentabilidad
   - Manual / Automatic / Guided
3. **PUBLISH** - Publicación en marketplaces
   - Manual / Automatic / Guided
4. **PURCHASE** - Compra del proveedor
   - Manual / Automatic / Guided
5. **FULFILLMENT** - Gestión de envíos
   - Manual / Automatic / Guided
6. **CUSTOMER SERVICE** - Atención al cliente
   - Manual / Automatic / Guided

**Evidencia:** `backend/prisma/schema.prisma:219-246`

### Modo Guided

**Funcionamiento:**
- Sistema notifica cuando requiere acción
- Usuario tiene 5 minutos para responder
- Si no responde, acción se cancela
- Notificaciones vía WebSocket en tiempo real

**Evidencia:** `backend/src/services/workflow-executor.service.ts`

---

## ?? Alertas y Notificaciones

### Ver Notificaciones

**Ruta:** Centro de notificaciones (ícono de campana)  
**Endpoint:** `GET /api/notifications`  
**Evidencia:** `backend/src/api/routes/notifications.routes.ts`

**Tipos de notificaciones:**
- Nueva venta
- Producto publicado
- Oportunidad encontrada
- Acción guided requerida
- Error en proceso
- Alerta financiera

**Evidencia:** `backend/src/services/notification.service.ts`

### Configurar Alertas

**Ruta:** `/settings` ? "Notifications"  
**Endpoint:** `PUT /api/settings/notifications`  
**Evidencia:** `backend/src/routes/settings.routes.ts`

**Canales disponibles:**
- Email
- SMS (Twilio)
- Slack
- In-app (WebSocket)

---

**Próximos pasos:** Ver [Manual Soporte/Ventas](./05_manual_soporte.md) para funciones de atención al cliente.

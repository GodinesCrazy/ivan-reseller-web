# ??? Manual Viewer (Solo Lectura) - Ivan Reseller

**Versión:** 1.0.0  
**Última actualización:** 2025-01-23

---

## ?? Índice

1. [Acceso y Permisos](#acceso-y-permisos)
2. [Dashboard y Reportes](#dashboard-y-reportes)
3. [Visualización de Datos](#visualización-de-datos)
4. [Exportación de Reportes](#exportación-de-reportes)

---

## ?? Acceso y Permisos

### Rol Viewer

**Permisos:**
- ? Ver dashboard
- ? Ver reportes
- ? Ver productos (solo lectura)
- ? Ver ventas (solo lectura)
- ? Ver analytics
- ? No puede crear/editar/eliminar
- ? No puede publicar productos
- ? No puede procesar pedidos
- ? No puede modificar configuración

**Evidencia:** `backend/src/middleware/auth.middleware.ts`

---

## ?? Dashboard y Reportes

### Ver Dashboard

**Ruta:** `/dashboard`  
**Endpoint:** `GET /api/dashboard/stats`  
**Evidencia:** `backend/src/api/routes/dashboard.routes.ts`

**Información mostrada:**
- Resumen de productos
- Resumen de ventas
- Resumen financiero
- Gráficos de tendencias
- Actividad reciente

### Ver Reportes

**Ruta:** `/reports`  
**Endpoint:** `GET /api/reports/*`  
**Evidencia:** `backend/src/api/routes/reports.routes.ts`

**Tipos de reportes:**
- Executive Report
- Sales Report
- Products Report
- Marketplace Analytics

---

## ?? Visualización de Datos

### Ver Productos

**Ruta:** `/products`  
**Endpoint:** `GET /api/products`  
**Evidencia:** `backend/src/api/routes/products.routes.ts`

**Información visible:**
- Lista de productos
- Estado de productos
- Precios
- Marketplaces donde están publicados
- Estadísticas de ventas

**Limitaciones:**
- No se pueden editar
- No se pueden eliminar
- No se pueden publicar

### Ver Ventas

**Ruta:** `/sales`  
**Endpoint:** `GET /api/sales`  
**Evidencia:** `backend/src/api/routes/sales.routes.ts`

**Información visible:**
- Lista de ventas
- Estados de pedidos
- Tracking numbers
- Información del cliente
- Montos y comisiones

**Limitaciones:**
- No se pueden actualizar estados
- No se pueden procesar pedidos

---

## ?? Exportación de Reportes

### Exportar a Excel

**Proceso:**
1. Ir a `/reports`
2. Seleccionar tipo de reporte
3. Aplicar filtros
4. Click en "Export to Excel"
5. Descargar archivo .xlsx

**Evidencia:** `backend/src/services/reports.service.ts`

### Exportar a PDF

**Proceso:**
1. Ir a `/reports`
2. Seleccionar tipo de reporte
3. Aplicar filtros
4. Click en "Export to PDF"
5. Descargar archivo .pdf

**Evidencia:** `backend/src/services/reports.service.ts`

---

**Próximos pasos:** Ver [Guía de Configuración](./07_operacion_configuracion.md) para detalles técnicos.

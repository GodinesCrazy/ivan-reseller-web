# ?? Manual Soporte/Ventas - Ivan Reseller

**Versión:** 1.0.0  
**Última actualización:** 2025-01-23

---

## ?? Índice

1. [Acceso y Permisos](#acceso-y-permisos)
2. [Gestión de Pedidos](#gestión-de-pedidos)
3. [Tracking y Envíos](#tracking-y-envíos)
4. [Atención al Cliente](#atención-al-cliente)
5. [Devoluciones y Reembolsos](#devoluciones-y-reembolsos)
6. [Problemas Comunes](#problemas-comunes)

---

## ?? Acceso y Permisos

### Rol de Soporte

**Permisos:**
- ? Ver todas las ventas
- ? Actualizar estados de pedidos
- ? Gestionar tracking
- ? Responder a clientes
- ? Procesar devoluciones
- ? No puede crear productos
- ? No puede publicar en marketplaces
- ? No puede modificar configuración del sistema

**Evidencia:** `backend/src/middleware/auth.middleware.ts`

---

## ?? Gestión de Pedidos

### Ver Todos los Pedidos

**Ruta:** `/sales`  
**Endpoint:** `GET /api/sales`  
**Evidencia:** `backend/src/api/routes/sales.routes.ts`

**Información mostrada:**
- Order ID
- Producto
- Cliente (email, nombre)
- Precio de venta
- Estado actual
- Fecha de venta
- Marketplace

### Estados de Pedido

**Estados disponibles:**
- **PENDING** - Pendiente de procesamiento
- **PROCESSING** - En proceso de compra al proveedor
- **SHIPPED** - Enviado (con tracking)
- **DELIVERED** - Entregado
- **CANCELLED** - Cancelado
- **RETURNED** - Devuelto

**Evidencia:** `backend/prisma/schema.prisma:149`

### Actualizar Estado de Pedido

**Endpoint:** `PUT /api/sales/:id/status`  
**Evidencia:** `backend/src/api/routes/sales.routes.ts`

**Proceso:**
1. Seleccionar pedido
2. Click en "Update Status"
3. Seleccionar nuevo estado
4. Agregar notas (opcional)
5. Click en "Save"

---

## ?? Tracking y Envíos

### Agregar Tracking Number

**Endpoint:** `PUT /api/sales/:id/tracking`  
**Evidencia:** `backend/src/api/routes/sales.routes.ts`

**Proceso:**
1. Seleccionar pedido en estado "PROCESSING" o "SHIPPED"
2. Click en "Add Tracking"
3. Ingresar tracking number
4. Seleccionar carrier (opcional)
5. Click en "Save"
6. Sistema actualiza estado a "SHIPPED"

### Ver Historial de Tracking

**Información mostrada:**
- Tracking number
- Carrier
- Fecha de envío
- Estado actual
- Historial de actualizaciones

### Actualizar Tracking desde Marketplace

**Endpoint:** `POST /api/sales/:id/sync-tracking`  
**Evidencia:** `backend/src/api/routes/sales.routes.ts`

**Proceso:**
1. Seleccionar pedido
2. Click en "Sync from Marketplace"
3. Sistema obtiene tracking actualizado del marketplace
4. Actualiza información local

---

## ?? Atención al Cliente

### Ver Información del Cliente

**Información disponible:**
- Email del comprador
- Nombre del comprador
- Dirección de envío
- Historial de compras
- Pedidos activos

**Evidencia:** `backend/prisma/schema.prisma:155-157`

### Contactar Cliente

**Canales disponibles:**
- Email (desde marketplace)
- Mensaje interno (si marketplace lo permite)
- Notificación en marketplace

**Proceso:**
1. Seleccionar pedido
2. Click en "Contact Customer"
3. Seleccionar canal
4. Escribir mensaje
5. Enviar

### Plantillas de Mensajes

**Plantillas disponibles:**
- Confirmación de pedido
- Notificación de envío
- Tracking actualizado
- Retraso en envío
- Producto entregado

**Evidencia:** `backend/src/services/automated-business.service.ts`

---

## ?? Devoluciones y Reembolsos

### Procesar Devolución

**Endpoint:** `PUT /api/sales/:id/return`  
**Evidencia:** `backend/src/api/routes/sales.routes.ts`

**Proceso:**
1. Seleccionar pedido
2. Click en "Process Return"
3. Seleccionar razón de devolución
4. Agregar notas
5. Click en "Process"
6. Sistema:
   - Actualiza estado a "RETURNED"
   - Calcula reembolso
   - Notifica al cliente

### Procesar Reembolso

**Endpoint:** `POST /api/sales/:id/refund`  
**Evidencia:** `backend/src/services/paypal-payout.service.ts`

**Proceso:**
1. Seleccionar pedido devuelto
2. Click en "Process Refund"
3. Revisar monto de reembolso
4. Confirmar
5. Sistema procesa reembolso vía PayPal (si está configurado)

---

## ?? Problemas Comunes

### Pedido sin Tracking

**Solución:**
1. Verificar si proveedor ya envió
2. Contactar proveedor si es necesario
3. Agregar tracking cuando esté disponible
4. Notificar al cliente

### Pedido Retrasado

**Solución:**
1. Verificar estado con proveedor
2. Actualizar tracking
3. Notificar al cliente con explicación
4. Ofrecer compensación si es necesario

### Producto No Recibido

**Solución:**
1. Verificar tracking
2. Contactar carrier
3. Si está perdido:
   - Procesar reembolso o reenvío
   - Actualizar estado

### Cliente Insatisfecho

**Solución:**
1. Escuchar preocupación del cliente
2. Ofrecer solución (reembolso, reenvío, descuento)
3. Documentar en notas del pedido
4. Seguir up hasta resolución

---

**Próximos pasos:** Ver [Manual Viewer](./06_manual_viewer.md) para funciones de solo lectura.

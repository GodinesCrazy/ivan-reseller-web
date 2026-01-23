# ?? Manual Owner/SuperAdmin - Ivan Reseller

**Versión:** 1.0.0  
**Última actualización:** 2025-01-23

---

## ?? Índice

1. [Acceso y Autenticación](#acceso-y-autenticación)
2. [Dashboard Administrativo](#dashboard-administrativo)
3. [Gestión de Usuarios](#gestión-de-usuarios)
4. [Configuración Global del Sistema](#configuración-global-del-sistema)
5. [Gestión de Credenciales API](#gestión-de-credenciales-api)
6. [Monitoreo y Logs](#monitoreo-y-logs)
7. [Gestión de Comisiones](#gestión-de-comisiones)
8. [Reportes y Analytics](#reportes-y-analytics)
9. [Configuración Regional](#configuración-regional)
10. [Tareas Programadas (Jobs)](#tareas-programadas-jobs)

---

## ?? Acceso y Autenticación

### Credenciales Iniciales

**Usuario por defecto:**
- **Username:** `admin`
- **Email:** `admin@ivanreseller.com`
- **Password:** `admin123` (cambiar inmediatamente después del primer acceso)
- **Rol:** `ADMIN`

**Evidencia:** `backend/src/server.ts:188`, `backend/src/bootstrap/full-bootstrap.ts:54`

### Primer Acceso

1. Navegar a: `https://ivanreseller.com` (o URL de producción)
2. Click en "Login"
3. Ingresar credenciales:
   - Username: `admin`
   - Password: `admin123`
4. Click en "Iniciar Sesión"
5. **IMPORTANTE:** Cambiar contrase?a inmediatamente

### Cambiar Contrase?a

1. Menu ? Settings ? Cambiar Contrase?a
2. Ingresar contrase?a actual
3. Ingresar nueva contrase?a (mínimo 6 caracteres)
4. Confirmar nueva contrase?a
5. Click en "Guardar"

**Evidencia:** `backend/src/api/routes/auth.routes.ts`

---

## ?? Dashboard Administrativo

### Acceso

**Ruta:** `/admin`  
**Evidencia:** `frontend/src/pages/AdminPanel.tsx`

### Estadísticas Globales

El dashboard muestra:

1. **Resumen de Usuarios**
   - Total de usuarios
   - Usuarios activos
   - Usuarios inactivos
   - Nuevos usuarios (último mes)

2. **Resumen Financiero**
   - Ingresos totales
   - Comisiones mensuales
   - Comisiones pendientes
   - Balance total del sistema

3. **Actividad Reciente**
   - Últimas ventas
   - Productos publicados
   - Usuarios nuevos

**Evidencia:** `backend/src/api/routes/admin.routes.ts:29-38`

---

## ?? Gestión de Usuarios

### Ver Todos los Usuarios

**Ruta:** `/admin` ? Tab "Users"  
**Endpoint:** `GET /api/admin/users`  
**Evidencia:** `backend/src/api/routes/admin.routes.ts:29`

**Información mostrada:**
- ID, Username, Email
- Rol (ADMIN/USER)
- Estado (Activo/Inactivo)
- Estadísticas: Ventas, Productos, Comisiones
- Balance y ganancias totales
- Último login

### Crear Nuevo Usuario

**Ruta:** `/admin` ? Tab "Users" ? Botón "Create User"  
**Endpoint:** `POST /api/admin/users`  
**Evidencia:** `backend/src/api/routes/admin.routes.ts:76`

**Formulario:**
```
- Username: (requerido, 3-50 caracteres, único)
- Email: (requerido, válido, único)
- Password: (requerido, mínimo 6 caracteres)
- Full Name: (opcional)
- Role: ADMIN o USER (default: USER)
- Commission Rate: 0.00 a 1.00 (default: 0.20 = 20%)
- Fixed Monthly Cost: (default: 0.00 USD)
- Is Active: true/false (default: true)
```

**Proceso:**
1. Click en "Create User"
2. Completar formulario
3. Click en "Create"
4. Sistema crea automáticamente:
   - Cuenta de usuario
   - Configuración de workflow por defecto
   - Registro de actividad

**Evidencia:** `backend/src/api/routes/admin.routes.ts:76-150`

### Editar Usuario

**Endpoint:** `PUT /api/admin/users/:id`  
**Evidencia:** `backend/src/api/routes/admin.routes.ts`

**Campos editables:**
- Full Name
- Email
- Role (solo ADMIN puede cambiar)
- Commission Rate
- Fixed Monthly Cost
- Is Active (activar/desactivar)

**Proceso:**
1. Seleccionar usuario de la lista
2. Click en "Edit"
3. Modificar campos
4. Click en "Save"

### Eliminar Usuario

**Endpoint:** `DELETE /api/admin/users/:id`  
**Evidencia:** `backend/src/api/routes/admin.routes.ts`

**?? ADVERTENCIA:** Esta acción es **IRREVERSIBLE** y elimina:
- Usuario
- Todos sus productos
- Todas sus ventas
- Todas sus comisiones
- Todas sus credenciales API
- Todos sus datos relacionados

**Proceso:**
1. Seleccionar usuario
2. Click en "Delete"
3. Confirmar eliminación
4. Sistema elimina todos los datos relacionados

### Ver Estadísticas de Usuario

**Endpoint:** `GET /api/admin/users/:id/stats`  
**Evidencia:** `backend/src/api/routes/admin.routes.ts:60`

**Información mostrada:**
- Total de productos
- Total de ventas
- Ganancias totales
- Comisiones pagadas
- Balance actual
- Actividad reciente

---

## ?? Configuración Global del Sistema

### Variables de Entorno Críticas

**Ubicación:** Railway Dashboard ? Variables

**Variables obligatorias:**
- `JWT_SECRET` - Clave secreta para tokens (mínimo 32 caracteres)
- `DATABASE_URL` - URL de conexión PostgreSQL
- `NODE_ENV` - `production` en producción
- `PORT` - Puerto del servidor (Railway lo inyecta automáticamente)

**Variables opcionales pero recomendadas:**
- `REDIS_URL` - Para colas y cache
- `ENCRYPTION_KEY` - Para encriptación de credenciales (mínimo 32 caracteres)
- `CORS_ORIGIN` - Orígenes permitidos (separados por coma)

**Evidencia:** `backend/src/config/env.ts`

### Configuración desde UI

**Ruta:** `/settings` ? Tab "System"

**Configuraciones disponibles:**
- Moneda por defecto (USD, EUR, CLP, etc.)
- Idioma (Espa?ol, English)
- Zona horaria
- Tasa de comisión global
- Límites de capital de trabajo

**Evidencia:** `backend/src/routes/settings.routes.ts`

---

## ?? Gestión de Credenciales API

### Ver Credenciales de Todos los Usuarios

**Ruta:** `/admin` ? Tab "API Credentials"  
**Endpoint:** `GET /api/credentials` (con rol ADMIN)  
**Evidencia:** `backend/src/api/routes/api-credentials.routes.ts:569`

**Información mostrada:**
- Usuario propietario
- API Name (eBay, MercadoLibre, Amazon, etc.)
- Environment (sandbox/production)
- Scope (user/global)
- Estado (Active/Inactive)
- Última validación

**Nota:** Las credenciales están encriptadas. Solo se muestran metadatos.

### Configurar Credenciales Globales

**Ruta:** `/settings` ? "API Keys"  
**Endpoint:** `POST /api/credentials/:apiName` con `scope: "global"`  
**Evidencia:** `backend/src/api/routes/api-credentials.routes.ts:812`

**APIs que pueden ser globales:**
- AliExpress Affiliate API
- GROQ AI API
- ScraperAPI
- ZenRows
- 2Captcha
- Email (SMTP)
- Twilio (SMS)
- Slack

**Proceso:**
1. Ir a Settings ? API Keys
2. Seleccionar API
3. Configurar credenciales
4. Marcar "Global" (compartir con todos los usuarios)
5. Guardar

**Beneficio:** Los usuarios pueden usar APIs compartidas sin configurar sus propias credenciales.

---

## ?? Monitoreo y Logs

### Ver Logs del Sistema

**Ruta:** `/logs` (solo ADMIN)  
**Endpoint:** `GET /api/logs`  
**Evidencia:** `backend/src/api/routes/logs.routes.ts`

**Tipos de logs:**
- **Application** - Logs generales de la aplicación
- **Error** - Errores y excepciones
- **Auth** - Intentos de login, autenticación
- **API** - Llamadas a APIs externas
- **Job** - Trabajos en segundo plano
- **Security** - Eventos de seguridad

**Filtros disponibles:**
- Por tipo
- Por fecha
- Por nivel (info, warn, error)
- Por usuario

### Limpiar Logs

**Endpoint:** `POST /api/logs/clear` (solo ADMIN)  
**Evidencia:** `backend/src/api/routes/logs.routes.ts`

**?? ADVERTENCIA:** Esta acción elimina logs permanentemente.

---

## ?? Gestión de Comisiones

### Ver Comisiones de Admin

**Ruta:** `/admin` ? Tab "Commissions"  
**Endpoint:** `GET /api/admin/commissions`  
**Evidencia:** `backend/src/api/routes/admin-commissions.routes.ts`

**Información mostrada:**
- Comisiones pendientes
- Comisiones pagadas
- Total de comisiones
- Comisiones por usuario
- Historial de pagos

### Procesar Comisiones

**Endpoint:** `POST /api/admin/commissions/process`  
**Evidencia:** `backend/src/services/commission.service.ts`

**Proceso automático:**
- Las comisiones se procesan automáticamente cada día a las 2:00 AM
- El admin puede procesar manualmente desde el dashboard

**Evidencia:** `backend/src/services/scheduled-tasks.service.ts:101-111`

### Pagar Comisiones

**Endpoint:** `POST /api/admin/commissions/:id/pay`  
**Evidencia:** `backend/src/services/paypal-payout.service.ts`

**Integración con PayPal:**
- El sistema puede pagar comisiones automáticamente vía PayPal Payouts API
- Requiere configuración de credenciales PayPal

---

## ?? Reportes y Analytics

### Reportes Globales

**Ruta:** `/reports`  
**Endpoint:** `GET /api/reports/*`  
**Evidencia:** `backend/src/api/routes/reports.routes.ts`

**Tipos de reportes disponibles:**

1. **Executive Report**
   - Resumen ejecutivo del sistema
   - Métricas clave
   - Tendencias

2. **Sales Report**
   - Ventas por usuario
   - Ventas por marketplace
   - Ventas por período
   - Análisis de conversión

3. **Products Report**
   - Productos por usuario
   - Productos por estado
   - Performance de productos
   - Top productos

4. **Users Report**
   - Performance por usuario
   - Estadísticas individuales
   - Comparación de usuarios

5. **Marketplace Analytics**
   - Performance por marketplace
   - Análisis comparativo
   - Métricas agregadas

**Exportación:**
- Excel (.xlsx)
- PDF
- JSON

**Evidencia:** `backend/src/services/reports.service.ts`

---

## ?? Configuración Regional

### Acceso

**Ruta:** `/regional` (solo ADMIN)  
**Endpoint:** `GET /api/regional/*`  
**Evidencia:** `backend/src/api/routes/regional.routes.ts`

### Configuraciones Regionales

**Regiones soportadas:**
- US (Estados Unidos)
- UK (Reino Unido)
- MX (México)
- ES (Espa?a)
- BR (Brasil)
- CL (Chile)
- DE (Alemania)
- Y más...

**Configuraciones por región:**
- Moneda por defecto
- Impuestos (IVA, sales tax)
- Tasas de cambio
- Marketplaces disponibles
- Reglas de dropshipping

**Evidencia:** `backend/src/services/fx.service.ts`

---

## ? Tareas Programadas (Jobs)

### Ver Jobs

**Ruta:** `/jobs` (solo ADMIN)  
**Endpoint:** `GET /api/jobs`  
**Evidencia:** `backend/src/api/routes/jobs.routes.ts`

**Tipos de jobs:**
- Scraping jobs
- Publishing jobs
- Payout jobs
- Sync jobs

**Estados:**
- `waiting` - En cola
- `active` - En ejecución
- `completed` - Completado
- `failed` - Fallido
- `delayed` - Retrasado

### Tareas Programadas Automáticas

**Evidencia:** `backend/src/services/scheduled-tasks.service.ts`

**Tareas configuradas:**
1. **Financial Alerts** - 6:00 AM diario
   - Verifica balances bajos
   - Alertas de comisiones pendientes
   - Notificaciones financieras

2. **Commission Processing** - 2:00 AM diario
   - Procesa comisiones pendientes
   - Calcula pagos
   - Actualiza balances

3. **AliExpress Auth Health** - 4:00 AM diario
   - Verifica salud de autenticación AliExpress
   - Notifica si requiere intervención manual

4. **FX Rates Refresh** - 1:00 AM diario
   - Actualiza tasas de cambio
   - Sincroniza con proveedor FX

**Configuración:**
- Las tareas se ejecutan automáticamente
- Requieren Redis para funcionar
- Se pueden deshabilitar desde configuración

---

## ?? Seguridad y Auditoría

### Ver Actividad del Sistema

**Ruta:** `/admin` ? Tab "Activity"  
**Endpoint:** `GET /api/admin/activity`  
**Evidencia:** `backend/src/api/routes/admin.routes.ts`

**Información mostrada:**
- Logins recientes
- Acciones de usuarios
- Cambios en configuración
- Eventos de seguridad

### Backup del Sistema

**Endpoint:** `POST /api/admin/system/backup`  
**Evidencia:** `backend/src/api/routes/admin.routes.ts`

**Proceso:**
1. Click en "Create Backup"
2. Sistema genera backup de:
   - Base de datos (PostgreSQL dump)
   - Configuraciones
   - Logs importantes
3. Descargar backup

### Restaurar Backup

**Endpoint:** `POST /api/admin/system/restore`  
**Evidencia:** `backend/src/api/routes/admin.routes.ts`

**?? ADVERTENCIA:** Esta acción restaura el sistema a un estado anterior. Puede causar pérdida de datos.

---

## ?? Soporte y Troubleshooting

### Ver Estado del Sistema

**Ruta:** `/diagnostics`  
**Endpoint:** `GET /api/system/health`  
**Evidencia:** `backend/src/api/routes/system.routes.ts`

**Información mostrada:**
- Estado de base de datos
- Estado de Redis
- Estado de APIs externas
- Uso de recursos
- Versión del sistema

### Ver Errores Recientes

**Ruta:** `/logs` ? Filtro "Error"  
**Endpoint:** `GET /api/logs?type=error`  
**Evidencia:** `backend/src/api/routes/logs.routes.ts`

---

**Próximos pasos:** Ver [Manual Admin/Operador](./04_manual_admin.md) para funciones operativas.

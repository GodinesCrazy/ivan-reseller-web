# 👨‍💼 Guía de Administrador - Ivan Reseller

**Para Administradores del Sistema**

Esta guía explica cómo gestionar usuarios, comisiones, y monitorear el sistema como administrador.

**Última actualización:** 2025-01-27  
**Versión del Sistema:** 1.0  
**URL:** www.ivanreseller.com

---

## 🔐 Acceso de Administrador

### Crear Usuario Administrador

Si eres el primer administrador y necesitas crear tu cuenta:

**Opción 1: Desde la base de datos (inicial)**
```sql
-- Ejecutar en PostgreSQL
-- Primero, genera el hash bcrypt de tu contraseña (ver abajo)
INSERT INTO users (email, password, username, role, "isActive", "commissionRate", "fixedMonthlyCost", "createdAt", "updatedAt")
VALUES (
  'admin@ivanreseller.com',
  '$2b$10$...', -- Hash bcrypt de tu contraseña (ver cómo generarlo abajo)
  'admin',
  'ADMIN',
  true,
  0.20, -- 20% de comisión por defecto
  0.0,  -- Costo fijo mensual $0 para admin
  NOW(),
  NOW()
);
```

**Generar hash bcrypt:**
```javascript
// En Node.js
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('tu-contraseña-segura', 10);
console.log(hash);
```

**Opción 2: El sistema crea un admin automáticamente (si está configurado)**
- Al iniciar el sistema por primera vez, puede crear un admin automáticamente si las variables de entorno están configuradas
- Revisa los logs del backend al iniciar para ver si se creó automáticamente

**Opción 3: Desde el sistema (si ya hay un admin)**
- Un administrador existente puede crear nuevos usuarios (incluyendo otros admins) desde la interfaz
- Ve a **"Users"** → **"Create User"** → Selecciona rol **"ADMIN"**

### Privilegios de Administrador

Como administrador tienes acceso a:

- ✅ Crear y gestionar usuarios
- ✅ Ver todas las ventas y comisiones (no solo las tuyas)
- ✅ Ver todas las métricas del sistema
- ✅ Acceder a herramientas de mantenimiento
- ✅ Configurar parámetros globales

---

## 👥 Gestión de Usuarios

### Crear Nuevo Usuario

1. **Ve a "Users"** en el menú lateral (visible solo para admins)
2. **Haz clic en "Create User"** o **"Nuevo Usuario"**
3. **Completa el formulario:**
   - **Email:** `usuario@ejemplo.com` (debe ser único, se normaliza a minúsculas)
   - **Username:** `usuario_reseller` (debe ser único, mínimo 3 caracteres, máximo 50)
   - **Password:** `TempPass123!` (contraseña temporal segura, mínimo 8 caracteres)
   - **Full Name:** `Nombre Completo` (opcional)
   - **Role:** 
     - **USER** (usuario normal) - por defecto
     - **ADMIN** (administrador) - solo si necesitas crear otro admin
   - **Commission Rate:** `0.20` (20% de comisión sobre gross profit, por defecto 0.20)
   - **Fixed Monthly Cost:** `17.00` (costo fijo mensual en USD, por defecto 0.0)
   - **Is Active:** `true` (usuario activo, puede hacer login)
4. **Haz clic en "Create User"** o **"Crear Usuario"**
5. **El sistema:**
   - Valida que el email y username no existan
   - Hashea la contraseña con bcrypt
   - Crea el usuario en la base de datos
   - Crea automáticamente una `UserWorkflowConfig` con valores por defecto:
     - Environment: `sandbox`
     - Workflow Mode: `manual`
     - Todas las etapas en `manual`
     - Working Capital: `500` USD
   - Intenta enviar un email con las credenciales (si SMTP está configurado)
   - Registra la acción en logs (quién creó el usuario)
6. **Comparte con el usuario:**
   - **Email de acceso:** `usuario@ejemplo.com`
   - **Contraseña temporal:** `TempPass123!`
   - **URL del sistema:** `www.ivanreseller.com`
   - **Instrucciones:** "Debes cambiar tu contraseña en el primer login"

### Gestionar Usuarios Existentes

**Ver lista de usuarios:**
1. Ve a **"Admin" → "Users"**
2. Verás una tabla con todos los usuarios:
   - Email
   - Username
   - Rol
   - Estado (Activo/Inactivo)
   - Fecha de creación

**Editar usuario:**
1. Haz clic en el usuario que quieres editar
2. Puedes modificar:
   - Email
   - Username
   - Rol
   - Estado (activar/desactivar)

**Desactivar usuario:**
1. Edita el usuario
2. Cambia el estado a "Inactivo"
3. El usuario no podrá hacer login, pero sus datos se conservan

**Eliminar usuario (CUIDADO):**
- ⚠️ Esto eliminará todos los datos del usuario (productos, ventas, etc.)
- Solo hazlo si es absolutamente necesario
- Considera desactivar en lugar de eliminar

---

## 💰 Gestión de Comisiones

### Ver Comisiones Globales

1. **Ve a "Admin" → "Commissions"** o **"Comisiones"**
2. Verás todas las comisiones del sistema:
   - Por usuario
   - Estado: PENDING, SCHEDULED, PAID
   - Monto
   - Fecha de creación
   - Fecha programada de pago

### Estados de Comisiones

- **PENDING:** Comisión calculada, esperando programación de pago
- **SCHEDULED:** Programada para pago en una fecha específica
- **PAID:** Comisión pagada

### Programar Pago de Comisión

1. En la lista de comisiones, selecciona una comisión **PENDING**
2. Haz clic en **"Schedule Payment"** o **"Programar Pago"**
3. Selecciona la fecha de pago
4. La comisión pasará a estado **SCHEDULED**

### Pagar Comisión

**Pago Individual:**
1. Selecciona una comisión (PENDING o SCHEDULED)
2. Haz clic en **"Pay"** o **"Pagar"**
3. Confirma el pago
4. La comisión pasará a estado **PAID**

**Pago en Lote:**
1. Selecciona múltiples comisiones
2. Haz clic en **"Batch Pay"** o **"Pagar en Lote"**
3. Confirma el pago
4. Todas las comisiones seleccionadas pasarán a **PAID**

### Cálculo de Comisiones

Las comisiones se calculan automáticamente cuando se crea una venta:

**Fórmula:**
```
Gross Profit = Sale Price - AliExpress Cost - Marketplace Fee
Comisión = Gross Profit × Commission Rate
Net Profit (Usuario) = Gross Profit - Comisión
```

Donde:
- **Commission Rate:** Porcentaje configurado por usuario (por defecto: 20% = 0.20)
- **Fixed Monthly Cost:** Costo fijo mensual (se cobra independientemente de ventas)

**Ejemplo Real:**
- **Venta:** $50.00 USD
- **Costo AliExpress:** $25.00 USD
- **Marketplace Fee (12.5%):** $6.25 USD
- **Gross Profit:** $50.00 - $25.00 - $6.25 = **$18.75 USD**
- **Commission Rate:** 20% (0.20)
- **Comisión:** $18.75 × 0.20 = **$3.75 USD**
- **Net Profit (Usuario):** $18.75 - $3.75 = **$15.00 USD**

**Nota:** El Fixed Monthly Cost ($17.00) se cobra mensualmente independientemente de las ventas. No se incluye en el cálculo de comisiones por venta.

---

## 📊 Métricas del Sistema

### Dashboard de Administrador

Como administrador, verás métricas globales:

**Métricas de Usuarios:**
- Total de usuarios activos
- Nuevos usuarios este mes
- Usuarios inactivos

**Métricas de Productos:**
- Total de productos en el sistema
- Productos publicados
- Productos pendientes
- Tasa de aprobación

**Métricas de Ventas:**
- Total de ventas
- Ventas del mes
- Ganancias totales
- Ganancias del mes

**Métricas de Comisiones:**
- Comisiones totales
- Comisiones pendientes
- Comisiones pagadas
- Monto total pendiente

### Reportes Disponibles

**Reporte de Ventas:**
- Por usuario
- Por período
- Por marketplace
- Exportable a PDF/CSV

**Reporte de Comisiones:**
- Por usuario
- Por período
- Por estado
- Exportable a PDF/CSV

**Reporte de Usuarios:**
- Actividad por usuario
- Productos por usuario
- Ventas por usuario

---

## 🔍 Monitoreo del Sistema

### Logs del Sistema

**Ver logs del backend:**
1. Si tienes acceso a la consola del servidor
2. Los logs incluyen:
   - Errores de la aplicación
   - Ejecuciones de autopilot
   - Ejecuciones de workflows
   - Publicaciones a marketplaces
   - Validaciones de credenciales

**Secciones clave a monitorear:**

#### **Autopilot:**
- Ciclos completados exitosamente
- Errores en búsqueda de oportunidades
- Errores en publicaciones
- Uso de capital

#### **Workflows Personalizados:**
- Ejecuciones programadas
- Errores en ejecución
- Logs de cada workflow

#### **Publicaciones:**
- Éxitos y fallos por marketplace
- Errores de credenciales
- Tiempos de respuesta de APIs

#### **Autenticación:**
- Logins exitosos y fallidos
- Intentos de acceso no autorizados

### Herramientas de Mantenimiento

#### **Verificar Inconsistencias de Productos**

1. Ve a **"Admin" → "Maintenance"** (si está disponible)
2. O usa el endpoint: `GET /api/products/maintenance/inconsistencies`
3. Revisa las inconsistencias encontradas:
   - Productos con `status = PUBLISHED` pero `isPublished = false`
   - Productos con `status = APPROVED` pero `isPublished = true`
4. Si hay inconsistencias, puedes corregirlas:
   - Endpoint: `POST /api/products/maintenance/fix-inconsistencies`

#### **Verificar Estado de APIs**

1. Ve a **"Settings" → "API Settings"** (como admin)
2. Revisa el estado de todas las APIs del sistema
3. Identifica:
   - APIs con problemas
   - Credenciales expiradas
   - APIs no configuradas

### Alertas Importantes

Debes estar atento a:

- 🔴 **Errores críticos en logs:**
  - Errores de base de datos
  - Errores de encriptación
  - Errores de autenticación masivos

- ⚠️ **Problemas de credenciales:**
  - Múltiples usuarios con credenciales expiradas
  - Problemas con OAuth de eBay/ MercadoLibre

- 📊 **Métricas anormales:**
  - Caída drástica en publicaciones
  - Aumento de errores en workflows
  - Problemas de performance

---

## 🔒 Seguridad

### Verificar Seguridad Multi-Tenant

**Asegúrate de que:**
- Los usuarios solo ven sus propios datos
- Las consultas a la base de datos filtran por `userId`
- Los administradores pueden ver todos los datos cuando es necesario

**Revisar logs de seguridad:**
- Intentos de acceso no autorizados
- Accesos a datos de otros usuarios
- Cambios en roles de usuarios

### Credenciales Encriptadas

- Todas las credenciales de API se almacenan encriptadas (AES-256-GCM)
- La clave de encriptación está en `ENCRYPTION_KEY` en variables de entorno
- **NUNCA** expongas esta clave en logs o código

### Backup de Base de Datos

**Realiza backups periódicos:**
- Diarios para datos críticos
- Semanales completos
- Antes de migraciones importantes

---

## 🛠️ Tareas de Mantenimiento

### Tareas Diarias

- [ ] Revisar logs de errores
- [ ] Verificar estado de APIs críticas
- [ ] Revisar comisiones pendientes

### Tareas Semanales

- [ ] Revisar métricas globales
- [ ] Verificar usuarios inactivos
- [ ] Revisar inconsistencias de productos
- [ ] Backup de base de datos

### Tareas Mensuales

- [ ] Reporte de comisiones y pagos
- [ ] Revisar y limpiar logs antiguos
- [ ] Verificar espacio en disco
- [ ] Actualizar documentación si hay cambios

---

## 📞 Soporte a Usuarios

### Problemas Comunes de Usuarios

**"No puedo hacer login"**
- Verificar que el usuario esté activo
- Verificar que las credenciales sean correctas
- Revisar logs de autenticación

**"No puedo publicar productos"**
- Verificar credenciales de marketplace
- Verificar que el producto esté aprobado
- Revisar logs de publicación

**"El autopilot no funciona"**
- Verificar configuración de workflow
- Verificar credenciales de scraping
- Revisar logs de autopilot

### Escalar Problemas

Si un problema requiere atención técnica:

1. Documenta:
   - Usuario afectado
   - Pasos para reproducir
   - Logs relevantes
   - Mensajes de error

2. Revisa:
   - `INFORME_QA_COMPLETO_SISTEMA.md` para problemas conocidos
   - `BACKLOG_QA_ESTRUCTURADO.md` para estado de correcciones

3. Contacta al equipo técnico si es necesario

---

**Última actualización:** 2025-01-27


# 👨‍💼 Admin Guide - Ivan Reseller

**Guía completa para administradores del sistema**

**Última actualización:** 2025-03-04  
**Versión:** 1.1

---

## 🔐 Acceso de Administrador

### Crear Usuario Administrador

**Opción 1: Desde la base de datos (inicial)**

```sql
-- Generar hash bcrypt de la contraseña primero
INSERT INTO users (email, password, username, role, "isActive", "commissionRate", "fixedMonthlyCost", "createdAt", "updatedAt")
VALUES (
  'admin@ivanreseller.com',
  '$2b$10$...', -- Hash bcrypt (ver cómo generarlo abajo)
  'admin',
  'ADMIN',
  true,
  0.20, -- 20% de comisión por defecto
  0.0,  -- Costo fijo mensual $0
  NOW(),
  NOW()
);
```

**Generar hash bcrypt:**
```javascript
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('tu-contraseña-segura', 10);
console.log(hash);
```

**Opción 2: Desde la UI (si ya hay un admin)**

1. Login como admin existente
2. Ir a **Users**
3. Crear nuevo usuario
4. Seleccionar rol **ADMIN**

---

## 👥 Gestión de Usuarios

### Crear Usuario

1. Ir a **Users**
2. Hacer clic en **"Create User"**
3. Completar formulario:
   - Email
   - Username
   - Password
   - Full Name (opcional)
   - Role (USER o ADMIN)
   - Commission Rate (porcentaje, ej: 0.10 = 10%)
   - Fixed Monthly Cost (costo fijo mensual)
4. Guardar

### Editar Usuario

1. Ir a **Users**
2. Seleccionar usuario
3. Hacer clic en **Edit**
4. Modificar campos necesarios
5. Guardar

### Desactivar Usuario

1. Ir a **Users**
2. Seleccionar usuario
3. Cambiar **Is Active** a `false`
4. El usuario no podrá hacer login

---

## 🔑 Gestión de APIs Globales

Los administradores pueden configurar APIs con scope **global** que todos los usuarios pueden usar.

### Configurar API Global

1. Ir a **Settings → Configuración de APIs**
2. Seleccionar API
3. Configurar credenciales
4. Marcar como **Global** (scope: global)
5. Guardar

**Nota:** Las APIs globales son compartidas por todos los usuarios. Usar con precaución.

---

## 📊 Monitoreo del Sistema

### Dashboard de Admin

1. Ir a **Dashboard**
2. Ver métricas del sistema:
   - Total de usuarios
   - Total de productos
   - Total de ventas
   - Ingresos totales

### Logs del Sistema

1. Ir a **System Logs**
2. Filtrar por:
   - Nivel (error, warn, info, debug)
   - Usuario
   - Fecha
   - Tipo de acción
3. Revisar logs para diagnosticar problemas

### Health Checks

```bash
# Health básico
curl https://tu-backend.up.railway.app/health

# Health detallado
curl https://tu-backend.up.railway.app/api/system/health/detailed

# Business diagnostics (estado de Autopilot, Marketplace, Supplier, Payment, DB, Scheduler, Listings, Sales)
curl https://tu-backend.up.railway.app/api/system/business-diagnostics
```

El endpoint **business-diagnostics** devuelve OK/FAIL y conteos para cada componente. El Dashboard lo muestra en la sección "Estado del sistema".

---

## 💰 Configuración de Comisiones

### Comisiones por Usuario

1. Ir a **Users**
2. Seleccionar usuario
3. Editar **Commission Rate** y **Fixed Monthly Cost**
4. Guardar

### Comisiones Automáticas

Las comisiones se calculan automáticamente cuando hay una venta:
- **Comisión = (Precio de venta × Commission Rate) + Fixed Monthly Cost**

### Pagos de Comisiones

1. Ir a **Commissions**
2. Ver comisiones pendientes
3. Procesar pagos (si está configurado PayPal Payouts)

---

## 🔧 Configuración del Sistema

### Variables de Entorno

Las variables críticas se configuran en Railway (o en `.env` local):

- `JWT_SECRET` - Secret para JWT
- `ENCRYPTION_KEY` - Clave para cifrar credenciales
- `CORS_ORIGIN` - Orígenes permitidos
- `RATE_LIMIT_*` - Límites de rate limiting

**Ver:** [docs/DEPLOYMENT_RAILWAY.md](./DEPLOYMENT_RAILWAY.md)

### Feature Flags

- `ALLOW_BROWSER_AUTOMATION` - Permitir automatización con navegador
- `SCRAPER_BRIDGE_ENABLED` - Habilitar scraper bridge
- `ALIEXPRESS_DATA_SOURCE` - Fuente de datos (api/scraping/hybrid)
- `ALIEXPRESS_AUTH_MONITOR_ENABLED` - Monitoreo de autenticación AliExpress

---

## 🛡️ Seguridad

### Rotar Secretos

**JWT_SECRET:**
- Rotar cada 6-12 meses
- Generar nuevo secret
- Actualizar en Railway
- Redeploy backend
- **Nota:** Los usuarios deberán hacer login nuevamente

**ENCRYPTION_KEY:**
- **⚠️ CRÍTICO:** Si se pierde, no se pueden descifrar credenciales existentes
- Guardar en gestor de secretos seguro
- Rotar solo si es absolutamente necesario (requiere re-cifrar todas las credenciales)

### Revisar Accesos

1. Revisar usuarios activos periódicamente
2. Desactivar usuarios inactivos
3. Verificar que no haya usuarios con permisos excesivos

### Logs de Seguridad

Revisar logs para:
- Intentos de login fallidos
- Accesos no autorizados
- Cambios en configuración crítica

---

## 📈 Reportes y Analytics

### Reportes Ejecutivos

1. Ir a **Reports → Ejecutivo**
2. Ver KPIs del sistema:
   - Total de usuarios activos
   - Total de productos publicados
   - Total de ventas
   - Ingresos totales
   - Tendencias

### Reportes por Usuario

1. Ir a **Reports → Usuarios**
2. Ver rendimiento de cada usuario
3. Exportar reportes

---

## 🐛 Troubleshooting

### Problemas Comunes

**Ver:** [docs/TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

### Verificar Estado del Sistema

```bash
# Health check
curl https://tu-backend.up.railway.app/health

# CORS debug
curl -H "Origin: https://www.ivanreseller.com" \
     https://tu-backend.up.railway.app/api/cors-debug

# Configuración (sin secretos)
curl https://tu-backend.up.railway.app/api/system/config
```

### Revisar Logs

1. Ir a **System Logs**
2. Filtrar por nivel "error"
3. Revisar errores recientes
4. Diagnosticar y corregir

---

## 📚 Recursos Adicionales

- **Security Guide:** [docs/SECURITY.md](./SECURITY.md)
- **Deployment Guide:** [docs/DEPLOYMENT_RAILWAY.md](./DEPLOYMENT_RAILWAY.md)
- **Troubleshooting:** [docs/TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- **Architecture:** [docs/ARCHITECTURE.md](./ARCHITECTURE.md)

---

**Última actualización:** 2025-01-27


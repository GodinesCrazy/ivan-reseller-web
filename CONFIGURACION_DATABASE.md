# Configuración de PostgreSQL y DATABASE_URL

Este documento explica cómo configurar correctamente la base de datos PostgreSQL y la variable de entorno `DATABASE_URL` para el proyecto Ivan Reseller Web.

## Problema Resuelto

El sistema ha sido migrado de SQLite a PostgreSQL para mejor soporte en producción y Docker. Los errores de Prisma relacionados con `DATABASE_URL` vacía han sido resueltos.

## Configuración Local (Desarrollo)

### 1. Crear archivo .env en backend

Crea el archivo `backend/.env` con el siguiente contenido:

```env
# Base de datos PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ivan_reseller

# Otras variables necesarias
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key-change-in-production
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

### 2. Iniciar servicios con Docker Compose

```bash
# Iniciar PostgreSQL y Redis
docker compose up -d postgres redis

# Esperar a que PostgreSQL esté listo
docker compose ps

# Instalar dependencias del backend
cd backend
npm install

# Aplicar migraciones
npx prisma migrate deploy

# Iniciar backend en modo desarrollo
npm run dev
```

## Configuración con Docker Compose (Todo el stack)

El archivo `docker-compose.yml` ya incluye la configuración correcta:

```yaml
environment:
  DATABASE_URL: postgresql://postgres:postgres@postgres:5432/ivan_reseller
  REDIS_URL: redis://redis:6379
  JWT_SECRET: ${JWT_SECRET:-your-super-secret-jwt-key-change-in-production}
```

Para iniciar todo el sistema:

```bash
docker compose up -d
```

## Configuración en Producción

### Variables de Entorno Requeridas

Asegúrate de configurar las siguientes variables en tu plataforma de deployment (Railway, Vercel, etc.):

1. **DATABASE_URL**: URL de conexión a PostgreSQL
   - Formato: `postgresql://usuario:password@host:puerto/nombre_db`
   - Ejemplo: `postgresql://postgres:mypassword@postgres.railway.internal:5432/railway`

2. **REDIS_URL**: URL de conexión a Redis
   - Formato: `redis://host:puerto`
   - Ejemplo: `redis://redis.railway.internal:6379`

3. **JWT_SECRET**: Clave secreta para tokens JWT (mínimo 32 caracteres)

4. **NODE_ENV**: `production`

### Railway

Railway genera automáticamente `DATABASE_URL` cuando agregas un servicio de PostgreSQL. No necesitas configurarla manualmente.

### Vercel / Otras Plataformas

1. Crea una base de datos PostgreSQL (puede ser externa como ElephantSQL, Neon, etc.)
2. Obtén la URL de conexión
3. Configura `DATABASE_URL` en las variables de entorno

## Verificar Configuración

### Validar esquema Prisma

```bash
cd backend
npx prisma validate
```

### Verificar migración

```bash
cd backend
npx prisma migrate status
```

### Probar conexión a la base de datos

```bash
cd backend
npx prisma db pull
```

## Cambios Realizados

1. ✅ Actualizado `backend/prisma/schema.prisma`: Cambiado de SQLite a PostgreSQL
2. ✅ Creado archivo `backend/.env` con DATABASE_URL correcta
3. ✅ Eliminados archivos de SQLite (dev.db, migraciones antiguas)
4. ✅ Creada nueva migración PostgreSQL: `20251104180217_init`
5. ✅ Respaldado esquema SQLite anterior como `schema_sqlite.prisma`

## Solución de Problemas

### Error: "You must provide a nonempty URL"

**Causa**: La variable `DATABASE_URL` no está definida o está vacía.

**Solución**:
1. Verifica que el archivo `backend/.env` exista
2. Asegúrate de que contenga `DATABASE_URL=postgresql://...`
3. Reinicia el proceso/contenedor

### Error: "Can't reach database server"

**Causa**: PostgreSQL no está corriendo o no es accesible.

**Solución**:
```bash
# Verificar que PostgreSQL esté corriendo
docker compose ps postgres

# Ver logs de PostgreSQL
docker compose logs postgres

# Reiniciar PostgreSQL
docker compose restart postgres
```

### Error: "Database does not exist"

**Causa**: La base de datos no ha sido creada.

**Solución**:
```bash
# Aplicar migraciones
cd backend
npx prisma migrate deploy
```

## Notas Importantes

### Tipos de Datos para Valores Monetarios

⚠️ **Nota**: El esquema actual utiliza `Float` (DOUBLE PRECISION en PostgreSQL) para valores monetarios. Para aplicaciones financieras que requieren precisión exacta, considera migrar a `Decimal` en el futuro para evitar problemas de redondeo de punto flotante.

Campos afectados:
- `commissionRate`, `fixedMonthlyCost`, `balance`, `totalEarnings` en tabla `users`
- `aliexpressPrice`, `suggestedPrice`, `finalPrice` en tabla `products`
- `salePrice`, `aliexpressCost`, `marketplaceFee`, `grossProfit`, `commissionAmount`, `netProfit` en tabla `sales`
- `amount` en tabla `commissions`


## Estructura de la Base de Datos

El sistema utiliza las siguientes tablas:

- `users`: Usuarios del sistema
- `api_credentials`: Credenciales de APIs (eBay, MercadoLibre, Amazon, etc.)
- `products`: Productos importados de AliExpress
- `sales`: Ventas realizadas
- `commissions`: Comisiones generadas
- `activities`: Registro de actividad del sistema

Todas las tablas incluyen timestamps automáticos (`createdAt`, `updatedAt`) y relaciones con foreign keys configuradas con `CASCADE DELETE`.

## Recursos Adicionales

- [Prisma Documentation](https://www.prisma.io/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)

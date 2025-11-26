# Configuración de Base de Datos - Sala de Reuniones

## ✅ Estado Actual

La migración de Prisma está **marcada como aplicada** en el sistema de migraciones, pero necesitas verificar que la tabla realmente existe en tu base de datos PostgreSQL.

## 🔍 Verificación

### Opción 1: Verificar desde Prisma Studio (Recomendado)

```bash
cd backend
npx prisma studio
```

Busca la tabla `meeting_rooms` en la lista. Si existe, todo está correcto.

### Opción 2: Verificar desde PostgreSQL directamente

Conecta a tu base de datos y ejecuta:

```sql
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'meeting_rooms';
```

Si retorna una fila, la tabla existe.

## 📝 Si la Tabla NO Existe

### Para Railway (Producción)

La migración debería ejecutarse automáticamente al hacer deploy, pero si no se ejecutó:

1. **Opción A: Ejecutar migración automáticamente**
   ```bash
   railway run npx prisma migrate deploy
   ```

2. **Opción B: Ejecutar SQL manualmente**
   - Ve a Railway Dashboard → Postgres → Query
   - Copia y pega el contenido de `backend/prisma/migrations/20250127130000_add_meeting_room/migration.sql`
   - Ejecuta el SQL

### Para Desarrollo Local

```bash
cd backend
npx prisma db push
```

O ejecuta el SQL manualmente en tu base de datos local.

## 🔑 Claves y Restricciones Incluidas

La migración SQL **ya incluye todas las claves necesarias**:

### Primary Key
- `meeting_rooms_pkey` en `id`

### Unique Index
- `meeting_rooms_roomId_key` en `roomId` (garantiza IDs únicos)

### Foreign Keys
- `meeting_rooms_userId_fkey`: `userId` → `users.id` (CASCADE)
- `meeting_rooms_adminId_fkey`: `adminId` → `users.id` (SET NULL)

### Índices para Optimización
- `meeting_rooms_userId_status_idx`: Búsqueda por usuario y estado
- `meeting_rooms_adminId_status_idx`: Búsqueda por admin y estado
- `meeting_rooms_status_idx`: Búsqueda por estado
- `meeting_rooms_roomId_idx`: Búsqueda por roomId

## ✅ No Necesitas Crear Nada Manualmente

**Todo está incluido en el SQL de la migración.** Solo necesitas ejecutarlo si la tabla no existe.

## 🚀 Verificación Final

Una vez ejecutada la migración, verifica que:

1. ✅ La tabla `meeting_rooms` existe
2. ✅ Tiene todas las columnas correctas
3. ✅ Los índices están creados
4. ✅ Las foreign keys están configuradas

Puedes usar el script de verificación:

```bash
npx tsx backend/scripts/verify-meeting-room-table.ts
```

(Requiere DATABASE_URL configurada)

## 📋 Resumen

- **Migración SQL**: ✅ Creada y lista
- **Claves incluidas**: ✅ Todas las claves están en el SQL
- **Estado**: ⚠️ Necesitas verificar/ejecutar en tu base de datos
- **Acción requerida**: Ejecutar el SQL si la tabla no existe


# Sistema de Planes de Usuario - Solo ADMIN puede configurar

## Resumen
Se implementó un sistema donde **solo el ADMIN puede configurar el plan de los usuarios**, y el plan determina los límites de rate limiting.

## Cambios Implementados

### 1. Base de Datos (Prisma Schema)
- ✅ Agregado campo `plan` a la tabla `User` con valor por defecto `"FREE"`
- ✅ Planes disponibles: `FREE`, `BASIC`, `PRO`, `ENTERPRISE`, `ADMIN`

### 2. Rate Limiting Mejorado
- ✅ La función `getUserPlan()` ahora consulta el campo `plan` de la base de datos
- ✅ Si el usuario tiene `plan` en BD, se usa ese plan
- ✅ Si no tiene plan pero es `ADMIN`, se asigna plan `ADMIN`
- ✅ Por defecto, todos los usuarios tienen plan `FREE`
- ✅ Cache de 5 minutos para evitar consultas repetidas

### 3. Endpoint de Actualización
- ✅ `PUT /api/users/:id` - Solo ADMIN puede modificar el campo `plan`
- ✅ Validación: Si un usuario no-ADMIN intenta cambiar el plan, recibe error 403
- ✅ Mensaje: "Solo los administradores pueden modificar el plan de los usuarios"

### 4. Servicio de Usuario
- ✅ `updateUser()` ahora acepta y actualiza el campo `plan`
- ✅ Todos los métodos de consulta incluyen el campo `plan` en los resultados

## Límites por Plan

```typescript
FREE: 50 requests/15min
BASIC: 200 requests/15min  
PRO: 500 requests/15min
ENTERPRISE: 2000 requests/15min
ADMIN: 10000 requests/15min
```

## Cómo Usar

### Para el ADMIN:
1. Actualizar plan de un usuario:
```http
PUT /api/users/:userId
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "plan": "PRO"
}
```

### Para Usuarios:
- Los usuarios NO pueden modificar su propio plan
- Si intentan hacerlo, recibirán error 403

## Próximos Pasos

1. **Ejecutar migración de Prisma:**
```bash
cd backend
npx prisma migrate dev --name add_user_plan_field
```

2. **Regenerar Prisma Client:**
```bash
npx prisma generate
```

3. **Opcional: Agregar UI en frontend** para que el ADMIN pueda cambiar planes desde la interfaz

## Archivos Modificados

- `backend/prisma/schema.prisma` - Campo `plan` agregado
- `backend/src/middleware/rate-limit.middleware.ts` - Usa campo `plan` de BD
- `backend/src/api/routes/users.routes.ts` - Validación solo ADMIN puede cambiar plan
- `backend/src/services/user.service.ts` - Soporte para campo `plan`


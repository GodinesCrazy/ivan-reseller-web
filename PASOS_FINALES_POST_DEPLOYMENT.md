# 🚀 PASOS FINALES POST-DEPLOYMENT

**Fecha:** 2025-11-13  
**Estado:** ✅ Código desplegado en GitHub y producción

---

## ✅ ESTADO ACTUAL

- ✅ Código actualizado en GitHub
- ✅ Aplicación web desplegada
- ✅ Mejoras críticas implementadas

---

## 🔧 PASOS CRÍTICOS A EJECUTAR

### 1. Ejecutar Migración en Producción

**IMPORTANTE:** La migración debe ejecutarse en Railway para crear las nuevas tablas.

**Opción A: Automática (Recomendada)**
- Railway ejecutará automáticamente `npm run start:with-migrations`
- Esto ejecutará `npx prisma migrate deploy` al iniciar

**Opción B: Manual**
Si necesitas ejecutarla manualmente:

```bash
# En Railway, ejecutar en el servicio backend:
npx prisma migrate deploy
```

**Verificar:**
- Las tablas `refresh_tokens` y `password_reset_tokens` deben existir
- Verificar en Railway → Postgres → Data o usar Prisma Studio

---

### 2. Regenerar Prisma Client

**IMPORTANTE:** El Prisma Client debe regenerarse para incluir los nuevos modelos.

**En Railway:**
- El `postinstall` script debería ejecutarse automáticamente
- Si no, ejecutar manualmente: `npx prisma generate`

**Verificar:**
- El código debe poder usar `prisma.refreshToken` y `prisma.passwordResetToken`
- Si hay errores de TypeScript, regenerar el client

---

### 3. Verificar Variables de Entorno

Asegúrate de que estas variables estén configuradas en Railway:

```env
JWT_SECRET=<tu-secret>
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=30d
REDIS_URL=<tu-redis-url>  # Opcional pero recomendado para blacklist
```

---

## 🧪 PRUEBAS POST-DEPLOYMENT

### 1. Probar Login (debe generar refresh token)

```bash
POST /api/auth/login
{
  "username": "admin",
  "password": "admin123"
}

# Debe retornar:
# - Cookie: token (access token)
# - Cookie: refreshToken (refresh token)
# - user data
```

### 2. Probar Refresh Token

```bash
POST /api/auth/refresh
# Debe usar refreshToken de la cookie

# Debe retornar:
# - Nuevo token en cookie
# - Nuevo refreshToken en cookie
```

### 3. Probar Forgot Password

```bash
POST /api/auth/forgot-password
{
  "email": "admin@ivanreseller.com"
}

# Debe retornar éxito (aunque el email no se envíe aún)
```

### 4. Probar Reset Password

```bash
# Primero obtener token de forgot-password (revisar logs o BD)
POST /api/auth/reset-password
{
  "token": "<token-del-email>",
  "newPassword": "NuevaPassword123!"
}

# Debe retornar éxito y revocar todos los refresh tokens
```

### 5. Probar Logout (debe blacklistear tokens)

```bash
POST /api/auth/logout
# Con token en cookie

# Debe:
# - Revocar refresh token
# - Blacklistear access token
# - Limpiar cookies
```

---

## 🔍 VERIFICACIONES

### Base de Datos

1. **Verificar tablas creadas:**
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('refresh_tokens', 'password_reset_tokens');
   ```

2. **Verificar índices:**
   ```sql
   SELECT indexname 
   FROM pg_indexes 
   WHERE tablename IN ('refresh_tokens', 'password_reset_tokens');
   ```

### Redis (si está configurado)

1. **Verificar conexión:**
   ```bash
   # En Railway, verificar logs
   # Debe mostrar: "✅ Redis connected"
   ```

2. **Probar blacklist:**
   - Hacer login
   - Hacer logout
   - Intentar usar el token anterior (debe fallar)

---

## ⚠️ PROBLEMAS COMUNES

### Error: "Table 'refresh_tokens' does not exist"

**Solución:**
1. Verificar que la migración se ejecutó
2. Ejecutar manualmente: `npx prisma migrate deploy`
3. Verificar que el archivo de migración existe

### Error: "Cannot find module '@prisma/client'"

**Solución:**
1. Ejecutar: `npx prisma generate`
2. Verificar que `postinstall` script está en package.json
3. Reinstalar dependencias si es necesario

### Error: "Refresh token not found"

**Solución:**
1. Verificar que el refresh token se guardó en BD
2. Verificar que no está revocado
3. Verificar que no expiró

### Error: "Token has been revoked"

**Solución:**
- Esto es correcto si el token fue revocado (logout)
- Verificar que el blacklist funciona correctamente

---

## 📊 MONITOREO

### Logs a Revisar

1. **Login exitoso:**
   ```
   Login successful { userId: X, username: '...' }
   Refresh token generated { userId: X }
   ```

2. **Refresh exitoso:**
   ```
   Access token refreshed { userId: X }
   ```

3. **Logout exitoso:**
   ```
   Refresh token revoked { userId: X }
   ```

4. **Reset password:**
   ```
   Password reset token generated { userId: X, email: '...' }
   Password reset successful { userId: X }
   ```

---

## 🎯 CHECKLIST FINAL

- [ ] Migración ejecutada en producción
- [ ] Prisma Client regenerado
- [ ] Variables de entorno configuradas
- [ ] Login genera refresh token
- [ ] Refresh token funciona
- [ ] Forgot password funciona
- [ ] Reset password funciona
- [ ] Logout blacklistea tokens
- [ ] Redis conectado (si aplica)
- [ ] Logs sin errores críticos

---

## 🚀 PRÓXIMOS PASOS

Una vez verificadas todas las funcionalidades:

1. **Monitorear uso:**
   - Revisar logs de refresh tokens
   - Verificar que blacklist funciona
   - Monitorear errores

2. **Mejoras futuras:**
   - Implementar envío de emails para reset password
   - Reemplazar console.log con logger
   - Limpiar TODOs críticos
   - Implementar CSP

3. **Documentación:**
   - Actualizar documentación de API
   - Documentar nuevos endpoints
   - Crear guía de uso para usuarios

---

## ✅ CONCLUSIÓN

Si todos los pasos están completados y las pruebas pasan, el sistema está **100% listo para producción**.

**Estado:** 🟢 **LISTO PARA LANZAMIENTO PÚBLICO**

---

*Documento generado el 2025-11-13*


# 🔧 Troubleshooting Guide - Ivan Reseller

**Guía de solución de problemas comunes**

**Última actualización:** 2025-01-27  
**Versión:** 1.0

---

## 📋 Índice

1. [Problemas de CORS](#problemas-de-cors)
2. [Errores de Autenticación](#errores-de-autenticación)
3. [Problemas de Base de Datos](#problemas-de-base-de-datos)
4. [Errores de Red](#errores-de-red)
5. [Problemas con APIs](#problemas-con-apis)
6. [Problemas de Build](#problemas-de-build)
7. [Scripts de Verificación](#scripts-de-verificación)

---

## 🌐 Problemas de CORS

### Síntoma: "No 'Access-Control-Allow-Origin' header is present"

**Causa común:** El backend no está configurado para permitir el origen del frontend.

**Solución:**

1. **Verificar configuración en Railway:**
   ```env
   CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
   ```
   ⚠️ **IMPORTANTE:** El valor NO debe incluir el prefijo "CORS_ORIGIN="
   - ✅ Correcto: `https://www.ivanreseller.com,https://ivanreseller.com`
   - ❌ Incorrecto: `CORS_ORIGIN=https://www.ivanreseller.com`

2. **Verificar con endpoint de debug:**
   ```bash
   curl -H "Origin: https://www.ivanreseller.com" \
        https://tu-backend.up.railway.app/api/cors-debug
   ```
   Debe retornar `"matched": true`

3. **Verificar preflight OPTIONS:**
   ```bash
   curl -X OPTIONS \
        -H "Origin: https://www.ivanreseller.com" \
        -H "Access-Control-Request-Method: GET" \
        https://tu-backend.up.railway.app/api/dashboard/stats
   ```
   Debe retornar `204 No Content` con headers CORS correctos

**Documentación completa:** Ver [docs/CORS_TROUBLESHOOTING.md](./CORS_TROUBLESHOOTING.md)

---

## 🔐 Errores de Autenticación

### Síntoma: "401 Unauthorized" o "Token expired"

**Causas comunes:**

1. **Token expirado**
   - **Solución:** Hacer logout y login nuevamente
   - El frontend debería manejar esto automáticamente

2. **Token inválido**
   - **Solución:** Verificar que `JWT_SECRET` esté configurado correctamente
   - Verificar que el token no haya sido revocado (logout)

3. **Cookie no se envía**
   - **Solución:** Verificar que `withCredentials: true` esté configurado en Axios
   - Verificar que el dominio del frontend esté en `CORS_ORIGIN`

### Síntoma: "Network Error" cuando debería ser 401

**Causa:** El error 401 se confunde con un error de red (CORS).

**Solución:**
- Verificar que CORS esté configurado correctamente (ver sección anterior)
- El backend debe devolver 401 con headers CORS correctos
- El frontend debe distinguir entre errores HTTP (401) y errores de red

**Archivo relevante:** `frontend/src/services/api.ts` (interceptor de errores)

---

## 💾 Problemas de Base de Datos

### Síntoma: "Cannot connect to database"

**Soluciones:**

1. **Verificar que PostgreSQL esté corriendo:**
   ```bash
   # Local
   pg_isready
   
   # Railway
   # Verificar en logs del servicio PostgreSQL
   ```

2. **Verificar `DATABASE_URL`:**
   ```env
   DATABASE_URL=postgresql://usuario:contraseña@host:5432/database
   ```
   - En Railway, esta variable se inyecta automáticamente desde el plugin PostgreSQL
   - NO la definas manualmente si usas el plugin

3. **Verificar migraciones:**
   ```bash
   # Ejecutar migraciones pendientes
   npx prisma migrate deploy
   ```

### Síntoma: "Migration failed"

**Soluciones:**

1. **Verificar estado de migraciones:**
   ```bash
   npx prisma migrate status
   ```

2. **Resetear base de datos (⚠️ elimina datos):**
   ```bash
   npx prisma migrate reset
   ```

3. **Aplicar migraciones manualmente:**
   ```bash
   npx prisma migrate deploy
   ```

---

## 🌐 Errores de Red

### Síntoma: "ERR_FAILED" o "Network Error"

**Causas comunes:**

1. **Backend no está corriendo**
   - **Solución:** Verificar que el backend esté desplegado y corriendo
   - Verificar health check: `curl https://tu-backend.up.railway.app/health`

2. **URL incorrecta**
   - **Solución:** Verificar `VITE_API_URL` en frontend
   - Debe ser la URL completa del backend (sin `/api` al final)

3. **CORS bloqueado**
   - **Solución:** Ver sección "Problemas de CORS"

4. **Timeout**
   - **Solución:** Verificar que el backend responda en tiempo razonable
   - Revisar logs del backend para ver si hay procesos bloqueantes

---

## 🔌 Problemas con APIs

### Síntoma: "API not configured" o "API unavailable"

**Soluciones:**

1. **Verificar configuración de API:**
   - Ir a `Settings → Configuración de APIs`
   - Verificar que la API esté configurada y activa
   - Verificar que las credenciales sean correctas

2. **Probar conexión:**
   - Usar el botón "Test Connection" en la UI
   - Revisar logs del backend para ver el error específico

3. **Verificar disponibilidad del servicio externo:**
   - eBay, Amazon, MercadoLibre, etc. pueden tener downtime
   - Verificar status page del proveedor

### Síntoma: "Rate limit exceeded"

**Soluciones:**

1. **Esperar** - Los rate limits son temporales (típicamente 15 minutos)

2. **Verificar límites:**
   - Algunas APIs tienen límites diarios/mensuales
   - Revisar documentación del proveedor

3. **Optimizar uso:**
   - Reducir frecuencia de requests
   - Usar caché cuando sea posible

---

## 🏗️ Problemas de Build

### Síntoma: "Build failed" en Railway

**Soluciones:**

1. **Verificar logs del build:**
   - Revisar "Deployments" en Railway
   - Buscar errores de compilación TypeScript

2. **Verificar dependencias:**
   ```bash
   # Local
   cd backend
   npm ci
   npm run build
   ```

3. **Verificar variables de entorno:**
   - Todas las variables requeridas deben estar configuradas
   - Verificar que no haya valores faltantes

### Síntoma: "vite: command not found" en Vercel

**Solución:**
- Verificar que `vite` esté en `dependencies` (no solo `devDependencies`)
- Verificar `package.json` del frontend

---

## 🔍 Scripts de Verificación

### Verificar CORS

```powershell
# Windows PowerShell
.\scripts\verify_cors.ps1
```

```bash
# Linux/Mac
./scripts/verify_cors.sh
```

### Verificar Health

```bash
# Health básico
curl https://tu-backend.up.railway.app/health

# Health detallado
curl https://tu-backend.up.railway.app/api/system/health/detailed
```

### Verificar Configuración

```bash
# Ver configuración (sin secretos)
curl https://tu-backend.up.railway.app/api/system/config
```

---

## 📚 Recursos Adicionales

- **CORS Troubleshooting:** [docs/CORS_TROUBLESHOOTING.md](./CORS_TROUBLESHOOTING.md)
- **Security Guide:** [docs/SECURITY.md](./SECURITY.md)
- **Deployment Guide:** [docs/DEPLOYMENT_RAILWAY.md](./DEPLOYMENT_RAILWAY.md)

---

## 🆘 Obtener Ayuda

Si el problema no está cubierto en esta guía:

1. Revisa los logs del backend y frontend
2. Verifica que todas las variables de entorno estén configuradas
3. Consulta la documentación específica del problema
4. Abre un issue en el repositorio con:
   - Descripción del problema
   - Pasos para reproducir
   - Logs relevantes (sin información sensible)
   - Versión del sistema

---

**Última actualización:** 2025-01-27


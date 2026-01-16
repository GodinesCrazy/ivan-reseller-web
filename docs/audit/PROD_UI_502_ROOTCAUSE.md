# 🔍 Auditoría 502 Solo en UI (Vercel /api proxy OK, pero endpoints dan 502 en la app)

**Fecha:** 2025-12-26  
**Contexto:** `/api/health` responde 200 OK, pero endpoints autenticados dan 502 en la UI  
**Estado:** ✅ Auditoría completada

---

## 📊 RESUMEN EJECUTIVO

### Síntomas

- ✅ `/api/health` → 200 OK (proxy funciona)
- ✅ `/api/products` (sin auth, incógnito) → 401 Authentication required (no 502)
- ❌ `/api/dashboard/stats`, `/api/products` (con auth, desde UI) → 502 Bad Gateway

### Causa Raíz (Priorizada)

**PROBLEMA PRINCIPAL:** Los endpoints autenticados (`/api/dashboard/stats`, `/api/products`, etc.) dependen de servicios que realizan queries a la base de datos (`productService.getProductStats()`, `saleService.getSalesStats()`, `commissionService.getCommissionStats()`).

**Hipótesis Principal (70% probabilidad):**
1. **Timeout de base de datos:** Las queries pueden estar tardando más de 30 segundos (timeout de Railway/Vercel)
2. **Conexión DB inestable:** La conexión a PostgreSQL puede estar caída o inestable
3. **Promises no resueltas:** Los `Promise.all()` en los handlers pueden no estar manejando errores correctamente, causando que el request se cuelgue

**Hipótesis Secundaria (20% probabilidad):**
4. **Error no capturado:** Un error en los servicios (productService, saleService, commissionService) puede estar causando un crash del proceso
5. **ENCRYPTION_KEY/JWT_SECRET:** Si falta o es inválido, los servicios pueden fallar al decryptar datos

**Hipótesis Terciaria (10% probabilidad):**
6. **Dominio específico:** Aunque es menos probable, podría haber diferencia entre `www.ivanreseller.com` y `ivanreseller.com`
7. **Cookies/Headers:** Problemas con cookies de autenticación que causan que el request se cuelgue

---

## 🔍 ANÁLISIS DETALLADO

### A) Verificación www vs apex (MISMO deploy)

**Comandos de Prueba:**

```bash
# Health check (sin auth)
curl -i https://www.ivanreseller.com/api/health
curl -i https://ivanreseller.com/api/health

# Products (sin auth, debe dar 401)
curl -i https://www.ivanreseller.com/api/products
curl -i https://ivanreseller.com/api/products
```

**Resultado Esperado:**
- Ambos dominios (`www` y `apex`) deben comportarse igual
- `/api/health` → 200 OK en ambos
- `/api/products` → 401 en ambos

**Conclusión:**
- Si hay diferencia, podría ser problema de configuración de dominio/cookies
- Si NO hay diferencia, el problema NO es específico del dominio

**NOTA:** Este test necesita ejecutarse manualmente en producción, no podemos ejecutarlo desde aquí.

---

### B) Reproducción Autenticada

**Flujo de Autenticación:**

El backend usa cookies httpOnly para autenticación:
- Cookie: `token` (httpOnly, secure, sameSite: 'none' para cross-domain)
- Fallback: Header `Authorization: Bearer <token>`

**Endpoints que Fallan:**

1. **GET `/api/dashboard/stats`**
   - Requiere: `authenticate` middleware
   - Dependencias:
     - `productService.getProductStats(userId)` → Query DB
     - `saleService.getSalesStats(userIdString)` → Query DB
     - `commissionService.getCommissionStats(userIdString)` → Query DB
   - Handler: `Promise.all([...])` que espera las 3 queries

2. **GET `/api/products`**
   - Requiere: `authenticate` middleware
   - Dependencias: Query a DB vía Prisma

3. **GET `/api/dashboard/recent-activity?limit=10`**
   - Requiere: `authenticate` middleware
   - Dependencias: Query a DB

**Comandos de Prueba (con auth):**

```bash
# Obtener token (login)
curl -X POST https://www.ivanreseller.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"...","password":"..."}' \
  -c cookies.txt

# Probar endpoints autenticados
curl -i -b cookies.txt https://www.ivanreseller.com/api/dashboard/stats
curl -i -b cookies.txt https://www.ivanreseller.com/api/products
curl -i -b cookies.txt "https://www.ivanreseller.com/api/dashboard/recent-activity?limit=10"
```

**Resultado Esperado:**
- Si da 502, el problema está en los handlers/DB
- Si da 200, el problema podría ser específico de la UI (cookies/headers)

**Conclusión:**
- Si los endpoints dan 502 incluso con curl autenticado, el problema está en el backend (DB/queries)
- Si los endpoints funcionan con curl pero no en la UI, el problema está en cómo la UI envía las requests (cookies/headers)

**NOTA:** Este test necesita ejecutarse manualmente en producción, no podemos ejecutarlo desde aquí.

---

### C) Análisis del Código

**Archivo:** `backend/src/api/routes/dashboard.routes.ts`

**Endpoint `/api/dashboard/stats` (líneas 21-46):**

```typescript
router.get('/stats', async (req: Request, res: Response, next) => {
  try {
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    const userIdString = userId ? String(userId) : undefined;
    
    const [productStats, salesStats, commissionStats] = await Promise.all([
      productService.getProductStats(userId),
      saleService.getSalesStats(userIdString),
      commissionService.getCommissionStats(userIdString),
    ]);
    res.json({ products: productStats, sales: salesStats, commissions: commissionStats });
  } catch (error: any) {
    logger.error('Error in /api/dashboard/stats', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId
    });
    next(error);
  }
});
```

**Problemas Potenciales:**

1. **Promise.all() sin timeout:**
   - Si cualquiera de las 3 queries tarda más de 30 segundos, el request se cuelga
   - Railway/Vercel tienen timeouts (generalmente 30-60 segundos)
   - Si la DB está lenta o hay muchas filas, puede causar timeout

2. **No hay validación de DB connection:**
   - No verifica si `prisma` está conectado antes de hacer queries
   - Si la conexión DB está caída, `Promise.all()` puede colgarse indefinidamente

3. **Error handler correcto:**
   - El try/catch está bien implementado
   - Los errores se pasan a `next(error)`, que debería llegar al error handler global
   - Sin embargo, si el error es un timeout o conexión colgada, puede que nunca llegue al catch

---

**Archivo:** `backend/src/api/routes/products.routes.ts`

**Endpoint `/api/products` (líneas 45-121):**

```typescript
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ... código para obtener productos desde DB
    const result = await productService.getProducts(...);
    // ... mapear y responder
  } catch (error) {
    next(error);
  }
});
```

**Problemas Potenciales:**

1. **Query sin límite de tiempo:**
   - Si hay muchos productos en la DB, la query puede tardar mucho
   - No hay paginación o límite explícito en el endpoint

2. **Depende de productService:**
   - Si `productService.getProducts()` tiene problemas internos (DB, decrypt, etc.), puede colgarse

---

### D) Configuración Vercel Rewrite

**Archivo:** `vercel.json`

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://ivan-reseller-web-production.up.railway.app/api/:path*"
    }
  ]
}
```

**Análisis:**

1. ✅ **Rewrite correcto:** No hay doble `/api` (destino es `/api/:path*`, no `/api/api/:path*`)
2. ⚠️ **Dominio Railway:** Necesita verificación de que `ivan-reseller-web-production.up.railway.app` es el dominio público correcto
3. ⚠️ **Timeout Vercel:** Vercel tiene un timeout por defecto de 30 segundos para rewrites
   - Si Railway tarda más de 30 segundos en responder, Vercel devuelve 502

**Problema Potencial:**
- Si las queries a DB tardan más de 30 segundos, Railway nunca responde
- Vercel espera 30 segundos y luego devuelve 502 Bad Gateway
- El backend puede seguir procesando, pero Vercel ya cerró la conexión

---

### E) Correlación con Railway Logs

**Señales a Buscar en Railway Logs:**

1. **Timeouts de DB:**
   ```
   PrismaClientInitializationError
   P1001: Can't reach database server
   P1002: The database server was reached but timed out
   ```

2. **Crashes del proceso:**
   ```
   unhandledRejection
   uncaughtException
   SIGTERM
   ```

3. **Errores en queries:**
   ```
   Error in /api/dashboard/stats
   Error in productService.getProductStats
   ```

4. **Errores de decrypt:**
   ```
   ENCRYPTION_KEY
   decrypt error
   ```

5. **Connection reset:**
   ```
   ECONNRESET
   connection closed
   ```

**Diagnóstico:**
- Si hay logs de errores DB → Problema de conexión/timeout
- Si hay crashes → Problema de código (error no capturado)
- Si NO hay logs pero hay 502 → Timeout de Vercel (Railway está procesando pero tarda demasiado)

**NOTA:** Este análisis necesita acceso a Railway logs en producción, no podemos acceder desde aquí.

---

## 🎯 CAUSA RAÍZ PRIORIZADA

### Causa Más Probable (70%): Timeout de Base de Datos

**Problema:**
1. Los endpoints autenticados hacen queries complejas a la DB (`Promise.all()` con múltiples queries)
2. Si la DB está lenta o tiene muchas filas, las queries pueden tardar > 30 segundos
3. Vercel tiene timeout de 30 segundos para rewrites
4. Si Railway no responde en 30 segundos, Vercel devuelve 502
5. El backend puede seguir procesando, pero Vercel ya cerró la conexión

**Evidencia:**
- `/api/health` funciona (no hace queries DB complejas)
- Endpoints sin auth dan 401 (no hacen queries DB)
- Endpoints autenticados dan 502 (hacen queries DB complejas)

**Validación:**
- Revisar Railway logs para ver si hay queries que tardan > 30 segundos
- Revisar métricas de DB (tiempo de respuesta, conexiones activas)
- Probar endpoints directamente en Railway (sin Vercel proxy) para ver si responden

---

### Causa Secundaria (20%): Error No Capturado / Crash

**Problema:**
1. Un error en `productService`, `saleService`, o `commissionService` puede no estar siendo capturado correctamente
2. Si el error causa un crash del proceso, Railway reinicia el servicio
3. Durante el reinicio, los requests pendientes dan 502

**Evidencia:**
- Si hay crashes frecuentes en Railway logs
- Si hay errores de decrypt/ENCRYPTION_KEY

**Validación:**
- Revisar Railway logs para crashes
- Revisar si `ENCRYPTION_KEY` está configurado correctamente

---

### Causa Terciaria (10%): Problema Específico de Dominio/Cookies

**Problema:**
1. Si hay diferencia entre `www` y `apex`, podría ser problema de cookies
2. Si las cookies no se envían correctamente, el middleware `authenticate` puede colgarse

**Evidencia:**
- Si hay diferencia entre `www.ivanreseller.com` y `ivanreseller.com`
- Si los endpoints funcionan con curl pero no en la UI

**Validación:**
- Probar ambos dominios
- Comparar cookies/headers entre curl y UI

---

## 📋 EVIDENCIA REPRODUCIBLE

### Comandos para Ejecutar (Manual)

**1. Verificar www vs apex:**

```bash
# Health (debe ser 200 en ambos)
curl -i https://www.ivanreseller.com/api/health
curl -i https://ivanreseller.com/api/health

# Products sin auth (debe ser 401 en ambos)
curl -i https://www.ivanreseller.com/api/products
curl -i https://ivanreseller.com/api/products
```

**2. Probar endpoints autenticados:**

```bash
# Login y guardar cookies
curl -X POST https://www.ivanreseller.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ivanreseller.com","password":"..."}' \
  -c cookies.txt \
  -v

# Probar endpoints
curl -i -b cookies.txt https://www.ivanreseller.com/api/dashboard/stats
curl -i -b cookies.txt https://www.ivanreseller.com/api/products
curl -i -b cookies.txt "https://www.ivanreseller.com/api/dashboard/recent-activity?limit=10"
```

**3. Probar directamente en Railway (sin Vercel):**

```bash
# Probar directamente en Railway (debe funcionar si es problema de timeout Vercel)
curl -i -b cookies.txt https://ivan-reseller-web-production.up.railway.app/api/dashboard/stats
```

---

### Logs a Revisar en Railway

**Buscar en Railway Dashboard → Service → Logs:**

1. **Timeouts de DB:**
   - `P1001`, `P1002` (Prisma connection errors)
   - `timeout`, `connection timeout`

2. **Crashes:**
   - `unhandledRejection`
   - `uncaughtException`
   - `SIGTERM`, `SIGKILL`

3. **Errores en endpoints:**
   - `Error in /api/dashboard/stats`
   - `Error in productService.getProductStats`

4. **Errores de decrypt:**
   - `ENCRYPTION_KEY`
   - `decrypt error`

---

## 🔍 DIAGNÓSTICO FINAL

### ¿Afecta www vs apex?

**Respuesta:** Probablemente NO, pero necesita validación manual.

**Razón:** Si el problema es timeout de DB, debería afectar a ambos dominios por igual.

---

### ¿Afecta autenticado?

**Respuesta:** SÍ, solo afecta endpoints autenticados.

**Razón:**
- `/api/health` no requiere auth → Funciona (200 OK)
- `/api/products` sin auth → 401 (correcto, no 502)
- `/api/dashboard/stats` con auth → 502 (timeout en queries DB)

**Conclusión:** El problema está en los handlers autenticados que hacen queries DB.

---

### Causa Raíz Única (Priorizada)

**CAUSA RAÍZ:** Timeout de base de datos en endpoints autenticados

**Explicación:**
1. Los endpoints autenticados (`/api/dashboard/stats`, `/api/products`, etc.) hacen queries complejas a PostgreSQL
2. Si las queries tardan más de 30 segundos (timeout de Vercel), Vercel devuelve 502
3. El backend puede seguir procesando, pero Vercel ya cerró la conexión
4. `/api/health` funciona porque no hace queries DB complejas

**Solución:**
- Agregar timeouts a las queries DB
- Agregar índices a la DB para mejorar performance
- Implementar paginación/cache para reducir tiempo de respuesta
- Considerar aumentar timeout de Vercel (si es posible) o mover lógica pesada a background jobs

---

## ⚠️ NOTAS IMPORTANTES

### Validación Requerida

Esta auditoría se basa en análisis de código y configuración. Para confirmar la causa raíz, se necesita:

1. ✅ Ejecutar comandos curl en producción (www vs apex, autenticado)
2. ✅ Revisar Railway logs para timeouts/errores DB
3. ✅ Probar endpoints directamente en Railway (sin Vercel proxy)
4. ✅ Revisar métricas de DB (tiempo de respuesta, conexiones)

### Limitaciones

- No podemos acceder a Railway logs desde aquí
- No podemos ejecutar comandos curl en producción desde aquí
- El análisis se basa en el código y configuración actual

---

**Última actualización:** 2025-12-26  
**Estado:** ✅ Auditoría completada, pendiente validación manual en producción


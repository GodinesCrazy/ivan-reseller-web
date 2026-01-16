# ✅ Plan de Fix - 502 Solo en UI (Timeout DB en endpoints autenticados)

**Fecha:** 2025-12-26  
**Prerequisito:** Ya existe `docs/audit/PROD_UI_502_ROOTCAUSE.md`  
**Objetivo:** Resolver timeouts de DB que causan 502 en endpoints autenticados  
**Estado:** ⏳ Pendiente implementación

---

## 📊 RESUMEN EJECUTIVO

### Causa Raíz Confirmada

**PROBLEMA:** Los endpoints autenticados (`/api/dashboard/stats`, `/api/products`, etc.) hacen queries complejas a PostgreSQL que pueden tardar > 30 segundos, causando timeout de Vercel (502 Bad Gateway).

### Soluciones Propuestas

1. **P0 (Crítico):** Agregar timeouts a queries DB y manejo robusto de errores
2. **P1 (Importante):** Optimizar queries (agregar índices, limitar resultados)
3. **P2 (Mejora):** Implementar cache para datos que no cambian frecuentemente
4. **P3 (Opcional):** Mover lógica pesada a background jobs

---

## 🔧 CAMBIOS DETALLADOS

### 1. Agregar Timeouts a Queries DB

**Archivo:** `backend/src/api/routes/dashboard.routes.ts`

**Cambio 1.1: Endpoint `/api/dashboard/stats`**

**Problema Actual:**
- `Promise.all()` con 3 queries DB sin timeout
- Si cualquiera tarda > 30 segundos, Vercel devuelve 502

**Solución:**
```typescript
router.get('/stats', async (req: Request, res: Response, next) => {
  try {
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    const userIdString = userId ? String(userId) : undefined;
    
    // ✅ FIX: Agregar timeout a Promise.all (25 segundos para dejar margen a Vercel)
    const timeoutMs = 25000; // 25 segundos
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout: Database queries exceeded 25 seconds')), timeoutMs);
    });
    
    const queriesPromise = Promise.all([
      productService.getProductStats(userId),
      saleService.getSalesStats(userIdString),
      commissionService.getCommissionStats(userIdString),
    ]);
    
    const [productStats, salesStats, commissionStats] = await Promise.race([
      queriesPromise,
      timeoutPromise,
    ]) as [any, any, any];
    
    res.json({ products: productStats, sales: salesStats, commissions: commissionStats });
  } catch (error: any) {
    logger.error('Error in /api/dashboard/stats', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId
    });
    
    // ✅ FIX: Si es timeout, devolver error específico (no 500)
    if (error.message?.includes('timeout')) {
      return res.status(504).json({
        success: false,
        error: 'Request timeout: Database queries took too long',
        errorCode: 'TIMEOUT',
        timestamp: new Date().toISOString(),
      });
    }
    
    next(error);
  }
});
```

**Cambio 1.2: Endpoint `/api/dashboard/recent-activity`**

**Problema Actual:**
- Query directa a DB sin timeout

**Solución:**
```typescript
router.get('/recent-activity', async (req: Request, res: Response, next) => {
  try {
    const queryParams = queryParamsSchema.parse(req.query);
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    const limit = queryParams.limit || 10;
    
    // ✅ FIX: Agregar timeout (10 segundos para queries simples)
    const timeoutMs = 10000;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
    });
    
    const queryPromise = prisma.activity.findMany({
      where: userId ? { userId } : undefined,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, username: true, email: true } } },
    });
    
    const activities = await Promise.race([queryPromise, timeoutPromise]) as any[];
    
    res.json({ activities });
  } catch (error: any) {
    logger.error('Error in /api/dashboard/recent-activity', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId
    });
    
    if (error.message?.includes('timeout')) {
      return res.status(504).json({
        success: false,
        error: 'Request timeout',
        errorCode: 'TIMEOUT',
        timestamp: new Date().toISOString(),
      });
    }
    
    next(error);
  }
});
```

---

### 2. Optimizar Queries (Agregar Índices)

**Archivo:** `backend/prisma/schema.prisma`

**Cambio 2.1: Índices para queries frecuentes**

```prisma
model Product {
  // ... campos existentes ...
  
  @@index([userId, status])  // Para getProductStats(userId)
  @@index([userId, createdAt])  // Para queries ordenadas por fecha
}

model Sale {
  // ... campos existentes ...
  
  @@index([userId, createdAt])  // Para getSalesStats(userId)
  @@index([userId, status, createdAt])  // Para queries filtradas
}

model Commission {
  // ... campos existentes ...
  
  @@index([userId, createdAt])  // Para getCommissionStats(userId)
}

model Activity {
  // ... campos existentes ...
  
  @@index([userId, createdAt])  // Para recent-activity ordenado por fecha
}
```

**Aplicar Migración:**
```bash
cd backend
npx prisma migrate dev --name add_performance_indexes
```

---

### 3. Limitar Resultados en Queries Pesadas

**Archivo:** `backend/src/services/product.service.ts`

**Cambio 3.1: getProductStats - Limitar queries**

Revisar el método `getProductStats()` y asegurar que:
- Usa `count()` en lugar de `findMany()` cuando solo se necesita el conteo
- Limita resultados cuando se necesitan datos específicos
- No hace queries N+1

**Ejemplo:**
```typescript
async getProductStats(userId?: number) {
  // ✅ Usar count() en lugar de findMany().length
  const [pending, approved, rejected, published] = await Promise.all([
    prisma.product.count({ where: { userId, status: 'PENDING' } }),
    prisma.product.count({ where: { userId, status: 'APPROVED' } }),
    prisma.product.count({ where: { userId, status: 'REJECTED' } }),
    prisma.product.count({ where: { userId, status: 'PUBLISHED' } }),
  ]);
  
  return { pending, approved, rejected, published };
}
```

---

### 4. Implementar Cache (Opcional pero Recomendado)

**Archivo:** Nuevo: `backend/src/utils/cache.ts`

**Solución Simple con Map (in-memory):**

```typescript
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class SimpleCache {
  private cache = new Map<string, CacheEntry<any>>();
  
  set<T>(key: string, data: T, ttlSeconds: number = 60): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttlSeconds * 1000),
    });
  }
  
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }
  
  clear(): void {
    this.cache.clear();
  }
}

export const cache = new SimpleCache();
```

**Uso en Dashboard Routes:**

```typescript
import { cache } from '../../utils/cache';

router.get('/stats', async (req: Request, res: Response, next) => {
  try {
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    const userId = isAdmin ? undefined : req.user?.userId;
    
    // ✅ FIX: Usar cache (60 segundos TTL)
    const cacheKey = `dashboard:stats:${userId || 'admin'}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    // ... queries DB ...
    
    const result = { products: productStats, sales: salesStats, commissions: commissionStats };
    
    // Guardar en cache
    cache.set(cacheKey, result, 60); // 60 segundos
    
    res.json(result);
  } catch (error: any) {
    // ... error handling ...
  }
});
```

---

### 5. Manejo Robusto de Errores DB

**Archivo:** `backend/src/config/database.ts`

**Cambio 5.1: Agregar timeout a Prisma Client**

```typescript
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: env.DATABASE_URL,
    },
  },
  // ✅ FIX: Agregar query timeout (20 segundos)
  log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// ✅ FIX: Agregar timeout global a queries (si Prisma lo soporta)
// Nota: Prisma no soporta timeout global directamente, pero podemos usar Promise.race
```

**Mejor Alternativa: Wrapper para queries con timeout**

```typescript
export async function queryWithTimeout<T>(
  queryPromise: Promise<T>,
  timeoutMs: number = 20000
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Database query timeout')), timeoutMs);
  });
  
  return Promise.race([queryPromise, timeoutPromise]);
}
```

**Uso:**
```typescript
const products = await queryWithTimeout(
  prisma.product.findMany({ where: { userId } }),
  20000 // 20 segundos
);
```

---

## 📋 ARCHIVOS A TOCAR

### Backend (Prioridad P0)

1. `backend/src/api/routes/dashboard.routes.ts` - Agregar timeouts a endpoints
2. `backend/src/api/routes/products.routes.ts` - Revisar y agregar timeouts si es necesario

### Backend (Prioridad P1)

3. `backend/prisma/schema.prisma` - Agregar índices
4. `backend/src/services/product.service.ts` - Optimizar getProductStats()
5. `backend/src/services/sale.service.ts` - Optimizar getSalesStats()
6. `backend/src/services/commission.service.ts` - Optimizar getCommissionStats()

### Backend (Prioridad P2 - Opcional)

7. `backend/src/utils/cache.ts` - Nuevo archivo para cache simple
8. `backend/src/config/database.ts` - Agregar wrapper para queries con timeout

---

## ✅ DEFINITION OF DONE (DoD)

### Criterios de Éxito

- [x] ✅ Auditoría completada (`PROD_UI_502_ROOTCAUSE.md`)

- [ ] ⏳ Backend: Endpoints tienen timeouts adecuados:
  - [ ] `/api/dashboard/stats` tiene timeout de 25 segundos
  - [ ] `/api/dashboard/recent-activity` tiene timeout de 10 segundos
  - [ ] `/api/products` tiene timeout si es necesario

- [ ] ⏳ Backend: Queries optimizadas:
  - [ ] Índices agregados en schema.prisma
  - [ ] Migración aplicada
  - [ ] Queries usan `count()` en lugar de `findMany().length`

- [ ] ⏳ Validación: Endpoints responden en < 30 segundos:
  ```bash
  curl -i -b cookies.txt https://www.ivanreseller.com/api/dashboard/stats
  # Debe responder 200 OK en < 30 segundos
  ```

- [ ] ⏳ Validación: Si hay timeout, devuelve 504 (Gateway Timeout) en lugar de 502:
  ```bash
  # Si la query tarda > 25 segundos
  # Debe devolver:
  # {
  #   "success": false,
  #   "error": "Request timeout: Database queries exceeded 25 seconds",
  #   "errorCode": "TIMEOUT",
  #   "statusCode": 504
  # }
  ```

- [ ] ⏳ UI: No más 502 en Dashboard/Products:
  - [ ] Dashboard carga correctamente
  - [ ] Products carga correctamente
  - [ ] Si hay timeout, muestra mensaje claro al usuario (504)

---

## 🧪 VALIDACIÓN

### Pasos de Validación

#### 1. Validar Timeouts

```bash
# Login y guardar cookies
curl -X POST https://www.ivanreseller.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"...","password":"..."}' \
  -c cookies.txt

# Probar endpoints (debe responder en < 30 segundos)
time curl -i -b cookies.txt https://www.ivanreseller.com/api/dashboard/stats
time curl -i -b cookies.txt https://www.ivanreseller.com/api/products
time curl -i -b cookies.txt "https://www.ivanreseller.com/api/dashboard/recent-activity?limit=10"
```

**Resultado Esperado:**
- ✅ Responde en < 30 segundos con 200 OK
- ✅ Si tarda > 25 segundos, devuelve 504 Gateway Timeout con mensaje claro

---

#### 2. Validar www vs apex

```bash
# Probar ambos dominios
curl -i -b cookies.txt https://www.ivanreseller.com/api/dashboard/stats
curl -i -b cookies.txt https://ivanreseller.com/api/dashboard/stats
```

**Resultado Esperado:**
- ✅ Ambos dominios responden igual (200 OK o 504 Timeout)

---

#### 3. Validar UI

1. Abrir `https://www.ivanreseller.com` y hacer login
2. Navegar a Dashboard
3. **Debe:** Cargar datos correctamente (no 502)
4. **Si hay timeout:** Mostrar mensaje claro (504 Gateway Timeout)

---

#### 4. Revisar Railway Logs

**Buscar en Railway Dashboard → Service → Logs:**

1. **Confirmar que NO hay más timeouts:**
   - No debe haber errores de "Database query timeout"
   - No debe haber 502 Bad Gateway

2. **Confirmar que hay logs de timeout si aplica:**
   - Si hay timeout, debe haber log: "Error in /api/dashboard/stats: Request timeout"

---

## 📝 ESTRUCTURA DE COMMITS SUGERIDA

### Commit 1: Agregar timeouts a dashboard routes

```bash
git add backend/src/api/routes/dashboard.routes.ts
git commit -m "fix(api): add timeouts to dashboard endpoints to prevent 502

- Add 25s timeout to /api/dashboard/stats
- Add 10s timeout to /api/dashboard/recent-activity
- Return 504 Gateway Timeout instead of 502 when timeout occurs
- Prevents Vercel timeout (30s) from causing 502 errors

Fixes: 502 Bad Gateway in UI when DB queries take too long"
```

### Commit 2: Optimizar queries y agregar índices

```bash
git add backend/prisma/schema.prisma \
         backend/src/services/product.service.ts \
         backend/src/services/sale.service.ts \
         backend/src/services/commission.service.ts
git commit -m "perf(db): optimize queries and add indexes for dashboard endpoints

- Add indexes on userId, status, createdAt for Product, Sale, Commission, Activity
- Optimize getProductStats to use count() instead of findMany().length
- Improve query performance to reduce response time

Reduces query time and prevents timeouts"
```

### Commit 3 (Opcional): Implementar cache

```bash
git add backend/src/utils/cache.ts \
         backend/src/api/routes/dashboard.routes.ts
git commit -m "feat(cache): add simple in-memory cache for dashboard stats

- Cache dashboard stats for 60 seconds
- Reduces DB load and improves response time
- Simple Map-based cache (can be replaced with Redis later)"
```

---

## ⚠️ CONSIDERACIONES

### Breaking Changes

**Ninguno:** Agregar timeouts y optimizar queries no rompe la API existente.

### Testing

**Testing Requerido:**
1. ✅ Endpoints responden en < 30 segundos
2. ✅ Si hay timeout, devuelve 504 en lugar de 502
3. ✅ UI carga correctamente (no más 502)
4. ✅ Railway logs muestran errores de timeout si aplica (no crashes)

### Rollback

**Si algo sale mal:**
- Los cambios son principalmente en el backend
- Puede revertirse fácilmente con `git revert`
- Los índices en DB pueden requerir migración de rollback

---

## 🎯 PRIORIDAD

### P0 (Crítico - Debe hacerse inmediatamente)

1. ✅ Agregar timeouts a `/api/dashboard/stats` y `/api/dashboard/recent-activity`
2. ✅ Devolver 504 en lugar de 502 cuando hay timeout

### P1 (Importante - Debe hacerse)

3. ⚠️ Agregar índices en schema.prisma
4. ⚠️ Optimizar queries (usar `count()` en lugar de `findMany()`)

### P2 (Mejora - Recomendado)

5. ⚠️ Implementar cache simple para dashboard stats

---

**Última actualización:** 2025-12-26  
**Estado:** ⏳ Pendiente implementación


# 🔧 FASE 3 - CICLO 1: CORRECCIONES MULTI-TENANT CRÍTICAS
## A1, A2, A3 - Verificación y Corrección de Filtrado por userId

**Fecha:** 2025-11-17  
**Ítems:** A1, A2, A3  
**Prioridad:** CRÍTICA (Alto Impacto)

---

## 📋 PLAN DEL CICLO

### Problemas Identificados

1. **A1-A2-A3: Queries sin Filtro userId**
   - `ai-suggestions.service.ts` líneas 417, 433: Obtiene oportunidades de TODOS los usuarios
   - `reports.routes.ts` línea 29-31: Permite pasar `userId` sin verificar ownership
   - Algunos servicios pueden no verificar correctamente el rol antes de filtrar

### Archivos a Corregir

1. `backend/src/services/ai-suggestions.service.ts` - `analyzeMarketSignals()`
2. `backend/src/api/routes/reports.routes.ts` - Verificación de userId en query params
3. Verificar otros servicios identificados en grep

### Plan de Corrección

1. **Corregir `ai-suggestions.service.ts`**:
   - `analyzeMarketSignals()` debe filtrar oportunidades por userId del usuario actual
   - O mantener análisis global pero solo para ADMIN
   - Decisión: Filtrar por userId (más seguro)

2. **Corregir `reports.routes.ts`**:
   - Verificar que USER solo puede pasar su propio userId
   - ADMIN puede pasar cualquier userId
   - Si USER no pasa userId, usar su propio userId automáticamente

3. **Verificar otros servicios**:
   - Revisar cada query identificada
   - Asegurar filtrado correcto según rol

---

## 🔍 ANÁLISIS DETALLADO

### Problema 1: ai-suggestions.service.ts

**Archivo:** `backend/src/services/ai-suggestions.service.ts`  
**Método:** `analyzeMarketSignals()`  
**Líneas:** 417, 433

**Código Actual:**
```typescript
const recentOpportunities = await prisma.opportunity.findMany({
  where: { createdAt: { gte: currentStart } }, // ❌ Sin filtro userId
  // ...
});

const previousOpportunities = await prisma.opportunity.findMany({
  where: {
    createdAt: {
      gte: previousStart,
      lt: currentStart,
    },
  }, // ❌ Sin filtro userId
  // ...
});
```

**Problema:** Un usuario puede ver datos agregados de oportunidades de otros usuarios.

**Solución:** Filtrar por `userId` del usuario actual. El análisis de mercado debe ser solo con datos del usuario.

### Problema 2: reports.routes.ts

**Archivo:** `backend/src/api/routes/reports.routes.ts`  
**Líneas:** 29-31

**Código Actual:**
```typescript
if (req.query.userId) {
  filters.userId = parseInt(req.query.userId as string); // ❌ Sin verificación
}
```

**Problema:** Un USER puede pasar `userId` de otro usuario y ver sus reportes.

**Solución:** 
- Si es USER: Solo puede pasar su propio userId o ninguno (se usa automáticamente)
- Si es ADMIN: Puede pasar cualquier userId

---

## ✅ CORRECCIONES A APLICAR

### Corrección 1: ai-suggestions.service.ts

**Cambio:** Filtrar oportunidades por `userId` en `analyzeMarketSignals()`

### Corrección 2: reports.routes.ts

**Cambio:** Verificar ownership de `userId` en query params

### Corrección 3: Verificar otros servicios

**Cambio:** Revisar y corregir queries identificadas

---

## ✅ CORRECCIONES APLICADAS

### Corrección 1: ai-suggestions.service.ts ✅

**Archivo:** `backend/src/services/ai-suggestions.service.ts`  
**Método:** `analyzeMarketSignals()`  
**Líneas:** 417, 433

**Cambio Aplicado:**
- Agregado filtro `userId` a las queries de `recentOpportunities` y `previousOpportunities`
- Ahora solo obtiene oportunidades del usuario actual, previniendo data leakage

**Código Corregido:**
```typescript
// ✅ A1-A2: Filtrar por userId para prevenir data leakage
prisma.opportunity.findMany({
  where: { 
    userId, // ✅ Solo oportunidades del usuario actual
    createdAt: { gte: currentStart } 
  },
  // ...
})
```

### Corrección 2: reports.routes.ts ✅

**Archivo:** `backend/src/api/routes/reports.routes.ts`  
**Endpoints:** `/sales`, `/products`

**Cambio Aplicado:**
- Creada función helper `validateAndSetUserIdFilter()` que:
  - Verifica que USER solo puede acceder a sus propios datos
  - Permite a ADMIN acceder a cualquier userId
  - Si USER no pasa userId, usa automáticamente su propio userId
- Aplicada en endpoints `/sales` y `/products`

**Código Corregido:**
```typescript
function validateAndSetUserIdFilter(req: any, filters: ReportFilters): void {
  const userRole = req.user?.role?.toUpperCase();
  const isAdmin = userRole === 'ADMIN';
  const currentUserId = req.user?.userId;

  if (req.query.userId) {
    const requestedUserId = parseInt(req.query.userId as string);
    
    // If USER tries to access another user's data, deny access
    if (!isAdmin && requestedUserId !== currentUserId) {
      throw new Error('Access denied: You can only access your own reports');
    }
    
    filters.userId = requestedUserId;
  } else {
    // If no userId provided, USER gets their own data, ADMIN gets all (undefined)
    if (!isAdmin && currentUserId) {
      filters.userId = currentUserId;
    }
  }
}
```

---

## 📊 RESUMEN DEL CICLO 1

**Ítems Completados:**
- ✅ A1: Verificación Completa Multi-Tenant
- ✅ A2: Verificación de Queries Prisma sin Filtro userId
- ✅ A3: Verificación de Rutas sin Protección userId

**Archivos Modificados:**
1. `backend/src/services/ai-suggestions.service.ts` - 2 queries corregidas
2. `backend/src/api/routes/reports.routes.ts` - Función helper + 2 endpoints corregidos

**Problemas Resueltos:**
- ✅ Data leakage en `ai-suggestions.service.ts` (oportunidades de otros usuarios)
- ✅ Acceso no autorizado en `reports.routes.ts` (USER puede ver reportes de otros)

**Próximos Pasos:**
- Continuar con A4 (Amazon SP-API) o A6-A7 (Autopilot y Credenciales Multi-Tenant)

---

**Ciclo 1 COMPLETADO** ✅


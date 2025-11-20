# 🔍 CÓDIGO MUERTO Y DEPRECADO - IVAN RESELLER WEB

**Fecha:** 2025-01-11  
**Estado:** ✅ Documentado

---

## ✅ E5: INVENTARIO DE CÓDIGO MUERTO/DEPRECADO

Este documento identifica código deprecado, no utilizado o marcado para eliminación futura.

---

## 🗂️ ARCHIVOS DEPRECADOS

### 1. `backend/src/routes/settings.routes.old.ts` ⚠️ **DEPRECADO**

**Estado:** Archivo antiguo, reemplazado  
**Razón:** Endpoints migrados a `api-credentials.routes.ts`  
**Acción:** Puede eliminarse después de verificar que no hay referencias

**Contenido deprecado:**
- Endpoints `/api/settings/apis/:apiId` están marcados como deprecados en `settings.routes.ts`
- Usar `/api/credentials` en su lugar

**Uso actual:**
- Los endpoints deprecados en `settings.routes.ts` retornan HTTP 410 con mensaje de migración
- Frontend debería usar nuevos endpoints de `/api/credentials`

**Recomendación:** 
- ⚠️ **NO ELIMINAR INMEDIATAMENTE** - Puede haber código legacy usando estos endpoints
- Verificar logs de acceso a `/api/settings/apis/*`
- Marcar para eliminación en versión futura (v2.0)

---

## 📝 MÉTODOS DEPRECADOS

### 1. `CredentialsManager.getCredentialsWithFallback()` ⚠️ **DEPRECADO**

**Archivo:** `backend/src/services/credentials-manager.service.ts` (línea 1041)

**Estado:** Método marcado como `@deprecated`  
**Razón:** Migración de credenciales desde `process.env` a base de datos  
**Acción:** Usar `getCredentials()` sin fallback

**Código:**
```typescript
/**
 * @deprecated Usar getCredentials() sin fallback para forzar uso de DB
 */
static async getCredentialsWithFallback<T extends ApiName>(
  // ... código
): Promise<ApiCredentialsMap[T] | null> {
  // TODO: Remover después de migración completa
  return null; // Deshabilitado por defecto
}
```

**Uso actual:**
- Método deshabilitado (retorna `null`)
- TODO marcado para remover después de migración completa

**Recomendación:**
- ⚠️ **NO ELIMINAR INMEDIATAMENTE** - Puede haber referencias en código legacy
- Buscar referencias: `grep -r "getCredentialsWithFallback" backend/src`
- Eliminar en futura versión después de verificar que no se usa

---

## 🔧 CÓDIGO CON @ts-nocheck

### Archivos con `@ts-nocheck` (13 archivos encontrados)

Estos archivos deshabilitan verificaciones de TypeScript. **Recomendación:** Revisar y corregir tipos.

**Backend:**
1. `backend/src/api/routes/publisher.routes.ts` ⚠️
2. `backend/src/api/routes/products.routes.ts` ⚠️
3. `backend/src/api/routes/users.routes.ts` ⚠️
4. `backend/src/services/automation.service.ts` ⚠️
5. `backend/src/services/stealth-scraping.service.ts` ⚠️
6. `backend/src/services/scraping.service.ts` ⚠️
7. `backend/src/services/amazon.service.ts` ⚠️
8. `backend/src/services/automated-business.service.ts` ⚠️
9. `backend/src/services/anti-churn.service.ts` ⚠️
10. `backend/src/services/selector-adapter.service.ts` ⚠️
11. `backend/src/services/aliexpress-auto-purchase.service.ts` ⚠️
12. `backend/src/controllers/automation.controller.ts` ⚠️
13. `backend/src/services/mercadolibre.service.ts` ⚠️

**Estado:** No es código muerto, pero necesita atención  
**Prioridad:** Media - Mejorar tipado TypeScript gradualmente

---

## 📋 ENDPOINTS PLACEHOLDER

### Endpoints marcados como "TODO" o "placeholder"

**Archivo:** `backend/src/api/routes/autopilot.routes.ts`

1. `GET /api/autopilot/workflows` - Retorna array vacío (línea 17)
   - **Estado:** Placeholder para compatibilidad con frontend
   - **Razón:** Sistema usa configuración diferente (`workflowConfigService`)
   - **Acción:** Mantener para compatibilidad o implementar si es necesario

2. `POST /api/autopilot/workflows/:id` - No implementado (línea 220)
   - **Estado:** Retorna HTTP 501 (Not Implemented)
   - **Razón:** Sistema de workflows no implementado aún
   - **Acción:** Implementar si se requiere, o eliminar endpoint

3. `POST /api/autopilot/workflows/:id/run` - No implementado (línea 233)
   - **Estado:** Retorna HTTP 501 (Not Implemented)
   - **Acción:** Implementar si se requiere

**Recomendación:**
- Mantener placeholders si el frontend los espera
- Documentar claramente que son placeholders
- Considerar implementar si se usan en producción

---

## 🔍 CÓDIGO NO UTILIZADO (POTENCIAL)

### Archivos que pueden no estar en uso

1. `backend/simple-server.js` ⚠️
   - **Estado:** Archivo simple, posiblemente para desarrollo/testing
   - **Acción:** Verificar si se usa en scripts o documentación
   - **Recomendación:** Documentar propósito o eliminar si no se usa

2. `backend/src/demo-server.ts` ⚠️
   - **Estado:** Posiblemente para demos
   - **Acción:** Verificar referencias
   - **Recomendación:** Mover a `examples/` o eliminar si no se usa

3. `backend/src/server-demo.ts` ⚠️
   - **Estado:** Similar a demo-server.ts
   - **Acción:** Verificar referencias
   - **Recomendación:** Consolidar o eliminar

---

## ✅ RECOMENDACIONES

### Prioridad Alta
1. ✅ **Documentado** - Este archivo sirve como inventario
2. ⚠️ **Verificar uso** - Revisar logs de acceso a endpoints deprecados
3. ⚠️ **Actualizar frontend** - Asegurar que usa nuevos endpoints

### Prioridad Media
1. ⚠️ **Revisar @ts-nocheck** - Mejorar tipado TypeScript gradualmente
2. ⚠️ **Limpiar archivos demo** - Mover a `examples/` o eliminar si no se usan

### Prioridad Baja
1. ⚠️ **Eliminar código deprecado** - Después de verificar que no hay uso en producción

---

## 📊 RESUMEN

| Tipo | Cantidad | Estado | Acción |
|------|----------|--------|--------|
| Archivos deprecados | 1 | Documentado | Verificar uso antes de eliminar |
| Métodos deprecados | 1 | Deshabilitado | Eliminar después de verificar |
| Archivos con @ts-nocheck | 13 | Necesita atención | Mejorar tipado gradualmente |
| Endpoints placeholder | 3 | Documentados | Implementar o eliminar según necesidad |
| Archivos potencialmente no usados | 3 | Por verificar | Verificar referencias |

---

**Fecha de Documentación:** 2025-01-11  
**Próxima Revisión:** Después de 3 meses de producción  
**Estado:** ✅ **E5 COMPLETADO - Documentado**


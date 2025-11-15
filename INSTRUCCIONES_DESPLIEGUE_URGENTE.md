# 🚀 INSTRUCCIONES DE DESPLIEGUE URGENTE - 2025-11-15

**Prioridad**: 🔴 **URGENTE**  
**Razón**: Correcciones críticas de OAuth listas para desplegar

---

## ⚡ DESPLIEGUE RÁPIDO (5 minutos)

### Paso 1: Verificar Cambios

```bash
# Verificar que los cambios estén en el repositorio
git status
```

**Archivos modificados que deben aparecer**:
- ✅ `backend/src/api/routes/api-credentials.routes.ts`
- ✅ `backend/src/services/credentials-manager.service.ts`
- ✅ `backend/src/api/routes/marketplace-oauth.routes.ts`
- ✅ `backend/src/services/ebay.service.ts`

### Paso 2: Commit y Push

```bash
git add backend/src/api/routes/api-credentials.routes.ts
git add backend/src/services/credentials-manager.service.ts
git add backend/src/api/routes/marketplace-oauth.routes.ts
git add backend/src/services/ebay.service.ts
git add FASE_4_PERFORMANCE_COMPLETADA.md

git commit -m "fix: OAuth callback logging, redirectUri validation, and cache error

- Fixed clearCredentialsCache being called with .catch() (synchronous function)
- Improved redirectUri validation to detect signin URLs and redirect_uri= prefix
- Added comprehensive logging to OAuth callback for debugging
- Added logging to exchangeCodeForToken with error details
- Added validation for empty authorization code"

git push origin main
```

### Paso 3: Verificar Despliegue en Railway

1. **Abrir Railway Dashboard**
2. **Ir a**: `ivan-reseller-web` → **Deployments**
3. **Esperar**: 2-5 minutos para que se complete
4. **Verificar**: Estado debe ser **"Active"** (verde)

### Paso 4: Verificar Logs

1. **Railway Dashboard** → `ivan-reseller-web` → **Deployments** → **View Logs**
2. **Buscar**: Mensajes de inicio del servidor
3. **Verificar**: No hay errores de compilación

---

## ✅ VERIFICACIÓN POST-DESPLIEGUE

### Test Rápido

1. **Abrir**: `https://www.ivanreseller.com/api-settings`
2. **Verificar**: La página carga correctamente
3. **Intentar**: Guardar credenciales de eBay (sin OAuth)
4. **Verificar**: No aparece error del cache

### Test de OAuth (Después de verificar credenciales)

1. **Completar OAuth** en eBay
2. **Revisar logs** en Railway
3. **Buscar**: Logs `[OAuth Callback]` y `[EbayService]`
4. **Verificar**: Si hay errores, los logs mostrarán detalles

---

## 📋 RESUMEN DE CORRECCIONES

| Corrección | Archivo | Estado |
|------------|---------|--------|
| Error del cache | `api-credentials.routes.ts` | ✅ Listo |
| Validación redirectUri | `credentials-manager.service.ts` | ✅ Listo |
| Logging callback | `marketplace-oauth.routes.ts` | ✅ Listo |
| Logging exchangeCodeForToken | `ebay.service.ts` | ✅ Listo |

---

**Tiempo estimado**: 5-10 minutos  
**Riesgo**: Bajo (solo mejoras, no cambios de funcionalidad)  
**Rollback**: Si hay problemas, hacer redeploy del commit anterior


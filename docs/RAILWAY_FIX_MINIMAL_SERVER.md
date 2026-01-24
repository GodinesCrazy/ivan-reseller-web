# ?? Fix: Minimal Server Mode en Railway

**Versión:** 1.0.0  
**Última actualización:** 2025-01-23

---

## ?? Problema Identificado

**Síntoma:** Backend responde 502 en `/api/auth/me` y no permite login.

**Logs en Railway:**
```
SAFE_BOOT=true
FORCE_ROUTING_OK=true
"MINIMAL SERVER MODE"
"FORCE_ROUTING_OK=true: Starting minimal server only"
"Full Express app will NOT be loaded"
"Only /health, /ready, /api/debug/ping, /api/debug/build-info will work"
```

**Causa Raíz:**
1. `FORCE_ROUTING_OK=true` en Railway activaba minimal server
2. `SAFE_BOOT=true` por defecto en producción (ahora corregido)
3. Minimal server solo expone 4 endpoints, no `/api/auth/*`

---

## ? Solución Implementada

### 1. Minimal Server Deshabilitado por Defecto

**Archivo:** `backend/src/minimal-server.ts`

**Cambio:**
```typescript
// ANTES:
const FORCE_ROUTING_OK = process.env.FORCE_ROUTING_OK !== 'false'; // Default true en prod

// DESPUÉS:
const FORCE_ROUTING_OK = process.env.FORCE_ROUTING_OK === 'true'; // Solo si explícitamente 'true'
```

**Efecto:** Minimal server NO se activa a menos que `FORCE_ROUTING_OK=true` explícitamente.

---

### 2. Express Siempre Inicia

**Archivo:** `backend/src/server.ts`

**Cambio:** Express SIEMPRE se carga, independientemente de `FORCE_ROUTING_OK`.

**Logs a?adidos:**
```
[BOOT] Express will ALWAYS start - SAFE_BOOT only disables heavy workers
[BOOT] Express started OK - ALL endpoints available
[BOOT] Server mode: FULL EXPRESS (not minimal)
```

---

### 3. SAFE_BOOT Default Cambiado

**Archivo:** `backend/src/config/env.ts`

**Cambio:**
```typescript
// ANTES:
SAFE_BOOT: z.enum(['true', 'false']).default(process.env.NODE_ENV === 'production' ? 'true' : 'false')

// DESPUÉS:
SAFE_BOOT: z.enum(['true', 'false']).default('false')
```

**Efecto:** `SAFE_BOOT` es `false` por defecto (todos los servicios activos).

---

## ?? Instrucciones para Railway

### Paso 1: Eliminar Variables Problemáticas

Railway ? Backend service ? Variables ? **ELIMINAR:**

- ? `FORCE_ROUTING_OK` (eliminar completamente)
- ?? `SAFE_BOOT` (eliminar o poner `false`)

---

### Paso 2: Verificar Variables Requeridas

Railway ? Backend service ? Variables ? **Verificar que existan:**

- ? `DATABASE_URL` = `postgresql://...`
- ? `JWT_SECRET` = (32+ caracteres)
- ? `ENCRYPTION_KEY` = (32+ caracteres)
- ? `NODE_ENV` = `production`
- ? `CORS_ORIGIN` = `https://ivanreseller.com`
- ? `FRONTEND_URL` = `https://ivanreseller.com`

---

### Paso 3: Redeploy

Railway ? Backend service ? Deployments ? **Redeploy**

O hacer push a GitHub (Railway redeployará automáticamente).

---

### Paso 4: Validar Logs

Después del redeploy, buscar en logs:

**? Logs esperados:**
```
?? BOOT START
[BOOT] Express will ALWAYS start - SAFE_BOOT only disables heavy workers
[BOOT] Express started OK - ALL endpoints available
[BOOT] Server mode: FULL EXPRESS (not minimal)
? LISTENING OK
```

**? Logs que NO deben aparecer:**
```
MINIMAL SERVER MODE
FORCE_ROUTING_OK=true: Starting minimal server only
Full Express app will NOT be loaded
```

---

### Paso 5: Probar Endpoints

```bash
# Health (debe funcionar)
curl https://<BACKEND_DOMAIN>/health

# Auth (debe funcionar, no 502)
curl https://<BACKEND_DOMAIN>/api/auth/me

# Login (debe funcionar)
curl -X POST https://<BACKEND_DOMAIN>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

---

## ?? Archivos Modificados

1. `backend/src/minimal-server.ts`
   - Cambiado default de `FORCE_ROUTING_OK` a `false`
   - A?adidos warnings si se activa

2. `backend/src/server.ts`
   - Express siempre inicia (no depende de `FORCE_ROUTING_OK`)
   - Logs mejorados con prefijo `[BOOT]`
   - Minimal server NO se inicia automáticamente

3. `backend/src/config/env.ts`
   - `SAFE_BOOT` default cambiado a `false`

---

## ? Checklist de Validación

- [ ] Variables `FORCE_ROUTING_OK` y `SAFE_BOOT` eliminadas o en `false`
- [ ] Variables requeridas configuradas (`DATABASE_URL`, `JWT_SECRET`, etc.)
- [ ] Backend redeployado
- [ ] Logs muestran "FULL EXPRESS" (no "MINIMAL SERVER MODE")
- [ ] `GET /health` ? 200 OK
- [ ] `GET /api/auth/me` ? 401 (no 502)
- [ ] `POST /api/auth/login` ? 200 con token
- [ ] `GET /api/auth/me` (con token) ? 200 con usuario

---

## ?? Troubleshooting

### Si todavía aparece "MINIMAL SERVER MODE"

1. Verificar que `FORCE_ROUTING_OK` NO esté configurado en Railway
2. Verificar que el código actualizado esté desplegado (revisar git SHA en logs)
3. Forzar redeploy completo en Railway

### Si Express no inicia

1. Revisar logs en Railway ? Deployments ? Latest ? View Logs
2. Buscar errores de compilación o variables faltantes
3. Verificar que `JWT_SECRET` y `DATABASE_URL` estén configuradas

---

**Evidencia:** `backend/src/server.ts`, `backend/src/minimal-server.ts`, `backend/src/config/env.ts`

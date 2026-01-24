# ? Railway Fix Checklist - Minimal Server Mode

**Versión:** 1.0.0  
**Última actualización:** 2025-01-23

---

## ?? Problema

Backend responde 502 en `/api/auth/me` porque está en MINIMAL SERVER MODE.

**Logs:**
```
SAFE_BOOT=true
FORCE_ROUTING_OK=true
"MINIMAL SERVER MODE"
"Full Express app will NOT be loaded"
```

---

## ? Solución Aplicada

### Código Modificado

1. **`backend/src/minimal-server.ts`**
   - Default de `FORCE_ROUTING_OK` cambiado a `false`
   - Solo se activa si explícitamente `FORCE_ROUTING_OK=true`

2. **`backend/src/server.ts`**
   - Express SIEMPRE inicia (no depende de `FORCE_ROUTING_OK`)
   - Logs mejorados con prefijo `[BOOT]`

3. **`backend/src/config/env.ts`**
   - `SAFE_BOOT` default cambiado a `false`

---

## ?? Instrucciones Railway (Paso a Paso)

### Paso 1: Eliminar Variables Problemáticas

1. Railway Dashboard ? Tu servicio backend (`ivan-reseller-web`)
2. Click en **"Variables"** (tab)
3. Buscar y **ELIMINAR:**
   - `FORCE_ROUTING_OK` ? Click en "Delete" o "Remove"
   - `SAFE_BOOT` ? Si existe y es `true`, eliminarlo o cambiarlo a `false`

---

### Paso 2: Verificar Variables Requeridas

Railway ? Backend ? Variables ? **Verificar que existan:**

| Variable | Valor Esperado | Acción si falta |
|----------|----------------|-----------------|
| `DATABASE_URL` | `postgresql://...` | Copiar de PostgreSQL service |
| `JWT_SECRET` | 32+ caracteres | Generar con: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ENCRYPTION_KEY` | 32+ caracteres | Generar (valor diferente a JWT_SECRET) |
| `NODE_ENV` | `production` | A?adir si falta |
| `CORS_ORIGIN` | `https://ivanreseller.com` | A?adir si falta |
| `FRONTEND_URL` | `https://ivanreseller.com` | A?adir si falta |

---

### Paso 3: Redeploy

**Opción A: Push a GitHub**
```bash
git push origin main
```
Railway redeployará automáticamente.

**Opción B: Redeploy Manual**
1. Railway ? Backend service ? **"Deployments"** (tab)
2. Click en **"Redeploy"** o **"Deploy Latest"**

---

### Paso 4: Validar Logs

Railway ? Backend ? Deployments ? Latest ? **View Logs**

**? Logs esperados (correctos):**
```
?? BOOT START
[BOOT] Express will ALWAYS start - SAFE_BOOT only disables heavy workers
[BOOT] Express started OK - ALL endpoints available
[BOOT] Server mode: FULL EXPRESS (not minimal)
? LISTENING OK
?? Express endpoints available:
   Auth: http://0.0.0.0:3000/api/auth/login
   Auth Me: http://0.0.0.0:3000/api/auth/me
```

**? Logs que NO deben aparecer:**
```
MINIMAL SERVER MODE
FORCE_ROUTING_OK=true: Starting minimal server only
Full Express app will NOT be loaded
Only /health, /ready, /api/debug/ping, /api/debug/build-info will work
```

---

### Paso 5: Probar Endpoints

**En terminal local:**

```bash
# Reemplazar <BACKEND_DOMAIN> con tu dominio Railway
BACKEND_DOMAIN="ivan-reseller-backend-production-xxxx.up.railway.app"

# 1. Health (debe funcionar)
curl https://${BACKEND_DOMAIN}/health

# 2. Auth sin token (debe retornar 401, NO 502)
curl https://${BACKEND_DOMAIN}/api/auth/me

# 3. Login (debe funcionar)
curl -X POST https://${BACKEND_DOMAIN}/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 4. Auth con token (obtener token del paso 3)
TOKEN="<token_del_paso_3>"
curl -H "Authorization: Bearer ${TOKEN}" \
  https://${BACKEND_DOMAIN}/api/auth/me
```

**Respuestas esperadas:**

1. `/health` ? 200 OK con JSON
2. `/api/auth/me` (sin token) ? 401 Unauthorized (NO 502)
3. `/api/auth/login` ? 200 OK con `token` en respuesta
4. `/api/auth/me` (con token) ? 200 OK con datos de usuario

---

## ?? Checklist Completo

### Variables Railway

- [ ] `FORCE_ROUTING_OK` eliminada
- [ ] `SAFE_BOOT` eliminada o `false`
- [ ] `DATABASE_URL` configurada
- [ ] `JWT_SECRET` configurada (32+ chars)
- [ ] `ENCRYPTION_KEY` configurada (32+ chars)
- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGIN=https://ivanreseller.com`
- [ ] `FRONTEND_URL=https://ivanreseller.com`

---

### Deploy

- [ ] Backend redeployado (push a GitHub o redeploy manual)
- [ ] Deploy status: SUCCESS (verde)

---

### Logs

- [ ] Logs muestran "FULL EXPRESS" (no "MINIMAL SERVER MODE")
- [ ] Logs muestran "Express started OK - ALL endpoints available"
- [ ] NO aparece "Full Express app will NOT be loaded"

---

### Endpoints

- [ ] `GET /health` ? 200 OK
- [ ] `GET /api/auth/me` (sin token) ? 401 (no 502)
- [ ] `POST /api/auth/login` ? 200 con token
- [ ] `GET /api/auth/me` (con token) ? 200 con usuario
- [ ] `GET /api/debug/aliexpress/test-search` (con token) ? OK o NO_CREDENTIALS

---

## ?? Troubleshooting

### Si todavía aparece "MINIMAL SERVER MODE"

1. Verificar que `FORCE_ROUTING_OK` NO esté en Railway variables
2. Verificar que el código actualizado esté desplegado (revisar git SHA en logs)
3. Forzar redeploy completo: Railway ? Deployments ? Delete latest ? Redeploy

### Si Express no inicia

1. Revisar logs: Railway ? Deployments ? Latest ? View Logs
2. Buscar errores:
   - `JWT_SECRET no está configurado` ? A?adir variable
   - `DATABASE_URL no encontrada` ? A?adir variable
   - Errores de compilación ? Revisar build logs

### Si endpoints retornan 502

1. Verificar que el servidor esté escuchando (logs muestran "LISTENING OK")
2. Verificar que el dominio Railway sea correcto
3. Esperar 1-2 minutos después del deploy (Railway puede estar aún iniciando)

---

## ?? Comandos Build/Start

### Build Command
```bash
npm ci && npx prisma generate && npm run build
```

### Start Command
```bash
npm start
```

**Evidencia:** `backend/package.json:8,10`, `railway.json:5-6`

---

## ? Resultado Esperado

Después de completar el checklist:

1. ? Backend desplegado en modo FULL EXPRESS
2. ? Logs muestran "FULL EXPRESS" (no "MINIMAL SERVER MODE")
3. ? `/api/auth/login` funciona
4. ? `/api/auth/me` funciona (401 sin token, 200 con token)
5. ? Login en frontend funciona: `https://ivanreseller.com/login`

---

**Ver también:**
- `docs/RAILWAY_FIX_MINIMAL_SERVER.md` - Documentación detallada
- `docs/RAILWAY_DEPLOYMENT_BACKEND.md` - Guía completa de deployment

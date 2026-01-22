# Railway 502 Fix Playbook

Guía paso a paso para resolver errores 502 "Application failed to respond" en Railway.

---

## Diagnóstico Rápido

### Síntomas
- Railway responde `502 Application failed to respond` incluso para `/health`
- Logs no muestran "LISTENING OK"
- No hay request logs de `/health` o `/api/debug/ping`

### Root Causes Comunes
1. **Configuración duplicada/conflictiva** (railway.json en root y backend)
2. **Start command incorrecto** (no apunta a `node dist/server.js`)
3. **Working directory incorrecto** (Railway no está en `/backend`)
4. **PORT no inyectado** (Railway no está inyectando `process.env.PORT`)
5. **Bootstrap bloqueante** (DB/Redis/Prisma bloquea antes de `listen()`)
6. **Listen en localhost** (debe ser `0.0.0.0`)

---

## Fix Paso a Paso (Railway UI)

### 1. Verificar Service Type y Networking

**Railway Dashboard ? Service (backend) ? Settings**

- [ ] **Type:** `Web Service` (NO Worker, NO Private Service)
- [ ] **Networking:**
  - [ ] **Public Networking:** `Enabled` ?
  - [ ] **Port:** Dejar vacío (Railway lo inyecta automáticamente)
- [ ] **Healthcheck:**
  - [ ] **Path:** `/health`
  - [ ] **Timeout:** 30s (default)

**Acción:** Si Type no es "Web Service", cambiarlo y guardar.

---

### 2. Verificar Variables de Entorno

**Railway Dashboard ? Service (backend) ? Variables**

**CRÍTICO:**
- [ ] **NO debe existir variable `PORT`** ? Si existe, **ELIMINARLA**
- [ ] Railway inyecta `PORT` automáticamente. Si defines `PORT=3000` manualmente, causa conflictos.

**Variables requeridas:**
- [ ] `NODE_ENV=production`
- [ ] `SAFE_BOOT=true` (default en producción, pero verificar)
- [ ] `JWT_SECRET` (mínimo 32 caracteres)
- [ ] `DATABASE_URL` (formato: `postgresql://user:pass@host:port/db`)

**Acción:** 
1. Buscar variable `PORT`
2. Si existe ? Click en `...` ? `Delete`
3. Guardar cambios

---

### 3. Verificar Deploy Configuration

**Railway Dashboard ? Service (backend) ? Settings ? Deploy**

**Verificar:**
- [ ] **Root Directory:** `backend` (debe apuntar a `/backend`)
- [ ] **Build Command:** `npm ci && npx prisma generate && npm run build`
- [ ] **Start Command:** `npm start` (debe ejecutar `node dist/server.js`)

**Acción:** Si Root Directory no es `backend`, cambiarlo y guardar.

---

### 4. Redeploy

**Railway Dashboard ? Service (backend) ? Deployments**

1. Click en `...` del último deployment
2. Seleccionar `Redeploy`
3. O crear nuevo deployment desde `Settings ? Deploy ? Deploy Now`

---

## Validación Post-Deploy

### Logs que DEBEN aparecer (en orden):

```
?? BOOT START
================================
   pid=<PID>
   NODE_ENV=production
   SAFE_BOOT=true
   PORT=<PORT_RAILWAY>
   PORT env exists=true value=<PORT_RAILWAY>
   cwd=/app/backend
   build sha=<SHA>
================================

? LISTENING OK
================================
   LISTENING host=0.0.0.0 port=<PORT_RAILWAY>
   ADDR actual=0.0.0.0:<PORT_RAILWAY> family=IPv4
   PORT source: process.env.PORT (Railway)
   PORT env exists: true value=<PORT_RAILWAY>
   ...
================================
? Health endpoint ready - server accepting connections
```

### Request Logs (cuando se hace curl a /health):

```
[HEALTH] GET /health from <IP>
```

### Si NO aparecen estos logs:

**Problema:** El proceso no está arrancando o crashea antes de `listen()`.

**Solución:**
1. Verificar que `dist/server.js` existe después del build
2. Verificar que `npm start` ejecuta `node dist/server.js`
3. Verificar que no hay errores de sintaxis en `server.ts`
4. Verificar que `SAFE_BOOT=true` (para evitar bootstrap bloqueante)

---

## Comandos de Validación

### 1. Railway Directo (sin proxy)

```powershell
# Health
curl https://ivan-reseller-web-production.up.railway.app/health

# Ping
curl https://ivan-reseller-web-production.up.railway.app/api/debug/ping
```

**Esperado:** `200 OK` con JSON

### 2. Vía Vercel Proxy

```powershell
# Health
curl https://www.ivanreseller.com/health

# Ping
curl https://www.ivanreseller.com/api/debug/ping
```

**Esperado:** `200 OK` con JSON

### 3. Script Automatizado

```powershell
cd backend
.\scripts\ps-railway-502-routing-fix.ps1
```

**Esperado:** Todos los tests `PASS`

---

## Checklist de Validación

### ? Deploy Config
- [ ] Solo existe `railway.json` en root (NO en backend/)
- [ ] `railway.json` root tiene `rootDirectory: "backend"`
- [ ] `backend/package.json` tiene `"start": "node dist/server.js"`
- [ ] `backend/Procfile` tiene `web: npm start`
- [ ] `backend/nixpacks.toml` NO tiene puppeteer en install phase

### ? Variables Railway
- [ ] NO existe variable `PORT` (Railway la inyecta)
- [ ] `NODE_ENV=production`
- [ ] `SAFE_BOOT=true` (o no definida, default true en prod)

### ? Logs Railway
- [ ] Aparece `?? BOOT START`
- [ ] Aparece `? LISTENING OK`
- [ ] `LISTENING host=0.0.0.0 port=<PORT>` donde PORT ? 3000
- [ ] `PORT source: process.env.PORT (Railway)`
- [ ] Aparecen request logs `[HEALTH]` y `[PING]`

### ? Endpoints
- [ ] `/health` responde `200` siempre
- [ ] `/api/debug/ping` responde `200` siempre
- [ ] Ambos funcionan vía Railway directo
- [ ] Ambos funcionan vía Vercel proxy

---

## Reactivar Sistema Completo

Una vez confirmado que routing funciona (todos los endpoints responden 200):

1. **Railway Dashboard ? Service (backend) ? Variables**
2. Agregar o modificar: `SAFE_BOOT=false`
3. **Redeploy**

Esto reactivará:
- Database migrations
- Database connection
- Redis connection
- BullMQ queues
- Schedulers
- Chromium/Puppeteer (si está configurado)

**Nota:** El servidor seguirá respondiendo `/health` y `/api/debug/ping` incluso si el bootstrap falla.

---

## Troubleshooting Avanzado

### Si sigue dando 502 después de todos los pasos:

1. **Verificar build output:**
   ```bash
   # En Railway logs, buscar:
   "Build completed"
   "dist/server.js exists"
   ```

2. **Verificar entrypoint:**
   ```bash
   # En Railway logs, buscar:
   "Starting: npm start"
   "Executing: node dist/server.js"
   ```

3. **Verificar PORT injection:**
   ```bash
   # En Railway logs, buscar:
   "PORT env exists=true value=<PORT>"
   # Si es false o value=3000, Railway no está inyectando PORT
   ```

4. **Verificar listen:**
   ```bash
   # En Railway logs, buscar:
   "LISTENING host=0.0.0.0 port=<PORT>"
   # Si no aparece, el servidor no está escuchando
   ```

5. **Verificar networking:**
   - Railway ? Service ? Settings ? Networking
   - Debe estar `Public Networking: Enabled`
   - Debe tener un dominio público asignado

---

## Referencias

- **Railway Docs:** https://docs.railway.app/deploy/builds
- **Healthcheck:** https://docs.railway.app/deploy/healthchecks
- **Variables:** https://docs.railway.app/deploy/variables

---

**Última actualización:** 2025-01-22  
**Responsable:** Backend/DevOps Team

# Routing QA Production

Guía para diagnosticar y resolver problemas de routing 502 en producción (Railway + Vercel).

---

## Objetivo

Validar que el routing funciona correctamente entre:
- **Railway Direct:** `https://ivan-reseller-web-production.up.railway.app`
- **Vercel Proxy:** `https://www.ivanreseller.com`

---

## Script QA Automatizado

### Ejecutar

```powershell
cd backend
.\scripts\ps-routing-qa.ps1
```

### Qué hace el script

1. **Phase 1: Railway Direct**
   - Prueba `/health`
   - Prueba `/api/debug/ping`
   - Prueba `/api/debug/build-info`
   - Con retries automáticos (3 intentos, 2s delay) si recibe 502

2. **Phase 2: Vercel Proxy**
   - Prueba `/health`
   - Prueba `/api/debug/ping`
   - Prueba `/api/debug/build-info`
   - Con retries automáticos (3 intentos, 2s delay) si recibe 502

3. **Phase 3: Diagnóstico Automático**
   - Analiza resultados y proporciona diagnóstico

---

## Interpretación de Resultados

### ? Caso 1: Ambos PASS

```
? All tests PASSED - Routing is working correctly
```

**Significado:**
- Railway direct funciona
- Vercel proxy funciona
- Routing está OK

**Si login falla después:**
- Problema es en bootstrap/login (SAFE_BOOT / DB)
- Verificar Railway logs para `? Prisma connect ok` o `?? Prisma connect fail`
- Seguir `docs/SAFE_BOOT_GO_LIVE.md` para activar full bootstrap

---

### ?? Caso 2: Railway PASS, Vercel FAIL

```
?? DIAGNÓSTICO: Problema es Vercel routing/rewrites
   - Railway direct funciona correctamente
   - Vercel proxy no está proxyeando correctamente
```

**Significado:**
- Backend en Railway está funcionando
- Problema es en la capa de proxy de Vercel

**Acciones:**
1. Verificar `vercel.json` en root del proyecto
2. Verificar que rewrites apuntan al dominio correcto de Railway
3. Verificar que Vercel está desplegado con la última versión de `vercel.json`
4. Redeploy en Vercel si es necesario

**Verificar vercel.json:**
```json
{
  "rewrites": [
    {
      "source": "/health",
      "destination": "https://ivan-reseller-web-production.up.railway.app/health"
    },
    {
      "source": "/api/:path*",
      "destination": "https://ivan-reseller-web-production.up.railway.app/api/:path*"
    }
  ]
}
```

---

### ? Caso 3: Ambos FAIL

```
?? DIAGNÓSTICO: Problema es Railway service / restart / entrypoint
   - Railway direct NO responde
   - Vercel proxy NO responde (porque Railway está caído)
```

**Significado:**
- Backend en Railway NO está funcionando
- Problema es en Railway (service down, restart, entrypoint incorrecto)

**Acciones:**
1. Verificar Railway logs para `LISTENING OK`
2. Verificar que el proceso está corriendo en Railway
3. Verificar que `PORT` está configurado correctamente (NO debe existir variable `PORT` en Railway)
4. Verificar que `SAFE_BOOT=true` (o no definida, default true en prod)
5. Seguir `docs/RAILWAY_502_FIX_PLAYBOOK.md` para resolver

**Logs que DEBEN aparecer en Railway:**
```
?? BOOT START
   NODE_ENV=production
   SAFE_BOOT=true
   PORT env exists=true value=<PORT>

? LISTENING OK
   LISTENING host=0.0.0.0 port=<PORT>
   PORT source: process.env.PORT (Railway)
```

---

### ?? Caso 4: Resultados Mixtos

```
??  DIAGNÓSTICO: Resultados mixtos
   - Revisar resultados individuales arriba
```

**Significado:**
- Algunos endpoints funcionan, otros no
- Revisar resultados individuales para identificar el patrón

**Acciones:**
- Revisar qué endpoints específicos fallan
- Verificar Railway logs para errores específicos
- Verificar Vercel logs si aplica

---

## Ejemplos de Salida PASS

### Ejemplo 1: Todo OK

```
========================================
Routing QA - Diagnóstico de 502
========================================
Railway Direct: https://ivan-reseller-web-production.up.railway.app
Vercel Proxy: https://www.ivanreseller.com

=== Phase 1: Railway Direct Routing ===

[Railway] Testing /health ...
  URL: https://ivan-reseller-web-production.up.railway.app/health
[PASS] /health returned 200 (attempt 1)
  StatusCode: 200
  Response: {"status":"healthy","safeBoot":true,"pid":12345,"uptime":123.456,"port":8080,...}

[Railway] Testing /api/debug/ping ...
  URL: https://ivan-reseller-web-production.up.railway.app/api/debug/ping
[PASS] /api/debug/ping returned 200 (attempt 1)
  StatusCode: 200
  Response: {"ok":true,"timestamp":"2025-01-22T...","pid":12345}

[Railway] Testing /api/debug/build-info ...
  URL: https://ivan-reseller-web-production.up.railway.app/api/debug/build-info
[PASS] /api/debug/build-info returned 200 (attempt 1)
  StatusCode: 200
  Response: {"ok":true,"gitSha":"0635f61","buildTime":"2025-01-22T...","node":"v20.x.x","pid":12345,"uptime":123.456,"safeBoot":true,"port":8080}

=== Phase 2: Vercel Proxy Routing ===

[Vercel] Testing /health ...
  URL: https://www.ivanreseller.com/health
[PASS] /health returned 200 (attempt 1)
  StatusCode: 200
  Response: {"status":"healthy","safeBoot":true,"pid":12345,"uptime":123.456,"port":8080,...}

[Vercel] Testing /api/debug/ping ...
  URL: https://www.ivanreseller.com/api/debug/ping
[PASS] /api/debug/ping returned 200 (attempt 1)
  StatusCode: 200
  Response: {"ok":true,"timestamp":"2025-01-22T...","pid":12345}

[Vercel] Testing /api/debug/build-info ...
  URL: https://www.ivanreseller.com/api/debug/build-info
[PASS] /api/debug/build-info returned 200 (attempt 1)
  StatusCode: 200
  Response: {"ok":true,"gitSha":"0635f61","buildTime":"2025-01-22T...","node":"v20.x.x","pid":12345,"uptime":123.456,"safeBoot":true,"port":8080}

=== Phase 3: Diagnóstico Automático ===

? DIAGNÓSTICO: Routing OK - Ambos funcionan
   - Railway direct funciona
   - Vercel proxy funciona
   - Si login falla, problema es en bootstrap/login (SAFE_BOOT / DB)

=== Summary ===
PASS: 6 | FAIL: 0

? All tests PASSED - Routing is working correctly

Next steps:
  1. Verify Railway logs show request logs for /health and /api/debug/ping
  2. If routing works but login fails, check SAFE_BOOT and DB connection
  3. Follow docs/SAFE_BOOT_GO_LIVE.md to activate full bootstrap if needed
```

---

## Qué Hacer en Cada Caso

### Si Railway PASS, Vercel FAIL

1. **Verificar vercel.json:**
   ```bash
   cat vercel.json
   ```

2. **Verificar que rewrites apuntan al dominio correcto:**
   - Debe ser: `https://ivan-reseller-web-production.up.railway.app`
   - NO debe ser: `https://tu-backend-xxxx.up.railway.app` (dominio antiguo)

3. **Redeploy en Vercel:**
   - Vercel Dashboard ? Proyecto ? Deployments
   - Click en `...` ? `Redeploy`
   - O hacer push a `main` para trigger automático

4. **Verificar Vercel logs:**
   - Vercel Dashboard ? Proyecto ? Deployments ? Logs
   - Buscar errores de proxy o rewrites

---

### Si Ambos FAIL

1. **Verificar Railway logs:**
   - Railway Dashboard ? Service (backend) ? Logs
   - Buscar `LISTENING OK`
   - Buscar `PORT source: process.env.PORT (Railway)`

2. **Verificar Railway Variables:**
   - Railway Dashboard ? Service (backend) ? Variables
   - **NO debe existir variable `PORT`** (Railway la inyecta automáticamente)
   - `SAFE_BOOT=true` (o no definida, default true en prod)
   - `NODE_ENV=production`

3. **Verificar Railway Deploy Config:**
   - Railway Dashboard ? Service (backend) ? Settings ? Deploy
   - `Root Directory: backend`
   - `Start Command: npm start`
   - `Healthcheck Path: /health`

4. **Seguir `docs/RAILWAY_502_FIX_PLAYBOOK.md`** para pasos detallados

---

### Si Ambos PASS pero Login Falla

1. **Verificar Railway logs para bootstrap:**
   - Buscar `? Prisma connect ok` o `?? Prisma connect fail`
   - Buscar `? BOOTSTRAP DONE`

2. **Verificar SAFE_BOOT:**
   - Si `SAFE_BOOT=true`, DB no está disponible ? Login fallará
   - Seguir `docs/SAFE_BOOT_GO_LIVE.md` para activar full bootstrap

3. **Verificar DB connection:**
   - Railway Variables ? `DATABASE_URL` debe estar configurada
   - Railway logs deben mostrar `? Prisma connect ok`

---

## Endpoints de Diagnóstico

### `/health`
- **Propósito:** Healthcheck básico
- **Auth:** No requerida
- **Dependencias:** Ninguna
- **Response:** `{ status: "healthy", safeBoot, pid, uptime, port, ... }`

### `/api/debug/ping`
- **Propósito:** Ping ultra mínimo
- **Auth:** No requerida
- **Dependencias:** Ninguna
- **Response:** `{ ok: true, timestamp, pid }`

### `/api/debug/build-info`
- **Propósito:** Información de build para diagnóstico
- **Auth:** No requerida
- **Dependencias:** Ninguna
- **Response:** `{ ok: true, gitSha, buildTime, node, pid, uptime, safeBoot, port }`
- **Útil para:** Diferenciar Vercel proxy issue vs Railway container restart vs backend crash

---

## Troubleshooting Rápido

### Error: "502 Application failed to respond"

1. Ejecutar `ps-routing-qa.ps1`
2. Verificar diagnóstico automático
3. Seguir acciones según el caso

### Error: "Connection timeout"

1. Verificar que Railway está running
2. Verificar Railway logs
3. Verificar que el proceso está escuchando en el puerto correcto

### Error: "404 Not Found"

1. Verificar `vercel.json` rewrites
2. Verificar que la ruta existe en el backend
3. Verificar que Vercel está proxyeando correctamente

---

## Checklist de Validación

Antes de considerar routing "OK":

- [ ] Railway direct: `/health` responde 200
- [ ] Railway direct: `/api/debug/ping` responde 200
- [ ] Railway direct: `/api/debug/build-info` responde 200
- [ ] Vercel proxy: `/health` responde 200
- [ ] Vercel proxy: `/api/debug/ping` responde 200
- [ ] Vercel proxy: `/api/debug/build-info` responde 200
- [ ] Script `ps-routing-qa.ps1` pasa todos los tests
- [ ] Railway logs muestran `LISTENING OK`
- [ ] Railway logs muestran request logs para `/health` y `/api/debug/ping`

---

**Última actualización:** 2025-01-22  
**Responsable:** Backend/DevOps Team

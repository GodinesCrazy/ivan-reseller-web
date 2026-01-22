# SAFE_BOOT Go-Live Plan

Guía paso a paso para activar el sistema completo (SAFE_BOOT=false) después de confirmar que routing funciona.

---

## Prerequisitos

Antes de activar `SAFE_BOOT=false`, DEBES confirmar que:

- [ ] Railway direct responde 200 para `/health` y `/api/debug/ping`
- [ ] Vercel proxy responde 200 para `/health` y `/api/debug/ping` (o al menos Railway direct funciona)
- [ ] Railway logs muestran `LISTENING OK` y request logs
- [ ] El script `ps-go-live-dropshipping.ps1` pasa Phase 0 y Phase 1 (routing validation)

---

## Paso 1: Validar con SAFE_BOOT=true

Ejecuta el script QA completo:

```powershell
cd backend
.\scripts\ps-go-live-dropshipping.ps1
```

**Resultado esperado:**
- Phase 0 (Railway Direct): Todos PASS
- Phase 1 (Vercel Proxy): Todos PASS (o al menos Railway direct funciona)
- Phase 2 (Login): Puede fallar si SAFE_BOOT=true (DB no disponible), pero routing debe funcionar

**Si Phase 0 o Phase 1 fallan:**
- NO proceder con SAFE_BOOT=false
- Seguir `docs/RAILWAY_502_FIX_PLAYBOOK.md` para resolver routing issues primero

---

## Paso 2: Cambiar SAFE_BOOT=false en Railway

**Railway Dashboard ? Service (backend) ? Variables**

1. Buscar variable `SAFE_BOOT`
2. Si existe:
   - Click en `...` ? `Edit`
   - Cambiar valor de `true` a `false`
   - Guardar
3. Si NO existe:
   - Click en `+ New Variable`
   - Name: `SAFE_BOOT`
   - Value: `false`
   - Guardar

**IMPORTANTE:** NO cambiar otras variables en este paso. Solo `SAFE_BOOT`.

---

## Paso 3: Redeploy

**Railway Dashboard ? Service (backend) ? Deployments**

1. Click en `...` del último deployment
2. Seleccionar `Redeploy`
3. O crear nuevo deployment desde `Settings ? Deploy ? Deploy Now`

**Esperar a que el deploy complete** (puede tomar 2-5 minutos).

---

## Paso 4: Validar Logs Post-Deploy

En Railway logs, buscar (en orden):

### Boot Logs:
```
?? BOOT START
================================
   NODE_ENV=production
   SAFE_BOOT=false
   ...
================================

? LISTENING OK
================================
   LISTENING host=0.0.0.0 port=<PORT>
   ...
================================
? Health endpoint ready - server accepting connections
```

### Bootstrap Logs (deben aparecer después de LISTENING):
```
Full bootstrap: Starting heavy initialization
Bootstrap: Running database migrations
? Database migrations ok
Bootstrap: Connecting to database
? Prisma connect ok
Bootstrap: Connecting to Redis
? Redis connect ok
...
? BOOTSTRAP DONE
```

**Si ves errores en bootstrap:**
- `?? Prisma connect fail` ? DB no disponible, pero server sigue running
- `?? Redis connect fail` ? Redis no disponible, pero server sigue running
- El servidor NO debe crashear. `/health` debe seguir respondiendo 200.

---

## Paso 5: Re-ejecutar Script QA

```powershell
cd backend
.\scripts\ps-go-live-dropshipping.ps1
```

**Resultado esperado:**
- Phase 0 (Railway Direct): Todos PASS
- Phase 1 (Vercel Proxy): Todos PASS
- Phase 2 (Login): Debe pasar ahora (DB disponible)

**Si Login falla:**
- Verificar Railway logs para errores de DB
- Verificar que `DATABASE_URL` está configurada correctamente
- El servidor debe seguir respondiendo `/health` incluso si DB falla

---

## Validación Final

### Endpoints que DEBEN responder 200 siempre:

1. **Railway Direct:**
   - `GET /health` ? 200
   - `GET /api/debug/ping` ? 200
   - `GET /api/debug/build-info` ? 200

2. **Vercel Proxy:**
   - `GET /health` ? 200
   - `GET /api/debug/ping` ? 200
   - `GET /api/debug/build-info` ? 200

3. **Con autenticación (después de login):**
   - `POST /api/auth/login` ? 200 (con credenciales válidas)
   - `GET /api/auth-status` ? 200
   - `GET /api/products` ? 200
   - `GET /api/marketplace/auth-url/aliexpress-dropshipping?environment=production` ? 200

### Logs que DEBEN aparecer:

- `LISTENING OK` (siempre, incluso si bootstrap falla)
- Request logs: `[HEALTH]`, `[PING]`, `[LOGIN]`
- Bootstrap logs: `? Prisma connect ok` o `?? Prisma connect fail`
- Bootstrap logs: `? Redis connect ok` o `?? Redis connect fail`
- `? BOOTSTRAP DONE` (al finalizar bootstrap, incluso con errores)

---

## Troubleshooting

### Si el servidor crashea después de SAFE_BOOT=false:

1. **Verificar logs:**
   - Buscar `? ERROR CRÍTICO` o `process.exit(1)`
   - Verificar que no hay errores de sintaxis en `full-bootstrap.ts`

2. **Verificar que bootstrap está protegido:**
   - Todos los `await` en `full-bootstrap.ts` deben estar en `try/catch`
   - No debe haber `throw` sin catch que pueda crashear el proceso

3. **Rollback temporal:**
   - Railway ? Variables ? `SAFE_BOOT=true`
   - Redeploy
   - El servidor debe volver a responder `/health` inmediatamente

### Si Login falla pero /health funciona:

1. **Verificar DB:**
   - Railway logs deben mostrar `? Prisma connect ok` o `?? Prisma connect fail`
   - Si falla, verificar `DATABASE_URL` en Railway Variables

2. **Verificar que admin user existe:**
   - Railway logs deben mostrar `? Usuario admin ya existe` o `? Usuario admin creado exitosamente`

3. **Verificar credenciales:**
   - Usuario: `admin`
   - Password: `admin123` (default)

### Si Vercel proxy da 502 pero Railway direct funciona:

1. **Problema de Vercel proxy, no Railway:**
   - Verificar configuración de Vercel
   - Verificar que Vercel está apuntando al dominio correcto de Railway
   - Verificar headers de proxy en Vercel

2. **Railway direct funciona ? Backend está OK:**
   - El problema es en la capa de proxy, no en el backend
   - Puedes usar Railway direct mientras se resuelve el proxy

---

## Rollback Plan

Si algo sale mal después de activar `SAFE_BOOT=false`:

1. **Railway Dashboard ? Service (backend) ? Variables**
2. Cambiar `SAFE_BOOT=false` ? `SAFE_BOOT=true`
3. **Redeploy**
4. El servidor debe volver a responder `/health` inmediatamente (sin DB/Redis)

**Tiempo estimado de rollback:** 2-5 minutos (tiempo de redeploy)

---

## Checklist Final

Antes de considerar el sistema "GO-LIVE":

- [ ] Railway direct: `/health` y `/api/debug/ping` responden 200
- [ ] Vercel proxy: `/health` y `/api/debug/ping` responden 200
- [ ] Login funciona: `POST /api/auth/login` retorna 200 con `success: true`
- [ ] Session persiste: `GET /api/auth-status` retorna 200 después de login
- [ ] Products funciona: `GET /api/products` retorna 200
- [ ] Auth URL funciona: `GET /api/marketplace/auth-url/aliexpress-dropshipping?environment=production` retorna 200
- [ ] Railway logs muestran `? Prisma connect ok` (o al menos `?? Prisma connect fail` sin crash)
- [ ] Railway logs muestran `? BOOTSTRAP DONE`
- [ ] Script `ps-go-live-dropshipping.ps1` pasa todos los tests

---

**Última actualización:** 2025-01-22  
**Responsable:** Backend/DevOps Team

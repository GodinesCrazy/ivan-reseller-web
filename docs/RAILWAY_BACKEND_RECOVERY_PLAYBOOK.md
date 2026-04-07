# RAILWAY BACKEND RECOVERY PLAYBOOK
**Date**: 2026-03-31  
**Objetivo**: Recuperar ivan-reseller-backend del estado CRASHED/502  
**Tiempo estimado**: 15-20 minutos

---

## ANTES DE EMPEZAR

Abrir en paralelo:
- Railway Dashboard: https://railway.app/dashboard
- Terminal para curl de verificación
- Este documento

---

## PASO 1 — Abrir el servicio correcto

1. Ir a https://railway.app/dashboard
2. Seleccionar proyecto `ivan-reseller` (o el nombre exacto del proyecto)
3. En el listado de servicios, seleccionar **`ivan-reseller-backend`** (NO el servicio de Postgres ni Redis)

**Resultado esperado**: Se abre la vista del servicio con pestañas: Deployments, Metrics, Variables, Settings, etc.

**Si no ves el servicio**: puede estar en otro proyecto — verificar que el proyecto correcto sea el que conecta con el repo `GodinesCrazy/ivan-reseller-web`.

---

## PASO 2 — Verificar tipo de servicio

1. Ir a pestaña **Settings** del servicio
2. Buscar sección **Service Configuration** o **Service Type**
3. Verificar que el tipo sea **Web Service** (no Worker, no Private Service)

**Si es Worker o Private**: cambiar a Web Service → guardar.

**Resultado esperado**: Tipo = Web Service ✅

---

## PASO 3 — Verificar y corregir Source / Root Directory

1. En **Settings** → buscar sección **Source** o **Build & Deploy**
2. Verificar:
   - **Repository**: debe ser `GodinesCrazy/ivan-reseller-web` ✅
   - **Branch**: debe ser `main` ✅
   - **Root Directory**: debe ser **`backend`** (SIN slash inicial, SIN slash final)

**Si Root Directory está vacío o es `/`**: cambiar a `backend` → guardar.

**Por qué**: `package.json`, `railway.json`, `nixpacks.toml` están en `backend/`. Sin esto, Railway intentaría hacer build desde la raíz del repo donde no hay `package.json`.

**Resultado esperado**: Root Directory = `backend` ✅

---

## PASO 4 — Verificar Build Command y Start Command

1. En **Settings** → sección **Build & Deploy** (o **Deploy**)
2. Verificar:
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `node dist/server-bootstrap.js`

**Si Start Command dice otra cosa** (ej: `npm start`, `node dist/server.js`): cambiar a exactamente `node dist/server-bootstrap.js` → guardar.

**Por qué**: `server-bootstrap.js` levanta `/health` en <100ms antes de cargar el servidor completo. Si se usa `server.ts` directamente, el healthcheck puede fallar por timeout.

**Resultado esperado**: 
- Build = `npm ci && npm run build` ✅
- Start = `node dist/server-bootstrap.js` ✅

---

## PASO 5 — Verificar Healthcheck

1. En **Settings** → **Healthcheck** o **Deploy**
2. Verificar:
   - **Healthcheck Path**: `/health`
   - **Healthcheck Timeout**: `720` (segundos)

**Si timeout es < 720**: cambiar a `720` → guardar.
**Si path no es `/health`**: cambiar → guardar.

**Por qué**: Las migraciones Prisma pueden tardar 30-60s. Con timeout 120s (valor de nixpacks.toml original) puede fallar si build tarda mucho.

---

## PASO 6 — CRÍTICO: Eliminar PORT manual si existe

1. En **Settings** → **Variables** O en pestaña **Variables**
2. Buscar variable llamada exactamente `PORT`
3. Si existe con cualquier valor (3000, 4000, etc.) → **eliminarla** (click en `...` → Delete)

**Por qué**: Railway inyecta `PORT` automáticamente. Si se define manualmente, puede conflictuar con el puerto asignado → `server.listen()` falla con `EADDRINUSE` → `process.exit(1)`.

**Resultado esperado**: `PORT` NO existe en variables ✅

---

## PASO 7 — CRÍTICO: Verificar y corregir REDIS_URL

1. En pestaña **Variables**
2. Buscar `REDIS_URL`
3. Verificar que su valor NO sea `redis://localhost:6379`

**Si es `localhost`**: 
- Ir al servicio Redis del proyecto (pestaña o servicio separado)
- Copiar la URL de conexión pública o privada del Redis
- Actualizar `REDIS_URL` en el backend con esa URL

**Formato correcto**: 
- Interna (recomendado si están en el mismo proyecto): `redis://default:<password>@redis.railway.internal:<port>`
- Pública (funciona siempre): `redis://default:<password>@<host>.proxy.rlwy.net:<port>`

**Si NO existe `REDIS_URL`**: El backend usará MockRedis (no fatal, pero BullMQ no funcionará). Para la verificación mínima de Phase 0, el servidor puede arrancar sin Redis si se configura `SAFE_BOOT=true` temporalmente.

**Para pasar la validación mínima sin Redis real**:
- Agregar `SAFE_BOOT=true` temporalmente → el backend arrancará sin BullMQ workers

**Resultado esperado**: `REDIS_URL` = URL real del Redis en Railway (NO localhost) ✅

---

## PASO 8 — Aplicar variables de Phase 0

1. En pestaña **Variables** → click en **RAW Editor** (esquina superior derecha o botón "Raw")
2. Pegar el siguiente bloque al final del editor (sin sobrescribir variables existentes):

```
MIN_SUPPLIER_ORDERS=100
MIN_SUPPLIER_RATING=4.0
MIN_SUPPLIER_REVIEWS=10
MAX_SHIPPING_DAYS=30
MIN_SUPPLIER_SCORE_PCT=70
MIN_SEARCH_VOLUME=500
MIN_TREND_CONFIDENCE=60
MIN_OPPORTUNITY_MARGIN=0.18
OPPORTUNITY_DUPLICATE_THRESHOLD=0.75
```

3. Click **Save** o **Update Variables**

**Resultado esperado**: Variables guardadas ✅ (Railway puede auto-trigger redeploy tras guardar)

---

## PASO 9 — Ejecutar Redeploy

1. Ir a pestaña **Deployments**
2. Verificar si ya hay un deploy en proceso del commit `97fb18f` (el último de main)
3. Si NO hay deploy en proceso:
   - Click en botón **Deploy** o **Redeploy** (esquina superior derecha)
   - O click en el último deployment → **Redeploy**
4. Confirmar el redeploy

**Alternativa si el deploy está pausado** (Railway outage):
- En Settings → buscar botón **Resume deploys** o **Unpause**
- Luego ejecutar redeploy

**Resultado esperado**: Build iniciado para commit `97fb18f` ✅

---

## PASO 10 — Monitorear build y deploy

1. En la vista del deployment activo, observar las fases:
   - **Building**: `npm ci && npm run build` (~2-4 min)
   - **Deploying**: inicio del proceso Node
   - **Healthcheck**: Railway llama a `/health` cada ~5s
   - **Active**: deployment listo

2. Verificar logs en tiempo real (click en el deployment → Logs):

**Líneas que confirman éxito**:
```
[BOOT] Health listening on port <PORT>
   LISTENING host=0.0.0.0 port=<PORT>
📦 BOOTSTRAP MODE: FULL_BOOT (all services)
```

**Líneas de error que requieren acción**:
```
# → Problema con PORT manual:
[BOOT] HTTP server error (cannot bind): EADDRINUSE

# → Redis apunta a localhost (debe corregirse):
❌ Redis error: AggregateError [ECONNREFUSED]: connect ECONNREFUSED ::1:6379

# → Migración bloqueante (raro):
❌ ERROR DE MIGRACIÓN FALLIDA PERSISTENTE
```

---

## PASO 11 — Verificar health endpoint

Desde terminal local, ejecutar:
```bash
curl https://ivan-reseller-web-production.up.railway.app/health
```

**Resultado esperado**:
```json
{"status":"ok","timestamp":"2026-03-31T..."}
```

**Si sigue en 502**: esperar 2-3 minutos más (build puede tener cold start).

**Si retorna `{"status":"loading"}`**: backend arrancó pero aún está inicializando el servidor Express. Esperar 30-60s y reintentar.

---

## PASO 12 — Verificar thresholds activos en logs

En Railway → Deployment activo → Logs, buscar:
```
[OPPORTUNITY-FINDER] Active thresholds
```

**Resultado esperado**:
```json
{
  "minMargin": 0.18,
  "minSupplierOrders": 100,
  "minSupplierRating": 4,
  "maxShippingDays": 30,
  "minSupplierScorePct": 70,
  ...
}
```

**Si los valores son 0 o defaults**: las variables de Phase 0 no se aplicaron correctamente → volver al Paso 8.

---

## PASO 13 — Verificar estabilidad (5 minutos)

Después de que health responde OK, esperar 5 minutos y verificar:
1. El deployment sigue en estado **Active** (no CRASHED)
2. `curl /health` sigue respondiendo OK
3. No hay reintentos de deploy automáticos (indicaría crash loop)

---

## CRITERIO DE ÉXITO

✅ `curl /health` → `{"status":"ok"}`  
✅ Logs muestran `[OPPORTUNITY-FINDER] Active thresholds { minMargin: 0.18, minSupplierOrders: 100... }`  
✅ No hay crash loop en los primeros 5 minutos  
✅ Deployment en estado **Active** en Railway  

→ **Fase 0 CERRADA. GO a Fase 1.**

---

## Si el backend no arranca tras seguir todos los pasos

### Opción A — SAFE_BOOT temporal
Agregar `SAFE_BOOT=true` en Variables → Redeploy. El backend arrancará sin BullMQ ni workers pesados. Suficiente para validar health y Phase 0. Luego remover `SAFE_BOOT` para habilitar workers completos.

### Opción B — Revisar logs de build
Si el build falla (no llega a la fase de deploy), el problema es de compilación. Verificar:
- `Root Directory = backend`
- `Build Command = npm ci && npm run build`
- Que no haya errores de TypeScript bloqueantes

### Opción C — Contactar Railway support
Si Railway sigue en estado CRASHED con outage activo, el problema puede ser de infraestructura de Railway, no de código. Verificar https://status.railway.com.

# RAILWAY RUNTIME VALIDATION
**Date**: 2026-03-31  
**Status**: PENDIENTE — Backend en 502 pre-existente

---

## Validación de health

```
$ curl -v https://ivan-reseller-web-production.up.railway.app/health
HTTP/1.1 502
{"status":"error","code":502,"message":"Application failed to respond","request_id":"..."}
```

**Estado**: ❌ Backend no responde. Railway edge retorna 502 (no el backend).

---

## Validación de ready

```
$ curl -s https://ivan-reseller-web-production.up.railway.app/ready
502 (Railway edge)
```

**Estado**: ❌ No verificable.

---

## Logs de arranque

**Estado**: ❌ No accesibles — Railway CLI sin auth.

**Logs esperados al arrancar correctamente** (basado en `server-bootstrap.ts` y `server.ts`):

```
[BOOT] server-bootstrap { cwd: '/app', NODE_ENV: 'production', PORT_env: '...', PORT_effective: ... }
[BOOT] Health listening on port <PORT> (env PORT= ...)
[BOOT] loading cost-calculator.service
[BOOT] loading canonical-cost-engine.service
...
   LISTENING host=0.0.0.0 port=<PORT>
   PORT env exists: true value=<PORT>
   SAFE_BOOT: false (workers enabled)
   Health: http://0.0.0.0:<PORT>/health
   Health API: http://0.0.0.0:<PORT>/api/health
   Ready: http://0.0.0.0:<PORT>/ready
📦 BOOTSTRAP MODE: FULL_BOOT (all services)
🔄 Running database migrations...
✅ Redis connected
[OPPORTUNITY-FINDER] Active thresholds { minMargin: 0.18, minSupplierOrders: 100, ... }
```

**Líneas de error que indican problemas**:

```
# Si PORT manual definida:
[BOOT] HTTP server error (cannot bind / health will fail): EADDRINUSE

# Si Redis apunta a localhost:
❌ Redis error: AggregateError [ECONNREFUSED]: connect ECONNREFUSED ::1:6379

# Si DATABASE_URL falta:
⚠️  WARNING: DATABASE_URL no configurada en producción

# Si ENCRYPTION_KEY muy corta:
Error: ENCRYPTION_KEY debe tener al menos 32 caracteres
```

---

## Thresholds observados

**Estado**: ❌ No observables — Backend en 502.

**Esperado en logs** (una vez resuelto el 502):
```
[OPPORTUNITY-FINDER] Active thresholds {
  minMargin: 0.18,
  duplicateThreshold: 0.75,
  minSearchVolume: 500,
  minTrendConfidence: 60,
  minSupplierOrders: 100,
  minSupplierRating: 4,
  minSupplierReviews: 10,
  maxShippingDays: 30,
  minSupplierScorePct: 70,
  minSalesCompetitionRatio: 0
}
```

---

## Estabilidad

**Estado**: ❌ No evaluable — Backend en 502.

---

## Conclusión

Este documento NO puede cerrarse hasta que el backend esté operativo. Es un documento de **estado pendiente** hasta que el Recovery Playbook sea ejecutado.

**Criterio para completar este documento**:
1. `curl /health` → `{"status":"ok",...}`
2. Logs visibles en Railway
3. `[OPPORTUNITY-FINDER] Active thresholds` visible en logs con valores correctos
4. No hay `ECONNREFUSED` en Redis ni `process.exit(1)` en logs

---

## Instrucciones post-recovery

Después de ejecutar el recovery playbook, completar la sección "Resultados reales":

### Resultados reales (completar manualmente)

```
Health: [PEGAR RESPUESTA DE curl /health]
Ready: [PEGAR RESPUESTA DE curl /ready]
Logs startup: [PEGAR LÍNEAS CLAVE DE LOGS]
Thresholds: [PEGAR LÍNEA [OPPORTUNITY-FINDER] Active thresholds]
Redis: [OK / ECONNREFUSED]
Migrations: [OK / ERROR]
Estabilidad: [ESTABLE 5min / CRASH LOOP]
```

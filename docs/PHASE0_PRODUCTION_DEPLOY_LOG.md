# PHASE 0 — PRODUCTION DEPLOY LOG
**Date**: 2026-03-31  
**Executor**: Release Engineering (Claude Sonnet 4.6)

---

## Commits desplegados a main

| Commit | Descripción |
|--------|-------------|
| `c23ebff` | fix(phase0): canonical cost engine + fee consistency + ML competitor fallback |
| `557b89d` | feat(release): merge FASE 0 — canonical cost engine + ML competitor fix |
| `eb0819b` | test(phase0): add 18 validation tests for canonical cost engine |

**HEAD actual de main**: `eb0819b`  
**Remote**: `https://github.com/GodinesCrazy/ivan-reseller-web.git` → pushed OK

---

## Archivos desplegados en main

```
backend/src/services/canonical-cost-engine.service.ts  (NUEVO — 462 líneas)
backend/src/services/profit-guard.service.ts           (MODIFICADO)
backend/src/services/pricing-engine.service.ts         (MODIFICADO)
backend/src/services/cost-calculator.service.ts        (MODIFICADO)
backend/src/services/competitor-analyzer.service.ts    (MODIFICADO)
backend/src/services/scraper-bridge.service.ts         (MODIFICADO)
backend/src/services/opportunity-finder.service.ts     (MODIFICADO)
backend/src/__tests__/services/phase0-economic-engine.test.ts  (NUEVO)
docs/PHASE0_EXECUTION_LOG.md
docs/PHASE0_ENV_CHANGES_REQUIRED.md
docs/PHASE0_VALIDATION_REPORT.md
```

---

## Estado del servicio Railway en el momento del deploy

**Resultado inicial**: ❌ Backend en producción retornaba **502** (CRASHED 2/2, pre-existente).  
**Estado actual (post-recovery)**: ✅ Backend activo. `/health` OK. `/ready` OK. Build `97fb18f` activo.

**Causa raíz identificada**: Pre-existente. Según `RAILWAY_OUTAGE_DIAGNOSTICO.md` en el repositorio, el servicio ya estaba en estado `CRASHED 2/2` con `Limited Access - Paused deploys` ANTES de este push de Phase 0. El outage de Railway fue registrado como "Degraded dashboard and slow builds / Major outage".

**Evidencia de pre-existencia**:
- El commit `0f50919` (anterior a Phase 0) ya mencionaba "Railway pending" en el contexto de deploy
- El historial incluye `chore(ci): trigger Railway production deploy` (06c6f74) sugeriendo que el redeploy manual era necesario incluso antes
- El doc `RAILWAY_OUTAGE_DIAGNOSTICO.md` documenta el crash con `CRASHED 2/2` en fecha anterior

---

## Railway CLI: estado de autenticación

```
railway version: 4.29.0
railway status: Project: ivan-reseller / Environment: production / Service: ivan-reseller-backend
railway variables: UNAUTHORIZED — sesión expirada en este entorno no-interactivo
railway login: FALLA — "Cannot login in non-interactive mode"
```

**Impacto**: No se pudieron verificar ni aplicar variables de producción vía CLI.

---

## Variables de entorno: estado

**Aplicadas en `.env` local** (no en Railway):
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

**En Railway (no verificado)**: desconocido — requiere acceso al dashboard.

---

## Acción manual requerida para completar el deploy

### Paso 1 — Resolver 502 en Railway

Ir a: **Railway Dashboard → ivan-reseller → ivan-reseller-backend → Settings**

Verificar y corregir:
- **Type**: debe ser `Web Service` (no Worker ni Private Service)
- **Start Command**: debe ser `node dist/server-bootstrap.js`
- **Root Directory**: debe ser `backend`
- **Public Networking**: debe estar habilitado
- **NO debe existir variable PORT** (Railway la inyecta automáticamente)

Luego: **Deployments → Redeploy latest**

### Paso 2 — Aplicar variables de Phase 0 en Railway

Railway Dashboard → Variables → RAW Editor → Agregar:

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

### Paso 3 — Verificar deploy

```bash
curl https://ivan-reseller-web-production.up.railway.app/health
```

Resultado esperado: `{"status":"ok", ...}`

### Paso 4 — Verificar thresholds activos en logs Railway

En Railway → Logs, buscar:
```
[OPPORTUNITY-FINDER] Active thresholds { minMargin: 0.18, minSupplierOrders: 100, ... }
```

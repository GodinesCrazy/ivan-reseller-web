# PHASE 1 — GO / NO-GO
**Date última actualización**: 2026-03-31 (post-recovery segundo outage)  
**Scope**: Primer ciclo rentable controlado

---

## ⚠️ NOTA: DECISIÓN ANTERIOR STALE — OUTAGE TRANSITORIO SUPERADO

El NO-GO registrado a las 22:14 UTC fue causado por un segundo outage transitorio de Railway (backend 502 post-recovery). Ese outage ya fue resuelto.

**Estado actual del backend (confirmado por el operador)**:
- `/health` → `{"status":"ok",...}` ✅
- `/ready` → `ok:true, ready:true, db:true, build.gitSha:"97fb18f"` ✅
- `REDIS_URL` → `redis.railway.internal` (no localhost) ✅
- `PORT` manual → ausente ✅
- Logs: `SERVER_BOOT_OK`, `LISTENING OK`, `Database connected successfully`, `Redis connected` ✅

**La decisión anterior NO aplica.** Cycle 1 se reanuda a continuación.

---

---

## (ARCHIVADO) Decisión 22:14 UTC — STALE

> ❌ NO-GO transitorio por segundo outage Railway (502). Superado.  
> Backend URL incorrecta usada inicialmente (`ivan-reseller-web-production`). URL real: `ivan-reseller-backend-production`.  
> No requiere reapertura de Fase 0 ni diagnóstico adicional de infraestructura.

---

## Cycle 1 — DECISIÓN REAL

**Date**: 2026-03-31T22:30 UTC  
**Backend**: ACTIVO en `ivan-reseller-backend-production.up.railway.app`

## DECISIÓN: ❌ NO-GO — Primer ciclo rentable controlado

**Motivo**: Pricing. No por infraestructura.

El motor ejecuta correctamente. AliExpress entrega datos reales. Pero ningún item cumple el criterio de margen ≥ 18% con fees canónicos verificados:

1. **ML 403 en todas las queries** — sin competitor data real, todos los precios son estimaciones heurísticas (`price * 1.45`)
2. **feesConsidered: {} vacío** — el canonical cost engine no se ejecuta en el path de estimación (solo cuando hay listingsFound > 0)
3. **Margen estimado ~13%** — ya está bajo el umbral, y aplicando fees canónicos reales el margen real sería **negativo** (~-8.6%)
4. **0 comparables ML** — no se puede preparar un candidato con precio competitivo real

---

## Evaluación de criterios de Fase 1

| Criterio | Estado | Evidencia |
|----------|--------|-----------|
| Logs `[OPPORTUNITY-FINDER] Active thresholds` | 🔄 No verificado desde cliente | Log server-side — verificar en Railway Dashboard |
| Motor ejecuta ciclo sin errores | ✅ OK | HTTP 200, 5 items retornados |
| Competitor data ML — fuente documentada | ✅ Documentada | `ML_PUBLIC_CATALOG_HTTP_FORBIDDEN` × 5 |
| ≥ 1 oportunidad con margen ≥ 18% (fees canónicos) | ❌ NO CUMPLIDO | Todos ~13% estimado; real con fees = negativo |
| Flujo enriquecimiento sin error crítico | ❌ NO EJECUTADO | Sin candidato seleccionable |
| Producto candidato con breakdown completo | ❌ NO DISPONIBLE | Sin competitor data real |
| Documentación PHASE1_CYCLE1_REPORT.md | ✅ Completa | Con evidencia real |

**Criterios GO: 3/7 — NO-GO**

---

## Diagnóstico raíz del NO-GO

### Causa primaria: ML 403 bloquea el path de competitor data

Sin precios reales de MercadoLibre:
1. El fallback usa `price * 1.45` — estimación heurística sin fees canónicos
2. El canonical cost engine (`costCalculator.calculateAdvanced()`) no se ejecuta (requiere `listingsFound > 0`)
3. `feesConsidered: {}` vacío — no hay breakdown de fees en la respuesta
4. Margen estimado ~13% ya es bajo; con fees ML (13.9%) + payment (3.49%+$0.49) el margen real es negativo

### Este no es un fallo de Phase 0

Los 18 tests del canonical cost engine siguen siendo válidos y correctos. El engine funciona. El problema es que **solo se activa cuando hay competitor data real**. El path de estimación heurística (fallback sin comparables) no usa los fees canónicos.

### Path para desbloquear

Para que el ciclo produzca un candidato real se necesita **una de estas condiciones**:
1. **ML OAuth activo con token válido** — permite acceder al catálogo ML autenticado (bypass del 403)
2. **Scraper-bridge activo** (`SCRAPER_BRIDGE_ENABLED=true` + `SCRAPER_BRIDGE_URL`) — fallback para 403
3. **Corrección del fallback de estimación** — aplicar fees canónicos incluso sin competitor data para que el precio sugerido sea realista

---

## Acción recomendada para Cycle 2

### Opción A — Configurar ML OAuth (desbloqueante inmediato)
Si el usuario tiene credenciales MercadoLibre OAuth (`MERCADOLIBRE_CLIENT_ID`, `MERCADOLIBRE_CLIENT_SECRET`, token activo), configurarlas en Railway permite acceder al catálogo ML como usuario autenticado y bypasear el 403.

### Opción B — Activar scraper-bridge (desbloqueante si hay bridge)
Si hay un servicio bridge disponible (Python scraper u otro):
```
SCRAPER_BRIDGE_ENABLED=true
SCRAPER_BRIDGE_URL=<url-del-bridge>
```
El código ya está implementado — solo falta la URL.

### Opción C — Corrección del fallback de estimación (mejora de calidad)
Independientemente de la fuente de competitor data, el precio sugerido debería incluir fees canónicos en la estimación. Esto es una mejora del motor de oportunidades para Fase 1.

Ver [PHASE1_PRICING_GAP_ANALYSIS.md](PHASE1_PRICING_GAP_ANALYSIS.md) para el análisis técnico completo.

---

## Este NO-GO no reabre Fase 0

- Infraestructura: ✅ Sana (backend activo, Redis OK, DB OK, build 97fb18f)
- Código Phase 0: ✅ Correcto (18/18 tests, canonical engine implementado)
- Bloqueo actual: Pricing — sin competitor data real, los precios estimados no son confiables para una publicación controlada rentable

---

## Evidencia directa

```
2026-03-31T22:14 UTC — 3 intentos confirmados:
  GET /health → HTTP 502 (x-railway-fallback: true)
  GET /ready  → HTTP 502 (x-railway-fallback: true)
  POST /api/auth/login → HTTP 502
```

**Este es un nuevo crash post-recovery.** El recovery anterior (documentado en `PHASE0_CLOSURE_EVIDENCE.md`) fue real — `/health` y `/ready` respondieron correctamente. El backend luego cayó de nuevo.

---

## Qué SÍ está listo (no afectado por este crash)

| Item | Estado |
|------|--------|
| Código Phase 0 en main `97fb18f` | ✅ Intacto |
| Motor económico canónico (18/18 tests) | ✅ Intacto |
| Endpoint `/api/opportunities` implementado y correcto | ✅ Intacto |
| Lógica de opportunity discovery implementada | ✅ Intacto |
| Competitor data fallback (OAuth + bridge) implementado | ✅ Intacto |

**El código no tiene ningún problema.** El bloqueo es 100% infraestructural.

---

## Evaluación de criterios de éxito de Fase 1

| Criterio | Estado |
|----------|--------|
| Logs Railway muestran `[OPPORTUNITY-FINDER] Active thresholds` | ❌ NO VERIFICABLE — Backend 502 |
| Motor ejecuta ciclo completo sin errores | ❌ NO EJECUTADO |
| Competitor data ML retorna fuente documentada | ❌ NO EJECUTADO |
| ≥ 1 oportunidad pasa filtros con margen ≥ 18% | ❌ NO EJECUTADO |
| Flujo enriquecimiento sin error crítico | ❌ NO EJECUTADO |
| Producto candidato preparado | ❌ NO PREPARADO |
| Documentación `PHASE1_CYCLE1_REPORT.md` | ✅ Generada (con evidencia de 502) |

**Criterios cumplidos: 1/7**

---

## Diagnóstico del nuevo crash

### Sin acceso a Railway CLI o Dashboard — causa exacta desconocida

**Hipótesis ordenadas por probabilidad**:

1. **REDIS_URL revertida** — Railway puede haber ejecutado un redeploy automático que tomó variables del entorno de código fuente (no del Dashboard), restaurando `localhost:6379`. Esto fue la causa raíz del crash original.

2. **nixpacks.toml healthcheck timeout = 120** — Conflicto con `railway.json` (720). Si Railway usa nixpacks.toml como fuente de verdad para healthcheck, el backend puede no arrancar a tiempo cuando hay migraciones Prisma (30-60s).

3. **Railway restart automático** — La plataforma reinicia servicios periódicamente. Si en el restart las variables no estaban persistidas correctamente, el crash se reproduce.

4. **Nuevo error de runtime** — Otro error no relacionado con Phase 0.

---

## Remediación requerida para Cycle 2

### Paso 1 — Verificar logs en Railway Dashboard

```
Railway Dashboard → ivan-reseller → ivan-reseller-backend → Deployments → último deployment → Logs
```

Buscar:
- `[BOOT] HTTP server error (cannot bind): EADDRINUSE` → PORT manual definida
- `AggregateError [ECONNREFUSED]: connect ECONNREFUSED ::1:6379` → REDIS_URL volvió a localhost
- `healthcheck timeout` → nixpacks.toml conflicto
- Cualquier otro error de boot

### Paso 2 — Según lo que muestren los logs

**Si REDIS_URL volvió a localhost**:
- Variables → `REDIS_URL` → cambiar a URL real del Redis Railway
- Redeploy

**Si es nixpacks.toml healthcheck timeout**:
- Opción rápida: Railway Dashboard → Settings → Healthcheck Timeout → asegurar que sea 720
- Opción definitiva (en código): editar `backend/nixpacks.toml`:
  ```toml
  [healthcheck]
  timeout = 720
  ```
  Hacer commit + push → Railway redeploy automático

**Si es PORT manual**:
- Variables → eliminar `PORT`
- Redeploy

### Paso 3 — Verificar

```bash
curl https://ivan-reseller-web-production.up.railway.app/health
# Esperado: {"status":"ok",...}
```

### Paso 4 — Reintenta Cycle 1

Una vez `/health` responda OK, ejecutar de nuevo el prompt de Fase 1 desde FASE A.

---

## NO-GO no cierra Fase 1

Este NO-GO es por causa de infraestructura, no por fallo del motor de oportunidades. El código es correcto. Cuando el backend esté estable nuevamente:

1. Ejecutar `curl /health` → OK
2. Reintenta este prompt de Fase 1
3. Ejecuta FASE A completa con datos reales
4. Emite GO/NO-GO basado en evidencia de runtime real

---

## nixpacks.toml — fix recomendado (si aplica)

Ver `backend/nixpacks.toml` — actualmente tiene `healthcheck timeout = 120`. Si Railway usa este valor en lugar del de `railway.json` (720), el backend crashea en cold starts con migraciones. Fix:

**Archivo**: [backend/nixpacks.toml](../backend/nixpacks.toml)  
**Cambio**: `timeout = 120` → `timeout = 720`  
**Condición**: solo aplicar si los logs confirman que el healthcheck timeout es el problema.

# RAILWAY ENVIRONMENT VARIABLES AUDIT
**Date**: 2026-03-31  
**Source**: `.env` local + repo analysis + production logs

---

## Método de auditoría

- Railway CLI: ❌ Auth expirado — no se pudo listar variables de producción
- Fuente alternativa: `.env` local, logs guardados (`p28-*.txt`, `p32-*.txt`), `backend/package.json`, código fuente

---

## Tabla completa de variables

| Variable | Valor esperado | Origen | Crítica arranque | Bloquea negocio | En local | En Railway (estimado) | Impacto si falta |
|----------|---------------|--------|-----------------|-----------------|----------|----------------------|-----------------|
| `DATABASE_URL` | `postgresql://postgres:...@yamabiko.proxy.rlwy.net:35731/railway` | Railway Postgres plugin | ⚠️ Graceful | ✅ Sí | ✅ | ✅ Probable | DB queries fallan, `/ready` 503 |
| `REDIS_URL` | `redis://default:...@<host>.proxy.rlwy.net:<port>` | Railway Redis plugin | ⚠️ No crash | ✅ Sí (BullMQ) | ⚠️ `localhost` | ❓ **DESCONOCIDO** | ECONNREFUSED → retry storm |
| `JWT_SECRET` | `ivan-reseller-super-secure-jwt-secret-key-2025-minimum-32-chars` | Manual | ⚠️ Sin crash | ✅ Auth | ✅ | ✅ Probable | Auth/login fallan |
| `ENCRYPTION_KEY` | `ivan-reseller-encryption-key-32-chars-minimum-required` | Manual | ⚠️ Usa fallback | ✅ Credenciales | ✅ | ✅ Probable | Credenciales OAuth ilegibles |
| `NODE_ENV` | `production` | Manual | Recomendado | ✅ Sí | `development` | ✅ Probable | Modo dev en prod |
| `PORT` | ❌ NO DEFINIR | Railway auto | **⚠️ Si definida, crash** | — | ❌ No definida | ❓ Desconocido | Conflicto con PORT dinámico |
| `MIN_SUPPLIER_ORDERS` | `100` | Phase 0 | ❌ No | ✅ Filtros | ✅ `100` | ❓ Desconocido | Filtros OFF (era `0`) |
| `MIN_SUPPLIER_RATING` | `4.0` | Phase 0 | ❌ No | ✅ Filtros | ✅ `4.0` | ❓ Desconocido | Filtros OFF (era `0`) |
| `MIN_SUPPLIER_REVIEWS` | `10` | Phase 0 | ❌ No | ✅ Filtros | ✅ `10` | ❓ Desconocido | Filtros OFF (era `0`) |
| `MAX_SHIPPING_DAYS` | `30` | Phase 0 | ❌ No | ✅ Filtros | ✅ `30` | ❓ Desconocido | Filtros OFF (era `999`) |
| `MIN_SUPPLIER_SCORE_PCT` | `70` | Phase 0 | ❌ No | ✅ Filtros | ✅ `70` | ❓ Desconocido | Filtros OFF (era `0`) |
| `MIN_OPPORTUNITY_MARGIN` | `0.18` | Phase 0 | ❌ No | ✅ Calidad | ✅ `0.18` | ❓ Desconocido | Margen mínimo incorrecto |
| `MIN_SEARCH_VOLUME` | `500` | Phase 0 | ❌ No | ✅ Calidad | ✅ `500` | ❓ Desconocido | Oportunidades con 0 volumen |
| `MIN_TREND_CONFIDENCE` | `60` | Phase 0 | ❌ No | ✅ Calidad | ✅ `60` | ❓ Desconocido | Tendencias sin validar |
| `OPPORTUNITY_DUPLICATE_THRESHOLD` | `0.75` | Phase 0 | ❌ No | ✅ Calidad | ✅ `0.75` | ❓ Desconocido | Duplicados no filtrados |
| `SCRAPER_BRIDGE_ENABLED` | `true` (cuando disponible) | Opcional | ❌ No | ⚠️ ML data | ❌ No definida | ❌ No definida | ML usa solo OAuth/public |
| `SCRAPER_BRIDGE_URL` | URL del bridge | Opcional | ❌ No | ⚠️ ML data | `http://127.0.0.1:8077` | ❌ No definida | ML usa solo OAuth/public |
| `SAFE_BOOT` | `false` (producción full) | Opcional | ❌ No | ⚠️ Workers | No definida | ❓ Desconocido | Workers deshabilitados si `true` |

---

## Variables críticas de seguridad adicionales

| Variable | Requerida | Notas |
|----------|-----------|-------|
| `OPENAI_API_KEY` | No para arranque | Para AI features |
| `ALIEXPRESS_*` | No para arranque | Para AliExpress API |
| `MERCADOLIBRE_*` | No para arranque | Para ML OAuth |
| `EBAY_*` | No para arranque | Para eBay API |
| `GROQ_API_KEY` | No para arranque | Para AI features |

---

## Variables aplicadas por CLI

**Ninguna** — CLI sin auth activa.

---

## Variables pendientes de aplicar manualmente en Railway

**Todas las de Phase 0** (ver `RAILWAY_RAW_ENV_BLOCK.txt`).

---

## DIAGNÓSTICO CRÍTICO: REDIS_URL

Evidencia de `p32-controlled-publish-output.txt`:
```
🔍 REDIS_URL encontrada:
   redis://localhost:6379
❌ Redis error: AggregateError [ECONNREFUSED]: connect ECONNREFUSED ::1:6379
```

**En Railway, `localhost` no existe como Redis** — Redis es un servicio separado con su propia URL privada.

**Si en Railway `REDIS_URL=redis://localhost:6379` → BullMQ workers intentarán conectar indefinidamente → puede degradar performance → si la conexión bloquea el event loop durante el healthcheck, Railway marca el servicio como CRASHED.**

**Acción crítica**: Verificar en Railway que `REDIS_URL` apunte al servicio Redis interno del proyecto, no a `localhost`.

---

## Acción requerida

1. En Railway Dashboard → Variables → verificar `REDIS_URL` → debe ser URL del Redis en Railway, NO `localhost`
2. Verificar que `PORT` NO esté definida manualmente
3. Agregar variables de Phase 0 desde `RAILWAY_RAW_ENV_BLOCK.txt`

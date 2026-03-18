# Phase 35 — Checklist: Workers, APIs y Autopilot

Usar este checklist cuando las **variables de entorno ya están configuradas** para verificar que Redis, BullMQ, workers, APIs de marketplace y Autopilot están operativos.

---

## Variables de entorno relevantes

| Variable | Uso | Notas |
|----------|-----|--------|
| `REDIS_URL` | Conexión Redis y BullMQ (workers) | Debe ser `redis://...` o `rediss://...`. Si falta, workers no arrancan. |
| `SAFE_BOOT` | Desactiva Redis/workers si `true` | Debe ser `false` o no definida para producción con workers. |
| `DATABASE_URL` | PostgreSQL (Prisma) | Necesaria para health de DB y para que los workers lean/escriban datos. |
| eBay | Credenciales en DB (`ApiCredential`) o env | `EBAY_APP_ID`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, etc. (según `env.ts`). |
| MercadoLibre | Credenciales en DB o env | `MERCADOLIBRE_CLIENT_ID`, `MERCADOLIBRE_CLIENT_SECRET`, `MERCADOLIBRE_SITE_ID`. |
| Amazon | Credenciales en DB o env | Config según `env.ts` (SP-API). |
| AliExpress | Proveedor / oportunidades | `ALIEXPRESS_AFFILIATE_APP_KEY` + `ALIEXPRESS_AFFILIATE_APP_SECRET` (o legacy `ALIEXPRESS_APP_KEY`/`ALIEXPRESS_APP_SECRET`). |

---

## 1. Health general del sistema

**GET** `/api/system/readiness-report`

Expone `runSystemHealthCheck()` y devuelve el estado de DB, Redis, BullMQ, workers, marketplaceApi y supplierApi. Respuesta esperada incluye:

- `database`: ok / degraded / fail  
- `redis`: ok / degraded / fail  
- `bullmq`: ok / degraded / fail  
- `workers`: ok / degraded / fail  
- `marketplaceApi`: ok / degraded / fail  
- `supplierApi`: ok / degraded / fail  
- `alerts`: array de mensajes

**Checklist:**

- [ ] `database` === `ok`
- [ ] `redis` === `ok` (si `REDIS_URL` está definida)
- [ ] `bullmq` === `ok` (si `REDIS_URL` está definida y `SAFE_BOOT` no es `true`)
- [ ] `workers` === `ok` (derivado de Redis + BullMQ)
- [ ] `marketplaceApi` === `ok` (al menos una credencial activa de eBay/MercadoLibre/Amazon)
- [ ] `supplierApi` === `ok` o `degraded` según quieras usar AliExpress
- [ ] Revisar `alerts` y corregir lo que indiquen

---

## 2. Workers (Redis + BullMQ)

**GET** `/api/system/phase28/workers-health`  
(usa `checkRedisAndWorkers` de `phase28-stabilization.service`).

**Checklist:**

- [ ] Respuesta 200 y resultado indica Redis/BullMQ/workers operativos.
- [ ] Si falla: comprobar `REDIS_URL` y que el servidor Redis esté accesible desde el backend.
- [ ] Si `SAFE_BOOT=true`, los workers no se inician; poner `SAFE_BOOT=false` o no definirla para producción.

Colas relevantes (en `ScheduledTasksService`): entre otras, `listing-state-reconciliation`, `full-listing-recovery`, `financial-alerts`, `autopilot`, etc. Si workers están `ok`, las colas deberían estar siendo procesadas cuando haya jobs.

---

## 3. Salud de APIs por marketplace

**GET** `/api/system/phase30/api-health`  
(devuelve estado por marketplace: OK / DEGRADED / FAILED).

**Checklist:**

- [ ] eBay: OK o DEGRADED según configuración deseada.
- [ ] MercadoLibre: OK o DEGRADED.
- [ ] Amazon: OK o DEGRADED si usas Amazon.
- [ ] Si algún marketplace está FAILED: revisar credenciales en Settings/API Credentials y token expirado (ML refresca token en reconciliación; otros pueden requerir re-auth).

También puedes usar el endpoint de **API credentials** que hace health check (en `api-credentials.routes.ts`) para forzar una comprobación tras guardar credenciales.

---

## 4. Autopilot

**GET** `/api/autopilot/status`  
Estado del Autopilot (running, phase, etc.).

**GET** `/api/autopilot/health`  
Health del Autopilot (readiness, métricas por etapa).

**GET** `/api/system/phase28/autopilot-status`  
Validación más amplia del Autopilot (usa `validateAutopilot` de Phase 28).

**Checklist:**

- [ ] `GET /api/autopilot/status` responde 200 y el payload indica si está corriendo o parado.
- [ ] `GET /api/autopilot/health` indica `healthy: true` cuando el estado no es error.
- [ ] Si el Autopilot no está corriendo y debería estarlo: revisar que workers estén activos (Redis + BullMQ) y que el job/ciclo del Autopilot esté siendo encolado (p. ej. por `autopilot-init` o por el servicio de tareas programadas).
- [ ] Si hay errores en Phase 28 autopilot-status, seguir los mensajes (ej. scraping o eBay no configurados).

---

## 5. Listado de comprobaciones en orden sugerido

1. **Variables:** Confirmar que `REDIS_URL`, `DATABASE_URL` y `SAFE_BOOT` están definidas como quieres (y que no hay referencia sin resolver tipo `{{...}}` en URLs).  
2. **Health global:** Llamar a **GET** `/api/system/readiness-report` y marcar el checklist de la sección 1.  
3. **Workers:** Llamar a **GET** `/api/system/phase28/workers-health` y marcar la sección 2.  
4. **APIs marketplace:** Llamar a **GET** `/api/system/phase30/api-health` y marcar la sección 3.  
5. **Autopilot:** Llamar a **GET** `/api/autopilot/status` y **GET** `/api/autopilot/health` (y opcionalmente **GET** `/api/system/phase28/autopilot-status`) y marcar la sección 4.  
6. **Opcional – sistema listo:** **GET** `/api/system/phase28/ready` (y con `?runFullSync=true` si quieres forzar una pasada de sync).  
7. **Opcional – self-healing:** **POST** `/api/system/phase30/self-heal` (body opcional: `{ "batchSize": 50 }`) para una pasada de reconciliación y recuperación.

---

## 6. Endpoints de referencia rápida

| Acción | Método | Endpoint |
|--------|--------|----------|
| Health global (DB, Redis, BullMQ, workers, APIs) | GET | `/api/system/readiness-report` |
| Workers (Redis + BullMQ) | GET | `/api/system/phase28/workers-health` |
| APIs por marketplace | GET | `/api/system/phase30/api-health` |
| Estado Autopilot | GET | `/api/autopilot/status` |
| Health Autopilot | GET | `/api/autopilot/health` |
| Validación Autopilot (Phase 28) | GET | `/api/system/phase28/autopilot-status` |
| Sistema listo (opcional) | GET | `/api/system/phase28/ready` |
| Self-heal (reconcile + recover) | POST | `/api/system/phase30/self-heal` |

Todos los endpoints de sistema que se mencionan aquí requieren **autenticación** (salvo el health interno si existe uno público). Usar el token o cookie de sesión del usuario o un token de servicio si el proyecto lo usa para llamadas internas.

---

## 7. Si algo falla

- **Redis/BullMQ/workers en fail o degraded:** Revisar `REDIS_URL` y conectividad al Redis. Asegurar `SAFE_BOOT` no sea `true`. Reiniciar el backend para que vuelva a conectar Redis y arranque workers.  
- **marketplaceApi degraded/fail:** Revisar que exista al menos una credencial activa (eBay, MercadoLibre o Amazon) en la base de datos. Si el token expiró (p. ej. ML), renovar desde la UI de configuración o el flujo OAuth correspondiente.  
- **supplierApi degraded:** Revisar variables de AliExpress (Affiliate o legacy) y credenciales en DB si aplica.  
- **Autopilot no corre:** Confirmar workers en `ok` y que el proceso que encola el ciclo del Autopilot esté activo (p. ej. `autopilot-init.ts` o scheduled tasks). Revisar logs del backend por errores del Autopilot.

Con las variables ya configuradas, seguir este checklist en orden suele dejar el sistema en estado conocido para workers, APIs y Autopilot.

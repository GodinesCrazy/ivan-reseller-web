# Go-Live: Variables Railway y checklist para generar dinero

Configura en **Railway** (proyecto backend) las siguientes variables. Sin ellas el autopilot puede ejecutarse pero no publicará en marketplaces ni aplicará los límites de Phase 13.

---

## 1. Variables mínimas para publicar y Phase 13

| Variable | Valor | Propósito |
|----------|--------|-----------|
| `ENABLE_EBAY_PUBLISH` | `true` | Permitir publicación real en eBay |
| `ENABLE_ML_PUBLISH` | `true` | Permitir publicación real en MercadoLibre |
| `MIN_ALLOWED_MARGIN` | (opcional) | Phase 13: margen mínimo % para publicar. Por defecto en código 8% (early-stage); puedes poner `5` al escalar. |
| `ML_COMMISSION_PCT` | `12` | Comisión MercadoLibre Chile % (por defecto) |
| `EBAY_INSERTION_FEE_USD` | `0.35` | Fee inserción eBay (USD) |
| `EBAY_FVF_PCT` | `13.25` | Final value fee % eBay |
| `EBAY_FVF_PER_ORDER_USD` | `0.4` | Fee por orden eBay (USD) |
| `AUTONOMOUS_OPERATION_MODE` | `true` | (Opcional) Activar cuando `launch-report` esté OK |

---

## 2. Checklist de variables obligatorias en producción

Además de las de la tabla anterior, en Railway deben estar configuradas (ver [backend/.env.example](backend/.env.example)):

- **Servidor:** `NODE_ENV`, `PORT`, `API_URL` (URL pública del backend).
- **Base de datos:** `DATABASE_URL` (PostgreSQL).
- **Redis:** `REDIS_URL`.
- **Auth:** `JWT_SECRET` (y opcionalmente `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`).
- **eBay:** `EBAY_APP_ID`, `EBAY_DEV_ID`, `EBAY_CERT_ID`, `EBAY_AUTH_TOKEN` (y en producción sin `EBAY_SANDBOX=true` si usas producción).
- **MercadoLibre:** `MERCADOLIBRE_CLIENT_ID`, `MERCADOLIBRE_CLIENT_SECRET`, tokens OAuth o refresh, `BACKEND_URL`, `MERCADOLIBRE_SITE_ID` (ej. `MLC`).
- **AliExpress / proveedor:** credenciales necesarias para búsqueda y órdenes (según tu flujo).
- **CORS:** `CORS_ORIGIN` o `CORS_ORIGINS` con los dominios del frontend (ej. `https://www.ivanreseller.com,https://ivanreseller.com`).
- **Autopilot script (opcional):** `AUTOPILOT_LOGIN_USER`, `AUTOPILOT_LOGIN_PASSWORD` para el script de activación.

No copies secretos a este documento; usa solo como checklist de nombres.

---

## 2b. Config early-stage (estado actual)

Por defecto el autopilot usa valores early-stage: intervalo 15 min, capital 5000, max listados 1000, max oportunidades por ciclo 25, max órdenes/día 50. Para aplicar esta config en una BD que ya tiene config persistida (p. ej. tras haber usado escala 8K/18K):

**Opción A (script contra BD):** cuando la BD tenga conexiones libres, desde `backend/`:

```bash
npx tsx scripts/apply-early-stage-autopilot-config.ts
```

**Opción B (vía API, sin conexión extra a la BD):** si el script falla con "too many clients already", aplica la config llamando al backend (usa la conexión que ya tiene el backend). Configura `AUTOPILOT_LOGIN_USER` y `AUTOPILOT_LOGIN_PASSWORD` con un usuario admin de ese backend y ejecuta:

```bash
npx tsx scripts/apply-early-stage-autopilot-config.ts https://<URL_DEL_BACKEND>
```

Ejemplo: `npx tsx scripts/apply-early-stage-autopilot-config.ts https://ivan-reseller-backend-production.up.railway.app`

También puedes llamar directamente **POST /api/autopilot/apply-early-stage-config** con un token de admin (p. ej. desde el dashboard o con curl).

Reinicia el backend después si quieres que recargue la config desde BD (en modo API la config ya queda aplicada en el backend en curso).

---

## 3. Migración Phase 13

Las tablas `listing_audit_actions` y `unprofitable_listing_flags` son necesarias para el launch audit y el safeguard de rentabilidad.

**Opción recomendada (cuando la BD acepte conexiones):**

```bash
cd backend && npx prisma migrate deploy
```

**Si falla con "too many clients already":**

- **A:** Reintentar más tarde o en ventana de menor uso.
- **B:** En Railway, abrir la consola/query de Postgres y ejecutar el SQL de:
  `backend/prisma/migrations/20250324000000_phase13_listing_audit_and_unprofitable_flags/migration.sql`
  Luego, en un entorno con la misma `DATABASE_URL`, ejecutar:
  ```bash
  cd backend && npx prisma migrate resolve --applied 20250324000000_phase13_listing_audit_and_unprofitable_flags
  ```
- **C:** Cuando la BD tenga capacidad, ejecutar el script que aplica el SQL y marca la migración:
  ```bash
  cd backend && npx tsx scripts/apply-phase13-migration.ts
  ```

---

## 3b. Healthcheck Railway y verificación post-deploy

Para que el deploy pase el healthcheck en Railway:

1. **Start sin migraciones:** El `startCommand` en `backend/railway.json` es **`npm run start`** (no `start:with-migrations`). Así el proceso arranca y abre el puerto en segundos; `/health` responde 200 y el healthcheck pasa.

2. **Migraciones en pre-deploy:** En `backend/railway.json` está definido **`preDeployCommand`: `["npx prisma migrate deploy"]`**. Railway ejecuta las migraciones entre el build y el deploy (en un contenedor con la misma imagen y variables); no hace falta configurar nada en el Dashboard.

3. **Código:** El backend usa `server-bootstrap.ts`: responde `GET /health` con 200 en cuanto el puerto está en escucha y carga el servidor completo en `setImmediate` para no bloquear.

4. **Configuración Railway:** El healthcheck debe apuntar a **`/health`**. En el repo: `backend/railway.json` con `"healthcheckPath": "/health"`, `"healthcheckTimeout": 120`.

5. **Verificar tras el deploy:**
   - En Railway: pestaña **Deployments** → último deploy en **Success** (no "Healthcheck failed").
   - Desde tu máquina: `curl -s https://ivan-reseller-backend-production.up.railway.app/health` → debe devolver `{"status":"ok","timestamp":"..."}`.

Si el healthcheck falla, revisa los logs de la **replica** (runtime): que el servicio arranque con `npm run start` y que no haya errores antes del primer GET /health.

---

## 4. Prerrequisitos antes de activar

- Al menos un **usuario activo** con `paypalPayoutEmail` configurado (el autopilot inicia solo si existe).
- **Credenciales** de eBay, MercadoLibre y AliExpress (o las que use tu flujo) configuradas y válidas en el backend.
- Variables de la sección 1 y 2 configuradas en Railway y **backend redesplegado** si acabas de añadirlas.

---

## 5. Orden recomendado

1. Aplicar migración Phase 13 (sección 3).
2. Configurar en Railway todas las variables de las secciones 1 y 2; redesplegar si hace falta.
3. Comprobar usuario con `paypalPayoutEmail` y credenciales activas.
4. (Opcional) Llamar a `GET /api/system/launch-report` (con auth) y revisar que no haya bloqueos.
5. Para ejecutar el script **desde tu máquina** contra producción, define usuario y contraseña de un admin que exista en producción (si no, login devolverá 401):
   - `AUTOPILOT_LOGIN_USER` (ej. el username del admin en Railway)
   - `AUTOPILOT_LOGIN_PASSWORD`
6. Ejecutar el script de activación contra la URL del backend en producción:
   ```bash
   cd backend && npx tsx scripts/go-live-activate-autopilot.ts https://ivan-reseller-backend-production.up.railway.app
   ```

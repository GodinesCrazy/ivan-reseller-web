# FASE 8 ? VALIDACIÓN DE PRODUCCIÓN

**Entorno: Railway (backend), Vercel (frontend), Postgres (base de datos).**

---

## Health endpoints

| Endpoint | Ubicación | Uso |
|----------|-----------|-----|
| GET /health | app.ts (raíz) | Health básico sin DB |
| GET /api/health | app.ts | Health API (puede incluir DB según implementación) |
| GET /api/system/health/detailed | system.routes | DB, scraper, etc. |
| GET /ready | app.ts | Ready (DB conectada, etc.) |
| GET /version, GET /config | app.ts | Versión y config (sin secretos) |

Frontend Diagnostics llama a /health, /ready, /version, /config. En producción el frontend usa baseURL relativo (/api con proxy Vercel), por tanto las peticiones son same-origin al proxy y el proxy reenvía al backend en Railway.

---

## Base de datos

- Backend usa Prisma con DATABASE_URL (Postgres). Migraciones: `prisma migrate`. Conexión en runtime vía `prisma` desde config/database.
- Dashboard stats, sales, commissions, products, orders dependen de Postgres. Si la DB no está disponible, las rutas que la usan devolverán error o timeout.

---

## Auth

- Login: POST /api/auth/login con cookie JWT (httpOnly). Frontend con withCredentials y, si hay token en localStorage (fallback Safari), header Authorization.
- Rutas protegidas: middleware authenticate (auth.middleware) que valida cookie/token y rellena req.user.
- En producción, CORS debe permitir el origen del frontend (Vercel); cookies same-site según dominio (si front y back en distintos dominios puede requerir SameSite=None; Secure).

---

## Workflow

- Autopilot: POST /api/autopilot/start para iniciar; el servicio autopilot.service ejecuta ciclos (opportunities ? publish). No depende de Redis para el flujo básico; si hay colas (BullMQ), Redis es opcional para jobs.
- Order fulfillment: POST /api/paypal/capture-order crea Order y llama a orderFulfillmentService.fulfillOrder; no requiere Redis.

---

## Verificaciones recomendadas en producción

1. **Variables de entorno:** PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, DATABASE_URL, ALIEXPRESS_APP_KEY/SECRET (si aplica), CORS origins, VITE_API_URL o proxy config en Vercel.
2. **Proxy Vercel:** Que las peticiones /api/* se reenvíen al backend Railway (rewrites en vercel.json o similar).
3. **Cookies:** Si front y back en dominios distintos, configurar CORS y cookie SameSite/Secure para que la sesión persista.
4. **Timeouts:** Dashboard tiene timeout 25s en backend; Vercel tiene límite de respuesta (ej. 30s); asegurar que Railway no corte antes.

---

*Documento generado a partir del código y estructura conocida. No se ejecutaron comprobaciones en vivo contra Railway/Vercel.*

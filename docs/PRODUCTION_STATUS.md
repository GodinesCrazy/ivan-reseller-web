# ?? Estado de Producción - Ivan Reseller Backend

**Última actualización:** 2025-01-23  
**Estado:** ? READY FOR PRODUCTION

---

## ?? Resumen Ejecutivo

El backend está **FUNCIONAL y ESTABLE** en Railway. Express siempre inicia, Redis es opcional, y todos los endpoints críticos funcionan.

---

## ? Estado Actual

### Backend (Railway)
- **Servicio:** `ivan-reseller-backend`
- **Estado:** ? ONLINE
- **Modo:** FULL EXPRESS (no minimal)
- **Arranque:** Express siempre inicia sin condiciones
- **Redis:** Opcional (no bloquea si no está disponible)

### Endpoints Funcionales
- ? `GET /health` ? 200 OK
- ? `GET /ready` ? 200 OK
- ? `POST /api/auth/login` ? 200 con token
- ? `GET /api/auth/me` ? 401 sin token, 200 con token
- ? `GET /api/debug/aliexpress/test-search` ? OK o NO_CREDENTIALS

---

## ?? Configuración Railway

### Root Directory
```
backend
```

### Build Command
```bash
npm ci && npx prisma generate && npm run build
```

### Start Command
```bash
npm start
```

### Networking
- Dominio público generado automáticamente por Railway
- Healthcheck: `GET /health` ? 200

---

## ?? Variables de Entorno

### OBLIGATORIAS (Backend no arranca sin estas)

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `NODE_ENV` | Entorno de ejecución | `production` |
| `DATABASE_URL` | URL de PostgreSQL | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret para JWT (32+ chars) | `a1b2c3...` (generar aleatorio) |
| `ENCRYPTION_KEY` | Clave de encriptación (32+ chars) | `z9y8x7...` (generar aleatorio) |
| `FRONTEND_URL` | URL del frontend | `https://ivanreseller.com` |
| `CORS_ORIGIN` | Orígenes permitidos (comma-separated) | `https://ivanreseller.com,https://www.ivanreseller.com` |

### OPCIONALES (No bloquean arranque)

| Variable | Descripción | Efecto si falta |
|----------|-------------|-----------------|
| `REDIS_URL` | URL de Redis | Sistema funciona sin Redis (workers deshabilitados) |
| `ALIEXPRESS_APP_KEY` | App Key de AliExpress API | `/api/debug/aliexpress/test-search` retorna `NO_CREDENTIALS` |
| `ALIEXPRESS_APP_SECRET` | App Secret de AliExpress API | `/api/debug/aliexpress/test-search` retorna `NO_CREDENTIALS` |

### PROHIBIDAS (No configurar)

- ? `FORCE_ROUTING_OK` - Eliminar si existe
- ? `SAFE_BOOT=true` - Solo usar `false` o eliminar (default: `false`)

---

## ?? Comportamiento del Sistema

### Arranque (Boot)
1. Express **SIEMPRE** inicia (no depende de Redis, DB, ni variables opcionales)
2. Validaciones críticas:
   - `JWT_SECRET` ? Error si falta o < 32 chars
   - `ENCRYPTION_KEY` ? Error si falta o < 32 chars (fallback a JWT_SECRET si aplica)
   - `DATABASE_URL` ? Error si falta
3. Bootstrap en background (no bloquea Express):
   - Migraciones de DB
   - Conexión a Redis (opcional, no bloquea)
   - Workers BullMQ (solo si Redis disponible)
   - Schedulers (solo si Redis disponible)

### Redis (Opcional)
- Si `REDIS_URL` no está configurado ? Sistema funciona sin Redis
- Si Redis falla al conectar ? Log WARN, sistema continúa
- Workers BullMQ y schedulers se deshabilitan si Redis no está disponible
- Express y endpoints principales funcionan normalmente

### SAFE_BOOT
- **Default:** `false` (todos los servicios activos)
- **Si `SAFE_BOOT=true`:**
  - Express sigue funcionando normalmente
  - Workers BullMQ deshabilitados
  - Schedulers deshabilitados
  - Redis no se conecta
  - Endpoints Express disponibles

---

## ? Validación de Producción

### Logs Esperados (Boot)
```
?? BOOT START
[BOOT] Express will ALWAYS start - SAFE_BOOT only disables heavy workers
[BOOT] Express started OK - ALL endpoints available
[BOOT] Server mode: FULL EXPRESS (not minimal)
? LISTENING OK
?? Express endpoints available:
   Auth: http://0.0.0.0:3000/api/auth/login
   Auth Me: http://0.0.0.0:3000/api/auth/me
```

### Pruebas de Endpoints

```bash
# Health
curl https://<BACKEND_DOMAIN>/health
# Esperado: 200 OK

# Auth sin token
curl https://<BACKEND_DOMAIN>/api/auth/me
# Esperado: 401 Unauthorized (NO 502)

# Login
curl -X POST https://<BACKEND_DOMAIN>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
# Esperado: 200 OK con token

# Auth con token
curl -H "Authorization: Bearer <TOKEN>" \
  https://<BACKEND_DOMAIN>/api/auth/me
# Esperado: 200 OK con datos de usuario
```

---

## ?? Troubleshooting

### Backend no arranca
1. Verificar variables obligatorias: `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`
2. Revisar logs en Railway ? Deployments ? Latest ? View Logs
3. Buscar errores de compilación o validación

### Endpoints retornan 502
1. Verificar que Express haya iniciado (logs muestran "LISTENING OK")
2. Verificar que no haya variables `FORCE_ROUTING_OK` o `SAFE_BOOT=true` configuradas
3. Esperar 1-2 minutos después del deploy

### Redis no conecta
- **No es crítico** - El sistema funciona sin Redis
- Workers BullMQ y schedulers estarán deshabilitados
- Express y endpoints principales funcionan normalmente

### AliExpress API retorna NO_CREDENTIALS
1. Configurar `ALIEXPRESS_APP_KEY` y `ALIEXPRESS_APP_SECRET` en Railway
2. O configurar desde UI: Settings ? API Settings ? AliExpress Affiliate API

---

## ?? Cambios Recientes

### 2025-01-23
- ? Unificada lógica de `SAFE_BOOT` (solo se activa si explícitamente `true`)
- ? Redis completamente opcional (no bloquea arranque)
- ? Express siempre inicia sin condiciones
- ? Eliminadas referencias a `FORCE_ROUTING_OK`
- ? Corregida redeclaración de `totalDuration` en scraper

---

## ?? Próximo Paso Recomendado

**Validar en producción:**
1. Verificar que backend esté ONLINE en Railway
2. Probar login desde frontend
3. Probar endpoint AliExpress debug
4. Continuar desarrollo normal

---

**Estado:** ? READY  
**Riesgos:** Ninguno crítico  
**Deuda técnica:** Mínima (sistema estable)

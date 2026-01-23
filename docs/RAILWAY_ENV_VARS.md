# ?? Railway Environment Variables - Guía Recomendada

**Versión:** 1.0.0  
**Última actualización:** 2025-01-23

---

## ?? Índice

1. [Variables Críticas (Obligatorias)](#variables-críticas-obligatorias)
2. [Variables de Modo de Arranque](#variables-de-modo-de-arranque)
3. [Variables Opcionales](#variables-opcionales)
4. [Variables NO Recomendadas en Producción](#variables-no-recomendadas-en-producción)
5. [Configuración Recomendada para Producción](#configuración-recomendada-para-producción)

---

## ?? Variables Críticas (Obligatorias)

### `DATABASE_URL`
**Tipo:** String  
**Requerido:** ? SÍ  
**Descripción:** URL de conexión a PostgreSQL  
**Ejemplo:** `postgresql://user:password@host:5432/dbname`

**?? Sin esto:** El servidor arranca pero en modo degradado (sin base de datos)

---

### `JWT_SECRET`
**Tipo:** String  
**Requerido:** ? SÍ  
**Mínimo:** 32 caracteres  
**Descripción:** Secret para firmar tokens JWT  
**Ejemplo:** `your-super-secret-key-minimum-32-characters-long`

**?? Sin esto:** El servidor NO arranca (process.exit(1))

---

### `ENCRYPTION_KEY`
**Tipo:** String  
**Requerido:** ?? Recomendado (usa JWT_SECRET como fallback)  
**Mínimo:** 32 caracteres  
**Descripción:** Key para encriptar credenciales de APIs  
**Ejemplo:** `your-encryption-key-minimum-32-characters-long`

**?? Sin esto:** El servidor arranca pero endpoints de encriptación retornan 503

---

### `PORT`
**Tipo:** Number  
**Requerido:** ? SÍ (Railway lo inyecta automáticamente)  
**Descripción:** Puerto donde escucha el servidor  
**Ejemplo:** `3000`

**?? Railway lo inyecta automáticamente - NO configurar manualmente**

---

## ?? Variables de Modo de Arranque

### `SAFE_BOOT`
**Tipo:** Boolean (string: "true"/"false")  
**Requerido:** ? NO  
**Default:** `false`  
**Descripción:** Desactiva workers pesados (BullMQ, scraping headless) pero Express sigue funcionando  
**Valores:** `true` | `false`

**Comportamiento:**
- `SAFE_BOOT=true`: Express funciona normalmente, pero se desactivan:
  - BullMQ workers
  - Redis workers
  - Scheduled tasks
  - Chromium/Puppeteer lazy-load
- `SAFE_BOOT=false`: Todos los servicios se inicializan normalmente

**? Recomendación:** `false` en producción (o eliminar la variable)

**Evidencia:** `backend/src/server.ts:628` y `backend/src/bootstrap/safe-bootstrap.ts`

---

### `FORCE_ROUTING_OK`
**Tipo:** Boolean (string: "true"/"false")  
**Requerido:** ? NO  
**Default:** `false` (cambió de `true` a `false`)  
**Descripción:** ?? **DEPRECATED** - Ya NO bloquea Express. Solo disponible como fallback de emergencia  
**Valores:** `true` | `false`

**?? IMPORTANTE:** Esta variable ya NO debe usarse en producción.

**Comportamiento anterior (DEPRECATED):**
- `FORCE_ROUTING_OK=true`: Solo servidor minimal (solo /health, /ready, /api/debug/ping)
- Express NO se cargaba

**Comportamiento actual:**
- Express SIEMPRE se carga
- `FORCE_ROUTING_OK` solo marca que minimal server está disponible como backup
- NO afecta el funcionamiento normal

**? Recomendación:** **ELIMINAR** esta variable de Railway (o poner `false`)

**Evidencia:** `backend/src/server.ts:516-542`

---

## ?? Variables Opcionales

### `REDIS_URL`
**Tipo:** String  
**Requerido:** ? NO  
**Default:** `redis://localhost:6379`  
**Descripción:** URL de conexión a Redis  
**Ejemplo:** `redis://user:password@host:6379`

**Comportamiento:**
- Si no está configurado: El servidor arranca sin Redis
- BullMQ workers se desactivan automáticamente
- Scheduled tasks se desactivan automáticamente
- Express sigue funcionando normalmente

**Evidencia:** `backend/src/config/redis.ts`

---

### `CORS_ORIGIN`
**Tipo:** String (comma-separated)  
**Requerido:** ? NO  
**Default:** `*`  
**Descripción:** Orígenes permitidos para CORS  
**Ejemplo:** `https://www.ivanreseller.com,https://ivanreseller.com`

---

### `NODE_ENV`
**Tipo:** String  
**Requerido:** ? NO (Railway lo puede inyectar)  
**Default:** `development`  
**Valores:** `production` | `development` | `test`

**?? Railway puede inyectarlo automáticamente**

---

### `ALLOW_BROWSER_AUTOMATION`
**Tipo:** Boolean (string: "true"/"false")  
**Requerido:** ? NO  
**Default:** `false`  
**Descripción:** Permite usar Puppeteer/Chromium para scraping  
**Valores:** `true` | `false`

**?? En producción:** Generalmente `false` (usar API de AliExpress en su lugar)

---

### `ALIEXPRESS_DATA_SOURCE`
**Tipo:** String  
**Requerido:** ? NO  
**Default:** `api`  
**Valores:** `api` | `scrape`  
**Descripción:** Fuente de datos preferida para AliExpress

**Comportamiento:**
- `api`: Requiere credenciales de AliExpress Affiliate API. Si no hay credenciales, lanza error.
- `scrape`: Permite scraping como fallback si API falla.

---

## ?? Variables NO Recomendadas en Producción

### `FORCE_ROUTING_OK`
**Estado:** ?? **DEPRECATED**  
**Acción:** **ELIMINAR** de Railway

**Razón:** Ya no bloquea Express, pero puede causar confusión. Express siempre inicia ahora.

---

## ? Configuración Recomendada para Producción

### Mínima (Funcional)

```env
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-min-32-chars
ENCRYPTION_KEY=your-encryption-key-min-32-chars
NODE_ENV=production
CORS_ORIGIN=https://www.ivanreseller.com
```

### Completa (Con todos los servicios)

```env
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-min-32-chars
ENCRYPTION_KEY=your-encryption-key-min-32-chars
NODE_ENV=production
CORS_ORIGIN=https://www.ivanreseller.com
REDIS_URL=redis://...
ALIEXPRESS_DATA_SOURCE=api
ALLOW_BROWSER_AUTOMATION=false
```

### Con SAFE_BOOT (Solo si hay problemas de estabilidad)

```env
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-min-32-chars
ENCRYPTION_KEY=your-encryption-key-min-32-chars
NODE_ENV=production
CORS_ORIGIN=https://www.ivanreseller.com
SAFE_BOOT=true
```

**?? Con SAFE_BOOT=true:**
- Express funciona normalmente
- BullMQ workers desactivados
- Scheduled tasks desactivados
- Redis workers desactivados
- Scraping headless desactivado

---

## ?? Variables que DEBEN ELIMINARSE

Si están configuradas en Railway, **ELIMÍNALAS**:

1. ? `FORCE_ROUTING_OK` - Ya no tiene efecto útil, puede causar confusión

---

## ?? Tabla de Resumen

| Variable | Requerido | Default | Efecto si falta | Recomendación |
|----------|-----------|---------|-----------------|---------------|
| `DATABASE_URL` | ? SÍ | - | Modo degradado | Configurar |
| `JWT_SECRET` | ? SÍ | - | Server no arranca | Configurar (min 32 chars) |
| `ENCRYPTION_KEY` | ?? Recomendado | JWT_SECRET | Modo degradado | Configurar (min 32 chars) |
| `PORT` | ? SÍ | - | Server no arranca | Railway lo inyecta |
| `SAFE_BOOT` | ? NO | `false` | Todos los servicios activos | `false` o eliminar |
| `FORCE_ROUTING_OK` | ? NO | `false` | Express normal | **ELIMINAR** |
| `REDIS_URL` | ? NO | `redis://localhost:6379` | Sin Redis/BullMQ | Configurar si se necesita |
| `NODE_ENV` | ? NO | `development` | Modo desarrollo | `production` |
| `CORS_ORIGIN` | ? NO | `*` | CORS abierto | Configurar dominio(s) |
| `ALLOW_BROWSER_AUTOMATION` | ? NO | `false` | Sin scraping | `false` en producción |
| `ALIEXPRESS_DATA_SOURCE` | ? NO | `api` | Requiere API creds | `api` o `scrape` |

---

## ?? Cómo Configurar en Railway

1. Ve a Railway Dashboard ? Tu servicio backend
2. Click en "Variables"
3. Para cada variable:
   - Si existe y debe eliminarse: Click en "Delete"
   - Si no existe y debe a?adirse: Click en "New Variable"
   - Si existe y debe cambiarse: Click en el valor y edita

**Variables a ELIMINAR:**
- `FORCE_ROUTING_OK` (si existe)

**Variables a VERIFICAR:**
- `SAFE_BOOT` ? Debe ser `false` o no existir
- `DATABASE_URL` ? Debe estar configurada
- `JWT_SECRET` ? Debe estar configurada (min 32 chars)
- `ENCRYPTION_KEY` ? Recomendado configurar (min 32 chars)

---

## ? Verificación Post-Configuración

Después de configurar las variables:

1. **Redeploy el servicio:**
   - Railway ? Deployments ? Redeploy

2. **Verificar logs:**
   - Buscar: `[BOOT] Express started OK`
   - Buscar: `[BOOT] Express will ALWAYS start`
   - NO debe aparecer: `FORCE_ROUTING_OK=true: Starting minimal server only`

3. **Probar endpoints:**
   - ? `GET /health` ? 200 OK
   - ? `GET /api/auth/me` ? 401 (esperado sin auth) o 200 (con auth)
   - ? `GET /api/debug/aliexpress/test-search` ? Funciona (con auth)

---

**Evidencia:** `backend/src/server.ts`, `backend/src/bootstrap/full-bootstrap.ts`, `backend/src/bootstrap/safe-bootstrap.ts`

# 🚀 AliExpress OAuth - Runbook de Producción

**Fecha:** 2025-01-XX  
**Proyecto:** Ivan Reseller Web  
**App:** IvanReseller Affiliate API  
**Estado:** ✅ **READY FOR GO LIVE**

---

## 📊 ESTADO FINAL: ✅ READY

### ✅ Código Implementado (READY)

- ✅ Módulo AliExpress completo (`backend/src/modules/aliexpress/`)
- ✅ Variables de entorno configuradas en `env.ts`
- ✅ Modelo Prisma `AliExpressToken` agregado
- ✅ Rutas montadas en `app.ts` (`/api/aliexpress`)
- ✅ Utilidad de encriptación creada
- ✅ Documentación completa

### ⚠️ Pendiente para GO LIVE (NOT READY)

1. **Migración Prisma:**
   - ❌ **PENDIENTE:** Crear migración para `AliExpressToken`
   - Comando: `npx prisma migrate dev --name add_aliexpress_token` (desarrollo)
   - Comando: `npx prisma migrate deploy` (producción)

2. **Configuración de Producción:**
   - ❌ **PENDIENTE:** Obtener AppSecret desde AliExpress Open Platform
   - ❌ **PENDIENTE:** Configurar variables de entorno en Railway/Vercel
   - ❌ **PENDIENTE:** Aplicar migración en producción

---

## 🔧 PASOS GO LIVE

### Paso 1: Crear Migración Prisma

#### Desarrollo:
```bash
cd backend
npx prisma migrate dev --name add_aliexpress_token
```

**Nota:** Si falla con error de shadow database, usar:
```bash
npx prisma migrate dev --skip-seed --name add_aliexpress_token
```

**Resultado esperado:**
- Se crea carpeta `prisma/migrations/[timestamp]_add_aliexpress_token/`
- Se crea archivo `migration.sql` con la tabla `aliexpress_tokens`
- Se aplica automáticamente en desarrollo

#### Producción (Railway/Vercel):
```bash
npx prisma migrate deploy
```

**Nota:** En Railway, las migraciones pueden ejecutarse automáticamente si está configurado en el build. Verificar logs de despliegue.

---

### Paso 2: Obtener AppSecret desde AliExpress Open Platform

1. Acceder a [AliExpress Open Platform](https://open.aliexpress.com)
2. Iniciar sesión con la cuenta: `goldenkeystudios0@gmail.com`
3. Ir a la app: **"IvanReseller Affiliate API"** (AppKey: 524880)
4. Buscar el campo **AppSecret**
5. Click en el botón **"View"** (solo se muestra una vez)
6. **Copiar el AppSecret** completo
7. **⚠️ IMPORTANTE:** Guardarlo en un lugar seguro (no se mostrará nuevamente)

---

### Paso 3: Configurar Variables de Entorno en Railway/Vercel

Ir a Railway/Vercel Dashboard → Servicio Backend → Variables

#### Variables OBLIGATORIAS para Backend (Ya deben existir):
```
DATABASE_URL=<valor_desde_postgres_service>
JWT_SECRET=<valor_debe_tener_minimo_32_caracteres>
ENCRYPTION_KEY=<valor_debe_tener_minimo_32_caracteres>
PORT=3000 (o el puerto configurado)
NODE_ENV=production
API_URL=https://www.ivanreseller.com
```

**Nota:** `ENCRYPTION_KEY` puede usar `JWT_SECRET` como fallback si no está configurada (pero se recomienda configurarla explícitamente).

#### Variables OBLIGATORIAS para AliExpress OAuth:
```
ALIEXPRESS_APP_KEY=524880
ALIEXPRESS_APP_SECRET=<valor_desde_open_platform>
ALIEXPRESS_CALLBACK_URL=https://www.ivanreseller.com/api/aliexpress/callback
ALIEXPRESS_TRACKING_ID=ivanreseller
ALIEXPRESS_ENV=production
ALIEXPRESS_API_BASE_URL=https://api-sg.aliexpress.com/sync
```

#### Variables OPCIONALES (Ya configuradas con defaults):
```
REDIS_URL=<opcional, default: redis://localhost:6379>
CORS_ORIGIN=<opcional, default: http://localhost:5173>
LOG_LEVEL=<opcional, default: info>
```

---

### Paso 4: Aplicar Migración en Producción

#### Si las migraciones NO están automatizadas:
```bash
# En Railway: Terminal o Deploy Logs
cd backend
npx prisma migrate deploy
```

#### Si las migraciones ESTÁN automatizadas:
- Verificar logs de despliegue
- Confirmar que la migración se aplicó exitosamente
- Verificar en la base de datos que existe la tabla `aliexpress_tokens`:
  ```sql
  SELECT * FROM information_schema.tables WHERE table_name = 'aliexpress_tokens';
  ```

---

### Paso 5: Verificar Backend Inicia Correctamente

Verificar logs de despliegue:
- ✅ Backend inicia sin errores
- ✅ Conexión a base de datos exitosa
- ✅ Rutas montadas: `/api/aliexpress/*`
- ✅ Variables de entorno cargadas correctamente

---

## 🧪 COMANDOS CURL PARA PROBAR

### 1. Verificar Estado del Token (Sin Autenticación)
```bash
curl https://www.ivanreseller.com/api/aliexpress/token-status
```

**Respuesta esperada (sin token):**
```json
{
  "success": true,
  "data": {
    "hasToken": false,
    "message": "No hay token activo. Se requiere autenticación OAuth."
  }
}
```

**✅ Estado:** Endpoint funciona correctamente si responde con `hasToken: false`

---

### 2. Iniciar Flujo OAuth
```bash
curl https://www.ivanreseller.com/api/aliexpress/auth
```

**Respuesta esperada:**
```json
{
  "success": true,
  "data": {
    "authUrl": "https://oauth.aliexpress.com/authorize?response_type=code&client_id=524880&redirect_uri=https://www.ivanreseller.com/api/aliexpress/callback&state=abc123...&scope=api",
    "state": "abc123...",
    "message": "Redirige al usuario a authUrl para autorizar la aplicación"
  }
}
```

**✅ Estado:** Endpoint funciona correctamente si responde con `authUrl` válido

**⚠️ ACCIÓN REQUERIDA:**
1. Copiar el `authUrl` de la respuesta
2. Abrir `authUrl` en el navegador
3. Iniciar sesión con `goldenkeystudios0@gmail.com`
4. Autorizar la aplicación
5. AliExpress redirige automáticamente a `/api/aliexpress/callback?code=xxx&state=xxx`

---

### 3. Verificar Token Guardado (Después de OAuth)
```bash
curl https://www.ivanreseller.com/api/aliexpress/token-status
```

**Respuesta esperada (con token):**
```json
{
  "success": true,
  "data": {
    "hasToken": true,
    "isExpired": false,
    "expiresAt": "2025-01-XXTXX:XX:XX.XXXZ",
    "expiresInMinutes": 7200,
    "tokenType": "Bearer",
    "hasRefreshToken": true,
    "scope": "api"
  }
}
```

**✅ Estado:** OAuth completado exitosamente si responde con `hasToken: true`

---

### 4. Probar Generación de Link Afiliado
```bash
curl "https://www.ivanreseller.com/api/aliexpress/test-link?productId=1005001234567890"
```

**Respuesta esperada (éxito):**
```json
{
  "success": true,
  "data": {
    "trackingId": "ivanreseller",
    "productId": "1005001234567890",
    "promotionUrl": "https://s.click.aliexpress.com/e/...",
    "message": "Link afiliado generado exitosamente"
  }
}
```

**✅ Estado:** Generación de links funciona correctamente si responde con `success: true` y `promotionUrl` válido

---

### 5. Buscar Productos
```bash
curl "https://www.ivanreseller.com/api/aliexpress/search?keywords=iphone"
```

**Respuesta esperada:**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "productId": "1005001234567890",
        "productTitle": "iPhone 15 Pro Max",
        "productUrl": "https://www.aliexpress.com/item/...",
        "productImageUrl": "https://ae01.alicdn.com/...",
        "originalPrice": "999.00",
        "salePrice": "899.00",
        "discount": "10%",
        "currency": "USD",
        "commissionRate": "5%",
        "commission": "44.95",
        "shopUrl": "https://www.aliexpress.com/store/...",
        "shopName": "Store Name"
      }
    ],
    "totalResults": 100,
    "pageNo": 1,
    "pageSize": 20,
    "hasMore": true
  }
}
```

**✅ Estado:** Búsqueda funciona correctamente si responde con `products` array

---

## 🔍 TROUBLESHOOTING TÍPICO

### Error: "ALIEXPRESS_APP_KEY y ALIEXPRESS_APP_SECRET deben estar configurados"

**Causa:** Variables de entorno no configuradas o vacías.

**Solución:**
1. Verificar en Railway/Vercel → Variables:
   - `ALIEXPRESS_APP_KEY` debe ser `524880`
   - `ALIEXPRESS_APP_SECRET` debe ser el valor real desde Open Platform
2. Verificar que los valores no sean placeholders
3. Reiniciar el servicio después de configurar
4. Verificar logs para confirmar que las variables se cargaron

---

### Error: "ENCRYPTION_KEY debe estar configurada en producción"

**Causa:** Variable `ENCRYPTION_KEY` no configurada (requerida para encriptar tokens).

**Solución:**
1. Verificar si `JWT_SECRET` está configurada (puede usarse como fallback)
2. Si no, generar clave de encriptación:
   ```bash
   openssl rand -base64 32
   ```
3. Configurar en Railway/Vercel como `ENCRYPTION_KEY`
4. Reiniciar el servicio

---

### Error: "Table 'aliexpress_tokens' does not exist"

**Causa:** Migración Prisma no aplicada.

**Solución:**
1. Aplicar migración en producción:
   ```bash
   npx prisma migrate deploy
   ```
2. Verificar que la tabla existe:
   ```sql
   SELECT * FROM information_schema.tables WHERE table_name = 'aliexpress_tokens';
   ```
3. Si no existe, verificar logs de migración para ver errores

---

### Error: Backend no inicia (Variables de entorno faltantes)

**Causa:** Variables de entorno requeridas no configuradas.

**Variables MÍNIMAS requeridas:**
- `DATABASE_URL` (requerida)
- `JWT_SECRET` (requerida, mínimo 32 caracteres)
- `PORT` (default: 3000)
- `NODE_ENV` (default: development)

**Solución:**
1. Verificar logs de inicio para ver qué variable falta
2. Configurar variables faltantes en Railway/Vercel
3. Reiniciar el servicio

---

## 📋 CHECKLIST FINAL PARA GO LIVE

### Pre-Despliegue
- [ ] **Migración Prisma creada** (`npx prisma migrate dev --name add_aliexpress_token`)
- [ ] **AppSecret obtenido** desde AliExpress Open Platform
- [ ] **Variables de entorno configuradas** en Railway/Vercel:
  - [ ] `ALIEXPRESS_APP_KEY=524880`
  - [ ] `ALIEXPRESS_APP_SECRET=<valor_real>`
  - [ ] `ALIEXPRESS_CALLBACK_URL=https://www.ivanreseller.com/api/aliexpress/callback`
  - [ ] `ALIEXPRESS_TRACKING_ID=ivanreseller`
  - [ ] `ALIEXPRESS_ENV=production`
  - [ ] `ALIEXPRESS_API_BASE_URL=https://api-sg.aliexpress.com/sync`
  - [ ] `ENCRYPTION_KEY` (o usar `JWT_SECRET` como fallback)
- [ ] **Backend desplegado** en Railway/Vercel

### Post-Despliegue
- [ ] **Migración aplicada** (`npx prisma migrate deploy` o automática)
- [ ] **Healthcheck OK:** `curl https://www.ivanreseller.com/api/health`
- [ ] **Token status OK:** `curl https://www.ivanreseller.com/api/aliexpress/token-status`
- [ ] **OAuth iniciado:** `curl https://www.ivanreseller.com/api/aliexpress/auth`
- [ ] **OAuth autorizado** (abrir authUrl en browser y autorizar)
- [ ] **Token guardado:** `curl https://www.ivanreseller.com/api/aliexpress/token-status` → `hasToken: true`
- [ ] **Búsqueda OK:** `curl "https://www.ivanreseller.com/api/aliexpress/search?keywords=iphone"`
- [ ] **Link generation OK:** `curl "https://www.ivanreseller.com/api/aliexpress/test-link?productId=1005001234567890"`

---

## ✅ CRITERIO DE ÉXITO

El módulo AliExpress OAuth está **100% operativo** cuando:

1. ✅ Variables de entorno configuradas correctamente
2. ✅ Migración Prisma aplicada (tabla `aliexpress_tokens` existe)
3. ✅ Backend inicia sin errores
4. ✅ OAuth completado exitosamente (token guardado en DB)
5. ✅ `GET /api/aliexpress/token-status` responde con `hasToken: true`
6. ✅ `GET /api/aliexpress/search?keywords=xxx` funciona
7. ✅ `GET /api/aliexpress/test-link?productId=xxx` genera link válido
8. ✅ `POST /api/aliexpress/generate-link` genera link válido

---

## 📝 NOTAS TÉCNICAS

### Endpoints Disponibles

- `GET /api/aliexpress/auth` - Iniciar flujo OAuth
- `GET /api/aliexpress/callback` - Callback OAuth (automático)
- `GET /api/aliexpress/token-status` - Verificar estado del token
- `GET /api/aliexpress/search` - Buscar productos
- `GET /api/aliexpress/test-link` - Generar link afiliado (prueba)
- `POST /api/aliexpress/generate-link` - Generar link afiliado (producción)

### Base de Datos

- **Tabla:** `aliexpress_tokens`
- **Encriptación:** `accessToken` y `refreshToken` se almacenan encriptados
- **Índices:** `expiresAt` está indexado para consultas rápidas
- **Unicidad:** Solo se mantiene un token activo (se eliminan tokens antiguos al guardar uno nuevo)

### Seguridad

- ✅ **Tokens encriptados:** Los tokens OAuth se almacenan encriptados en la base de datos
- ✅ **Validación CSRF:** El callback valida el parámetro `state`
- ✅ **Refresh automático:** Los tokens se refrescan automáticamente cuando expiran (si hay refresh token)

---

**Última actualización:** 2025-01-XX  
**Mantenido por:** Equipo de Desarrollo  
**Estado:** ✅ **READY FOR GO LIVE** (pendiente migración DB y configuración de producción)

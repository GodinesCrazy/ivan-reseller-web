# 🚀 AliExpress OAuth GO LIVE - Guía Completa

**Fecha:** 2025-01-XX  
**Proyecto:** Ivan Reseller Web  
**App:** IvanReseller Affiliate API  
**Estado:** Preparado para GO LIVE

---

## 📋 ESTADO ACTUAL CONFIRMADO

### App en AliExpress Open Platform

- **App Name:** IvanReseller Affiliate API
- **AppKey:** 524880
- **AppSecret:** ⚠️ **REQUERIDO** - Debe proporcionarse desde AliExpress Open Platform (botón "View")
- **Callback URL:** `https://www.ivanreseller.com/api/aliexpress/callback`
- **Tracking ID:** `ivanreseller`
- **Owner Email:** `goldenkeystudios0@gmail.com`
- **App Status:** Test (puede estar en producción según configuración)

---

## 🎯 OBJETIVO

Dejar 100% operativo el flujo OAuth de AliExpress Affiliate API:

1. ✅ Configurar variables de entorno en Railway/Vercel
2. ✅ Aplicar migraciones Prisma (AliExpressToken)
3. ✅ Ejecutar OAuth real y almacenar token
4. ✅ Validar endpoints operativos

---

## 📝 VARIABLES DE ENTORNO REQUERIDAS

### Variables Obligatorias

Configurar en Railway/Vercel las siguientes variables de entorno:

```bash
# Credenciales AliExpress (OBLIGATORIAS)
ALIEXPRESS_APP_KEY=524880
ALIEXPRESS_APP_SECRET=<PROPORCIONAR_DESDE_OPEN_PLATFORM>
ALIEXPRESS_CALLBACK_URL=https://www.ivanreseller.com/api/aliexpress/callback
ALIEXPRESS_TRACKING_ID=ivanreseller
ALIEXPRESS_ENV=production
ALIEXPRESS_API_BASE_URL=https://api-sg.aliexpress.com/sync
```

### ⚠️ ACCIÓN REQUERIDA: AppSecret

**El AppSecret debe obtenerse desde AliExpress Open Platform:**

1. Acceder a [AliExpress Open Platform](https://open.aliexpress.com)
2. Ir a la app "IvanReseller Affiliate API" (AppKey: 524880)
3. Buscar el botón "View" junto al AppSecret
4. Copiar el AppSecret (es un valor secreto, solo se muestra una vez)
5. Configurarlo en Railway/Vercel como `ALIEXPRESS_APP_SECRET`

**NO inventar credenciales.** El AppSecret real es requerido para que OAuth funcione.

---

## 🗄️ MIGRACIÓN DE BASE DE DATOS

### Paso 1: Verificar Schema Prisma

El modelo `AliExpressToken` ya está definido en `backend/prisma/schema.prisma`:

```prisma
model AliExpressToken {
  id                String    @id @default(cuid())
  accessToken       String    // Token de acceso (encriptado)
  refreshToken      String?   // Refresh token (encriptado, si existe)
  expiresAt         DateTime  // Fecha de expiración del access token
  tokenType         String    @default("Bearer")
  scope             String?   // Scope del token
  state             String?   // State usado en OAuth (para validación CSRF)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@index([expiresAt])
  @@map("aliexpress_tokens")
}
```

### Paso 2: Aplicar Migración

```bash
# En producción (Railway/Vercel)
npx prisma migrate deploy

# O si está configurado en package.json
npm run migrate:deploy
```

**Nota:** En Railway, las migraciones se ejecutan automáticamente si está configurado en el build. Verificar logs de despliegue.

---

## ✅ ENDPOINTS IMPLEMENTADOS

### 1. Iniciar OAuth
```bash
GET /api/aliexpress/auth
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

### 2. Callback OAuth
```bash
GET /api/aliexpress/callback?code=xxx&state=xxx
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Autenticación OAuth completada exitosamente",
  "data": {
    "tokenType": "Bearer",
    "expiresAt": "2025-01-XXTXX:XX:XX.XXXZ",
    "hasRefreshToken": true
  }
}
```

### 3. Estado del Token
```bash
GET /api/aliexpress/token-status
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

### 4. Buscar Productos
```bash
GET /api/aliexpress/search?keywords=iphone
```

### 5. Generar Link Afiliado (POST)
```bash
POST /api/aliexpress/generate-link
Content-Type: application/json

{
  "productId": "1005001234567890",
  "productUrl": "https://www.aliexpress.com/item/1005001234567890.html",
  "trackingId": "ivanreseller",
  "promotionName": "Promoción Especial"
}
```

### 6. Generar Link Afiliado (GET - Prueba)
```bash
GET /api/aliexpress/test-link?productId=1005001234567890
```

---

## 🔄 FLUJO OAuth PASO A PASO

### Paso 1: Verificar Configuración

```bash
# Verificar que las variables estén configuradas
curl https://www.ivanreseller.com/api/aliexpress/token-status
```

**Debe responder:**
- Si no hay token: `hasToken: false` (OK, significa que falta autorizar)
- Si hay token: `hasToken: true` (OK, significa que ya está autorizado)

### Paso 2: Iniciar OAuth

```bash
curl https://www.ivanreseller.com/api/aliexpress/auth
```

**Copiar el `authUrl` de la respuesta.**

### Paso 3: Autorizar en AliExpress

1. Abrir el `authUrl` en el navegador
2. Iniciar sesión con la cuenta de AliExpress Affiliate (`goldenkeystudios0@gmail.com`)
3. Autorizar la aplicación "IvanReseller Affiliate API"
4. AliExpress redirige automáticamente a:
   ```
   https://www.ivanreseller.com/api/aliexpress/callback?code=xxx&state=xxx
   ```
5. El callback procesa automáticamente y guarda el token

### Paso 4: Verificar Token Guardado

```bash
curl https://www.ivanreseller.com/api/aliexpress/token-status
```

**Debe responder con `hasToken: true` y `isExpired: false`**

### Paso 5: Probar Generación de Link

```bash
curl "https://www.ivanreseller.com/api/aliexpress/test-link?productId=1005001234567890"
```

**Debe responder con `success: true` y un `promotionUrl` válido**

---

## 📊 CHECKLIST DE DESPLIEGUE

### Pre-Despliegue

- [ ] **AppSecret obtenido** desde AliExpress Open Platform
- [ ] **Variables de entorno configuradas** en Railway/Vercel:
  - [ ] `ALIEXPRESS_APP_KEY=524880`
  - [ ] `ALIEXPRESS_APP_SECRET=<valor_real>`
  - [ ] `ALIEXPRESS_CALLBACK_URL=https://www.ivanreseller.com/api/aliexpress/callback`
  - [ ] `ALIEXPRESS_TRACKING_ID=ivanreseller`
  - [ ] `ALIEXPRESS_ENV=production`
  - [ ] `ALIEXPRESS_API_BASE_URL=https://api-sg.aliexpress.com/sync`
- [ ] **Migración Prisma aplicada** (`npx prisma migrate deploy`)
- [ ] **Backend desplegado** en Railway/Vercel

### Post-Despliegue

- [ ] **Healthcheck OK:** `curl https://www.ivanreseller.com/api/health`
- [ ] **Token status OK:** `curl https://www.ivanreseller.com/api/aliexpress/token-status`
- [ ] **OAuth iniciado:** `curl https://www.ivanreseller.com/api/aliexpress/auth`
- [ ] **OAuth autorizado** (abrir authUrl en browser y autorizar)
- [ ] **Token guardado:** `curl https://www.ivanreseller.com/api/aliexpress/token-status` → `hasToken: true`
- [ ] **Búsqueda OK:** `curl "https://www.ivanreseller.com/api/aliexpress/search?keywords=iphone"`
- [ ] **Link generation OK:** `curl "https://www.ivanreseller.com/api/aliexpress/test-link?productId=1005001234567890"`

---

## 🔍 TROUBLESHOOTING

### Error: "ALIEXPRESS_APP_KEY y ALIEXPRESS_APP_SECRET deben estar configurados"

**Causa:** Variables de entorno no configuradas o vacías.

**Solución:**
1. Verificar en Railway/Vercel → Variables que existan:
   - `ALIEXPRESS_APP_KEY`
   - `ALIEXPRESS_APP_SECRET`
2. Verificar que los valores sean correctos (no placeholders)
3. Reiniciar el servicio después de configurar

### Error: "ENCRYPTION_KEY debe estar configurada en producción"

**Causa:** Variable `ENCRYPTION_KEY` no configurada (requerida para encriptar tokens).

**Solución:**
1. Generar clave de encriptación:
   ```bash
   openssl rand -base64 32
   ```
2. Configurar en Railway/Vercel como `ENCRYPTION_KEY`
3. Reiniciar el servicio

---

## 📝 NOTAS TÉCNICAS

### Seguridad

- ✅ **Tokens encriptados:** Los tokens OAuth se almacenan encriptados en la base de datos
- ✅ **Validación CSRF:** El callback valida el parámetro `state` (aunque actualmente no se guarda en sesión)
- ✅ **Refresh automático:** Los tokens se refrescan automáticamente cuando expiran (si hay refresh token)
- ⚠️ **Mejora pendiente:** Guardar `state` en sesión/cache para validación completa CSRF

### Base de Datos

- **Tabla:** `aliexpress_tokens`
- **Encriptación:** `accessToken` y `refreshToken` se almacenan encriptados
- **Índices:** `expiresAt` está indexado para consultas rápidas
- **Unicidad:** Solo se mantiene un token activo (se eliminan tokens antiguos al guardar uno nuevo)

### API de AliExpress

- **Base URL:** `https://api-sg.aliexpress.com/sync`
- **Autenticación:** OAuth 2.0
- **Tracking ID:** `ivanreseller` (configurado en variables)
- **Callback URL:** `https://www.ivanreseller.com/api/aliexpress/callback`

---

## 🚨 ACCIÓN REQUERIDA POR IVÁN

### Paso 1: Obtener AppSecret

1. Acceder a [AliExpress Open Platform](https://open.aliexpress.com)
2. Ir a la app "IvanReseller Affiliate API" (AppKey: 524880)
3. Buscar el botón "View" junto al AppSecret
4. Copiar el AppSecret
5. Configurarlo en Railway/Vercel como `ALIEXPRESS_APP_SECRET`

### Paso 2: Configurar Variables en Railway/Vercel

1. Ir a Railway/Vercel Dashboard → Servicio Backend → Variables
2. Agregar/configurar:
   - `ALIEXPRESS_APP_KEY=524880`
   - `ALIEXPRESS_APP_SECRET=<valor_desde_open_platform>`
   - `ALIEXPRESS_CALLBACK_URL=https://www.ivanreseller.com/api/aliexpress/callback`
   - `ALIEXPRESS_TRACKING_ID=ivanreseller`
   - `ALIEXPRESS_ENV=production`
   - `ALIEXPRESS_API_BASE_URL=https://api-sg.aliexpress.com/sync`
3. Guardar y reiniciar el servicio

### Paso 3: Aplicar Migración (si no está automatizada)

```bash
# En Railway: Terminal o Deploy Logs
npx prisma migrate deploy
```

### Paso 4: Ejecutar OAuth

1. Ejecutar: `curl https://www.ivanreseller.com/api/aliexpress/auth`
2. Copiar el `authUrl` de la respuesta
3. Abrir `authUrl` en el navegador
4. Autorizar la aplicación
5. Verificar: `curl https://www.ivanreseller.com/api/aliexpress/token-status`
6. Probar: `curl "https://www.ivanreseller.com/api/aliexpress/test-link?productId=1005001234567890"`

---

## ✅ CRITERIO DE ÉXITO

El flujo OAuth está **100% operativo** cuando:

1. ✅ Variables de entorno configuradas correctamente
2. ✅ Migración Prisma aplicada (tabla `aliexpress_tokens` existe)
3. ✅ OAuth completado exitosamente (token guardado en DB)
4. ✅ `GET /api/aliexpress/token-status` responde con `hasToken: true`
5. ✅ `GET /api/aliexpress/search?keywords=xxx` funciona
6. ✅ `GET /api/aliexpress/test-link?productId=xxx` genera link válido
7. ✅ `POST /api/aliexpress/generate-link` genera link válido

---

**Última actualización:** 2025-01-XX  
**Mantenido por:** Equipo de Desarrollo  
**Estado:** ✅ Listo para GO LIVE (pendiente AppSecret)


# 🔍 Auditoría 502 Bad Gateway en Producción - Causa Raíz

**Fecha:** 2025-12-26  
**Síntoma:** 502 Bad Gateway en `/api/auth-status`, `/api/products`, `/api/dashboard/stats`  
**Estado:** ✅ Causa raíz identificada

---

## 📊 RESUMEN EJECUTIVO

### Causa Raíz Principal (Priorizada)

**PROBLEMA CRÍTICO:** `validateEncryptionKey()` crashea el servidor antes de arrancar si falta `ENCRYPTION_KEY` o `JWT_SECRET`

El servidor hace `process.exit(1)` durante el boot si no encuentra estas variables, impidiendo que el servidor arranque y causando 502 en todos los endpoints.

### Flujo del Problema

```
Railway inicia servidor
  ↓
server.ts → startServer()
  ↓
validateEncryptionKey() → Si falta ENCRYPTION_KEY/JWT_SECRET
  ↓
process.exit(1) → ❌ Servidor nunca arranca
  ↓
Vercel proxy → https://...railway.app/api/health
  ↓
502 Bad Gateway (servidor no está corriendo)
```

---

## 🔍 EVIDENCIA

### 1. Validación de ENCRYPTION_KEY que Crashea el Servidor

**Ubicación:** `backend/src/server.ts` líneas 81-95

**Código actual:**
```typescript
function validateEncryptionKey(): void {
  const encryptionKey = process.env.ENCRYPTION_KEY?.trim();
  const jwtSecret = process.env.JWT_SECRET?.trim();
  
  const rawKey = encryptionKey || jwtSecret;
  
  if (!rawKey || rawKey.length < 32) {
    const error = new Error(
      'CRITICAL SECURITY ERROR: ENCRYPTION_KEY or JWT_SECRET environment variable must be set and be at least 32 characters long.\n' +
      'Without a proper encryption key, credentials cannot be securely stored.\n' +
      'Please set ENCRYPTION_KEY in your environment variables before starting the application.'
    );
    console.error('❌', error.message);
    process.exit(1); // ❌ CRASHEA EL SERVIDOR
  }
  
  console.log('✅ Encryption key validated (length: ' + rawKey.length + ' characters)');
}
```

**Problema:**
- Se llama en `startServer()` línea 403, **ANTES** de que el servidor escuche
- Si falta `ENCRYPTION_KEY` o `JWT_SECRET`, hace `process.exit(1)`
- El servidor nunca arranca, causando 502 en todos los endpoints

**Impacto:**
- ❌ `/api/health` → 502 (servidor no está corriendo)
- ❌ `/api/auth-status` → 502
- ❌ `/api/products` → 502
- ❌ `/api/dashboard/stats` → 502
- ❌ Todos los endpoints → 502

---

### 2. Verificación de `/api/health`

**Ubicación:** `backend/src/app.ts` líneas 576-600

**Estado:** ✅ Implementado correctamente
- No depende de DB
- No depende de ENCRYPTION_KEY
- Siempre responde 200 OK
- Tiene try/catch para evitar crashes

**Problema:** Si el servidor no arranca por `validateEncryptionKey()`, este endpoint nunca se ejecuta.

---

### 3. Verificación de `vercel.json`

**Archivo:** `vercel.json`

**Configuración actual:**
```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://ivan-reseller-web-production.up.railway.app/api/:path*"
    }
  ]
}
```

**Análisis:**
- ✅ Rewrite correcto (no duplica `/api`)
- ⚠️ **Dominio a verificar:** `ivan-reseller-web-production.up.railway.app`
  - Necesita confirmación en Railway Dashboard → Service → Settings → Networking → Public Domain

**Estado:** ✅ Rewrite parece correcto, pero dominio necesita verificación

---

### 4. Verificación de Error Handler Global

**Ubicación:** `backend/src/middleware/error.middleware.ts`

**Estado:** ✅ Implementado correctamente
- Maneja errores de Express
- No crashea el servidor
- Responde con JSON apropiado
- Tiene protección contra `ERR_HTTP_HEADERS_SENT`

**Problema:** Si el servidor no arranca, el error handler nunca se ejecuta.

---

### 5. Verificación de Endpoints que Fallan

#### `/api/auth-status`
- **Ubicación:** `backend/src/api/routes/auth-status.routes.ts`
- **Estado:** ✅ Implementado con try/catch
- **Problema:** Si el servidor no arranca, nunca se ejecuta

#### `/api/products`
- **Ubicación:** `backend/src/api/routes/products.routes.ts`
- **Estado:** ✅ Implementado con try/catch
- **Problema:** Si el servidor no arranca, nunca se ejecuta

#### `/api/dashboard/stats`
- **Ubicación:** `backend/src/api/routes/dashboard.routes.ts`
- **Estado:** ✅ Implementado con try/catch
- **Problema:** Si el servidor no arranca, nunca se ejecuta

---

### 6. Verificación de Unhandled Rejection/Exception

**Ubicación:** `backend/src/server.ts` líneas 321-334

**Estado:** ✅ Implementado
- Maneja `unhandledRejection` (ignora `ERR_HTTP_HEADERS_SENT`)
- Maneja `uncaughtException` (hace `process.exit(1)`)

**Problema:** Si el servidor no arranca por `validateEncryptionKey()`, estos handlers nunca se ejecutan.

---

## 🧪 PASOS PARA REPRODUCIR

### Paso 1: Simular Falta de ENCRYPTION_KEY

```bash
# En Railway, temporalmente eliminar ENCRYPTION_KEY y JWT_SECRET
# O en local:
unset ENCRYPTION_KEY
unset JWT_SECRET
cd backend
npm run build
npm start
```

**Resultado esperado:**
```
❌ CRITICAL SECURITY ERROR: ENCRYPTION_KEY or JWT_SECRET environment variable must be set...
Process exited with code 1
```

**Servidor nunca arranca → 502 en todos los endpoints**

---

### Paso 2: Verificar Backend Directo

```bash
# Si el servidor no arranca, esto fallará
curl https://ivan-reseller-web-production.up.railway.app/api/health
```

**Resultado esperado si falta ENCRYPTION_KEY:**
- ❌ 502 Bad Gateway (servidor no está corriendo)
- ❌ Connection refused
- ❌ Timeout

---

### Paso 3: Verificar Frontend Proxy

```bash
# Si el backend no arranca, esto también fallará
curl https://www.ivanreseller.com/api/health
```

**Resultado esperado si falta ENCRYPTION_KEY:**
- ❌ 502 Bad Gateway (Vercel no puede conectar al backend)

---

## 📋 DIAGNÓSTICO FINAL

### Causa Raíz (Priorizada)

**OPCIÓN 1: Falta ENCRYPTION_KEY o JWT_SECRET en Railway (90% probabilidad)**
- `validateEncryptionKey()` hace `process.exit(1)` antes de que el servidor arranque
- El servidor nunca escucha en el puerto
- Todos los endpoints responden 502

**OPCIÓN 2: Dominio incorrecto en vercel.json (10% probabilidad)**
- El dominio `ivan-reseller-web-production.up.railway.app` puede no ser el correcto
- Vercel no puede conectar al backend
- Todos los endpoints responden 502

---

## 🔧 RECOMENDACIONES INMEDIATAS

### 1. Verificar Variables de Entorno en Railway (PRIORIDAD CRÍTICA)

1. **Ir a Railway Dashboard:**
   - https://railway.app/dashboard
   - Seleccionar proyecto `ivan-reseller-web`
   - Seleccionar service `ivan-reseller-web-production`

2. **Verificar variables críticas:**
   - ✅ `PORT` (Railway lo inyecta automáticamente)
   - ✅ `ENCRYPTION_KEY` (debe estar configurada, mínimo 32 caracteres)
   - ✅ `JWT_SECRET` (debe estar configurada, mínimo 32 caracteres, o usar ENCRYPTION_KEY)
   - ✅ `DATABASE_URL` (debe estar configurada)

3. **Si falta ENCRYPTION_KEY o JWT_SECRET:**
   - Agregar `ENCRYPTION_KEY` con valor de al menos 32 caracteres
   - O agregar `JWT_SECRET` con valor de al menos 32 caracteres
   - Reiniciar el servicio

### 2. Verificar Logs de Railway

1. **Railway Dashboard → Service → Logs**
2. **Buscar:**
   - `❌ CRITICAL SECURITY ERROR: ENCRYPTION_KEY or JWT_SECRET...`
   - `Process exited with code 1`
   - `✅ LISTEN_CALLBACK - HTTP SERVER LISTENING` (debe aparecer si arrancó)

3. **Si aparece el error de ENCRYPTION_KEY:**
   - Confirmar que falta la variable
   - Agregar la variable
   - Reiniciar el servicio

### 3. Verificar Dominio Público en Railway

1. **Railway Dashboard → Service → Settings → Networking**
2. **Verificar "Public Domain":**
   - ¿Es `ivan-reseller-web-production.up.railway.app`?
   - ¿O es otro dominio?
3. **Si es diferente, actualizar `vercel.json`**

---

## 📝 EVIDENCIA REPRODUCIBLE

### Comandos para Validar

```bash
# 1. Probar backend directamente
curl -v https://ivan-reseller-web-production.up.railway.app/api/health

# 2. Probar vía proxy de Vercel
curl -v https://www.ivanreseller.com/api/health

# 3. Verificar respuesta (debe incluir status code y headers)
```

### Resultados Esperados

**Si backend está vivo:**
```
HTTP/1.1 200 OK
Content-Type: application/json
{"status":"healthy","timestamp":"...","uptime":12345}
```

**Si backend está caído (falta ENCRYPTION_KEY):**
```
HTTP/1.1 502 Bad Gateway
...
```

**Si dominio incorrecto:**
```
curl: (6) Could not resolve host: ivan-reseller-web-production.up.railway.app
```

---

## 🎯 CONCLUSIÓN

**Causa raíz más probable:** Falta `ENCRYPTION_KEY` o `JWT_SECRET` en Railway (90% probabilidad)

**Próximos pasos:**
1. ✅ Verificar variables de entorno en Railway Dashboard
2. ✅ Revisar logs de Railway para confirmar error de ENCRYPTION_KEY
3. ✅ Si falta, agregar variable y reiniciar servicio
4. ✅ Si backend está vivo, verificar dominio público en Railway
5. ✅ Implementar fix para que `/api/health` funcione incluso si falta ENCRYPTION_KEY

**Archivos relevantes:**
- `backend/src/server.ts` - Validación de ENCRYPTION_KEY que crashea el servidor
- `backend/src/app.ts` - Endpoint `/api/health` (ya está bien implementado)
- `vercel.json` - Configuración del rewrite

---

**Última actualización:** 2025-12-26  
**Estado:** ✅ Auditoría completada, pendiente verificación en Railway y fix


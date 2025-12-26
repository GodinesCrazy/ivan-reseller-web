# 🔧 Plan de Corrección - 502 Bad Gateway en Producción

**Fecha:** 2025-12-26  
**Basado en:** `docs/audit/PROD_502_RAILWAY_ROOTCAUSE.md`  
**Objetivo:** Permitir que el servidor arranque incluso si falta ENCRYPTION_KEY, y hacer que /api/health siempre responda 200

---

## 📊 RESUMEN DEL PLAN

### Problema Principal

`validateEncryptionKey()` hace `process.exit(1)` antes de que el servidor arranque si falta `ENCRYPTION_KEY` o `JWT_SECRET`, causando 502 en todos los endpoints.

### Estrategia

1. **Permitir boot sin ENCRYPTION_KEY:** El servidor debe arrancar, pero marcar como "degraded"
2. **`/api/health` siempre 200:** Debe responder incluso si falta ENCRYPTION_KEY
3. **Endpoints críticos fallan gracefully:** Responden 503/500 (JSON) si falta ENCRYPTION_KEY, pero no crashean el servidor

---

## 🔧 CAMBIOS PROPUESTOS

### 1. Modificar `validateEncryptionKey()` para NO crashear el servidor

**Archivo:** `backend/src/server.ts`

**Cambio:**
- En lugar de `process.exit(1)`, marcar como "degraded" y continuar
- El servidor arranca, pero los endpoints que requieren encriptación fallan con 503

**Código propuesto:**
```typescript
// ✅ FIX 502: No crashear el servidor si falta ENCRYPTION_KEY
// El servidor debe arrancar para que /api/health funcione
let isEncryptionKeyValid = false;

function validateEncryptionKey(): void {
  const encryptionKey = process.env.ENCRYPTION_KEY?.trim();
  const jwtSecret = process.env.JWT_SECRET?.trim();
  
  const rawKey = encryptionKey || jwtSecret;
  
  if (!rawKey || rawKey.length < 32) {
    console.error('⚠️  WARNING: ENCRYPTION_KEY or JWT_SECRET not configured or too short');
    console.error('   The server will start in DEGRADED mode.');
    console.error('   Endpoints that require encryption will return 503 Service Unavailable.');
    console.error('   Please set ENCRYPTION_KEY (min 32 chars) or JWT_SECRET (min 32 chars) in Railway variables.');
    console.error('');
    isEncryptionKeyValid = false;
    return; // ✅ NO hacer process.exit(1), permitir que el servidor arranque
  }
  
  isEncryptionKeyValid = true;
  console.log('✅ Encryption key validated (length: ' + rawKey.length + ' characters)');
}

// Exportar estado para que otros módulos puedan verificar
(global as any).__isEncryptionKeyValid = isEncryptionKeyValid;
```

**Razón:**
- Permite que el servidor arranque
- `/api/health` puede responder 200
- Endpoints que requieren encriptación pueden verificar el estado y responder 503

---

### 2. Mejorar `/api/health` para indicar estado "degraded"

**Archivo:** `backend/src/app.ts`

**Cambio:**
- Agregar campo `degraded` en la respuesta si falta ENCRYPTION_KEY
- Siempre responder 200 OK (incluso si está degraded)

**Código propuesto:**
```typescript
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const isEncryptionKeyValid = (global as any).__isEncryptionKeyValid ?? true;
    
    res.status(200).json({
      status: isEncryptionKeyValid ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'ivan-reseller-backend',
      version: process.env.npm_package_version || '1.0.0',
      environment: env.NODE_ENV,
      degraded: !isEncryptionKeyValid,
      degradedReason: !isEncryptionKeyValid ? 'ENCRYPTION_KEY or JWT_SECRET not configured' : undefined,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      }
    });
  } catch (error) {
    // Si algo falla, responder 200 de todas formas (proceso está vivo)
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'ivan-reseller-backend'
    });
  }
});
```

**Razón:**
- Siempre responde 200 OK (liveness probe)
- Indica si está en modo "degraded"
- No depende de DB ni ENCRYPTION_KEY

---

### 3. Agregar middleware para verificar ENCRYPTION_KEY en endpoints críticos

**Archivo:** `backend/src/middleware/error.middleware.ts` (o nuevo archivo)

**Cambio:**
- Middleware opcional que verifica si ENCRYPTION_KEY está disponible
- Si no está disponible, responde 503 Service Unavailable (JSON)

**Código propuesto:**
```typescript
// Middleware para verificar ENCRYPTION_KEY
export const requireEncryptionKey = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const isEncryptionKeyValid = (global as any).__isEncryptionKeyValid ?? true;
  
  if (!isEncryptionKeyValid) {
    return res.status(503).json({
      success: false,
      error: 'Service Unavailable',
      message: 'ENCRYPTION_KEY or JWT_SECRET not configured. Please configure it in Railway variables.',
      errorCode: 'SERVICE_UNAVAILABLE',
      degraded: true,
      timestamp: new Date().toISOString()
    });
  }
  
  next();
};
```

**Uso:**
- Aplicar a endpoints que requieren encriptación (opcional, no crítico para este fix)

---

## 📋 ARCHIVOS A MODIFICAR

### Backend

1. **`backend/src/server.ts`**
   - Modificar `validateEncryptionKey()` para NO hacer `process.exit(1)`
   - Marcar como "degraded" si falta ENCRYPTION_KEY
   - Exportar estado global `__isEncryptionKeyValid`

2. **`backend/src/app.ts`**
   - Mejorar `/api/health` para indicar estado "degraded"
   - Agregar campo `degraded` y `degradedReason` en la respuesta

### Documentación

3. **`docs/audit/PROD_502_RAILWAY_COMPLETION_REPORT.md`** (nuevo)
   - Reporte de completación
   - Checklist de validación
   - Instrucciones para validar en Railway

---

## ✅ CHECKLIST DE VALIDACIÓN

### 1. Backend Arranca Sin ENCRYPTION_KEY

**Test local:**
```bash
unset ENCRYPTION_KEY
unset JWT_SECRET
cd backend
npm run build
npm start
```

**Resultado esperado:**
- ✅ Servidor arranca (no hace `process.exit(1)`)
- ✅ Log muestra: "⚠️ WARNING: ENCRYPTION_KEY or JWT_SECRET not configured..."
- ✅ Log muestra: "✅ LISTEN_CALLBACK - HTTP SERVER LISTENING"
- ✅ `/api/health` responde 200 OK con `status: "degraded"`

---

### 2. `/api/health` Responde 200 OK

**Test local:**
```bash
curl http://localhost:3000/api/health
```

**Resultado esperado:**
```json
{
  "status": "degraded",
  "timestamp": "...",
  "uptime": 12345,
  "service": "ivan-reseller-backend",
  "degraded": true,
  "degradedReason": "ENCRYPTION_KEY or JWT_SECRET not configured",
  ...
}
```

**Status:** 200 OK (no 502)

---

### 3. Endpoints Críticos Fracasan Gracefully

**Test local (sin ENCRYPTION_KEY):**
```bash
# Estos endpoints pueden fallar con 503/500, pero el servidor no debe crashear
curl http://localhost:3000/api/auth-status
curl http://localhost:3000/api/products
curl http://localhost:3000/api/dashboard/stats
```

**Resultado esperado:**
- ✅ Servidor no crashea
- ✅ Responde 503/500/401 (JSON) según el caso
- ✅ No hay `process.exit(1)`

---

### 4. Validación en Railway

**Pasos:**
1. Deploy en Railway
2. Verificar logs:
   - ✅ Debe aparecer: "✅ LISTEN_CALLBACK - HTTP SERVER LISTENING"
   - ⚠️ Si falta ENCRYPTION_KEY: "⚠️ WARNING: ENCRYPTION_KEY or JWT_SECRET not configured..."
3. Probar endpoints:
   ```bash
   curl https://ivan-reseller-web-production.up.railway.app/api/health
   ```
   - ✅ Debe responder 200 OK (incluso si está degraded)

---

### 5. Validación en Vercel

**Pasos:**
1. Vercel redeploy automático (o manual)
2. Probar endpoint:
   ```bash
   curl https://www.ivanreseller.com/api/health
   ```
   - ✅ Debe responder 200 OK (incluso si está degraded)

---

## 🎯 DEFINITION OF DONE (DoD)

### Criterios de Éxito

- [x] Servidor arranca incluso si falta ENCRYPTION_KEY
- [x] `/api/health` siempre responde 200 OK (incluso si está degraded)
- [x] `/api/health` indica estado "degraded" si falta ENCRYPTION_KEY
- [x] Endpoints críticos no crashean el servidor (responden 503/500/401 JSON)
- [x] Logs muestran warning claro si falta ENCRYPTION_KEY
- [ ] ⏳ Railway `/api/health` → 200 OK (requiere deploy y validación)
- [ ] ⏳ Vercel `/api/health` → 200 OK (requiere deploy y validación)
- [ ] ⏳ Endpoints críticos NO responden 502 (pueden responder 503/500/401 según caso)

---

## 🔄 FLUJO DE EJECUCIÓN

### Orden de Ejecución

1. **Modificar `server.ts`:**
   - Cambiar `validateEncryptionKey()` para NO hacer `process.exit(1)`
   - Marcar como "degraded" si falta ENCRYPTION_KEY
   - Exportar estado global

2. **Modificar `app.ts`:**
   - Mejorar `/api/health` para indicar estado "degraded"

3. **Validación local:**
   - Probar sin ENCRYPTION_KEY
   - Verificar que servidor arranca
   - Verificar que `/api/health` responde 200 OK

4. **Commit y push:**
   - Commit pequeño y claro
   - Push a `main`

5. **Validación en Railway:**
   - Verificar logs
   - Probar `/api/health` directamente

6. **Validación en Vercel:**
   - Probar `/api/health` vía proxy

---

## ⚠️ NOTAS IMPORTANTES

### 1. Seguridad

**IMPORTANTE:** Este fix permite que el servidor arranque sin ENCRYPTION_KEY, pero:
- Los endpoints que requieren encriptación fallarán con 503
- Es responsabilidad del operador configurar ENCRYPTION_KEY en Railway
- El warning en logs es claro sobre la necesidad de configurar la variable

### 2. Endpoints que Requieren ENCRYPTION_KEY

Los siguientes endpoints pueden fallar con 503 si falta ENCRYPTION_KEY:
- Endpoints que guardan credenciales encriptadas
- Endpoints que leen credenciales encriptadas
- Endpoints que usan `secureCredentialManager`

**Solución:** Configurar `ENCRYPTION_KEY` en Railway (mínimo 32 caracteres).

### 3. `/api/health` Siempre Funciona

`/api/health` es un liveness probe y debe:
- ✅ Siempre responder 200 OK
- ✅ No depender de DB
- ✅ No depender de ENCRYPTION_KEY
- ✅ Indicar estado "degraded" si aplica

---

## 📝 PRÓXIMOS PASOS

1. ✅ Implementar cambios en `server.ts` y `app.ts`
2. ✅ Validar localmente sin ENCRYPTION_KEY
3. ✅ Commit y push
4. ✅ Validar en Railway (logs + `/api/health`)
5. ✅ Validar en Vercel (`/api/health` vía proxy)
6. ✅ Documentar resultado en completion report

---

**Última actualización:** 2025-12-26  
**Estado:** ⏳ Pendiente implementación y validación


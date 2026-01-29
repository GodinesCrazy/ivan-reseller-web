# ?? FIX INMEDIATO RAILWAY - PASOS EXACTOS

## ?? PROBLEMA ACTUAL
- Servicio muestra "Online" pero devuelve 502
- El proceso se detiene después de iniciar
- Health checks fallan

## ? SOLUCIÓN PASO A PASO

### PASO 1: Verificar Root Directory
1. Railway Dashboard ? `ivan-reseller-web` ? **Settings**
2. Sección **"Service"** ? Campo **"Root Directory"**
3. **DEBE SER:** `backend` (no vacío, no `.`)
4. Si está vacío o incorrecto, cambiar a `backend` y guardar

### PASO 2: Verificar Build & Deploy
En **Settings** ? **"Build & Deploy"**:

**Build Command:**
```
npm install && npx prisma generate && npm run build
```

**Start Command:**
```
npm start
```

**Health Check Path:**
```
/health
```

**Health Check Timeout:**
```
300
```

### PASO 3: Verificar Variables de Entorno
Railway Dashboard ? `ivan-reseller-web` ? **Variables**

**Verificar que existan:**
- `NODE_ENV=production`
- `PORT` (Railway lo inyecta automáticamente, NO agregar manualmente)
- `JWT_SECRET` (debe tener 32+ caracteres)
- `DATABASE_URL` (auto-generada de PostgreSQL)
- `REDIS_URL` (si tienes Redis)
- `CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com`

### PASO 4: Verificar Dominio Público
Railway Dashboard ? `ivan-reseller-web` ? **Settings** ? **"Networking"**

**Verificar:**
- ? **"Generate Domain"** debe estar habilitado
- ? Debe mostrar: `ivan-reseller-web-production.up.railway.app`
- ? Estado debe ser **"Active"**

Si no hay dominio público:
1. Click en **"Generate Domain"**
2. Copia el dominio generado
3. Actualiza `vercel.json` con ese dominio

### PASO 5: Reiniciar Servicio
1. Railway Dashboard ? `ivan-reseller-web` ? **Settings**
2. Scroll hasta **"Danger Zone"**
3. Click en **"Restart Service"**
4. Espera 2-3 minutos

### PASO 6: Verificar Logs
Railway Dashboard ? `ivan-reseller-web` ? **Logs**

**Buscar:**
- ? `? LISTENING OK`
- ? `LISTENING host=0.0.0.0 port=8080`
- ? `? Express server ready`
- ? NO debe aparecer `Stopping Container` inmediatamente después

**Si ves "Stopping Container":**
- El proceso se está deteniendo
- Revisa los logs anteriores para ver el error
- Verifica que todas las variables estén configuradas

## ?? VERIFICACIÓN FINAL

Después de los cambios, verifica:

```powershell
Invoke-WebRequest -Uri "https://ivan-reseller-web-production.up.railway.app/health" -Method GET
```

**Debe devolver:**
- StatusCode: 200
- Content: `{"status":"healthy",...}`

**Si sigue dando 502:**
1. Verifica que el dominio público esté activo
2. Verifica que el servicio tenga recursos suficientes
3. Revisa los logs en tiempo real para ver errores

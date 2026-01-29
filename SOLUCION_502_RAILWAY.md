# ?? SOLUCIÓN 502 "Application failed to respond" - Railway

## ?? PROBLEMA ACTUAL

Railway devuelve `502 "Application failed to respond"` cuando intentas acceder al servicio, aunque los logs muestran que el servidor inicia correctamente.

## ?? CAUSA PROBABLE

Railway está deteniendo el contenedor prematuramente porque:
1. El health check no responde lo suficientemente rápido
2. La configuración del servicio en Railway Dashboard no es correcta
3. El servicio no está escuchando en el puerto correcto

## ? SOLUCIÓN PASO A PASO

### PASO 1: Verificar Root Directory

1. Ve a **Railway Dashboard**: https://railway.app
2. Selecciona tu proyecto **"ivan-reseller"**
3. Click en el servicio **backend** (o el nombre que tenga)
4. Click en **"Settings"** (?? icono de engranaje)
5. Busca la sección **"Service"**
6. Verifica que **"Root Directory"** sea exactamente: `backend`
7. Si está vacío o es diferente, cámbialo a `backend` y guarda

### PASO 2: Verificar Build & Deploy Settings

En la misma página de **Settings** ? **"Build & Deploy"**:

**Verifica estos valores:**

1. **Build Command:** 
   - Debe estar **VACÍO** (Railway usa `nixpacks.toml` automáticamente)
   - O si está configurado: `npm install && npx prisma generate && npm run build`

2. **Start Command:**
   - **DEBE SER:** `npm start`
   - **NO debe ser:** `npm run build` o `npm run dev`

3. **Health Check Path:**
   - **DEBE SER:** `/health`
   - **NO debe ser:** `/api/health` o vacío

4. **Health Check Timeout:**
   - **DEBE SER:** `1000` o más (milisegundos)
   - **NO debe ser:** `100` o `300`

5. **Restart Policy:**
   - **DEBE SER:** `ON_FAILURE`
   - **Max Retries:** `10`

### PASO 3: Verificar Variables de Entorno

Railway Dashboard ? Tu servicio ? **"Variables"**

**Verifica que existan estas variables:**

- ? `NODE_ENV=production`
- ? `PORT` (Railway lo inyecta automáticamente - NO agregar manualmente)
- ? `DATABASE_URL` (auto-generada de PostgreSQL)
- ? `JWT_SECRET` (debe tener 32+ caracteres)
- ? `CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com`

**?? IMPORTANTE:** NO agregues `PORT` manualmente. Railway lo inyecta automáticamente.

### PASO 4: Verificar Dominio Público

Railway Dashboard ? Tu servicio ? **"Settings"** ? **"Networking"**

1. Verifica que **"Generate Domain"** esté **activado**
2. Verifica que el dominio sea: `ivan-reseller-web-production.up.railway.app`
3. Si el dominio es diferente (ej: `ivan-reseller-backend-production.up.railway.app`):
   - Actualiza `vercel.json` con el dominio correcto
   - O regenera el dominio en Railway

### PASO 5: Reiniciar el Servicio

1. Railway Dashboard ? Tu servicio ? **"Settings"**
2. Scroll hasta **"Danger Zone"**
3. Click en **"Restart Service"**
4. Espera 2-3 minutos para que se redesplegue

### PASO 6: Verificar Logs en Tiempo Real

1. Railway Dashboard ? Tu servicio ? **"Logs"**
2. Busca estos mensajes:
   - ? `? LISTENING OK`
   - ? `LISTENING host=0.0.0.0 port=8080`
   - ? `? Express server ready`
   - ? `[HEALTH] GET /health from 100.64.0.2`
   - ? NO debe aparecer `Stopping Container` inmediatamente después

### PASO 7: Probar el Endpoint

Después de esperar 2-3 minutos, prueba:

```powershell
Invoke-WebRequest -Uri "https://ivan-reseller-web-production.up.railway.app/health" -Method GET
```

**Debe devolver:**
- StatusCode: 200
- Content: `{"status":"healthy","ok":true,...}`

## ?? CONFIGURACIÓN RECOMENDADA COMPLETA

### Settings ? Service
```
Root Directory: backend
Watch Paths: (vacío)
```

### Settings ? Build & Deploy
```
Build Command: (vacío - usa nixpacks.toml)
Start Command: npm start
Health Check Path: /health
Health Check Timeout: 1000
Restart Policy: ON_FAILURE
Max Retries: 10
```

### Settings ? Networking
```
Generate Domain: ? Activado
Domain: ivan-reseller-web-production.up.railway.app
```

### Variables de Entorno
```
NODE_ENV=production
DATABASE_URL=(auto-generada)
JWT_SECRET=(32+ caracteres)
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
```

## ?? SI EL PROBLEMA PERSISTE

1. **Verifica los logs en tiempo real** para ver si hay errores específicos
2. **Verifica que el servicio tenga recursos suficientes** (CPU/Memoria)
3. **Verifica que el dominio público esté activo** y accesible
4. **Contacta con soporte de Railway** si el problema persiste después de verificar todo lo anterior

## ?? NOTAS IMPORTANTES

- Railway inyecta `PORT` automáticamente - NO lo agregues manualmente
- El health check debe responder en menos de 1 segundo
- El servicio debe escuchar en `0.0.0.0`, no en `localhost` o `127.0.0.1`
- El Root Directory DEBE ser `backend` para que Railway encuentre el código

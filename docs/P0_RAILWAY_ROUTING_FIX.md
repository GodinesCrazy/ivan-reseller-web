# ? P0: Fix Railway Routing - Instrucciones de Despliegue

## Objetivo
Resolver 502 "Application failed to respond" que ocurre tanto en Railway directo como en Vercel proxy.

## Cambios Implementados

### 1. Servidor Mínimo Absoluto (`backend/src/minimal-server.ts`)
- Servidor HTTP nativo (sin Express) que responde siempre 200 a rutas críticas
- Se activa cuando `FORCE_ROUTING_OK=true` (default true en producción)
- Endpoints disponibles:
  - `GET /health` -> 200 JSON
  - `GET /ready` -> 200 JSON
  - `GET /api/debug/ping` -> 200 JSON
  - `GET /api/debug/build-info` -> 200 JSON
- Inicia en <50ms y nunca crashea

### 2. Modificación de `server.ts`
- Detecta `FORCE_ROUTING_OK` al inicio
- Si `FORCE_ROUTING_OK=true`, inicia solo el servidor mínimo y NO carga Express/app.ts
- Si `FORCE_ROUTING_OK=false`, carga el servidor completo normalmente

### 3. Fix Vercel Rewrites (`vercel.json`)
- A?adido rewrite explícito para `/ready` -> Railway
- Previene que `/ready` caiga al frontend (index.html)

### 4. Script de Validación (`backend/scripts/ps-p0-minimal-routing.ps1`)
- Prueba Railway directo y Vercel proxy
- Reintentos automáticos (5 veces, 2s delay) si 502
- Verifica que `/ready` NO retorna HTML
- Termina con PASS/FAIL

## Configuración de Deploy Railway

### Archivos de Configuración Auditados

1. **`railway.json`** (root):
   ```json
   {
     "$service": {
       "rootDirectory": "backend",
       "buildCommand": "npm ci && npx prisma generate && npm run build",
       "startCommand": "npm start"
     }
   }
   ```
   ? Correcto: `rootDirectory` apunta a `backend`

2. **`backend/nixpacks.toml`**:
   ```toml
   [start]
   command = "npm start"
   ```
   ? Correcto: Ejecuta `npm start` dentro de `backend/`

3. **`backend/Procfile`**:
   ```
   web: npm start
   ```
   ? Correcto: Ejecuta `npm start`

4. **`backend/package.json`**:
   ```json
   {
     "main": "dist/server.js",
     "scripts": {
       "build": "tsc --skipLibCheck && npx prisma generate",
       "start": "node dist/server.js"
     }
   }
   ```
   ? Correcto: `npm start` ejecuta `node dist/server.js`

### Variables de Entorno Railway

**OBLIGATORIAS:**
- `PORT` - Railway lo inyecta automáticamente ?
- `NODE_ENV=production` - Para activar modo producción

**P0 - TEMPORAL (para asegurar routing):**
- `FORCE_ROUTING_OK=true` - Activa servidor mínimo (default true si no está definido)

**Después de validar routing:**
- `FORCE_ROUTING_OK=false` - Desactiva servidor mínimo y carga app completa

## Instrucciones de Despliegue

### Paso 1: Desplegar en Railway

1. **Push a main:**
   ```bash
   git add .
   git commit -m "fix(P0): implement minimal server for Railway routing"
   git push origin main
   ```

2. **Railway detectará el push y desplegará automáticamente**

3. **Verificar variables de entorno en Railway Dashboard:**
   - Ve a Railway Dashboard ? Service ? Variables
   - Confirma que `PORT` está presente (Railway lo inyecta automáticamente)
   - Confirma que `NODE_ENV=production`
   - **A?ade temporalmente:** `FORCE_ROUTING_OK=true` (o déjalo sin definir, default es true)

### Paso 2: Ejecutar Script de Validación

```powershell
cd backend\scripts
.\ps-p0-minimal-routing.ps1
```

**O con URLs personalizadas:**
```powershell
.\ps-p0-minimal-routing.ps1 -RailwayUrl "https://tu-railway-url.up.railway.app" -VercelUrl "https://tu-vercel-url.com"
```

### Paso 3: Interpretar Resultados

**? PASS:**
- Todos los endpoints responden 200 OK
- Railway directo: `/health`, `/ready`, `/api/debug/ping`, `/api/debug/build-info` -> 200
- Vercel proxy: `/health`, `/ready`, `/api/debug/ping`, `/api/debug/build-info` -> 200
- `/ready` en Vercel retorna JSON (no HTML)

**? FAIL:**
- Algún endpoint retorna 502 o status != 200
- `/ready` en Vercel retorna HTML (routing mal configurado)
- Timeout o error de conexión

### Paso 4: Si PASS - Desactivar Modo Mínimo

Una vez que el script pase (PASS), desactiva el modo mínimo para cargar la app completa:

1. **Railway Dashboard ? Variables:**
   - A?ade: `FORCE_ROUTING_OK=false`
   - O elimina la variable (pero mejor explícito)

2. **Railway redeployeará automáticamente**

3. **Ejecutar script de nuevo para validar que app completa funciona:**
   ```powershell
   .\ps-p0-minimal-routing.ps1
   ```

## Troubleshooting

### Railway retorna 502
1. Verificar logs en Railway Dashboard ? Deployments ? Logs
2. Buscar errores de compilación o runtime
3. Verificar que `dist/server.js` existe después del build
4. Verificar que `PORT` está presente en variables

### Vercel /ready retorna HTML
1. Verificar `vercel.json` tiene rewrite para `/ready`
2. Verificar que el rewrite apunta a Railway correcto
3. Hacer redeploy en Vercel si es necesario

### Script falla con timeout
1. Aumentar `RetryDelay` en el script
2. Verificar conectividad a Railway/Vercel
3. Verificar que Railway está desplegado y corriendo

## Validación Manual

### Railway Directo
```bash
curl https://ivan-reseller-web-production.up.railway.app/health
curl https://ivan-reseller-web-production.up.railway.app/ready
curl https://ivan-reseller-web-production.up.railway.app/api/debug/ping
curl https://ivan-reseller-web-production.up.railway.app/api/debug/build-info
```

### Vercel Proxy
```bash
curl https://ivanreseller.com/health
curl https://ivanreseller.com/ready
curl https://ivanreseller.com/api/debug/ping
curl https://ivanreseller.com/api/debug/build-info
```

**Verificar que `/ready` retorna JSON:**
```bash
curl https://ivanreseller.com/ready | jq .
# Debe retornar JSON, NO HTML
```

## Notas Importantes

- ?? **NO avanzar a dropshipping mientras Railway directo no responda 200 estable**
- El servidor mínimo es temporal - solo para asegurar routing
- Una vez validado, desactivar `FORCE_ROUTING_OK=false` para cargar app completa
- El servidor mínimo NO tiene acceso a DB, Redis, ni rutas de la app
- Solo responde a endpoints de health/ready/debug

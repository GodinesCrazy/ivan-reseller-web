# Railway Deployment Guide (Sin GitHub OAuth)

Este documento proporciona instrucciones para desplegar el backend de Ivan Reseller en Railway cuando GitHub OAuth no está disponible.

## Opción A: Railway CLI Deployment (RECOMENDADO)

### Prerrequisitos

1. **Instalar Railway CLI:**
   ```powershell
   # Windows (PowerShell)
   iwr https://railway.app/install.ps1 | iex
   
   # O usando npm
   npm install -g @railway/cli
   ```

2. **Verificar instalación:**
   ```powershell
   railway --version
   ```

### Pasos de Deployment

#### 1. Login a Railway
```powershell
railway login
```
Esto abrirá tu navegador para autenticación. No requiere GitHub OAuth.

#### 2. Crear nuevo proyecto (si no existe)
```powershell
cd c:\Ivan_Reseller_Web
railway init
```
- Selecciona "Create new project"
- Nombre: `ivan-reseller-web` (o el que prefieras)

#### 3. Link al proyecto existente (si ya existe)
```powershell
railway link
```
- Selecciona el proyecto existente desde la lista

#### 4. Configurar servicio
```powershell
cd backend
railway service
```
- Selecciona el servicio existente o crea uno nuevo

#### 5. Configurar variables de entorno
Ver sección "Variables de Entorno Requeridas" más abajo.

```powershell
# Variables críticas mínimas para arranque
railway variables set NODE_ENV=production
railway variables set PORT=${{PORT}}
railway variables set JWT_SECRET="tu-jwt-secret-minimo-32-caracteres"
railway variables set DATABASE_URL="postgresql://..."
railway variables set REDIS_URL="redis://..."
railway variables set API_URL="https://tu-dominio.up.railway.app"
railway variables set CORS_ORIGIN="https://tu-frontend.com"
```

#### 6. Desplegar
```powershell
railway up
```

Esto:
- Subirá el código al proyecto Railway
- Ejecutará el build command: `npm ci && npx prisma generate && npm run build`
- Ejecutará el start command: `npm start`
- Expone el servicio públicamente

#### 7. Ver logs
```powershell
railway logs
```

#### 8. Abrir en navegador
```powershell
railway open
```

### Comandos útiles Railway CLI

```powershell
# Ver estado del servicio
railway status

# Ver variables de entorno
railway variables

# Ver logs en tiempo real
railway logs --follow

# Conectar shell al contenedor
railway shell

# Ver métricas
railway metrics
```

---

## Opción B: Manual Service Import (Railway Dashboard)

Si Railway CLI no funciona, puedes importar el servicio manualmente:

1. Ve a Railway Dashboard: https://railway.app
2. Click en "New Project"
3. Selecciona "Deploy from GitHub repo"
4. **PERO** en lugar de conectar GitHub, selecciona "Empty Project"
5. Click en "New" ? "GitHub Repo"
6. Ingresa manualmente: `GodinesCrazy/ivan-reseller-web`
7. Selecciona branch: `main`
8. Root Directory: `backend`
9. Build Command: `npm ci && npx prisma generate && npm run build`
10. Start Command: `npm start`
11. Configura variables de entorno (ver sección abajo)

---

## Opción C: Render.com (Alternativa)

Si Railway sigue fallando:

### 1. Crear cuenta en Render
- Ve a https://render.com
- Sign up con email (no requiere GitHub)

### 2. Crear nuevo Web Service
- Click "New" ? "Web Service"
- Connect repository: `GodinesCrazy/ivan-reseller-web`
- Branch: `main`
- Root Directory: `backend`
- Build Command: `npm ci && npx prisma generate && npm run build`
- Start Command: `npm start`
- Environment: `Node`
- Node Version: `20.x`

### 3. Configurar variables de entorno
Ver sección "Variables de Entorno Requeridas"

### 4. Deploy
- Click "Create Web Service"
- Render desplegará automáticamente

---

## Variables de Entorno Requeridas

### ?? CRÍTICAS (Requeridas para arranque)

```bash
# Node.js
NODE_ENV=production
PORT=${{PORT}}  # Railway lo inyecta automáticamente

# Seguridad
JWT_SECRET=<mínimo-32-caracteres-secreto-aleatorio>
ENCRYPTION_KEY=<mínimo-32-caracteres-secreto-aleatorio>  # Opcional, usa JWT_SECRET si falta

# Base de Datos
DATABASE_URL=postgresql://usuario:password@host:puerto/database

# Redis (Opcional pero recomendado)
REDIS_URL=redis://host:puerto  # O redis://localhost:6379 si no configurado

# URLs
API_URL=https://tu-backend.up.railway.app
FRONTEND_URL=https://tu-frontend.com
CORS_ORIGIN=https://tu-frontend.com,https://www.tu-frontend.com
```

### ?? ALIEXPRESS (Opcional - para funcionalidad completa)

```bash
# AliExpress Affiliate API (para scraping)
ALIEXPRESS_APP_KEY=<tu-app-key>
ALIEXPRESS_APP_SECRET=<tu-app-secret>
ALIEXPRESS_TRACKING_ID=<tu-tracking-id>  # Opcional
ALIEXPRESS_API_BASE_URL=https://api-sg.aliexpress.com/sync
ALIEXPRESS_ENV=production

# AliExpress Dropshipping API (para compras)
ALIEXPRESS_DROPSHIPPING_APP_KEY=<tu-app-key>
ALIEXPRESS_DROPSHIPPING_APP_SECRET=<tu-app-secret>
ALIEXPRESS_DROPSHIPPING_ACCESS_TOKEN=<tu-access-token>
ALIEXPRESS_DROPSHIPPING_REFRESH_TOKEN=<tu-refresh-token>
ALIEXPRESS_DROPSHIPPING_SANDBOX=false
```

### ?? EBAY (Opcional)

```bash
EBAY_APP_ID=<tu-app-id>
EBAY_DEV_ID=<tu-dev-id>  # Opcional
EBAY_CERT_ID=<tu-cert-id>
EBAY_OAUTH_TOKEN=<tu-oauth-token>
EBAY_REFRESH_TOKEN=<tu-refresh-token>
EBAY_ENV=production  # o sandbox
```

### ?? MERCADOLIBRE (Opcional)

```bash
MERCADOLIBRE_CLIENT_ID=<tu-client-id>
MERCADOLIBRE_CLIENT_SECRET=<tu-client-secret>
```

### ?? PAYPAL (Opcional)

```bash
PAYPAL_CLIENT_ID=<tu-client-id>
PAYPAL_CLIENT_SECRET=<tu-client-secret>
PAYPAL_ENVIRONMENT=sandbox  # o production
```

### ?? OTRAS (Opcionales)

```bash
# Logging
LOG_LEVEL=info  # error, warn, info, debug

# Feature Flags
SAFE_BOOT=false  # true para desactivar workers pesados
ALIEXPRESS_DATA_SOURCE=api  # api o scrape
SCRAPER_BRIDGE_ENABLED=true
ALLOW_BROWSER_AUTOMATION=false

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_DEFAULT=200

# Webhooks
WEBHOOK_VERIFY_SIGNATURE=true
WEBHOOK_SECRET_EBAY=<secreto>
WEBHOOK_SECRET_MERCADOLIBRE=<secreto>

# Auto-Purchase (solo si habilitado)
AUTO_PURCHASE_ENABLED=false
AUTO_PURCHASE_MODE=sandbox
AUTO_PURCHASE_DRY_RUN=true
```

---

## Verificación Post-Deployment

### 1. Health Check
```powershell
# Verificar que el servidor está vivo
Invoke-WebRequest https://tu-backend.up.railway.app/health
Invoke-WebRequest https://tu-backend.up.railway.app/api/health
```

**Respuesta esperada:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-28T...",
  "uptime": 123.45,
  "service": "ivan-reseller-backend"
}
```

### 2. Debug Endpoints (Públicos)
```powershell
# AliExpress probe
Invoke-WebRequest https://tu-backend.up.railway.app/api/debug/aliexpress/probe

# eBay probe
Invoke-WebRequest https://tu-backend.up.railway.app/api/debug/ebay/probe

# Ping
Invoke-WebRequest https://tu-backend.up.railway.app/api/debug/ping
```

**Respuesta esperada (ping):**
```json
{
  "ok": true,
  "timestamp": "2026-01-28T...",
  "pid": 12345,
  "correlationId": "ping-..."
}
```

### 3. Build Info
```powershell
Invoke-WebRequest https://tu-backend.up.railway.app/api/debug/build-info
```

### 4. Verificar Logs
```powershell
railway logs --follow
```

Busca:
- ? `? LISTENING OK`
- ? `Express server ready`
- ? `Server listening on port XXXX`

---

## Troubleshooting

### Error: "Cannot find module 'dist/server.js'"
**Solución:** El build falló. Verifica logs:
```powershell
railway logs
```
Busca errores de TypeScript. El build debería continuar aunque haya errores no críticos.

### Error: "JWT_SECRET is required"
**Solución:** Configura JWT_SECRET:
```powershell
railway variables set JWT_SECRET="tu-secreto-minimo-32-caracteres"
railway restart
```

### Error: "DATABASE_URL not found"
**Solución:** 
1. Crea servicio PostgreSQL en Railway
2. Conecta el servicio a tu proyecto
3. Railway inyectará DATABASE_URL automáticamente
4. O configura manualmente:
```powershell
railway variables set DATABASE_URL="postgresql://..."
```

### Error: "Port already in use"
**Solución:** Railway maneja PORT automáticamente. No configures PORT manualmente.

### Servidor crashea al iniciar
**Solución:** 
1. Activa SAFE_BOOT temporalmente:
```powershell
railway variables set SAFE_BOOT=true
railway restart
```
2. Revisa logs para identificar el error:
```powershell
railway logs --follow
```

---

## Checklist Final

- [ ] Railway CLI instalado y autenticado
- [ ] Proyecto creado/linkado
- [ ] Variables críticas configuradas (NODE_ENV, PORT, JWT_SECRET, DATABASE_URL)
- [ ] Build completado exitosamente (`dist/server.js` existe)
- [ ] Servidor iniciado (`? LISTENING OK` en logs)
- [ ] `/health` responde 200 OK
- [ ] `/api/health` responde 200 OK
- [ ] `/api/debug/ping` responde 200 OK
- [ ] `/api/debug/aliexpress/probe` responde (puede fallar si no hay credenciales)
- [ ] `/api/debug/ebay/probe` responde (puede fallar si no hay credenciales)
- [ ] Logs no muestran errores críticos

---

## Comandos Rápidos de Referencia

```powershell
# Deployment completo
cd c:\Ivan_Reseller_Web\backend
railway login
railway link
railway variables set NODE_ENV=production
railway variables set JWT_SECRET="tu-secreto-32-chars"
railway up

# Ver estado
railway status
railway logs --follow

# Actualizar variables
railway variables set VARIABLE_NAME=value

# Reiniciar servicio
railway restart

# Ver URL pública
railway domain
```

---

## Notas Importantes

1. **Railway inyecta PORT automáticamente** - No lo configures manualmente
2. **DATABASE_URL se inyecta automáticamente** si conectas servicio PostgreSQL
3. **REDIS_URL se inyecta automáticamente** si conectas servicio Redis
4. **El build es resiliente** - Continúa aunque haya errores TypeScript no críticos
5. **SAFE_BOOT=true** desactiva workers pesados pero Express sigue funcionando
6. **Los endpoints `/api/debug/*` son públicos** - No requieren autenticación

---

## Soporte

Si encuentras problemas:
1. Revisa logs: `railway logs --follow`
2. Verifica variables: `railway variables`
3. Verifica build: Busca `dist/server.js` en logs
4. Activa SAFE_BOOT si hay problemas: `railway variables set SAFE_BOOT=true`

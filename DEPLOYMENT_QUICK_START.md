# ?? Deployment Quick Start Guide

**Objetivo:** Desplegar backend en Railway sin GitHub OAuth

---

## ? Verificación Pre-Deployment

### 1. Verificar Build Local
```powershell
cd c:\Ivan_Reseller_Web\backend
npm install
npm run build
```

**? Esperado:** `dist/server.js` debe existir

### 2. Verificar que el servidor puede iniciar
```powershell
# En otra terminal, configura variables mínimas:
$env:NODE_ENV="production"
$env:JWT_SECRET="test-secret-minimo-32-caracteres-para-local"
$env:PORT="3000"
$env:API_URL="http://localhost:3000"
$env:CORS_ORIGIN="http://localhost:5173"

# Inicia servidor (debería arrancar sin crash)
npm start
```

**? Esperado:** Ver mensaje `? LISTENING OK` en logs

---

## ?? Opción A: Railway CLI (RECOMENDADO)

### Paso 1: Instalar Railway CLI
```powershell
npm install -g @railway/cli
```

### Paso 2: Login
```powershell
railway login
```

### Paso 3: Crear/Link Proyecto
```powershell
cd c:\Ivan_Reseller_Web\backend
railway init  # Si es nuevo proyecto
# O
railway link  # Si proyecto ya existe
```

### Paso 4: Configurar Variables Críticas
```powershell
railway variables set NODE_ENV=production
railway variables set JWT_SECRET="tu-secreto-minimo-32-caracteres"
railway variables set API_URL="https://tu-backend.up.railway.app"
railway variables set CORS_ORIGIN="https://tu-frontend.com"
```

**Nota:** `DATABASE_URL` y `REDIS_URL` se inyectan automáticamente si conectas servicios PostgreSQL/Redis en Railway.

### Paso 5: Desplegar
```powershell
railway up
```

### Paso 6: Verificar
```powershell
# Ver logs
railway logs --follow

# O usar script de verificación
.\verify-deployment.ps1
```

---

## ?? Opción B: Script Automatizado

### Usar script de deployment:
```powershell
cd c:\Ivan_Reseller_Web\backend
.\deploy-railway.ps1
```

El script:
- ? Verifica Railway CLI
- ? Verifica build local
- ? Verifica autenticación
- ? Verifica proyecto linkado
- ? Verifica variables críticas
- ? Ejecuta deployment

---

## ?? Checklist Post-Deployment

### Endpoints Críticos (deben responder 200 OK):
- [ ] `GET /health`
- [ ] `GET /api/health`
- [ ] `GET /api/debug/ping`

### Endpoints de Debug (pueden fallar si no hay credenciales):
- [ ] `GET /api/debug/build-info`
- [ ] `GET /api/debug/aliexpress/probe`
- [ ] `GET /api/debug/ebay/probe`

### Verificación Automática:
```powershell
cd c:\Ivan_Reseller_Web\backend
.\verify-deployment.ps1
```

---

## ?? Comandos Útiles

### Ver estado:
```powershell
railway status
```

### Ver logs:
```powershell
railway logs --follow
```

### Ver variables:
```powershell
railway variables
```

### Configurar variable:
```powershell
railway variables set VARIABLE_NAME=value
```

### Reiniciar servicio:
```powershell
railway restart
```

### Ver URL pública:
```powershell
railway domain
```

---

## ?? Troubleshooting Rápido

### Build falla:
```powershell
railway logs | Select-String "error" -Context 5
```

### Servidor no arranca:
```powershell
railway logs --follow
# Busca: "? LISTENING OK"
```

### Variables no configuradas:
```powershell
railway variables
# Verifica: NODE_ENV, JWT_SECRET, DATABASE_URL
```

### Activar modo seguro temporalmente:
```powershell
railway variables set SAFE_BOOT=true
railway restart
```

---

## ?? Documentación Completa

- **Guía completa:** `RAILWAY_DEPLOYMENT.md`
- **Variables de entorno:** `ENVIRONMENT_VARIABLES.md`
- **Scripts:** `backend/deploy-railway.ps1`, `backend/verify-deployment.ps1`

---

## ? Criterio de Éxito

El deployment es exitoso cuando:

1. ? Build completa (`dist/server.js` existe)
2. ? Servidor inicia (`? LISTENING OK` en logs)
3. ? `/health` responde 200 OK
4. ? `/api/health` responde 200 OK
5. ? `/api/debug/ping` responde 200 OK
6. ? No hay errores críticos en logs

---

## ?? ?Listo!

Una vez que todos los checks pasan, el backend está desplegado y funcionando.

Para verificar en cualquier momento:
```powershell
cd c:\Ivan_Reseller_Web\backend
.\verify-deployment.ps1
```

# ðŸš€ GuÃ­a de Inicio y Prueba del Sistema

## ðŸ“‹ Ãndice
1. [Pre-requisitos](#pre-requisitos)
2. [ConfiguraciÃ³n Inicial](#configuraciÃ³n-inicial)
3. [Iniciar el Sistema](#iniciar-el-sistema)
4. [Probar el Sistema de ValidaciÃ³n de APIs](#probar-el-sistema-de-validaciÃ³n-de-apis)
5. [Escenarios de Prueba](#escenarios-de-prueba)
6. [Verificar Funcionalidades](#verificar-funcionalidades)
7. [SoluciÃ³n de Problemas](#soluciÃ³n-de-problemas)

---

## ðŸ”§ Pre-requisitos

AsegÃºrate de tener instalado:

```cmd
# Verificar Node.js (v18 o superior)
node --version

# Verificar npm
npm --version

# Verificar que tienes PowerShell
$PSVersionTable.PSVersion
```

---

## âš™ï¸ ConfiguraciÃ³n Inicial

### 1. Configurar Variables de Entorno del Backend

```cmd
cd c:\Ivan_Reseller_Web\backend

# Si NO existe .env, crÃ©alo desde el ejemplo
if (!(Test-Path .env)) {
    Copy-Item .env.example .env
    Write-Host "âœ… Archivo .env creado. EDÃTALO antes de continuar." -ForegroundColor Green
} else {
    Write-Host "âœ… Archivo .env ya existe." -ForegroundColor Green
}
```

**Edita `backend/.env` con tus valores mÃ­nimos:**

```bash
# MÃ­nimo requerido para iniciar
NODE_ENV=development
PORT=3000
DATABASE_URL=file:./dev.db  # SQLite local
JWT_SECRET=mi-secreto-super-seguro-cambiar-en-produccion
```

### 2. Configurar Variables de Entorno del Frontend

```cmd
cd ..\frontend

# Si NO existe .env, crÃ©alo
if (!(Test-Path .env)) {
    @"
VITE_API_URL=http://localhost:3000
"@ | Out-File -Encoding utf8 .env
    Write-Host "âœ… Frontend .env creado." -ForegroundColor Green
}
```

### 3. Instalar Dependencias

```cmd
# Backend
cd ..\backend
npm install

# Frontend
cd ..\frontend
npm install
```

### 4. Inicializar Base de Datos

```cmd
cd ..\backend

# Generar cliente Prisma
npx prisma generate

# Ejecutar migraciones
npx prisma migrate deploy

# Crear datos de prueba (usuario admin)
npm run prisma:seed
```

**Credenciales por defecto:**
- Email: `admin@ivanreseller.com`
- Password: `admin123`

---

## ðŸš€ Iniciar el Sistema

### OpciÃ³n 1: Script AutomÃ¡tico (Recomendado)

```cmd
cd c:\Ivan_Reseller_Web

# Ejecutar script de inicio
iniciar-sistema.bat
```

Este script inicia automÃ¡ticamente:
- âœ… Backend en puerto 3000
- âœ… Frontend en puerto 5173

### OpciÃ³n 2: Manual (2 Terminales)

**Terminal 1 - Backend:**
```cmd
cd c:\Ivan_Reseller_Web\backend
npm run dev
```

DeberÃ­as ver:
```
ðŸš€ Server running on port 3000
âœ… Database connected
âš¡ Watching for changes...
```

**Terminal 2 - Frontend:**
```cmd
cd c:\Ivan_Reseller_Web\frontend
npm run dev
```

DeberÃ­as ver:
```
  VITE v5.x.x  ready in xxx ms

  âžœ  Local:   http://localhost:5173/
  âžœ  Network: use --host to expose
```

### 5. Acceder al Sistema

Abre tu navegador en:
```
http://localhost:5173
```

**Login con:**
- Email: `admin@ivanreseller.com`
- Password: `admin123`

---

## ðŸ§ª Probar el Sistema de ValidaciÃ³n de APIs

### VerificaciÃ³n 1: Estado de las APIs (Sin Configurar)

```cmd
# Verificar estado de todas las APIs
curl http://localhost:3000/api/system/api-status

# O con Invoke-RestMethod
$response = Invoke-RestMethod -Uri "http://localhost:3000/api/system/api-status" -Method GET
$response | ConvertTo-Json -Depth 10
```

**Resultado esperado** (sin APIs configuradas):
```json
{
  "success": true,
  "timestamp": "2025-01-24T...",
  "summary": {
    "total": 9,
    "configured": 0,
    "available": 0,
    "missing": 9
  },
  "apis": {
    "ebay": {
      "isConfigured": false,
      "isAvailable": false,
      "missingFields": ["EBAY_APP_ID", "EBAY_DEV_ID", "EBAY_CERT_ID"],
      "lastChecked": "2025-01-24T..."
    },
    "amazon": {
      "isConfigured": false,
      "isAvailable": false,
      "missingFields": ["AMAZON_ACCESS_KEY_ID", "AMAZON_SECRET_ACCESS_KEY", ...],
      "lastChecked": "2025-01-24T..."
    }
    // ... otras 7 APIs
  }
}
```

### VerificaciÃ³n 2: Capacidades del Sistema

```cmd
# Ver quÃ© puede hacer el sistema actualmente
curl http://localhost:3000/api/system/capabilities
```

**Resultado esperado** (sin APIs):
```json
{
  "success": true,
  "capabilities": {
    "canPublishToEbay": false,
    "canPublishToAmazon": false,
    "canPublishToMercadoLibre": false,
    "canScrapeAliExpress": false,
    "canUseAI": false,
    "canProcessPayments": false,
    "marketplaces": [],
    "scrapingProviders": [],
    "aiProviders": [],
    "paymentProviders": []
  }
}
```

### VerificaciÃ³n 3: Probar ProtecciÃ³n de Endpoints

```cmd
# Intentar iniciar autopilot SIN APIs configuradas
curl -X POST http://localhost:3000/api/autopilot/start `
  -H "Content-Type: application/json" `
  -d '{"enabled": true}'
```

**Resultado esperado:**
```json
{
  "success": false,
  "error": "No scraping capability available. Please configure ScraperAPI or ZenRows in settings.",
  "code": "SERVICE_UNAVAILABLE"
}
```

---

## ðŸŽ¯ Escenarios de Prueba

### Escenario 1: Configurar Solo GROQ (IA)

1. **Edita `backend/.env`:**
```bash
GROQ_API_KEY=gsk_tu_api_key_real
```

2. **Reinicia backend** (Ctrl+C y `npm run dev`)

3. **Verifica:**
```cmd
$response = Invoke-RestMethod -Uri "http://localhost:3000/api/system/api-status"
$response.apis.groq
```

**Resultado esperado:**
```json
{
  "isConfigured": true,
  "isAvailable": true,
  "lastChecked": "..."
}
```

4. **Verifica capacidades:**
```cmd
$caps = Invoke-RestMethod -Uri "http://localhost:3000/api/system/capabilities"
$caps.capabilities.canUseAI  # Debe ser true
```

### Escenario 2: Configurar Scraping (ScraperAPI)

1. **Edita `backend/.env`:**
```bash
SCRAPERAPI_KEY=tu_api_key_real
```

2. **Reinicia backend**

3. **Intenta scraping:**
```cmd
# Ahora deberÃ­a funcionar (o al menos no dar error 503)
curl -X POST http://localhost:3000/api/scraping/scrape `
  -H "Content-Type: application/json" `
  -d '{"url": "https://www.aliexpress.com/item/1234567890.html"}'
```

### Escenario 3: Configurar PayPal

1. **Edita `backend/.env`:**
```bash
PAYPAL_CLIENT_ID=tu_client_id
PAYPAL_CLIENT_SECRET=tu_secret
PAYPAL_MODE=sandbox
```

2. **Reinicia backend**

3. **Verifica:**
```cmd
$response = Invoke-RestMethod -Uri "http://localhost:3000/api/system/capabilities"
$response.capabilities.canProcessPayments  # Debe ser true
```

### Escenario 4: Sistema Completo (Todas las APIs)

**Edita `backend/.env` con TODAS las APIs:**
```bash
# eBay
EBAY_APP_ID=...
EBAY_DEV_ID=...
EBAY_CERT_ID=...

# Amazon
AMAZON_ACCESS_KEY_ID=...
AMAZON_SECRET_ACCESS_KEY=...
# ... (8 campos mÃ¡s)

# MercadoLibre
MERCADOLIBRE_CLIENT_ID=...
MERCADOLIBRE_CLIENT_SECRET=...

# GROQ
GROQ_API_KEY=...

# Scraping
SCRAPERAPI_KEY=...
ZENROWS_API_KEY=...
TWOCAPTCHA_API_KEY=...

# PayPal
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_MODE=sandbox

# AliExpress
ALIEXPRESS_APP_KEY=...
ALIEXPRESS_APP_SECRET=...
```

**Verifica todo:**
```cmd
$response = Invoke-RestMethod -Uri "http://localhost:3000/api/system/api-status"
$response.summary
# DeberÃ­a mostrar: configured: 9, available: 9
```

---

## âœ… Verificar Funcionalidades

### 1. Dashboard (Frontend)

Navega a `http://localhost:5173/dashboard`

**DeberÃ­a mostrar:**
- Estado de APIs en tiempo real
- MÃ©tricas del sistema
- Alertas si faltan APIs crÃ­ticas

### 2. ConfiguraciÃ³n de APIs

Navega a `http://localhost:5173/settings/apis`

**DeberÃ­a mostrar:**
- Lista de 9 APIs
- Estado de cada una (âœ… Configurada / âŒ No configurada)
- Botones para "Probar conexiÃ³n"

### 3. Autopilot

Navega a `http://localhost:5173/autopilot`

**Comportamiento esperado:**
- **Sin APIs:** BotÃ³n "Iniciar" deshabilitado con mensaje "APIs requeridas no configuradas"
- **Con APIs:** BotÃ³n habilitado, puede iniciar

### 4. Scraping

Navega a `http://localhost:5173/scraping`

**Comportamiento esperado:**
- **Sin ScraperAPI/ZenRows:** Error 503 al intentar scraping
- **Con API:** Scraping funciona normalmente

### 5. Comisiones

Navega a `http://localhost:5173/commissions`

**Comportamiento esperado:**
- **Sin PayPal:** Puede marcar como "Pagado manualmente", muestra advertencia
- **Con PayPal:** OpciÃ³n "Pagar automÃ¡ticamente vÃ­a PayPal" habilitada

---

## ðŸ§° SoluciÃ³n de Problemas

### Problema: "EADDRINUSE: port 3000 already in use"

**SoluciÃ³n:**
```cmd
# Matar proceso en puerto 3000
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force

# O cambiar puerto en backend/.env
PORT=3001
```

### Problema: "Database connection failed"

**SoluciÃ³n:**
```cmd
cd backend

# Regenerar Prisma
npx prisma generate

# Recrear base de datos
Remove-Item .\prisma\dev.db -ErrorAction SilentlyContinue
npx prisma migrate deploy
npm run prisma:seed
```

### Problema: Frontend no conecta con Backend

**Verifica:**
```cmd
# 1. Backend estÃ¡ corriendo
curl http://localhost:3000/health

# 2. Frontend tiene URL correcta
Get-Content frontend\.env
# Debe tener: VITE_API_URL=http://localhost:3000
```

### Problema: "API appears configured but validation fails"

**SoluciÃ³n:**
```cmd
# Limpiar cache de validaciÃ³n
curl -X POST http://localhost:3000/api/system/refresh-api-cache

# Revisar logs del backend para ver error especÃ­fico
```

### Problema: CORS errors

**Verifica en `backend/src/server.ts`:**
```typescript
app.use(cors({
  origin: 'http://localhost:5173', // Debe coincidir con frontend
  credentials: true
}));
```

---

## ðŸ“Š Comandos Ãštiles Durante el Desarrollo

```cmd
# Ver estado de APIs en tiempo real
while ($true) {
    Clear-Host
    $status = Invoke-RestMethod -Uri "http://localhost:3000/api/system/api-status"
    Write-Host "===== ESTADO DE APIs =====" -ForegroundColor Cyan
    Write-Host "Configuradas: $($status.summary.configured)/9" -ForegroundColor Green
    Write-Host "Disponibles: $($status.summary.available)/9" -ForegroundColor Yellow
    Write-Host "Faltantes: $($status.summary.missing)/9" -ForegroundColor Red
    Start-Sleep -Seconds 5
}

# Ver logs del backend filtrados
cd backend
npm run dev 2>&1 | Select-String "API|ERROR|WARNING"

# Reiniciar todo rÃ¡pidamente
cd c:\Ivan_Reseller_Web
Get-Process | Where-Object {$_.ProcessName -like "*node*"} | Stop-Process -Force
iniciar-sistema.bat
```

---

## ðŸŽ‰ Prueba Exitosa

**SabrÃ¡s que el sistema funciona correctamente cuando:**

1. âœ… Backend inicia sin errores en puerto 3000
2. âœ… Frontend inicia sin errores en puerto 5173
3. âœ… Puedes hacer login en `http://localhost:5173`
4. âœ… `/api/system/api-status` devuelve JSON con 9 APIs
5. âœ… Autopilot muestra error claro si intentas iniciar sin APIs
6. âœ… Al configurar una API, el sistema la detecta automÃ¡ticamente (despuÃ©s de 5 min o forzar refresh)
7. âœ… Funcionalidades se habilitan/deshabilitan segÃºn APIs disponibles

---

## ðŸ“š PrÃ³ximos Pasos

Una vez verificado que el sistema de validaciÃ³n funciona:

1. **Configurar APIs reales** en `backend/.env`
2. **Probar cada marketplace** (eBay, Amazon, MercadoLibre)
3. **Probar scraping** de AliExpress
4. **Probar IA** con GROQ para descripciones
5. **Probar pagos** con PayPal en sandbox
6. **Actualizar Frontend** para mostrar estado de APIs en Dashboard
7. **Agregar middlewares** a rutas crÃ­ticas que aÃºn no los tienen

---

## ðŸ†˜ Soporte

Si encuentras problemas:

1. Revisa logs del backend (terminal donde corre `npm run dev`)
2. Abre DevTools del navegador (F12) â†’ Console â†’ Network
3. Verifica `/api/system/api-status` para ver errores especÃ­ficos
4. Consulta `AUDITORIA_VALIDACION_APIS.md` para detalles tÃ©cnicos

---

**Â¡Sistema listo para pruebas! ðŸš€**

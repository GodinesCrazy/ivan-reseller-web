# Plan 3 Fases: Fix Memoria + SIGSEGV en Railway

## ?? Objetivo
Resolver crashes por memoria alta (96%) y SIGSEGV en `/api/auth-status` en Railway.

---

## ?? FASE 1: Subir RAM/Plan en Railway (UI)

### Paso a Paso en Railway Dashboard

1. **Acceder a Railway Dashboard**
   - Ir a: https://railway.app/dashboard
   - Seleccionar tu proyecto

2. **Navegar a Settings del Servicio Backend**
   - Click en el servicio de backend
   - Click en "Settings" (??) en el menú lateral

3. **Cambiar Plan de Recursos**
   - Scroll hasta "Resources"
   - Click en "Change Plan"
   - **Progresión recomendada:**
     - **Paso 1:** Starter ? Developer ($5/mes, 512MB RAM)
     - **Paso 2:** Developer ? Pro ($20/mes, 2GB RAM) ? **RECOMENDADO**
     - **Paso 3:** Pro ? Team ($50/mes, 4GB RAM) si persisten problemas

4. **Aplicar Cambios**
   - Click "Save" o "Update"
   - Railway reiniciará el servicio automáticamente

5. **Verificar Cambio**
   ```powershell
   # Esperar 2-3 minutos y verificar logs
   # En Railway Dashboard ? Deployments ? Ver logs
   # Buscar: "Memory limit" o "RAM available"
   ```

### ?? Nota Importante
- Los cambios de plan pueden tardar 2-5 minutos en aplicarse
- El servicio se reiniciará automáticamente
- Los precios son aproximados y pueden variar

---

## ?? FASE 2: Reducir Consumo de Memoria

### 2.1 Variables de Entorno en Railway

Agregar/actualizar estas variables en Railway Dashboard ? Variables:

```bash
# Heap limit (ajustar según RAM disponible)
NODE_OPTIONS=--max-old-space-size=1536

# Deshabilitar workers innecesarios
UV_THREADPOOL_SIZE=4

# Deshabilitar V8 optimizations costosas
NODE_OPTIONS=--max-old-space-size=1536 --no-experimental-fetch

# Safe modes (ya implementados, verificar que estén en true)
SAFE_AUTH_STATUS_MODE=true
SAFE_DASHBOARD_MODE=true
DISABLE_BROWSER_AUTOMATION=true

# Reducir concurrencia de BullMQ
BULLMQ_CONCURRENCY=1

# Deshabilitar lazy-load de Chromium en producción
SKIP_CHROMIUM_LAZY_LOAD=true
```

### 2.2 Ajustar Concurrencia en Código

**Archivo:** `backend/src/services/api-health-check-queue.service.ts`

```typescript
// Cambiar de 2 a 1
concurrency: 1, // ? FASE 2: Reducir a 1 para prevenir SIGSEGV
```

**Archivo:** `backend/src/services/api-health-monitor.service.ts`

```typescript
// Buscar y reducir cualquier concurrency > 1
const concurrency = parseInt(process.env.BULLMQ_CONCURRENCY || '1', 10);
```

### 2.3 Verificar Variables en Railway

```powershell
# Script para verificar variables (ejecutar localmente)
$railwayToken = "TU_RAILWAY_TOKEN"
$projectId = "TU_PROJECT_ID"
$serviceId = "TU_SERVICE_ID"

# Obtener variables actuales
Invoke-RestMethod -Uri "https://api.railway.app/v1/services/$serviceId/variables" `
  -Headers @{Authorization = "Bearer $railwayToken"} | ConvertTo-Json
```

---

## ??? FASE 3: Aislar Dependencias Nativas (Dynamic Imports)

### 3.1 Fix: `chromium.ts` - Lazy Load @sparticuz/chromium

**Archivo:** `backend/src/utils/chromium.ts`

**Cambio:** Mover `require('@sparticuz/chromium')` a función lazy.

```typescript
// ? ELIMINAR estas líneas (5-10):
let chromium: any = null;
try {
  chromium = require('@sparticuz/chromium');
} catch {
  // @sparticuz/chromium no está disponible (normal en Windows)
}

// ? AGREGAR función lazy:
let chromiumModule: any = null;
async function loadChromiumModule(): Promise<any> {
  if (chromiumModule !== null) {
    return chromiumModule;
  }
  try {
    chromiumModule = await import('@sparticuz/chromium');
    return chromiumModule;
  } catch {
    chromiumModule = false; // Cache negativo
    return null;
  }
}

// ? ACTUALIZAR ensureChromiumFromSparticuz:
async function ensureChromiumFromSparticuz(): Promise<string | undefined> {
  const chromium = await loadChromiumModule();
  if (!chromium) return undefined;
  
  // ... resto del código igual
}

// ? ACTUALIZAR getChromiumLaunchConfig:
export async function getChromiumLaunchConfig(extraArgs: string[] = []) {
  const executablePath = await resolveChromiumExecutable();
  const chromium = await loadChromiumModule();
  
  const args = executablePath && chromium?.args
    ? Array.from(new Set([...(chromium.args || []), ...extraArgs, '--no-sandbox']))
    : Array.from(new Set([...extraArgs, '--no-sandbox']));

  return {
    executablePath: executablePath,
    args,
    headless: true,
    defaultViewport: executablePath && chromium?.defaultViewport ? chromium.defaultViewport : { width: 1920, height: 1080 },
  };
}
```

### 3.2 Fix: `advanced-scraper.service.ts` - Dynamic Import Puppeteer

**Archivo:** `backend/src/services/advanced-scraper.service.ts`

**Cambio:** Convertir imports top-level a dynamic imports.

```typescript
// ? ELIMINAR estas líneas (1-3, 19-20):
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page, Protocol, Frame, HTTPResponse } from 'puppeteer';
// ...
puppeteer.use(StealthPlugin());

// ? AGREGAR al inicio de la clase:
class AdvancedMarketplaceScraper {
  private puppeteerModule: any = null;
  private stealthPlugin: any = null;
  private puppeteerTypes: any = null;

  private async loadPuppeteer(): Promise<any> {
    if (this.puppeteerModule) {
      return this.puppeteerModule;
    }
    
    // Verificar DISABLE_BROWSER_AUTOMATION
    const disableBrowser = process.env.DISABLE_BROWSER_AUTOMATION === 'true';
    if (disableBrowser) {
      throw new Error('Browser automation is disabled (DISABLE_BROWSER_AUTOMATION=true)');
    }

    try {
      const puppeteerExtra = await import('puppeteer-extra');
      const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
      const puppeteerTypes = await import('puppeteer');
      
      const puppeteer = puppeteerExtra.default;
      puppeteer.use(StealthPlugin());
      
      this.puppeteerModule = puppeteer;
      this.stealthPlugin = StealthPlugin;
      this.puppeteerTypes = puppeteerTypes;
      
      return puppeteer;
    } catch (error) {
      logger.error('[AdvancedScraper] Failed to load puppeteer:', error);
      throw error;
    }
  }

  // ? ACTUALIZAR todos los métodos que usan puppeteer:
  async scrapeProduct(url: string, options?: ScrapingOptions): Promise<ScrapedProduct> {
    const puppeteer = await this.loadPuppeteer();
    // ... resto del código usando puppeteer
  }
}
```

### 3.3 Fix: `aliexpress-auto-purchase.service.ts` - Dynamic Import

**Archivo:** `backend/src/services/aliexpress-auto-purchase.service.ts`

**Cambio:** Similar a advanced-scraper.

```typescript
// ? ELIMINAR (1-4, 10):
import puppeteer, { Browser } from 'puppeteer-core';
import type { Page } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
// ...
puppeteer.use(StealthPlugin());

// ? AGREGAR función lazy en la clase:
class AliExpressAutoPurchaseService {
  private puppeteerModule: any = null;

  private async loadPuppeteer(): Promise<any> {
    if (this.puppeteerModule) {
      return this.puppeteerModule;
    }
    
    const disableBrowser = process.env.DISABLE_BROWSER_AUTOMATION === 'true';
    if (disableBrowser) {
      throw new Error('Browser automation is disabled');
    }

    try {
      const puppeteerCore = await import('puppeteer-core');
      const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
      
      const puppeteer = puppeteerCore.default;
      puppeteer.use(StealthPlugin());
      
      this.puppeteerModule = puppeteer;
      return puppeteer;
    } catch (error) {
      logger.error('[AutoPurchase] Failed to load puppeteer:', error);
      throw error;
    }
  }

  // ? ACTUALIZAR métodos que usan puppeteer
}
```

### 3.4 Fix: `ali-auth-monitor.service.ts` - Dynamic Import AdvancedScraper

**Archivo:** `backend/src/services/ali-auth-monitor.service.ts`

**Cambio:** Import dinámico de AdvancedMarketplaceScraper.

```typescript
// ? ELIMINAR (línea 3):
import { AdvancedMarketplaceScraper } from './advanced-scraper.service';

// ? AGREGAR método lazy:
class AliExpressAuthMonitor {
  private scraperClass: any = null;

  private async getScraperClass(): Promise<any> {
    if (this.scraperClass) {
      return this.scraperClass;
    }
    
    // Verificar flags antes de cargar
    const disableBrowser = process.env.DISABLE_BROWSER_AUTOMATION === 'true';
    const safeMode = process.env.SAFE_AUTH_STATUS_MODE === 'true';
    
    if (disableBrowser || safeMode) {
      return null; // No cargar scraper en modo seguro
    }

    try {
      const module = await import('./advanced-scraper.service');
      this.scraperClass = module.AdvancedMarketplaceScraper;
      return this.scraperClass;
    } catch (error) {
      logger.error('[AliAuthMonitor] Failed to load AdvancedScraper:', error);
      return null;
    }
  }

  // ? ACTUALIZAR métodos que usan AdvancedMarketplaceScraper:
  async refreshNow(userId: number, options?: RefreshOptions) {
    const ScraperClass = await this.getScraperClass();
    if (!ScraperClass) {
      throw new Error('Scraper not available (DISABLE_BROWSER_AUTOMATION or SAFE_AUTH_STATUS_MODE enabled)');
    }
    
    const scraper = new ScraperClass();
    // ... resto del código
  }
}
```

### 3.5 Fix: `auth-status.routes.ts` - Dynamic Import aliExpressAuthMonitor

**Archivo:** `backend/src/api/routes/auth-status.routes.ts`

**Cambio:** Import dinámico solo cuando se necesite (en POST /refresh).

```typescript
// ? ELIMINAR (línea 5):
import { aliExpressAuthMonitor } from '../../services/ali-auth-monitor.service';

// ? ACTUALIZAR POST /:marketplace/refresh:
router.post('/:marketplace/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { marketplace } = req.params;

    if (marketplace !== 'aliexpress') {
      return res.status(400).json({ success: false, error: 'Marketplace not supported' });
    }

    // ? Dynamic import solo cuando se necesite
    const { aliExpressAuthMonitor } = await import('../../services/ali-auth-monitor.service');
    const result = await aliExpressAuthMonitor.refreshNow(userId, { force: true, reason: 'user-request' });

    return res.json({
      success: true,
      result,
    });
  } catch (error) {
    next(error);
  }
});
```

### 3.6 Fix: `server.ts` - Dynamic Import aliExpressAuthMonitor

**Archivo:** `backend/src/server.ts`

**Cambio:** Import dinámico condicional.

```typescript
// ? ELIMINAR (línea 9):
import { aliExpressAuthMonitor } from './services/ali-auth-monitor.service';

// ? AGREGAR función async para inicializar:
async function initializeServices() {
  // Solo cargar aliExpressAuthMonitor si no está en modo seguro
  const safeMode = process.env.SAFE_AUTH_STATUS_MODE === 'true';
  const disableBrowser = process.env.DISABLE_BROWSER_AUTOMATION === 'true';
  
  if (!safeMode && !disableBrowser) {
    try {
      const { aliExpressAuthMonitor } = await import('./services/ali-auth-monitor.service');
      aliExpressAuthMonitor.start();
      logMilestone('AliExpress Auth Monitor started');
    } catch (error: any) {
      console.warn('??  Failed to start AliExpress Auth Monitor:', error?.message || error);
    }
  } else {
    console.log('??  AliExpress Auth Monitor disabled (SAFE_AUTH_STATUS_MODE or DISABLE_BROWSER_AUTOMATION)');
  }
}

// ? LLAMAR en lugar de aliExpressAuthMonitor.start():
// Buscar donde está aliExpressAuthMonitor.start() y reemplazar con:
await initializeServices();
```

---

## ? CHECKLIST DE IMPLEMENTACIÓN

### Pre-Implementación
- [ ] Backup del código actual (commit a git)
- [ ] Verificar plan actual de Railway
- [ ] Documentar variables de entorno actuales

### Fase 1: Railway Plan
- [ ] Acceder a Railway Dashboard
- [ ] Cambiar plan a Pro (2GB RAM) o superior
- [ ] Esperar reinicio del servicio
- [ ] Verificar logs sin errores de memoria

### Fase 2: Variables de Entorno
- [ ] Agregar `NODE_OPTIONS=--max-old-space-size=1536` en Railway
- [ ] Agregar `UV_THREADPOOL_SIZE=4`
- [ ] Verificar `SAFE_AUTH_STATUS_MODE=true`
- [ ] Verificar `DISABLE_BROWSER_AUTOMATION=true`
- [ ] Agregar `BULLMQ_CONCURRENCY=1`
- [ ] Agregar `SKIP_CHROMIUM_LAZY_LOAD=true`
- [ ] Reiniciar servicio en Railway

### Fase 3: Código (Dynamic Imports)
- [ ] Fix `chromium.ts` (lazy load @sparticuz/chromium)
- [ ] Fix `advanced-scraper.service.ts` (dynamic import puppeteer)
- [ ] Fix `aliexpress-auto-purchase.service.ts` (dynamic import)
- [ ] Fix `ali-auth-monitor.service.ts` (dynamic import AdvancedScraper)
- [ ] Fix `auth-status.routes.ts` (dynamic import aliExpressAuthMonitor)
- [ ] Fix `server.ts` (dynamic import aliExpressAuthMonitor)
- [ ] Reducir concurrency en `api-health-check-queue.service.ts`
- [ ] Commit y push a git
- [ ] Deploy en Railway

### Post-Implementación
- [ ] Ejecutar tests de validación (ver sección siguiente)
- [ ] Monitorear logs por 24 horas
- [ ] Verificar que no hay crashes SIGSEGV
- [ ] Verificar uso de memoria < 80%

---

## ?? COMANDOS DE VALIDACIÓN

### PowerShell - Test de Estabilidad

```powershell
# Configurar variables
$apiUrl = "https://tu-backend.railway.app"
$authToken = "TU_JWT_TOKEN"

# Test 1: Health check básico
Write-Host "`n[TEST 1] Health Check..." -ForegroundColor Cyan
$response = Invoke-RestMethod -Uri "$apiUrl/api/system/health" -Method GET
Write-Host "Status: $($response.status)" -ForegroundColor Green

# Test 2: Auth Status (endpoint crítico)
Write-Host "`n[TEST 2] Auth Status (10 requests secuenciales)..." -ForegroundColor Cyan
$headers = @{
    "Authorization" = "Bearer $authToken"
    "Content-Type" = "application/json"
}

for ($i = 1; $i -le 10; $i++) {
    try {
        $startTime = Get-Date
        $response = Invoke-RestMethod -Uri "$apiUrl/api/auth-status" -Method GET -Headers $headers
        $duration = ((Get-Date) - $startTime).TotalMilliseconds
        Write-Host "  Request $i`: OK (${duration}ms)" -ForegroundColor Green
        Start-Sleep -Milliseconds 500
    } catch {
        Write-Host "  Request $i`: FAILED - $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Test 3: Memory check (si tienes endpoint de métricas)
Write-Host "`n[TEST 3] Memory Check..." -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$apiUrl/api/system/metrics" -Method GET -Headers $headers
    $memoryMB = [math]::Round($response.memory.heapUsed / 1024 / 1024, 2)
    Write-Host "Heap Used: ${memoryMB}MB" -ForegroundColor $(if ($memoryMB -lt 1000) { "Green" } else { "Yellow" })
} catch {
    Write-Host "Metrics endpoint not available" -ForegroundColor Yellow
}

# Test 4: Stress test (20 requests concurrentes)
Write-Host "`n[TEST 4] Stress Test (20 concurrent requests)..." -ForegroundColor Cyan
$jobs = 1..20 | ForEach-Object {
    Start-Job -ScriptBlock {
        param($url, $token)
        $headers = @{
            "Authorization" = "Bearer $token"
        }
        try {
            $response = Invoke-RestMethod -Uri "$url/api/auth-status" -Method GET -Headers $headers
            return @{ Success = $true; Status = "OK" }
        } catch {
            return @{ Success = $false; Error = $_.Exception.Message }
        }
    } -ArgumentList $apiUrl, $authToken
}

$results = $jobs | Wait-Job | Receive-Job
$jobs | Remove-Job

$successCount = ($results | Where-Object { $_.Success }).Count
$failCount = ($results | Where-Object { -not $_.Success }).Count
Write-Host "  Success: $successCount / 20" -ForegroundColor Green
Write-Host "  Failed: $failCount / 20" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Red" })

Write-Host "`n? Tests completados" -ForegroundColor Green
```

### cURL - Test Básico

```bash
# Test 1: Health
curl -X GET "https://tu-backend.railway.app/api/system/health"

# Test 2: Auth Status (repetir 10 veces)
for i in {1..10}; do
  echo "Request $i:"
  curl -X GET "https://tu-backend.railway.app/api/auth-status" \
    -H "Authorization: Bearer TU_JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -w "\nTime: %{time_total}s\nStatus: %{http_code}\n" \
    -s -o /dev/null
  sleep 0.5
done

# Test 3: Verificar headers de overload
curl -X GET "https://tu-backend.railway.app/api/auth-status" \
  -H "Authorization: Bearer TU_JWT_TOKEN" \
  -v 2>&1 | grep -i "overload\|memory"
```

### Verificar Logs en Railway

```powershell
# En Railway Dashboard:
# 1. Ir a Deployments
# 2. Click en el deployment más reciente
# 3. Ver logs y buscar:
#    - "SIGSEGV" (no debería aparecer)
#    - "memory_high" (no debería aparecer)
#    - "Auth Status Request completed" (debería aparecer con duración < 2s)
#    - "SAFE_AUTH_STATUS_MODE enabled" (debería aparecer)
```

---

## ?? MÉTRICAS DE ÉXITO

### Antes de la Implementación
- ? Memoria: 96%+ (overload)
- ? Crashes: SIGSEGV frecuentes
- ? `/api/auth-status`: Falla o muy lento (>5s)

### Después de la Implementación
- ? Memoria: < 80% estable
- ? Crashes: 0 SIGSEGV en 24h
- ? `/api/auth-status`: < 2s, 100% éxito
- ? Uptime: > 99.9%

---

## ?? TROUBLESHOOTING

### Si persisten crashes SIGSEGV:
1. Verificar que `DISABLE_BROWSER_AUTOMATION=true`
2. Verificar que `SAFE_AUTH_STATUS_MODE=true`
3. Verificar que todos los dynamic imports están implementados
4. Revisar logs para identificar qué módulo se carga antes del crash
5. Considerar subir a plan Team (4GB RAM)

### Si la memoria sigue alta:
1. Reducir `--max-old-space-size` a 1024
2. Reducir `UV_THREADPOOL_SIZE` a 2
3. Verificar que no hay memory leaks (usar `node --expose-gc`)
4. Revisar queries de Prisma (pueden estar cargando demasiados datos)

### Si el endpoint es lento:
1. Verificar que `SAFE_AUTH_STATUS_MODE=true` (evita checks activos)
2. Verificar latencia de base de datos
3. Verificar que Redis está disponible (cache)
4. Revisar logs para identificar cuellos de botella

---

## ?? NOTAS FINALES

- **Prioridad:** Implementar Fase 3 (dynamic imports) es CRÍTICA para resolver SIGSEGV
- **Fase 1 y 2:** Son complementarias pero no resuelven el problema raíz
- **Testing:** Ejecutar tests de validación después de cada fase
- **Monitoreo:** Monitorear Railway logs por 24-48h después de implementar

---

**Última actualización:** 2025-01-XX
**Autor:** Sistema de Ingeniería
**Versión:** 1.0

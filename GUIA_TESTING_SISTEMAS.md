# 🧪 GUÍA DE TESTING - Sistemas Críticos

Esta guía proporciona instrucciones detalladas para probar todos los sistemas implementados.

---

## 📋 PRE-REQUISITOS

### 1. Instalar Dependencias
```bash
cd backend
npm install
```

### 2. Configurar Variables de Entorno
Crear/editar archivo `.env`:

```bash
# Captcha Services (opcional pero recomendado)
TWO_CAPTCHA_API_KEY=your_2captcha_api_key
ANTI_CAPTCHA_API_KEY=your_anticaptcha_api_key

# Proxy Services
SCRAPERAPI_KEY=your_scraperapi_key
PROXY_LIST=[{"host":"proxy1.com","port":8080,"username":"user","password":"pass"}]

# AI Enhancement
GROQ_API_KEY=your_groq_api_key

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/ivan_reseller
```

---

## 🧪 TESTS POR SISTEMA

### 1. Test de Stealth Scraping Service

#### Test Básico:
```typescript
// backend/src/tests/stealth-scraping.test.ts
import { stealthScrapingService } from '../services/stealth-scraping.service';

async function testStealthScraping() {
  const testUrl = 'https://www.aliexpress.com/item/1234567890.html';
  
  try {
    console.log('🔍 Testing stealth scraping...');
    const product = await stealthScrapingService.scrapeAliExpressProduct(testUrl);
    
    console.log('✅ Product scraped successfully:');
    console.log('Title:', product.title);
    console.log('Price:', product.price, product.currency);
    console.log('Images:', product.images.length);
    console.log('Rating:', product.rating);
    console.log('Scrape Method:', product.metadata?.scrapeMethod);
    
    return product;
  } catch (error) {
    console.error('❌ Stealth scraping failed:', error);
    throw error;
  }
}

testStealthScraping();
```

#### Ejecutar:
```bash
npx ts-node src/tests/stealth-scraping.test.ts
```

---

### 2. Test de Anti-Captcha Service

#### Test de Balance:
```typescript
// backend/src/tests/anti-captcha.test.ts
import { antiCaptchaService } from '../services/anti-captcha.service';

async function testAntiCaptcha() {
  console.log('💰 Checking captcha service balances...');
  
  const balances = await antiCaptchaService.getBalances();
  console.log('Balances:', balances);
  
  const available = antiCaptchaService.isAvailable();
  console.log('Services available:', available);
}

testAntiCaptcha();
```

#### Test de Resolución (si tienes captcha):
```typescript
async function testCaptchaSolving() {
  const result = await antiCaptchaService.solveCaptcha({
    type: 'recaptcha_v2',
    websiteUrl: 'https://example.com',
    siteKey: 'your_site_key',
  });
  
  console.log('Captcha solved:', result);
}
```

---

### 3. Test de Adaptive Selector System

#### Test de Búsqueda de Elementos:
```typescript
// backend/src/tests/selector-adapter.test.ts
import puppeteer from 'puppeteer';
import { selectorAdapter } from '../services/selector-adapter.service';

async function testAdaptiveSelectors() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://www.aliexpress.com/item/1234567890.html');
  
  console.log('🔍 Testing adaptive selectors...');
  
  // Test title
  const titleElement = await selectorAdapter.findElement(page, 'productTitle');
  const title = await selectorAdapter.extractText(titleElement);
  console.log('Title found:', title);
  
  // Test price
  const priceElement = await selectorAdapter.findElement(page, 'productPrice');
  const price = await selectorAdapter.extractText(priceElement);
  console.log('Price found:', price);
  
  // Test images
  const images = await selectorAdapter.findElements(page, 'productImages');
  console.log('Images found:', images.length);
  
  // Get stats
  const stats = selectorAdapter.getPatternStats();
  console.log('Selector stats:', stats);
  
  await browser.close();
}

testAdaptiveSelectors();
```

---

### 4. Test de Proxy Manager

#### Test de Health Check:
```typescript
// backend/src/tests/proxy-manager.test.ts
import { proxyManager } from '../services/proxy-manager.service';

async function testProxyManager() {
  console.log('🌐 Testing proxy manager...');
  
  // Add test proxies
  proxyManager.addProxy('proxy1.example.com', 8080, {
    username: 'user',
    password: 'pass',
    type: 'datacenter',
  });
  
  // Get stats
  const stats = proxyManager.getStats();
  console.log('📊 Proxy stats:', stats);
  
  // Get best proxy
  const bestProxy = proxyManager.getBestProxy();
  console.log('🏆 Best proxy:', bestProxy);
  
  // Run health check
  console.log('🏥 Running health check...');
  await proxyManager.healthCheckAll();
  
  // Get updated stats
  const updatedStats = proxyManager.getStats();
  console.log('📊 Updated stats:', updatedStats);
}

testProxyManager();
```

---

## 🚀 TESTS DE INTEGRACIÓN

### Test End-to-End Completo:
```typescript
// backend/src/tests/e2e.test.ts
import { stealthScrapingService } from '../services/stealth-scraping.service';
import { proxyManager } from '../services/proxy-manager.service';
import { selectorAdapter } from '../services/selector-adapter.service';

async function testE2E() {
  console.log('🔄 Starting E2E test...');
  
  // 1. Check proxy manager
  console.log('\n1️⃣ Checking proxy manager...');
  const proxyStats = proxyManager.getStats();
  console.log('Active proxies:', proxyStats.activeProxies);
  
  // 2. Check selector adapter
  console.log('\n2️⃣ Checking selector adapter...');
  const selectorStats = selectorAdapter.getPatternStats();
  console.log('Selector patterns:', Object.keys(selectorStats).length);
  
  // 3. Scrape product with all systems
  console.log('\n3️⃣ Scraping product with all systems integrated...');
  const testUrl = 'https://www.aliexpress.com/item/1234567890.html';
  
  const product = await stealthScrapingService.scrapeAliExpressProduct(testUrl);
  
  console.log('\n✅ E2E test completed successfully!');
  console.log('Product:', product.title);
  console.log('Price:', product.price, product.currency);
  console.log('Scrape method:', product.metadata?.scrapeMethod);
  
  // 4. Check updated stats
  console.log('\n4️⃣ Updated stats:');
  const updatedProxyStats = proxyManager.getStats();
  console.log('Proxy usage:', updatedProxyStats);
  
  const updatedSelectorStats = selectorAdapter.getPatternStats();
  console.log('Selector success rates:', updatedSelectorStats);
  
  return product;
}

testE2E();
```

---

## 🔍 TESTS MANUALES

### 1. Test de API Endpoint

```bash
# Test scraping endpoint
curl -X POST http://localhost:3000/api/products/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "url": "https://www.aliexpress.com/item/1234567890.html"
  }'
```

### 2. Test de Proxy Health

```bash
# Check proxy stats
curl http://localhost:3000/api/system/proxy-stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Test de Selector Stats

```bash
# Check selector patterns
curl http://localhost:3000/api/system/selector-stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📊 VERIFICACIÓN DE LOGS

### Ver logs en tiempo real:
```bash
# Terminal 1: Error logs
tail -f backend/logs/error.log

# Terminal 2: Combined logs
tail -f backend/logs/combined.log
```

### Buscar eventos específicos:
```bash
# Buscar proxies fallidos
grep "proxy.*failed" backend/logs/combined.log

# Buscar selectores aprendidos
grep "learned new selector" backend/logs/combined.log

# Buscar captchas detectados
grep "captcha detected" backend/logs/combined.log
```

---

## 🐛 TROUBLESHOOTING

### Problema: Scraping falla constantemente
**Solución:**
1. Verificar que proxies estén configurados
2. Ejecutar health check manual: `proxyManager.healthCheckAll()`
3. Revisar logs de error

### Problema: Selectores no encuentran elementos
**Solución:**
1. Verificar URL de AliExpress es válida
2. Revisar `selector-patterns.json` para ver patrones
3. Habilitar modo debug en selector adapter

### Problema: Captchas no se resuelven
**Solución:**
1. Verificar API keys de 2Captcha/Anti-Captcha
2. Revisar balance: `antiCaptchaService.getBalances()`
3. Activar logs debug en anti-captcha service

---

## ✅ CHECKLIST DE VALIDACIÓN

Antes de considerar el sistema listo para producción:

- [ ] Stealth scraping funciona sin detección
- [ ] Captchas se resuelven automáticamente
- [ ] Selectores adaptativos funcionan en 3+ productos diferentes
- [ ] Al menos 3 proxies pasan health check
- [ ] Logs se guardan correctamente
- [ ] Métricas se actualizan en archivos JSON
- [ ] No hay memory leaks en sesiones largas
- [ ] Errores se manejan gracefully
- [ ] Sistema se recupera de fallos de proxy
- [ ] Sistema se recupera de cambios HTML

---

## 📈 MÉTRICAS A MONITOREAR

### En Producción:
1. **Tasa de éxito de scraping** (target: >90%)
2. **Tiempo promedio de scraping** (target: <30s)
3. **Tasa de detección de bots** (target: <5%)
4. **Success rate de proxies** (target: >70%)
5. **Tasa de learning de selectores** (target: >80%)
6. **Resolución automática de captchas** (target: >95%)

---

## 🚀 SIGUIENTE NIVEL

Después de validar estos tests:

1. **Crear tests unitarios con Jest**
2. **Implementar CI/CD pipeline**
3. **Configurar monitoring con Prometheus**
4. **Agregar alertas automáticas**
5. **Implementar Auto-Recovery System** (siguiente sistema)

---

**Status:** 📝 Guía de testing completa  
**Última actualización:** 29 de Octubre, 2025

# 🔍 Estado del Scraper de AliExpress

## ✅ Implementación Completa

El sistema tiene **DOS métodos de scraping** implementados con fallback automático:

### 1️⃣ **Scraping Nativo (Puppeteer)** - PRIORIDAD 1
- **Ubicación**: `backend/src/services/advanced-scraper.service.ts`
- **Método**: `scrapeAliExpress(query: string)`
- **Tecnología**: Puppeteer con Stealth Plugin
- **Características**:
  - ✅ Evasión anti-bot con Stealth Plugin
  - ✅ Múltiples selectores CSS para resiliencia
  - ✅ Detección y manejo de CAPTCHA
  - ✅ Simulación de comportamiento humano
  - ✅ Scroll automático para cargar más productos
  - ✅ Extracción de: título, precio, imagen, URL, rating, reviews

### 2️⃣ **Bridge Python** - FALLBACK
- **Ubicación**: `backend/src/services/scraper-bridge.service.ts`
- **Método**: `aliexpressSearch(params)`
- **Tecnología**: Servicio Python externo (puerto 8077)
- **Uso**: Solo si el scraping nativo falla

## 🔄 Flujo de Búsqueda de Oportunidades

```
Usuario busca "organizador cocina"
    ↓
GET /api/opportunities?query=organizador+cocina
    ↓
opportunity-finder.service.ts
    ↓
1️⃣ Intenta scraping nativo (Puppeteer)
    ├─ ✅ Éxito → Extrae productos
    └─ ❌ Falla → 
        ↓
2️⃣ Intenta bridge Python
    ├─ ✅ Éxito → Extrae productos
    └─ ❌ Falla → Retorna []
        ↓
3️⃣ Analiza competencia en marketplaces
    ↓
4️⃣ Calcula márgenes y ROI
    ↓
5️⃣ Retorna oportunidades
```

## 📊 Estado Actual

### ✅ **Funcionalidades Implementadas**:
- [x] Scraping nativo con Puppeteer
- [x] Fallback a bridge Python
- [x] Detección de CAPTCHA
- [x] Múltiples selectores CSS
- [x] Análisis de competencia
- [x] Cálculo de rentabilidad
- [x] Notificaciones en tiempo real

### ⚠️ **Posibles Problemas**:

1. **CAPTCHA de AliExpress**:
   - Si AliExpress detecta el scraping, puede mostrar CAPTCHA
   - El sistema detecta CAPTCHA y notifica al usuario
   - Requiere resolución manual en algunos casos

2. **Selectores CSS**:
   - AliExpress puede cambiar su estructura HTML
   - El sistema usa múltiples selectores alternativos
   - Si todos fallan, no encontrará productos

3. **Chromium en Railway**:
   - El scraper necesita Chromium instalado
   - Configurado en `nixpacks.toml`
   - Puede fallar si Chromium no está disponible

## 🧪 Cómo Probar

### Opción 1: Desde el Frontend
1. Ir a `/opportunities`
2. Buscar: "organizador cocina"
3. Click en "Search"
4. Ver resultados en la tabla

### Opción 2: Desde el Backend (API)
```bash
curl -X GET "https://ivan-reseller-backend-production.up.railway.app/api/opportunities?query=organizador+cocina&maxItems=5" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Opción 3: Revisar Logs de Railway
- Ver logs del backend en Railway
- Buscar mensajes:
  - `🔍 Usando scraping nativo local (Puppeteer)`
  - `✅ Scraping nativo exitoso: X productos encontrados`
  - `❌ Error en scraping nativo`
  - `⚠️ Scraping nativo falló, intentando bridge Python`

## 📝 Logs Esperados

### ✅ **Scraping Exitoso**:
```
🔍 Usando scraping nativo local (Puppeteer) para: organizador cocina
🚀 Inicializando navegador...
✅ Chromium encontrado en ruta preferida: /app/.chromium/chromium
🚀 Iniciando navegador con evasión anti-bot...
🔍 Scraping REAL AliExpress: "organizador cocina"
📡 Navegando a: https://www.aliexpress.com/w/wholesale-organizador+cocina.html
✅ Productos encontrados con selector: .search-item-card-wrapper-gallery
✅ Extraídos 5 productos REALES de AliExpress
✅ Scraping nativo exitoso: 5 productos encontrados
```

### ❌ **Scraping Fallido**:
```
🔍 Usando scraping nativo local (Puppeteer) para: organizador cocina
🚀 Inicializando navegador...
❌ Error al iniciar navegador: Failed to launch the browser process
⚠️ Scraping nativo falló, intentando bridge Python
❌ Ambos métodos de scraping fallaron
```

## 🔧 Solución de Problemas

### Si el scraper no encuentra productos:

1. **Verificar Chromium**:
   - Revisar logs: `✅ Chromium encontrado`
   - Si no aparece, verificar `nixpacks.toml`

2. **Verificar CAPTCHA**:
   - Revisar logs: `🛡️ CAPTCHA detectado`
   - Si aparece, resolver manualmente

3. **Verificar Selectores**:
   - AliExpress puede haber cambiado su HTML
   - Actualizar selectores en `advanced-scraper.service.ts`

4. **Verificar Bridge Python**:
   - Si el scraping nativo falla, verificar que el bridge esté corriendo
   - URL: `http://127.0.0.1:8077` (o variable de entorno)

## 📈 Mejoras Futuras

- [ ] Rotación de proxies para evitar CAPTCHA
- [ ] Cache de resultados de scraping
- [ ] Actualización automática de selectores CSS
- [ ] Métricas de éxito/fallo del scraper
- [ ] Alertas cuando el scraper falla repetidamente


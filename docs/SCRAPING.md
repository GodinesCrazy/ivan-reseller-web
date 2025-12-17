# Scraping Configuration Guide - Ivan Reseller Web

## 📋 Resumen

El sistema Ivan Reseller Web soporta múltiples métodos de scraping de AliExpress:
1. **Scraper Bridge (Python)** - Microservicio Python dedicado (recomendado para producción)
2. **Stealth Scraping (Puppeteer)** - Scraping directo con Puppeteer Stealth
3. **ScraperAPI/ZenRows** - Servicios externos de scraping (fallback)

---

## ⚙️ Configuración

### Variables de Entorno

```env
# Habilitar/deshabilitar Scraper Bridge
SCRAPER_BRIDGE_ENABLED=true  # true o false (default: true)

# URL del microservicio Python
SCRAPER_BRIDGE_URL=http://localhost:8077  # URL completa del bridge

# Fallback automático a stealth-scraping si bridge falla
SCRAPER_FALLBACK_TO_STEALTH=true  # true o false (default: true)
```

### Validación al Boot

El sistema valida la configuración del scraper al iniciar:
- Si `SCRAPER_BRIDGE_ENABLED=true` y `SCRAPER_BRIDGE_URL` no está configurada → Advertencia (usa fallback)
- Si `SCRAPER_BRIDGE_ENABLED=true` y URL configurada → Verifica disponibilidad (timeout 3s, no bloqueante)
- Si `SCRAPER_BRIDGE_ENABLED=false` → Usa stealth-scraping directamente

---

## 🐍 Opción A: Scraper Bridge (Python) - Recomendado

### Ventajas
- ✅ Más robusto y estable
- ✅ Mejor manejo de CAPTCHAs
- ✅ Procesamiento aislado (no afecta Node.js)

### Requisitos
- Python 3.9+
- Microservicio Flask/FastAPI corriendo en puerto configurado
- Dependencias: `selenium`, `undetected-chromedriver`, `requests`

### Endpoints Requeridos

El bridge Python debe implementar estos endpoints:

#### `GET /health`
```json
{
  "status": "healthy",
  "details": {
    "chromium_version": "...",
    "driver_status": "..."
  }
}
```

#### `POST /scraping/aliexpress/search`
**Request:**
```json
{
  "query": "phone case",
  "max_items": 10,
  "locale": "es-ES"
}
```

**Response:**
```json
{
  "items": [
    {
      "productId": "100500123456",
      "title": "Phone Case",
      "url": "https://www.aliexpress.com/item/...",
      "price": 5.99,
      "currency": "USD",
      "images": ["https://...", "https://..."],
      "shippingCost": 2.50,
      "store": "Store Name",
      "rating": 4.5,
      "orders": 1234
    }
  ]
}
```

### Configuración en Railway/Producción

1. **Crear servicio Python separado** (o incluir en repo)
2. **Configurar variable de entorno:**
   ```
   SCRAPER_BRIDGE_URL=http://scraper-bridge-service:8077
   ```
3. **Verificar conectividad:**
   - El sistema verifica automáticamente al boot
   - Puede verificar manualmente: `GET {SCRAPER_BRIDGE_URL}/health`

---

## 🤖 Opción B: Stealth Scraping (Puppeteer) - Fallback

### Ventajas
- ✅ No requiere servicio externo
- ✅ Totalmente integrado en Node.js

### Desventajas
- ⚠️ Puede fallar en Railway/producción sin Chromium configurado
- ⚠️ Más propenso a detección de bots

### Configuración en Railway/Producción

1. **Instalar Chromium en Dockerfile:**
   ```dockerfile
   RUN apt-get update && apt-get install -y \
       chromium \
       chromium-driver
   ```

2. **Configurar variable de entorno:**
   ```env
   PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
   ```

3. **O usar `@sparticuz/chromium` (Lambda/Railway):**
   ```env
   PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
   ```
   El sistema detecta automáticamente Chromium disponible.

---

## 🔄 Flujo de Fallback

El sistema intenta los métodos en este orden:

```
1. Scraping Nativo (StealthScrapingService)
   ↓ (si falla o retorna vacío)
2. Scraper Bridge (Python)
   ↓ (si falla, deshabilitado o no disponible)
3. ScraperAPI/ZenRows (si están configurados)
   ↓ (si falla)
4. Retorna error controlado (no crash)
```

### Errores Controlados

El sistema maneja estos errores sin crashear:
- ❌ Bridge no disponible → Usa fallback
- ❌ Bridge timeout → Usa fallback
- ❌ CAPTCHA requerido → Notifica al usuario para resolución manual
- ❌ Chromium no disponible → Usa bridge o retorna error controlado

---

## 🧪 Smoke Tests

### Verificar Bridge Python

```bash
# Desde el backend
curl http://localhost:8077/health
```

### Verificar Stealth Scraping

```bash
# El sistema intenta resolver Chromium automáticamente
# Si falla, retorna error controlado
```

### Test de Búsqueda Completa

```typescript
// El sistema prueba automáticamente al iniciar
// Ver logs del servidor para verificar qué método se usó
```

---

## 📝 Troubleshooting

### Problema: "Scraper bridge not available"

**Causas posibles:**
1. Bridge Python no está corriendo
2. URL incorrecta en `SCRAPER_BRIDGE_URL`
3. Firewall bloquea conexión
4. Bridge no responde en timeout (5s)

**Solución:**
1. Verificar que el bridge esté corriendo: `curl {SCRAPER_BRIDGE_URL}/health`
2. Verificar variable `SCRAPER_BRIDGE_URL` en Railway/env
3. Si no se usa bridge: `SCRAPER_BRIDGE_ENABLED=false`

### Problema: "Chromium executable not found"

**Causas posibles:**
1. Chromium no instalado en el sistema
2. `PUPPETEER_EXECUTABLE_PATH` no configurado
3. Railway no tiene Chromium disponible

**Solución:**
1. Usar Scraper Bridge en lugar de Puppeteer
2. Instalar Chromium en Dockerfile
3. Configurar `PUPPETEER_EXECUTABLE_PATH` manualmente

### Problema: "No products found"

**Causas posibles:**
1. Término de búsqueda sin resultados
2. AliExpress bloqueando scraping
3. CAPTCHA requerido
4. Todos los métodos de scraping fallaron

**Solución:**
1. Verificar término de búsqueda
2. Revisar logs para ver qué método falló
3. Si es CAPTCHA: resolver manualmente desde la UI
4. Esperar unos minutos (puede ser rate limiting)

---

## 🔐 Seguridad

- ✅ El bridge Python corre en puerto interno (no expuesto públicamente)
- ✅ Timeouts estrictos previenen bloqueos
- ✅ Errores no exponen información sensible
- ✅ Validación de respuestas antes de procesar

---

## 📊 Performance

- **Bridge Python:** ~2-5 segundos por búsqueda
- **Stealth Scraping:** ~10-30 segundos por búsqueda
- **ScraperAPI/ZenRows:** ~1-3 segundos por búsqueda

**Recomendación:** Usar Bridge Python en producción para mejor performance y estabilidad.


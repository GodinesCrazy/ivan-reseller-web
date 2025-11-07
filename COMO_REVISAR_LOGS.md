# 📋 Cómo Revisar los Logs del Scraper

## 🔍 Dónde Ver los Logs

### 1. **Railway Dashboard (Producción)**

Los logs del backend están disponibles en Railway:

1. **Acceder a Railway Dashboard**:
   - Ir a: https://railway.app
   - Seleccionar el proyecto: `ivan-reseller-backend`
   - Click en el servicio del backend

2. **Ver Logs en Tiempo Real**:
   - Click en la pestaña **"Logs"** o **"Deployments"**
   - Los logs se muestran en tiempo real
   - Buscar por palabras clave relacionadas con scraping

3. **Filtrar Logs del Scraper**:
   - Buscar: `🔍 Usando scraping nativo`
   - Buscar: `Scraping REAL AliExpress`
   - Buscar: `✅ Scraping nativo exitoso`
   - Buscar: `❌ Error en scraping nativo`

### 2. **Logs Locales (Desarrollo)**

Si estás ejecutando localmente, los logs se guardan en:
- `backend/logs/combined.log` - Todos los logs
- `backend/logs/error.log` - Solo errores

## 🔎 Qué Buscar en los Logs

### ✅ **Logs de Éxito** (Scraper Funcionando):

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

### ⚠️ **Logs de Advertencia** (Problemas Menores):

```
⚠️  Chromium del sistema no encontrado, forzando descarga de Chrome de Puppeteer...
⚠️  Scraping nativo no encontró productos (puede ser selector incorrecto o página bloqueada)
⚠️  Scraping nativo falló, intentando bridge Python
```

### ❌ **Logs de Error** (Scraper Fallando):

```
❌ Error al iniciar navegador: Failed to launch the browser process
❌ Error en scraping nativo: [mensaje de error]
❌ Ambos métodos de scraping fallaron: {
  native: 'Error del scraping nativo',
  bridge: 'Error del bridge Python'
}
```

### 🛡️ **Logs de CAPTCHA**:

```
🛡️  CAPTCHA detectado, aplicando evasión...
CAPTCHA_REQUIRED: Se requiere resolver CAPTCHA manualmente
```

## 📊 Análisis de Logs

### Patrones a Identificar:

1. **Frecuencia de Éxitos vs Fallos**:
   - ¿Cuántas búsquedas exitosas vs fallidas?
   - ¿Hay un patrón temporal?

2. **Tiempo de Respuesta**:
   - ¿Cuánto tarda cada búsqueda?
   - ¿Hay búsquedas que se cuelgan?

3. **Errores Comunes**:
   - ¿Falla siempre el mismo paso?
   - ¿Hay errores de Chromium, CAPTCHA, o selectores?

4. **Fallback al Bridge Python**:
   - ¿Con qué frecuencia se usa el fallback?
   - ¿El bridge Python funciona cuando el nativo falla?

## 🔧 Comandos Útiles para Analizar Logs

### En Railway (usando Railway CLI):

```bash
# Instalar Railway CLI
npm i -g @railway/cli

# Login
railway login

# Ver logs en tiempo real
railway logs

# Ver logs filtrados por scraper
railway logs | grep -i "scraping\|scraper\|aliexpress"
```

### Localmente (si tienes acceso a los archivos):

```bash
# Ver últimos 100 logs
tail -n 100 backend/logs/combined.log

# Buscar errores del scraper
grep -i "scraping\|scraper\|aliexpress" backend/logs/combined.log

# Contar éxitos vs fallos
grep -c "✅ Scraping nativo exitoso" backend/logs/combined.log
grep -c "❌ Error en scraping nativo" backend/logs/combined.log
```

## 📝 Ejemplo de Análisis Completo

### Escenario 1: Scraper Funcionando Correctamente

```
✅ Chromium encontrado
✅ Navegador iniciado exitosamente
✅ Productos encontrados con selector
✅ Scraping nativo exitoso: 5 productos encontrados
```

**Conclusión**: ✅ Scraper funcionando correctamente

### Escenario 2: Problema con Chromium

```
⚠️  Chromium del sistema no encontrado
📥 Descargando Chrome de Puppeteer...
❌ Error al iniciar navegador: Failed to launch the browser process
⚠️  Scraping nativo falló, intentando bridge Python
```

**Conclusión**: ⚠️ Chromium no disponible, usando fallback

### Escenario 3: CAPTCHA Bloqueando

```
🛡️  CAPTCHA detectado, aplicando evasión...
CAPTCHA_REQUIRED: Se requiere resolver CAPTCHA manualmente
```

**Conclusión**: 🛡️ AliExpress está bloqueando con CAPTCHA

### Escenario 4: Selectores CSS Desactualizados

```
⚠️  No se encontraron productos con ningún selector
⚠️  Scraping nativo no encontró productos (puede ser selector incorrecto)
```

**Conclusión**: ⚠️ AliExpress cambió su HTML, actualizar selectores

## 🚨 Alertas Críticas

Si ves estos patrones, hay un problema serio:

1. **Todos los intentos fallan**:
   ```
   ❌ Ambos métodos de scraping fallaron
   ```
   → Verificar configuración de Chromium y bridge Python

2. **CAPTCHA constante**:
   ```
   🛡️  CAPTCHA detectado (repetido muchas veces)
   ```
   → Necesita rotación de proxies o resolución manual

3. **Navegador no inicia**:
   ```
   ❌ Error crítico al iniciar navegador
   ```
   → Verificar instalación de Chromium en Railway

## 📞 Siguiente Paso

Si encuentras errores en los logs:

1. **Copiar los logs completos** del error
2. **Identificar el patrón** (¿siempre falla en el mismo paso?)
3. **Revisar la documentación** en `ESTADO_SCRAPER.md`
4. **Aplicar las soluciones** sugeridas


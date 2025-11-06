# 🔧 SOLUCIÓN: Error de Puppeteer en Railway

**Fecha:** 2025-11-06  
**Problema:** Puppeteer no puede lanzar Chrome en Railway (Linux)

---

## 🔍 PROBLEMA IDENTIFICADO

El error `Failed to launch the browser process: spawn /root/.cache/puppeteer/chrome/linux-142.0.7444.59/chrome-linux64/chrome ENOENT` indica que:

1. **Chrome no está instalado** en el contenedor de Railway
2. **Puppeteer descargó Chrome** pero el ejecutable no existe o no tiene permisos
3. **Faltan dependencias del sistema** necesarias para Chrome en Linux

---

## ✅ SOLUCIONES APLICADAS

### 1. **Agregar dependencias de Chrome en `nixpacks.toml`**
**Archivo:** `backend/nixpacks.toml`

**Cambio:**
```toml
# ANTES:
[phases.setup]
nixPkgs = ["nodejs-20_x", "npm"]

# DESPUÉS:
[phases.setup]
nixPkgs = ["nodejs-20_x", "npm", "chromium", "chromedriver"]
```

**Resultado:** Railway instalará Chromium y ChromeDriver automáticamente.

---

### 2. **Mejorar manejo de errores en `advanced-scraper.service.ts`**
**Archivo:** `backend/src/services/advanced-scraper.service.ts`

**Cambios:**
- Agregado `--single-process` para contenedores con recursos limitados
- Agregado fallback con configuración mínima si falla el lanzamiento inicial
- Mejor logging de errores

**Código:**
```typescript
async init(): Promise<void> {
  try {
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        // ... otros args
        '--single-process', // Útil para contenedores
      ],
      // No especificar executablePath - usar Chrome de Puppeteer
    });
  } catch (error) {
    // Fallback con configuración mínima
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
  }
}
```

---

### 3. **Mejorar manejo de errores en `stealth-scraping.service.ts`**
**Archivo:** `backend/src/services/stealth-scraping.service.ts`

**Cambios:**
- Agregado fallback con configuración mínima
- Mejor logging de errores

---

## 📋 CONFIGURACIÓN ACTUAL

### Dependencias instaladas:
- ✅ `chromium` - Navegador Chromium
- ✅ `chromedriver` - Driver para automatización
- ✅ `puppeteer` - Librería de automatización
- ✅ `puppeteer-extra` - Extensiones para Puppeteer
- ✅ `puppeteer-extra-plugin-stealth` - Plugin anti-detección

### Argumentos de Chrome:
- `--no-sandbox` - Necesario en contenedores
- `--disable-setuid-sandbox` - Necesario en contenedores
- `--disable-dev-shm-usage` - Evita problemas de memoria compartida
- `--single-process` - Útil para contenedores con recursos limitados
- `--disable-gpu` - No hay GPU en contenedores
- `--headless` - Modo sin interfaz gráfica

---

## 🔄 FLUJO DE FALLBACK

1. **Intento principal:**
   - Lanzar Chrome con configuración completa
   - Usar Chrome descargado por Puppeteer

2. **Si falla:**
   - Intentar con configuración mínima
   - Solo argumentos esenciales para contenedores

3. **Si ambos fallan:**
   - Lanzar error descriptivo
   - El sistema intentará usar bridge Python como alternativa

---

## 🚀 PRÓXIMOS PASOS

1. **Esperar despliegue en Railway** (2-5 minutos)
2. **Verificar logs** para confirmar que Chrome se inicia correctamente
3. **Probar búsqueda de oportunidades** desde el frontend
4. **Si persiste el error:**
   - Verificar que las dependencias se instalaron correctamente
   - Revisar logs de Railway para errores de instalación
   - Considerar usar ScraperAPI o ZenRows como alternativa

---

## 📝 NOTAS IMPORTANTES

- **Railway usa Nixpacks** por defecto, que instala dependencias de Nix
- **Puppeteer descarga Chrome** automáticamente si no se especifica `executablePath`
- **Las dependencias del sistema** son necesarias para que Chrome funcione en Linux
- **El fallback a bridge Python** sigue disponible si Puppeteer falla completamente

---

**Commits:**
- `434c18c` - Fix: Mejorar manejo de errores de Puppeteer en Railway
- `[próximo]` - Fix: Agregar dependencias de Chrome en nixpacks.toml

**Última actualización:** 2025-11-06


# 🔧 SOLUCIÓN FINAL: Error de Puppeteer en Railway

**Fecha:** 2025-11-06  
**Problema:** Puppeteer no puede lanzar Chrome - `spawn /root/.cache/puppeteer/chrome/linux-142.0.7444.59/chrome-linux64/chrome ENOENT`

---

## 🔍 PROBLEMA IDENTIFICADO

El error `ENOENT` (Error NO ENTry) indica que:
1. **Chromium del sistema no está instalado** o no se encuentra
2. **Puppeteer no ha descargado Chrome** o el archivo no existe en la ruta esperada
3. **El archivo existe pero no tiene permisos de ejecución**

---

## ✅ SOLUCIONES APLICADAS

### 1. **Forzar descarga de Chrome durante el build**
**Archivo:** `backend/nixpacks.toml`

```toml
[phases.install]
cmds = [
  "npm install",
  "npx prisma generate",
  # Forzar descarga de Chrome para Puppeteer durante el build
  "PUPPETEER_SKIP_DOWNLOAD=false node -e \"const p=require('puppeteer');p.launch({headless:true}).then(b=>{console.log('Chrome downloaded');b.close()}).catch(e=>{console.log('Chrome download error:',e.message);process.exit(0)})\" || true"
]
```

**Resultado:** Chrome se descarga durante el build, asegurando que esté disponible en runtime.

---

### 2. **Agregar descarga en postinstall**
**Archivo:** `backend/package.json`

```json
"postinstall": "prisma generate && node -e \"try{require('puppeteer').launch({headless:true}).then(b=>{console.log('✅ Puppeteer Chrome ready');b.close()}).catch(()=>{console.log('⚠️ Puppeteer Chrome will download on first use')})}catch(e){console.log('⚠️ Puppeteer not available')}\" || true"
```

**Resultado:** Chrome se intenta descargar después de instalar dependencias.

---

### 3. **Búsqueda mejorada de Chrome**
**Archivo:** `backend/src/services/advanced-scraper.service.ts`

**Cambios:**
- Busca Chromium del sistema (Nix, /usr/bin, etc.)
- Busca Chrome descargado por Puppeteer en múltiples ubicaciones:
  - `/root/.cache/puppeteer/chrome`
  - `/root/.local/share/puppeteer/chrome`
  - `/tmp/.puppeteer/chrome`
- Verifica que `PUPPETEER_SKIP_DOWNLOAD` no esté bloqueando la descarga
- Si no encuentra nada, deja que Puppeteer descargue automáticamente

---

### 4. **Dependencias de Nix**
**Archivo:** `backend/nixpacks.toml`

```toml
[phases.setup]
nixPkgs = ["nodejs-20_x", "npm", "chromium", "chromedriver"]
```

**Resultado:** Chromium del sistema disponible como fallback.

---

## 🔄 FLUJO DE BÚSQUEDA DE CHROME

1. **Buscar Chromium del sistema:**
   - `which chromium` o `which chromium-browser`
   - `/nix/store/*/bin/chromium`
   - `/usr/bin/chromium`, `/usr/bin/chromium-browser`

2. **Si no se encuentra, buscar Chrome de Puppeteer:**
   - `/root/.cache/puppeteer/chrome`
   - `/root/.local/share/puppeteer/chrome`
   - `/tmp/.puppeteer/chrome`

3. **Si no se encuentra nada:**
   - Verificar que `PUPPETEER_SKIP_DOWNLOAD` no esté en `true`
   - Dejar que Puppeteer descargue automáticamente
   - Usar fallback con configuración mínima

---

## 📋 CONFIGURACIÓN ACTUAL

### Build Time:
- ✅ Chrome se descarga durante `npm install` (postinstall)
- ✅ Chrome se descarga durante build de Railway (nixpacks.toml)

### Runtime:
- ✅ Búsqueda automática de Chromium del sistema
- ✅ Búsqueda automática de Chrome descargado
- ✅ Descarga automática si no se encuentra nada
- ✅ Fallback con configuración mínima

---

## 🚀 PRÓXIMOS PASOS

1. **Esperar despliegue en Railway** (2-5 minutos)
2. **Verificar logs de build** para confirmar:
   - "Chrome downloaded" o "✅ Puppeteer Chrome ready"
   - Que Chrome se descargó correctamente
3. **Verificar logs de runtime** para confirmar:
   - "✅ Encontrado Chromium del sistema" o
   - "🔧 Usando Chrome de Puppeteer en: ..." o
   - "✅ Navegador iniciado exitosamente"
4. **Probar búsqueda de oportunidades** desde el frontend

---

## 🔍 DEBUGGING

Si el error persiste:

1. **Verificar logs de build:**
   - Buscar "Chrome downloaded" o errores de descarga
   - Verificar que postinstall se ejecutó correctamente

2. **Verificar logs de runtime:**
   - Buscar "⚠️  Chromium del sistema no encontrado"
   - Buscar "🔧 Usando Chrome de Puppeteer"
   - Verificar errores de lanzamiento

3. **Verificar permisos:**
   - El archivo Chrome debe tener permisos de ejecución
   - El directorio debe ser accesible

4. **Alternativas:**
   - Usar ScraperAPI o ZenRows si están configurados
   - Usar bridge Python si está disponible
   - Considerar usar un servicio externo de scraping

---

## 📝 NOTAS IMPORTANTES

- **Puppeteer descarga Chrome automáticamente** si no se especifica `executablePath`
- **El descargado puede tardar** en la primera ejecución
- **Railway puede tener limitaciones** de red o espacio
- **El fallback a bridge Python** sigue disponible como última opción

---

**Commits:**
- `ec3853f` - Fix: Mejorar descarga de Chrome de Puppeteer
- `dd8ec2a` - Fix: Forzar descarga de Chrome durante build
- `c6934f0` - Fix: Configurar StealthScrapingService para usar Chromium del sistema
- `d987618` - Fix: Configurar Puppeteer para usar Chromium del sistema
- `dfddbfe` - Fix: Agregar dependencias de Chrome en nixpacks.toml

**Última actualización:** 2025-11-06


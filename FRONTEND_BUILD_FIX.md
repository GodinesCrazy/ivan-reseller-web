# 🔧 Fix: Error de Build en Vercel - "vite: command not found"

## 📋 Resumen

**Error:** `sh: line 1: vite: command not found` al ejecutar `cd frontend && npm install && npm run build` en Vercel.

**Causa Raíz:** Vercel puede estar instalando dependencias con flags que excluyen `devDependencies` (por ejemplo, `npm install --production` o configuración similar). Como `vite` y `@vitejs/plugin-react` estaban en `devDependencies`, no se instalaban durante el build, causando que el comando `vite` no estuviera disponible.

**Solución Definitiva:** Mover `vite` y `@vitejs/plugin-react` de `devDependencies` a `dependencies`. Esto garantiza que estas herramientas de build estén disponibles incluso si Vercel instala con flags de producción.

---

## 🔍 Archivos Modificados

### `frontend/package.json`

**Cambios realizados:**

1. **Movido `vite` a `dependencies`:**
   ```json
   "dependencies": {
     // ... otras dependencias
     "vite": "^5.0.8",
     // ...
   }
   ```

2. **Movido `@vitejs/plugin-react` a `dependencies`:**
   ```json
   "dependencies": {
     "@vitejs/plugin-react": "^4.2.1",
     // ... otras dependencias
   }
   ```

3. **Script de build (sin cambios necesarios):**
   ```json
   "scripts": {
     "build": "vite build",
     // ... otros scripts
   }
   ```

**Líneas modificadas:**
- `dependencies`: Agregado `vite` y `@vitejs/plugin-react`
- `devDependencies`: Removido `vite` y `@vitejs/plugin-react`

**Razón:** Al estar en `dependencies`, estas herramientas se instalan siempre, incluso con `npm install --production`, garantizando que el build funcione en cualquier entorno de CI/CD.

---

## ✅ Validación Local

### Comandos para Reproducir Build Local

```bash
# 1. Navegar al directorio frontend
cd frontend

# 2. Limpiar e instalar dependencias desde lockfile
npm ci

# 3. Verificar que vite está en dependencies
npm list vite

# 4. Verificar que vite está disponible en node_modules/.bin
ls node_modules/.bin/vite  # Linux/Mac
# o
Test-Path node_modules\.bin\vite  # Windows PowerShell

# 5. Ejecutar build
npm run build

# Resultado esperado:
# ✓ built in ~17-30s
# dist/ generado correctamente
```

### Verificación de Dependencias

```bash
# Verificar que vite está instalado como dependency (no devDependency)
cd frontend
npm list vite --depth=0

# Debe mostrar:
# ivan-reseller-frontend@1.0.0
# └── vite@5.0.8

# Verificar ubicación en package.json
grep -A 5 '"dependencies"' package.json | grep vite
# Debe mostrar: "vite": "^5.0.8"
```

---

## 🚀 Configuración Recomendada de Vercel

### Root Directory
- **Valor:** `frontend` (si está configurado en Vercel Dashboard)
- **O:** Vacío (si se usa `cd frontend` en los comandos)

### Install Command
- **Recomendado:** `cd frontend && npm ci --include=dev`
- **Alternativa (si Root Directory = `frontend`):** `npm ci --include=dev`
- **Nota:** `--include=dev` asegura que devDependencies también se instalen, aunque `vite` ya está en `dependencies` como medida de seguridad.

### Build Command
- **Recomendado:** `cd frontend && npm run build`
- **Alternativa (si Root Directory = `frontend`):** `npm run build`

### Output Directory
- **Valor:** `frontend/dist` (si Root Directory está vacío)
- **O:** `dist` (si Root Directory = `frontend`)

### Framework Preset
- **Valor:** `Vite` (o `Other` si Vite no está disponible como preset)

---

## 📝 Notas Importantes

1. **Por qué mover a `dependencies`:**
   - Garantiza disponibilidad incluso con `npm install --production`
   - Más robusto que usar `npx` o cambiar scripts
   - Práctica común para herramientas de build críticas (webpack, vite, etc.)

2. **Impacto en el bundle:**
   - `vite` y `@vitejs/plugin-react` **NO** se incluyen en el bundle final
   - Solo se usan durante el proceso de build
   - El tamaño del bundle no se ve afectado

3. **Compatibilidad:**
   - El cambio es compatible con builds locales (ya validado)
   - No afecta otros scripts (`dev`, `preview`, `test`, etc.)
   - No requiere cambios en `vite.config.ts` ni en otras configuraciones

4. **Alternativas consideradas (no implementadas):**
   - Usar `npx vite build`: Funciona, pero menos robusto si `vite` no está instalado
   - Cambiar `vercel.json`: No es necesario, el problema está en las dependencias
   - Configurar Vercel para instalar devDependencies: Funciona, pero depende de configuración externa

---

## ✅ Checklist Post-Fix

- [x] `vite` movido a `dependencies`
- [x] `@vitejs/plugin-react` movido a `dependencies`
- [x] Script de build verificado (`vite build`)
- [x] Lockfile actualizado (`npm install` ejecutado)
- [x] Build local validado exitosamente (`npm ci && npm run build`)
- [x] `vite` verificado en `node_modules/.bin`
- [x] `vite.config.ts` verificado (sin cambios necesarios)
- [ ] Build en Vercel validado (pendiente de redeploy)

---

## 🔄 Próximos Pasos

1. **Hacer commit del cambio:**
   ```bash
   git add frontend/package.json frontend/package-lock.json
   git commit -m "fix(vercel): ensure vite available during build"
   git push
   ```

2. **En Vercel Dashboard:**
   - Verificar que el Install Command sea `cd frontend && npm ci --include=dev` (o `npm ci --include=dev` si Root Directory = `frontend`)
   - Verificar que el Build Command sea `cd frontend && npm run build` (o `npm run build` si Root Directory = `frontend`)
   - Verificar que Root Directory esté configurado correctamente (`frontend` o vacío según configuración)
   - Hacer redeploy o esperar a que Vercel detecte el nuevo commit

3. **Validar build en Vercel:**
   - Revisar logs del deployment
   - Verificar que `vite` se instale correctamente (debe aparecer en `dependencies`)
   - Verificar que no aparezca el error "vite: command not found"
   - Confirmar que el build se complete exitosamente

---

## 📚 Referencias

- [Vite Documentation - Building for Production](https://vitejs.dev/guide/build.html)
- [Vercel Documentation - Build Settings](https://vercel.com/docs/build-step)
- [npm Documentation - dependencies vs devDependencies](https://docs.npmjs.com/specifying-dependencies-and-devdependencies-in-a-package-json-file)

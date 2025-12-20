# ✅ Actualización de Configuración de Vercel

## 📋 Cambios Realizados

### `vercel.json` (Actualizado)

**Cambios aplicados:**
```json
{
  "buildCommand": "cd frontend && npm ci --include=dev && npm run build",
  "installCommand": "cd frontend && npm ci --include=dev",
  // ... resto de configuración
}
```

**Antes:**
- `installCommand`: `cd frontend && npm install`
- `buildCommand`: `cd frontend && npm install && npm run build`

**Después:**
- `installCommand`: `cd frontend && npm ci --include=dev`
- `buildCommand`: `cd frontend && npm ci --include=dev && npm run build`

**Razón del cambio:**
- `npm ci` es más rápido y reproducible que `npm install`
- `--include=dev` asegura que devDependencies se instalen (aunque `vite` ya está en `dependencies`)
- Eliminado `npm install` redundante del `buildCommand` (ya se ejecuta en `installCommand`)

---

## 🚀 Configuración Recomendada en Vercel Dashboard

**IMPORTANTE:** Vercel puede tener configuraciones en el Dashboard que sobrescriban `vercel.json`. Verifica y actualiza manualmente si es necesario.

### Settings → General
- **Root Directory:** `frontend` (o vacío si prefieres usar `cd frontend` en comandos)

### Settings → Build & Development Settings

**Si Root Directory = `frontend`:**
- **Framework Preset:** `Vite`
- **Install Command:** `npm ci --include=dev`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Development Command:** `npm run dev`

**Si Root Directory = vacío:**
- **Framework Preset:** `Vite`
- **Install Command:** `cd frontend && npm ci --include=dev`
- **Build Command:** `cd frontend && npm run build`
- **Output Directory:** `frontend/dist`
- **Development Command:** `cd frontend && npm run dev`

### Settings → Environment Variables
- **VITE_API_URL:** `https://ivan-reseller-web-production.up.railway.app`
  - Aplicar a: Production, Preview, Development

---

## ✅ Verificación Post-Actualización

1. **Commit y push de los cambios:**
   ```bash
   git add vercel.json
   git commit -m "fix(vercel): update build commands to use npm ci --include=dev"
   git push
   ```

2. **En Vercel Dashboard:**
   - Vercel detectará automáticamente los cambios en `vercel.json`
   - O haz un redeploy manual desde el Dashboard

3. **Validar el build:**
   - Revisar logs del deployment
   - Verificar que `vite` se instale correctamente
   - Confirmar que el build se complete sin errores

---

## 📝 Notas

- El archivo `vercel.json` tiene prioridad sobre la configuración del Dashboard
- Si hay conflictos, `vercel.json` se aplicará primero
- Los cambios se aplicarán en el próximo deployment automático o manual

---

## 🔄 Próximos Pasos

1. ✅ `vercel.json` actualizado
2. ⏳ Hacer commit y push
3. ⏳ Vercel detectará cambios y redesplegará automáticamente
4. ⏳ Validar build exitoso en Vercel


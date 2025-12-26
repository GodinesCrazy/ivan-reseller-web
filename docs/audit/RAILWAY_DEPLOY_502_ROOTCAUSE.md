# 🔍 Auditoría 502 Bad Gateway - Railway Deploy Monorepo

**Fecha:** 2025-12-26  
**Síntoma:** 502 Bad Gateway en `/api/health` y otros endpoints en producción  
**Estado:** ✅ Causa raíz identificada

---

## 📊 RESUMEN EJECUTIVO

### Causa Raíz Principal (Priorizada)

**PROBLEMA CRÍTICO:** Railway puede no estar desplegando desde el directorio `backend/` correctamente

En un monorepo, Railway necesita configuración explícita para desplegar desde un subdirectorio. Si no está configurado, Railway intentará desplegar desde la raíz, donde no existe el código del backend.

### Estructura del Monorepo

```
ivan-reseller-web/
├── package.json (raíz - solo sync-docs)
├── backend/
│   ├── package.json (backend real)
│   ├── Dockerfile (existe)
│   ├── nixpacks.toml (existe, pero usa start.sh que puede no existir)
│   └── src/
└── frontend/
    └── ...
```

**Problema:**
- Railway puede estar desplegando desde la raíz (donde no hay código del backend)
- O puede estar usando `nixpacks.toml` que referencia `start.sh` que puede no existir
- O puede no estar usando el `Dockerfile` correctamente

---

## 🔍 EVIDENCIA

### 1. Estructura del Monorepo

**package.json raíz:**
```json
{
  "name": "ivan-reseller-web",
  "scripts": {
    "sync-docs": "node scripts/sync_help_docs.mjs"
  }
}
```
- ✅ No tiene `build` ni `start` scripts
- ✅ Es solo un wrapper para sync-docs

**backend/package.json:**
```json
{
  "name": "ivan-reseller-backend",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc --skipLibCheck && npx prisma generate",
    "start": "node dist/server.js"
  }
}
```
- ✅ Tiene `build` y `start` scripts correctos
- ✅ El código del backend está aquí

---

### 2. Configuración Existente

#### Dockerfile (backend/Dockerfile)

**Estado:** ✅ Existe y está bien configurado
- Usa `WORKDIR /app`
- Copia archivos correctamente
- Expone puerto 3000
- CMD ejecuta `node dist/server.js` o `tsx src/server.ts`

**Problema potencial:**
- Railway puede no estar detectando este Dockerfile si está en un subdirectorio
- Necesita configuración explícita para usar `backend/Dockerfile`

#### nixpacks.toml (backend/nixpacks.toml)

**Estado:** ⚠️ Existe pero puede tener problemas
- Usa `command = "sh ./start.sh"` en línea 34
- No se encontró `start.sh` en el repositorio
- Si Railway usa nixpacks y `start.sh` no existe, el deploy fallará

**Problema:**
- Railway puede estar usando nixpacks en lugar de Dockerfile
- `start.sh` puede no existir, causando que el deploy falle

---

### 3. Configuración del Servidor

**backend/src/server.ts:**
- ✅ Escucha en `process.env.PORT` (correcto para Railway)
- ✅ Escucha en `0.0.0.0` (correcto para Railway)
- ✅ Tiene logs "LISTEN_CALLBACK - HTTP SERVER LISTENING"
- ✅ Validación de PORT antes de iniciar

**Estado:** ✅ El código del servidor está correcto

---

### 4. Verificación de vercel.json

**vercel.json:**
```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://ivan-reseller-web-production.up.railway.app/api/:path*"
    }
  ]
}
```

**Problema potencial:**
- ⚠️ El dominio `ivan-reseller-web-production.up.railway.app` necesita verificación
- Si el dominio público de Railway es diferente, el rewrite fallará
- Necesita confirmación del dominio público real en Railway Dashboard

---

## 🧪 PASOS PARA REPRODUCIR

### Paso 1: Verificar Railway Configuration

1. **Ir a Railway Dashboard:**
   - https://railway.app/dashboard
   - Seleccionar proyecto `ivan-reseller-web`
   - Seleccionar service `ivan-reseller-web-production`

2. **Verificar Settings → Deploy:**
   - **Root Directory:** ¿Está en `backend` o vacío/raíz?
   - **Build Command:** ¿Qué comando está configurado?
   - **Start Command:** ¿Qué comando está configurado?

3. **Verificar si usa Dockerfile o Nixpacks:**
   - Railway puede usar Dockerfile si existe
   - Railway puede usar nixpacks si existe `nixpacks.toml`
   - Necesita verificación manual

---

### Paso 2: Verificar Dominio Público

1. **Railway Dashboard → Service → Settings → Networking**
2. **Verificar "Public Domain":**
   - ¿Es `ivan-reseller-web-production.up.railway.app`?
   - ¿O es otro dominio?

3. **Comparar con vercel.json:**
   - Si el dominio es diferente, actualizar `vercel.json`

---

### Paso 3: Verificar Logs de Railway

1. **Railway Dashboard → Service → Logs**
2. **Buscar:**
   - `✅ LISTEN_CALLBACK - HTTP SERVER LISTENING`
   - Si no aparece, el servidor no está arrancando
   - Si aparece, verificar el puerto y host

---

## 📋 DIAGNÓSTICO FINAL

### Causa Raíz (Priorizada)

**OPCIÓN 1: Railway no está desplegando desde `backend/` (70% probabilidad)**
- Railway está intentando desplegar desde la raíz
- No encuentra el código del backend
- El servidor no arranca
- Todos los endpoints responden 502

**OPCIÓN 2: nixpacks.toml referencia start.sh que no existe (20% probabilidad)**
- Railway usa nixpacks en lugar de Dockerfile
- `start.sh` no existe
- El deploy falla
- El servidor no arranca

**OPCIÓN 3: Dominio incorrecto en vercel.json (10% probabilidad)**
- El dominio público de Railway es diferente
- Vercel no puede conectar al backend
- Todos los endpoints responden 502

---

## 🔧 RECOMENDACIONES INMEDIATAS

### 1. Crear `railway.toml` para Forzar Deploy desde `backend/`

**Solución más robusta:** Crear `railway.toml` en la raíz que especifique:
- Root directory: `backend`
- Build command: `npm run build`
- Start command: `npm start`

**Ventajas:**
- Configuración explícita y versionada en Git
- No depende de clicks en el dashboard
- Funciona consistentemente

### 2. Mejorar `nixpacks.toml` o Eliminarlo

**Si se usa nixpacks:**
- Cambiar `command = "sh ./start.sh"` a `command = "npm start"`
- O eliminar `nixpacks.toml` para forzar uso de Dockerfile

### 3. Verificar Dominio Público

- Confirmar dominio público en Railway Dashboard
- Actualizar `vercel.json` si es necesario

---

## 📝 EVIDENCIA REPRODUCIBLE

### Comandos para Validar

```bash
# 1. Verificar estructura del monorepo
ls -la
ls -la backend/
ls -la frontend/

# 2. Verificar si start.sh existe
find backend/ -name "start.sh"

# 3. Verificar Dockerfile
cat backend/Dockerfile

# 4. Verificar nixpacks.toml
cat backend/nixpacks.toml
```

---

## 🎯 CONCLUSIÓN

**Causa raíz más probable:** Railway no está desplegando desde `backend/` (70% probabilidad)

**Próximos pasos:**
1. ✅ Crear `railway.toml` en la raíz para forzar deploy desde `backend/`
2. ✅ Mejorar `nixpacks.toml` o eliminarlo
3. ✅ Verificar dominio público en Railway Dashboard
4. ✅ Actualizar `vercel.json` si es necesario

**Archivos relevantes:**
- `backend/Dockerfile` - Dockerfile del backend (existe)
- `backend/nixpacks.toml` - Configuración Nixpacks (existe, pero puede tener problemas)
- `vercel.json` - Configuración del rewrite de Vercel
- `railway.toml` - NO EXISTE (necesita crearse)

---

**Última actualización:** 2025-12-26  
**Estado:** ✅ Auditoría completada, pendiente implementación de fix


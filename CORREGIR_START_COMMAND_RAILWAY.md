# 🔧 CORREGIR START COMMAND EN RAILWAY - URGENTE

**Problema:** El `startCommand` está configurado como `"npm run build"` cuando debería ser `"npm start"`.

Por eso el servidor no inicia - Railway ejecuta el build en lugar de iniciar el servidor.

---

## ✅ SOLUCIÓN INMEDIATA

### **PASO 1: Ir a Settings**

1. **Railway Dashboard** → Tu servicio `ivan-reseller-web`
2. **Click en la pestaña "Settings"** (arriba, junto a "Deployments")

### **PASO 2: Buscar "Build & Deploy"**

1. En la página de Settings, busca la sección **"Build & Deploy"**
2. O busca **"Start Command"** directamente

### **PASO 3: Corregir Start Command**

**Busca el campo "Start Command" o "Command":**

**ESTÁ MAL (actual):**
```
npm run build
```

**DEBE SER:**
```
npm start
```

**O si prefieres el comando completo:**
```
npx prisma migrate deploy && node dist/server.js
```

### **PASO 4: Guardar**

1. **Click en "Save"** o "Update"
2. Railway se redesplegará automáticamente

---

## 🎯 ALTERNATIVA: Usar railway.json

Si Railway está usando Dockerfile y no railway.json, puedes forzar el uso de railway.json:

1. Railway Dashboard → Settings → **"Service"**
2. Verifica que **"Root Directory"** esté configurado como `backend`
3. Railway debería leer automáticamente `railway.json` del repositorio

El `railway.json` ya tiene la configuración correcta:
```json
{
  "startCommand": "npm start"
}
```

---

## ✅ VERIFICACIÓN

Después de guardar:

1. **Railway iniciará un nuevo deployment automáticamente**
2. **Espera 2-3 minutos**
3. **Verifica los logs:**
   - Deberías ver: "🚀 Iniciando servidor..."
   - O: "Starting server..."
   - O: "npx prisma migrate deploy"
   - O: "node dist/server.js"

---

## 📋 CHECKLIST

- [ ] Click en "Settings" del servicio `ivan-reseller-web`
- [ ] Busca "Start Command" o "Command"
- [ ] Cambia de `npm run build` a `npm start`
- [ ] Click "Save"
- [ ] Espera a que Railway redesplegue
- [ ] Verifica los logs de runtime

---

**¡Corrige el Start Command ahora y el servidor debería iniciar!** 🚀


# 🔍 VER LOGS DE RAILWAY - URGENTE

**El servidor sigue dando 502 después del deployment exitoso. Necesitamos ver los logs de runtime para identificar el problema.**

---

## 🎯 PASO 1: VER LOGS DE RAILWAY

### **Método 1: Desde el Deployment (Recomendado)**

1. **Railway Dashboard** → Tu servicio `ivan-reseller-web`
2. **Click en la pestaña "Deployments"** (ya estás ahí)
3. **Click en el deployment más reciente** (el que dice "COMPLETED")
4. **Click en "View logs"** (botón verde/derecha)
5. **Busca los logs de RUNTIME** (no los de build)
   - Los logs de runtime aparecen después de "Starting Container"
   - Busca errores en rojo

### **Método 2: Desde la Pestaña "Logs"**

1. **Railway Dashboard** → Tu servicio `ivan-reseller-web`
2. **Click en la pestaña "Logs"** (arriba, junto a "Deployments")
3. **Verás los logs en tiempo real**
4. **Busca errores en rojo**

---

## 🔍 QUÉ BUSCAR EN LOS LOGS

### **Error 1: "Database connection failed"**
```
Error: Can't reach database server
PrismaClientInitializationError
```

**Solución:**
- Railway Dashboard → Variables → Verifica que `DATABASE_URL` exista
- Railway Dashboard → Verifica que PostgreSQL esté corriendo (no pausado)

### **Error 2: "JWT_SECRET must be at least 32 characters"**
```
JWT_SECRET must be at least 32 characters
```

**Solución:**
- Genera un nuevo JWT_SECRET:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Railway Dashboard → Variables → Actualiza `JWT_SECRET`

### **Error 3: "DATABASE_URL must start with postgresql://"**
```
Error validating datasource `db`: the URL must start with the protocol `postgresql://` or `postgres://`.
```

**Solución:**
- Railway Dashboard → Variables → Verifica que `DATABASE_URL` empiece con `postgresql://`
- Si no existe, Railway Dashboard → Agrega PostgreSQL (se crea automáticamente)

### **Error 4: "Cannot find module"**
```
Error: Cannot find module '@prisma/client'
```

**Solución:**
- El build puede no haber instalado dependencias correctamente
- Forzar redeploy

### **Error 5: Servidor crasheando al iniciar**
```
Error: Failed to start server
```

**Solución:**
- Ver el error completo en los logs
- Puede ser un error de código que no se detectó en el build

---

## 📋 INFORMACIÓN PARA COMPARTIR

**Por favor, copia y comparte:**
1. **Los últimos 50-100 líneas de los logs** (después de "Starting Container")
2. **Cualquier error en rojo** que veas
3. **El mensaje exacto** del error

Con esa información podré darte la solución exacta.

---

## 🎯 ACCIÓN INMEDIATA

**Haz esto ahora:**
1. Railway Dashboard → Click en "View logs" del deployment
2. Desplázate hacia abajo hasta ver los logs de runtime
3. Busca errores en rojo
4. **Copia los últimos errores** y compártelos

---

**¡Los logs te dirán exactamente qué está fallando!** 🔍


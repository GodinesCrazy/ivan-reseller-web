# 🚀 CÓMO AGREGAR REDIS EN RAILWAY

Hay **dos formas** de agregar Redis en Railway. Te recomiendo la **Opción 1** porque Railway gestiona todo automáticamente.

---

## ✅ OPCIÓN 1: Agregar Redis como Servicio (RECOMENDADO)

Esta es la forma más fácil y recomendada. Railway crea automáticamente la variable `REDIS_URL` y gestiona la conexión.

### **Paso 1: Ir a tu Proyecto en Railway**

1. Ve a: https://railway.app
2. Inicia sesión con tu cuenta
3. Selecciona tu proyecto (el que tiene el backend)

### **Paso 2: Agregar Redis**

1. En el dashboard de tu proyecto, haz clic en **"+ New"** (botón verde en la parte superior)
2. Selecciona **"Database"**
3. Selecciona **"Redis"**

### **Paso 3: Railway Configura Automáticamente**

Railway hará lo siguiente automáticamente:
- ✅ Crea un servicio Redis
- ✅ Crea la variable de entorno `REDIS_URL` en tu servicio backend
- ✅ Conecta el backend con Redis automáticamente

**No necesitas hacer nada más.** El sistema detectará `REDIS_URL` y comenzará a usarlo.

### **Paso 4: Verificar que Funciona**

1. Ve a tu servicio backend en Railway
2. Click en **"Variables"** (en el menú lateral)
3. Deberías ver `REDIS_URL` listada (Railway la crea automáticamente)
4. El valor será algo como: `redis://default:password@redis.railway.internal:6379`

### **Paso 5: Verificar en los Logs**

1. Ve a tu servicio backend → **"Deployments"** → Click en el último deployment
2. O ve a **"Logs"** en tiempo real
3. Deberías ver: `✅ Redis connected`

Si ves `⚠️ Redis not configured - using mock client`, significa que `REDIS_URL` no está configurada correctamente.

---

## ⚙️ OPCIÓN 2: Agregar REDIS_URL Manualmente

Si ya tienes un servicio Redis externo o quieres usar uno diferente, puedes agregar `REDIS_URL` manualmente.

### **Paso 1: Obtener URL de Redis**

Si tienes Redis en otro lugar, necesitas la URL de conexión. El formato es:
```
redis://[password]@[host]:[port]
```

Ejemplos:
- Redis local: `redis://localhost:6379`
- Redis con contraseña: `redis://mypassword@redis.example.com:6379`
- Redis Railway: `redis://default:password@redis.railway.internal:6379`

### **Paso 2: Agregar Variable en Railway**

1. Ve a tu proyecto en Railway
2. Selecciona tu servicio **backend**
3. Click en **"Variables"** (en el menú lateral)
4. Click en **"+ New Variable"**
5. Agrega:
   - **Name:** `REDIS_URL`
   - **Value:** Tu URL de Redis (ej: `redis://localhost:6379`)
6. Click en **"Add"**

### **Paso 3: Redeploy**

Después de agregar la variable, Railway debería hacer un redeploy automático. Si no:
1. Ve a **"Deployments"**
2. Click en **"Redeploy"** en el último deployment

---

## 🔍 VERIFICAR QUE REDIS ESTÁ FUNCIONANDO

### **Método 1: Ver Logs del Backend**

1. Railway → Tu proyecto → Servicio backend → **"Logs"**
2. Busca estos mensajes:
   - ✅ `✅ Redis connected` = Redis funciona
   - ⚠️ `⚠️ Redis not configured - using mock client` = Redis no está configurado

### **Método 2: Verificar en el Código**

El sistema detecta automáticamente si Redis está disponible:

```typescript
// En backend/src/config/redis.ts
export const isRedisAvailable = !!REDIS_URL;
```

Si `isRedisAvailable` es `true`, Redis está funcionando.

### **Método 3: Verificar Cache Distribuido**

Si Redis está funcionando, el cache de APIs usará Redis en lugar de memoria:
- Logs mostrarán: `Redis cache cleared for user X, API: Y`
- En lugar de: `Cache cleared for user X, API: Y (X memory keys)`

---

## 🎯 BENEFICIOS DE USAR REDIS

Una vez que Redis esté configurado, obtendrás:

1. ✅ **Cache Distribuido:** Múltiples instancias del backend comparten el mismo cache
2. ✅ **Tareas Programadas:** Los cron jobs funcionarán (alertas financieras, refresh de FX rates, etc.)
3. ✅ **Mejor Performance:** Cache más rápido y eficiente
4. ✅ **Escalabilidad:** Puedes escalar el backend sin perder cache

---

## ❓ PROBLEMAS COMUNES

### **Problema 1: "Redis not configured" en los logs**

**Solución:**
- Verifica que `REDIS_URL` esté en las variables de entorno
- Asegúrate de que el valor no esté vacío
- Si agregaste Redis como servicio, espera unos segundos para que Railway configure todo

### **Problema 2: "Redis error" en los logs**

**Solución:**
- Verifica que la URL de Redis sea correcta
- Si usas Redis externo, verifica que sea accesible desde Railway
- Revisa que el puerto y la contraseña sean correctos

### **Problema 3: Redis no se conecta**

**Solución:**
- Si agregaste Redis como servicio en Railway, verifica que esté "Running"
- Si usas Redis externo, verifica firewall y acceso de red
- Prueba la conexión manualmente con `redis-cli`

---

## 📝 RESUMEN RÁPIDO

**Para agregar Redis en Railway:**

1. Railway Dashboard → Tu Proyecto
2. Click **"+ New"** → **"Database"** → **"Redis"**
3. ✅ Listo! Railway crea `REDIS_URL` automáticamente
4. Verifica en logs: `✅ Redis connected`

**Tiempo estimado:** 2-3 minutos

---

## 🔗 REFERENCIAS

- **Railway Docs:** https://docs.railway.app/databases/redis
- **Código Redis Config:** `backend/src/config/redis.ts`
- **Cache Service:** `backend/src/services/api-availability.service.ts`

---

**¿Necesitas ayuda?** Revisa los logs del backend en Railway para ver mensajes de error específicos.


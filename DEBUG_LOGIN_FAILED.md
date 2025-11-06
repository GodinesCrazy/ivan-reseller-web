# 🔍 DEBUG: LOGIN FAILED - PASOS A SEGUIR

**El deployment fue exitoso, pero el login sigue fallando. Vamos a diagnosticar el problema.**

---

## ✅ VERIFICACIONES NECESARIAS

### **1. Verificar que el usuario admin se creó:**

En Railway:
1. Click en el deployment exitoso (el que dice "COMPLETED")
2. Click en **"View logs"**
3. Busca en los logs:
   ```
   👤 Usuario admin no encontrado. Creando...
   ✅ Usuario admin creado exitosamente
   ```
   O:
   ```
   ✅ Usuario admin ya existe
   ```

### **2. Verificar variable en Vercel:**

1. Ve a: https://vercel.com/ivan-martys-projects/ivan-reseller-web/settings/environment-variables
2. Verifica que existe:
   - **Key:** `VITE_API_URL`
   - **Value:** `https://ivan-reseller-web-production.up.railway.app`
3. Si no existe, agrégalo y haz redeploy

### **3. Verificar CORS en Railway:**

1. Railway → Tu servicio → **Variables**
2. Verifica que `CORS_ORIGIN` incluya:
   ```
   https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app
   ```

### **4. Ver errores en consola del navegador:**

1. Abre: `https://ivan-reseller-web.vercel.app`
2. Abre las **DevTools** (F12)
3. Ve a la pestaña **Console**
4. Intenta hacer login
5. **Copia todos los errores** que aparezcan

---

## 🔍 PRÓXIMOS PASOS

**Dime qué ves en:**
1. Los logs del deployment (¿se creó el usuario admin?)
2. La consola del navegador (¿qué errores aparecen?)
3. La variable VITE_API_URL en Vercel (¿existe?)

Con esa información podré darte la solución exacta. 🚀


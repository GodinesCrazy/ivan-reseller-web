# 🔧 SOLUCIÓN: DATABASE_URL vs DATABASE_PUBLIC_URL

**Problema:** Hay dos variables de base de datos en PostgreSQL:
- `DATABASE_URL` (interna)
- `DATABASE_PUBLIC_URL` (pública)

**Pregunta:** ¿Cuál debemos usar?

---

## ✅ RESPUESTA: USAR DATABASE_URL (INTERNA)

**Para servicios dentro de Railway, siempre usa `DATABASE_URL`:**

```
postgresql://postgres:password@postgres.railway.internal:5432/railway
```

**NO uses `DATABASE_PUBLIC_URL`** para servicios dentro de Railway.

---

## 🎯 VERIFICACIÓN

### **PASO 1: Verificar qué variable está usando ivan-reseller-web**

1. **Railway Dashboard** → Click en el servicio **"ivan-reseller-web"**
2. **Click en la pestaña "Variables"**
3. **Busca `DATABASE_URL`**
4. **Click en el ojo** 👁️ para ver el valor
5. **Verifica que:**
   - ✅ Empiece con `postgresql://`
   - ✅ Tenga `postgres.railway.internal` (URL interna)
   - ❌ NO tenga `yamabiko.proxy.rlwy.net` (URL pública)

---

## ✅ SOLUCIÓN: USAR VARIABLE REFERENCE (RECOMENDADO)

En lugar de copiar el valor manualmente, Railway puede vincular la variable directamente:

### **PASO 1: Ver mensaje en Railway**

En la pantalla de Variables de PostgreSQL, hay un mensaje morado:
```
"Trying to connect this database to a service? Add a Variable Reference"
```

### **PASO 2: Agregar Variable Reference**

1. **Railway Dashboard** → Click en el servicio **"ivan-reseller-web"**
2. **Click en la pestaña "Variables"**
3. **Si `DATABASE_URL` ya existe:**
   - Click en los tres puntos → **"Delete"**
   - Confirma la eliminación
4. **Click "+ New Variable"**
5. **Name:** `DATABASE_URL`
6. **Value:** En lugar de escribir, busca:
   - Un botón o enlace que diga **"Reference from Service"** o
   - **"Link from Postgres"** o
   - Un icono de cadena o enlace 🔗
7. **Si aparece esa opción:**
   - Selecciona el servicio **"Postgres"**
   - Selecciona la variable **"DATABASE_URL"** (NO `DATABASE_PUBLIC_URL`)
   - Guarda

Esto creará un vínculo directo que se actualiza automáticamente.

---

## ✅ SOLUCIÓN ALTERNATIVA: USAR DATABASE_PUBLIC_URL TEMPORALMENTE

Si la conexión interna no funciona, puedes probar con la URL pública:

1. **Postgres → Variables → `DATABASE_PUBLIC_URL`**
   - Click en el ojo para ver el valor
   - Copia el valor

2. **ivan-reseller-web → Variables → `DATABASE_URL`**
   - Actualiza con el valor de `DATABASE_PUBLIC_URL`
   - Guarda

**Nota:** Esto es una solución temporal. Lo ideal es usar la URL interna.

---

## 📋 CHECKLIST

- [ ] `DATABASE_URL` en ivan-reseller-web usa `postgres.railway.internal` (interna)
- [ ] `DATABASE_URL` en ivan-reseller-web es igual a `DATABASE_URL` de PostgreSQL
- [ ] NO estás usando `DATABASE_PUBLIC_URL` en ivan-reseller-web
- [ ] Los servicios están conectados en la arquitectura (hay línea entre ellos)

---

**¡Usa `DATABASE_URL` (interna), NO `DATABASE_PUBLIC_URL`!** 🚀


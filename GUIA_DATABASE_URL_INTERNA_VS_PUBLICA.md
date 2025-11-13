# 📚 Guía: DATABASE_URL Interna vs Pública

## 🎯 Resumen Rápido

Railway proporciona **DOS URLs** para PostgreSQL:

1. **`DATABASE_URL`** (Interna): `postgres.railway.internal:5432`
   - ✅ **Para servicios dentro de Railway**
   - ✅ Más rápida y segura
   - ✅ **RECOMENDADA para tu aplicación**

2. **`DATABASE_PUBLIC_URL`** (Pública): `yamabiko.proxy.rlwy.net:35731`
   - ⚠️ Para conexiones desde fuera de Railway
   - ⚠️ Más lenta
   - ⚠️ Solo usar si la interna no funciona

---

## 🔍 Identificación de URLs

### URL Interna (Correcta para Railway)
```
postgresql://postgres:password@postgres.railway.internal:5432/railway
                                    ^^^^^^^^^^^^^^^^^^^^^^^^
                                    Contiene "railway.internal"
```

### URL Pública (Para conexiones externas)
```
postgresql://postgres:password@yamabiko.proxy.rlwy.net:35731/railway
                                    ^^^^^^^^^^^^^^^^^^^^
                                    Contiene "proxy.rlwy.net"
```

---

## ✅ Configuración Correcta

### **PASO 1: Verificar qué URL tienes en Railway**

1. **Railway Dashboard** → **Postgres** → **Variables**
2. Busca `DATABASE_URL` y `DATABASE_PUBLIC_URL`
3. **Click en el ojo** 👁️ para ver cada valor

**Deberías ver:**
- `DATABASE_URL`: `postgresql://postgres:xxx@postgres.railway.internal:5432/railway`
- `DATABASE_PUBLIC_URL`: `postgresql://postgres:xxx@yamabiko.proxy.rlwy.net:35731/railway`

### **PASO 2: Configurar en ivan-reseller-web**

**Opción A: Usar Variable Reference (Recomendado)**

1. **Railway Dashboard** → **ivan-reseller-web** → **Variables**
2. Si `DATABASE_URL` ya existe, elimínala
3. **Click "+ New Variable"**
4. **Name:** `DATABASE_URL`
5. **Value:** Busca el botón **"Reference from Service"** o **"Link from Postgres"**
6. Selecciona **Postgres** → **DATABASE_URL** (NO `DATABASE_PUBLIC_URL`)
7. Guarda

**Opción B: Copiar Valor Manualmente**

1. **Postgres** → **Variables** → **DATABASE_URL**
2. **Click en el ojo** 👁️ para ver el valor
3. **Click en copiar** 📋 para copiar TODO el valor
4. **ivan-reseller-web** → **Variables** → **DATABASE_URL**
5. Pega el valor completo
6. Guarda

---

## ⚠️ ¿Cuándo Usar Cada Una?

### Usa `DATABASE_URL` (Interna) si:
- ✅ Tu aplicación está en Railway
- ✅ Quieres mejor rendimiento
- ✅ Quieres mayor seguridad (tráfico interno)
- ✅ **Este es tu caso** 🎯

### Usa `DATABASE_PUBLIC_URL` (Pública) si:
- ⚠️ Tu aplicación está **fuera** de Railway
- ⚠️ Estás desarrollando localmente y Railway no permite conexiones internas
- ⚠️ La URL interna no funciona (caso raro)

---

## 🔍 Verificación en Logs

Después de configurar, los logs deberían mostrar:

### ✅ Si usas URL Interna (Correcto):
```
🔍 DATABASE_URL encontrada:
   Variable: DATABASE_URL
   postgresql://postgres:****@postgres.railway.internal:5432/railway
   Host: postgres.railway.internal
   Port: 5432
   Database: railway
   User: postgres
   ✅ Tipo: URL INTERNA (correcta para servicios dentro de Railway)
   💡 Esta es la URL recomendada para servicios en Railway
```

### ⚠️ Si usas URL Pública:
```
🔍 DATABASE_URL encontrada:
   Variable: DATABASE_URL
   postgresql://postgres:****@yamabiko.proxy.rlwy.net:35731/railway
   Host: yamabiko.proxy.rlwy.net
   Port: 35731
   Database: railway
   User: postgres
   ⚠️  Tipo: URL PÚBLICA (para conexiones externas)
   💡 Si estás en Railway, considera usar DATABASE_URL con postgres.railway.internal
   💡 La URL pública funciona pero puede ser más lenta
```

---

## 🚨 Problemas Comunes

### Problema 1: "Can't reach database server"
**Causa:** Estás usando `DATABASE_PUBLIC_URL` desde dentro de Railway
**Solución:** Cambia a `DATABASE_URL` (interna)

### Problema 2: "Connection timeout"
**Causa:** La URL pública puede tener problemas de conectividad
**Solución:** Usa `DATABASE_URL` (interna)

### Problema 3: "Variable Reference no resuelta"
**Causa:** Railway no resolvió `{{Postgres.DATABASE_URL}}`
**Solución:** Copia el valor real en lugar de usar referencia

---

## 📋 Checklist Final

- [ ] `DATABASE_URL` en ivan-reseller-web usa `postgres.railway.internal` (interna)
- [ ] El host NO es `yamabiko.proxy.rlwy.net` (pública)
- [ ] Los logs muestran "✅ Tipo: URL INTERNA"
- [ ] La conexión funciona correctamente
- [ ] Las migraciones se ejecutan sin errores

---

## ✅ Resumen

**Para tu aplicación en Railway:**
- ✅ Usa `DATABASE_URL` (interna) con `postgres.railway.internal`
- ❌ NO uses `DATABASE_PUBLIC_URL` (pública) con `yamabiko.proxy.rlwy.net`

**El sistema detecta automáticamente el tipo de URL y te avisa en los logs si estás usando la incorrecta.**


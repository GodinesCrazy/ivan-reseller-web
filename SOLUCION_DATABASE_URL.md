# 🔧 Solución: Configurar DATABASE_URL para PostgreSQL

## ⚠️ Problema Detectado

Tu `DATABASE_URL` actual está configurada para SQLite:
```
file:./dev.db
```

Pero el sistema necesita PostgreSQL. Necesitas cambiarla.

---

## ✅ Solución Rápida

### Opción 1: Usar PostgreSQL Local

1. **Instala PostgreSQL** (si no lo tienes):
   - Descarga desde: https://www.postgresql.org/download/windows/
   - O usa Docker:
     ```bash
     docker run --name postgres-ivan -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ivan_reseller -p 5432:5432 -d postgres
     ```

2. **Edita `backend/.env`** y cambia:
   ```env
   # ANTES (SQLite):
   DATABASE_URL=file:./dev.db
   
   # DESPUÉS (PostgreSQL):
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ivan_reseller
   ```

3. **Crea la base de datos** (si usas instalación local):
   ```sql
   CREATE DATABASE ivan_reseller;
   ```

### Opción 2: Usar Railway PostgreSQL (Recomendado)

1. **Ve a Railway Dashboard**: https://railway.app
2. **Crea un servicio PostgreSQL**:
   - Click en **"+ New"** → **"Database"** → **"Add PostgreSQL"**
3. **Obtén la DATABASE_URL**:
   - Click en el servicio PostgreSQL
   - Ve a **"Variables"**
   - Busca `DATABASE_URL` o `DATABASE_PUBLIC_URL`
   - Click en el ojo 👁️ para ver el valor
   - Copia el valor completo
4. **Configura en tu backend**:
   - Ve a tu servicio backend en Railway
   - Ve a **"Variables"**
   - Agrega o edita `DATABASE_URL`
   - Pega el valor que copiaste
5. **Para desarrollo local**, también agrega en `backend/.env`:
   ```env
   DATABASE_URL=postgresql://postgres:xxxxx@xxxxx.railway.app:5432/railway
   ```

---

## 🚀 Después de Configurar

Una vez que tengas `DATABASE_URL` con formato PostgreSQL, ejecuta:

```bash
cd backend
npx prisma migrate dev --name add_user_plan_field
```

Esto:
1. ✅ Creará la migración para agregar el campo `plan`
2. ✅ Aplicará los cambios a la base de datos
3. ✅ Sincronizará el schema con la BD

---

## 📋 Formato Correcto de DATABASE_URL

Debe verse así:
```
postgresql://usuario:contraseña@host:puerto/base_datos
```

Ejemplos válidos:
- Local: `postgresql://postgres:postgres@localhost:5432/ivan_reseller`
- Railway: `postgresql://postgres:ABC123@containers-us-west-123.railway.app:5432/railway`

---

## ⚠️ Importante

- **NO uses** `file:./dev.db` (eso es SQLite)
- **DEBE empezar** con `postgresql://` o `postgres://`
- **DEBE incluir** usuario, contraseña, host, puerto y base de datos

---

## 🆘 ¿Necesitas Ayuda?

Si tienes problemas:
1. Verifica que PostgreSQL esté corriendo
2. Verifica que la base de datos exista
3. Verifica que las credenciales sean correctas
4. Revisa los logs del servidor para más detalles


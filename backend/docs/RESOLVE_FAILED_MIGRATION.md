# Resolver migración fallida en producción (P3009)

## Por qué falla el deploy

En la base de datos de Railway la migración `20250327000000_ensure_admin_user` quedó registrada como **fallida**. En cada deploy, Railway ejecuta `npx prisma migrate deploy` antes de arrancar el backend. Prisma detecta esa migración en estado "failed" y devuelve el error **P3009**, por lo que el proceso termina y el backend no llega a iniciarse.

## Paso obligatorio (una sola vez)

Debes ejecutar **una vez** el comando de Prisma para marcar esa migración como revertida. Así Prisma dejará de bloquear los deploys.

1. En Railway: proyecto del backend → **Variables** → copia el valor de `DATABASE_URL` (producción).
2. En tu máquina, desde la raíz del repo:

**Windows (PowerShell):**

```powershell
cd backend
$env:DATABASE_URL = "postgresql://usuario:contraseña@host:5432/railway"
npm run prisma:resolve-failed
```

**Windows (CMD):**

```cmd
cd backend
set DATABASE_URL=postgresql://usuario:contraseña@host:5432/railway
npm run prisma:resolve-failed
```

Sustituye `postgresql://...` por la URL real que copiaste de Railway.

3. Verifica que el comando termine sin error. A partir de entonces, los siguientes deploys deberían completar con normalidad y el backend arrancará; el login con admin/admin123 volverá a funcionar si la base de producción ya tenía ese usuario.

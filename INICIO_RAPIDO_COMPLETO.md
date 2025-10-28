# 🚀 Inicio Rápido - Ivan Reseller Web

## 📋 Pre-requisitos

- Node.js 20+
- Docker y Docker Compose
- Git

## ⚡ Instalación y Arranque (5 minutos)

### 1️⃣ Clonar y Configurar

```powershell
# Navegar a la carpeta del proyecto
cd C:\Ivan_Reseller_Web

# Copiar archivos de configuración
cp backend\.env.example backend\.env
cp frontend\.env.example frontend\.env

# Editar backend\.env y añadir un JWT_SECRET (mínimo 32 caracteres)
notepad backend\.env
```

**Ejemplo de `backend\.env`:**
```env
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/ivan_reseller"
REDIS_URL="redis://redis:6379"
JWT_SECRET="tu-secreto-super-seguro-de-minimo-32-caracteres-aqui"
PORT=3000
NODE_ENV=development
```

### 2️⃣ Levantar con Docker

```powershell
# Iniciar todos los servicios (PostgreSQL, Redis, Backend, Frontend)
docker-compose up -d

# Ver logs en tiempo real
docker-compose logs -f
```

### 3️⃣ Ejecutar Migraciones y Seed

```powershell
# Crear tablas en la base de datos
docker-compose exec backend npx prisma migrate dev

# Poblar con datos de ejemplo (usuarios, productos, ventas)
docker-compose exec backend npm run prisma:seed
```

### 4️⃣ Acceder al Sistema

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3000
- **Prisma Studio:** `docker-compose exec backend npx prisma studio`

### 🔑 Credenciales por Defecto

El seed crea estos usuarios:

| Usuario | Contraseña | Rol    | Comisión |
|---------|-----------|--------|----------|
| admin   | admin123  | ADMIN  | 10%      |
| demo    | demo123   | USER   | 8%       |

---

## 🛠️ Comandos Útiles

```powershell
# Ver logs de un servicio específico
docker-compose logs -f backend
docker-compose logs -f frontend

# Reiniciar servicios
docker-compose restart backend
docker-compose restart frontend

# Parar todos los servicios
docker-compose down

# Eliminar volúmenes (limpia la base de datos)
docker-compose down -v

# Ejecutar Prisma Studio (administrar DB visualmente)
docker-compose exec backend npx prisma studio

# Ejecutar seed nuevamente
docker-compose exec backend npm run prisma:seed

# Ver estado de servicios
docker-compose ps
```

---

## 🔥 Hot Reload Confirmado

- ✅ **Backend:** Cambios en `.ts` se aplican automáticamente
- ✅ **Frontend:** Cambios en `.tsx` se reflejan en <50ms
- ✅ **Base de datos:** Migraciones con Prisma

---

## 🐛 Troubleshooting

### ❌ Error: "Port already in use"
```powershell
# Detener servicios en conflicto
docker-compose down
netstat -ano | findstr :3000
netstat -ano | findstr :5173
```

### ❌ Error: "JWT_SECRET not defined"
```powershell
# Verifica que backend\.env tenga JWT_SECRET
cat backend\.env
```

### ❌ Error: "Cannot connect to database"
```powershell
# Reinicia PostgreSQL
docker-compose restart postgres

# Verifica que PostgreSQL esté corriendo
docker-compose ps postgres
```

### ❌ Error al ejecutar migraciones
```powershell
# Elimina la base de datos y vuelve a crear
docker-compose down -v
docker-compose up -d
docker-compose exec backend npx prisma migrate dev
docker-compose exec backend npm run prisma:seed
```

---

## 📚 Documentación Adicional

- **README.md** - Documentación completa del proyecto
- **PLAN_ACCION.md** - Plan detallado de desarrollo
- **ESTADO_ACTUAL.md** - Estado actual y próximos pasos
- **API_GUIDE.md** - Guía de endpoints (en carpeta original)

---

## 🎯 Próximos Pasos Recomendados

1. **Probar el sistema:**
   - Login con `demo / demo123`
   - Explorar dashboard
   - Ver productos, ventas, comisiones

2. **Verificar hot reload:**
   - Cambiar algo en `frontend/src/pages/Dashboard.tsx`
   - Ver cambio inmediato en http://localhost:5173

3. **Explorar API:**
   - Abrir http://localhost:3000
   - Probar endpoints con Postman/Thunder Client

4. **Continuar desarrollo:**
   - Ver **ESTADO_ACTUAL.md** para roadmap
   - Implementar formularios de productos
   - Añadir gráficas al dashboard

---

**¿Listo para despegar?** 🚀
```powershell
docker-compose up -d
docker-compose exec backend npx prisma migrate dev
docker-compose exec backend npm run prisma:seed
```

Luego abre http://localhost:5173 y disfruta 🎉

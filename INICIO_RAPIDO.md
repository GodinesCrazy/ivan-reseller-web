# 🚀 Guía de Inicio Rápido - Ivan Reseller Web

## ✅ Paso 1: Verificar Prerrequisitos

```bash
# Verificar Docker
docker --version
# Debe mostrar: Docker version 20.x o superior

# Verificar Docker Compose
docker-compose --version
# Debe mostrar: Docker Compose version 2.x o superior
```

## ✅ Paso 2: Configurar Variables de Entorno

```bash
# Copiar archivos de ejemplo
cp backend\.env.example backend\.env
cp frontend\.env.example frontend\.env
```

**Editar `backend\.env`:**

```env
# MÍNIMO REQUERIDO para empezar:
JWT_SECRET=tu-secreto-super-seguro-cambiar-en-produccion-minimo-32-caracteres
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/ivan_reseller
REDIS_URL=redis://redis:6379
```

**Las demás variables de APIs son opcionales para desarrollo inicial.**

## ✅ Paso 3: Levantar el Sistema

```bash
# Levantar todos los servicios
docker-compose up -d

# Ver logs (útil para debugging)
docker-compose logs -f
```

**Espera a que los servicios estén listos (30-60 segundos).**

## ✅ Paso 4: Inicializar Base de Datos

```bash
# Ejecutar migraciones de Prisma
docker-compose exec backend npx prisma migrate dev

# (Opcional) Crear usuario admin inicial
docker-compose exec backend npx prisma db seed
```

## ✅ Paso 5: Acceder a la Aplicación

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Health Check**: http://localhost:3000/health
- **Prisma Studio** (DB GUI): 
  ```bash
  docker-compose exec backend npx prisma studio
  # Abre en http://localhost:5555
  ```

## 🔐 Login Inicial

Si ejecutaste el seed, puedes usar:

- **Admin**:
  - Username: `admin`
  - Password: `admin123`

- **User**:
  - Username: `user1`
  - Password: `user123`

O registra un nuevo usuario desde la UI.

## 🛠️ Comandos Útiles

```bash
# Ver estado de servicios
docker-compose ps

# Ver logs en tiempo real
docker-compose logs -f backend
docker-compose logs -f frontend

# Restart servicio específico
docker-compose restart backend

# Detener todo
docker-compose down

# Detener y eliminar volúmenes (⚠️ elimina datos)
docker-compose down -v

# Rebuild después de cambios en código
docker-compose up -d --build backend
docker-compose up -d --build frontend
```

## ❌ Solución de Problemas Comunes

### Error: "Port already in use"

```bash
# Liberar puertos
# Windows:
netstat -ano | findstr :3000
taskkill /PID <pid> /F

# Linux/Mac:
lsof -ti:3000 | xargs kill -9
```

### Error: "Cannot connect to database"

```bash
# Verificar que PostgreSQL está corriendo
docker-compose ps

# Revisar logs de PostgreSQL
docker-compose logs postgres

# Recrear contenedor de base de datos
docker-compose down postgres
docker-compose up -d postgres
```

### Error: "Module not found"

```bash
# Rebuild con reinstalación de dependencias
docker-compose down
docker-compose build --no-cache backend frontend
docker-compose up -d
```

### Frontend no carga o muestra pantalla en blanco

```bash
# Verificar logs del frontend
docker-compose logs frontend

# Acceder al contenedor y verificar
docker-compose exec frontend sh
ls -la
npm run dev
```

## 🎯 Próximos Pasos

1. **Configurar APIs** en `backend\.env`:
   - eBay (para publicación de productos)
   - MercadoLibre
   - PayPal (para pagos)
   - GROQ (para IA)

2. **Explorar la Interfaz**:
   - Dashboard
   - Agregar productos
   - Configurar APIs en Settings

3. **Leer Documentación Completa**: `README.md`

4. **Revisar Plan de Acción**: `PLAN_ACCION.md`

## 📚 Recursos Adicionales

- **Backend API Docs**: http://localhost:3000/api-docs (próximamente)
- **Prisma Studio**: `docker-compose exec backend npx prisma studio`
- **Database Migrations**: Ver `backend/prisma/migrations/`

## 🆘 ¿Necesitas Ayuda?

1. Revisar logs: `docker-compose logs -f`
2. Verificar servicios: `docker-compose ps`
3. Consultar README.md
4. Abrir issue en GitHub

---

**¡Listo! Tu sistema está funcionando. Happy coding! 🎉**

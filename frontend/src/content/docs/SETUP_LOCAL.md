# 🛠️ Setup Local - Ivan Reseller

**Guía para configurar el entorno de desarrollo local**

**Última actualización:** 2025-01-27  
**Versión:** 1.0

---

## 📋 Prerrequisitos

### Software Requerido

- **Node.js** 20+ ([Descargar](https://nodejs.org/))
- **npm** 10+ (incluido con Node.js)
- **PostgreSQL** 16+ ([Descargar](https://www.postgresql.org/download/))
- **Redis** 7+ ([Descargar](https://redis.io/download))
- **Git** ([Descargar](https://git-scm.com/downloads))

### Alternativa: Docker

Si prefieres usar Docker, puedes usar `docker-compose` para levantar PostgreSQL y Redis automáticamente. Ver [README.md](../README.md#instalación-con-docker-recomendado).

---

## 🚀 Instalación Paso a Paso

### 1. Clonar el Repositorio

```bash
git clone <repository-url>
cd Ivan_Reseller_Web
```

### 2. Configurar Backend

```bash
cd backend

# Instalar dependencias
npm install

# Copiar archivo de ejemplo de variables de entorno
cp .env.example .env
```

### 3. Configurar Variables de Entorno (Backend)

Edita `backend/.env` con tus valores:

```env
# Base de datos
DATABASE_URL="postgresql://usuario:contraseña@localhost:5432/ivan_reseller"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT (generar con: openssl rand -base64 64)
JWT_SECRET="tu-secret-jwt-aqui-minimo-32-caracteres"

# Cifrado (generar con: openssl rand -base64 32)
ENCRYPTION_KEY="tu-encryption-key-aqui-32-bytes"

# CORS (para desarrollo local)
CORS_ORIGIN="http://localhost:5173,http://localhost:3000"

# API URL (backend)
API_URL="http://localhost:3000"

# Frontend URL
FRONTEND_URL="http://localhost:5173"

# Ambiente
NODE_ENV="development"

# Puerto (opcional, default 3000)
PORT=3000

# Feature Flags (opcionales)
ALLOW_BROWSER_AUTOMATION=true
SCRAPER_BRIDGE_ENABLED=true
ALIEXPRESS_DATA_SOURCE="api"  # "api" | "scraping" | "hybrid"
ALIEXPRESS_AUTH_MONITOR_ENABLED=true

# Rate Limiting (opcional)
RATE_LIMIT_ENABLED=true
RATE_LIMIT_DEFAULT=200
RATE_LIMIT_ADMIN=1000
RATE_LIMIT_LOGIN=5
```

**⚠️ IMPORTANTE:** Nunca commitees el archivo `.env` con valores reales. Usa `.env.example` como plantilla.

### 4. Configurar Base de Datos

```bash
# Crear base de datos PostgreSQL
createdb ivan_reseller

# O usando psql:
psql -U postgres
CREATE DATABASE ivan_reseller;
\q

# Ejecutar migraciones
npx prisma migrate dev

# Generar cliente Prisma
npx prisma generate

# (Opcional) Seed de datos iniciales
npm run prisma:seed
```

### 5. Iniciar Redis

**En Windows:**
```bash
# Si instalaste Redis con Chocolatey
redis-server

# O descarga Redis para Windows desde: https://github.com/microsoftarchive/redis/releases
```

**En Linux/Mac:**
```bash
redis-server
```

**Verificar que Redis funciona:**
```bash
redis-cli ping
# Debe responder: PONG
```

### 6. Configurar Frontend

```bash
cd ../frontend

# Instalar dependencias
npm install

# Copiar archivo de ejemplo
cp .env.example .env
```

### 7. Configurar Variables de Entorno (Frontend)

Edita `frontend/.env`:

```env
# URL del backend (sin /api al final)
VITE_API_URL="http://localhost:3000"

# Nivel de logging (opcional)
VITE_LOG_LEVEL="warn"
```

### 8. Iniciar Servicios

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

El backend debería iniciar en `http://localhost:3000`

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

El frontend debería iniciar en `http://localhost:5173`

---

## ✅ Verificación

### 1. Verificar Backend

```bash
# Health check
curl http://localhost:3000/health

# Debe responder: {"status":"ok","timestamp":"..."}
```

### 2. Verificar Frontend

Abre `http://localhost:5173` en tu navegador. Deberías ver la página de login.

### 3. Verificar Base de Datos

```bash
# Abrir Prisma Studio (GUI para la base de datos)
cd backend
npx prisma studio
```

Esto abrirá una interfaz web en `http://localhost:5555` donde puedes ver y editar datos.

---

## 🔧 Comandos Útiles

### Backend

```bash
cd backend

# Desarrollo con hot reload
npm run dev

# Compilar TypeScript
npm run build

# Ejecutar en producción
npm start

# Linting
npm run lint

# Type checking
npm run type-check

# Prisma
npm run prisma:generate    # Generar cliente Prisma
npm run prisma:migrate     # Crear migración
npm run prisma:studio      # Abrir Prisma Studio
npm run prisma:seed        # Seed de datos
```

### Frontend

```bash
cd frontend

# Desarrollo con hot reload
npm run dev

# Build para producción
npm run build

# Preview del build
npm run preview

# Linting
npm run lint

# Type checking
npm run type-check
```

---

## 🐛 Troubleshooting

### Error: "Cannot connect to database"

**Solución:**
1. Verifica que PostgreSQL esté corriendo: `pg_isready`
2. Verifica que `DATABASE_URL` en `.env` sea correcta
3. Verifica que la base de datos exista: `psql -l | grep ivan_reseller`

### Error: "Cannot connect to Redis"

**Solución:**
1. Verifica que Redis esté corriendo: `redis-cli ping`
2. Verifica que `REDIS_URL` en `.env` sea correcta
3. En Windows, asegúrate de que el servicio Redis esté iniciado

### Error: "JWT_SECRET is not set"

**Solución:**
1. Genera un JWT_SECRET seguro:
   ```bash
   # Linux/Mac
   openssl rand -base64 64
   
   # Windows PowerShell
   [Convert]::ToBase64String((1..64|%{Get-Random -Max 256}))
   ```
2. Agrega el valor a `backend/.env`

### Error: "ENCRYPTION_KEY is not set"

**Solución:**
1. Genera una ENCRYPTION_KEY de 32 bytes:
   ```bash
   # Linux/Mac
   openssl rand -base64 32
   
   # Windows PowerShell
   [Convert]::ToBase64String((1..32|%{Get-Random -Max 256}))
   ```
2. Agrega el valor a `backend/.env`

### Error: CORS en desarrollo

**Solución:**
1. Asegúrate de que `CORS_ORIGIN` en `backend/.env` incluya `http://localhost:5173`
2. Verifica que el frontend esté usando `VITE_API_URL="http://localhost:3000"`

### Error: "Port 3000 already in use"

**Solución:**
1. Cambia el puerto en `backend/.env`: `PORT=3001`
2. Actualiza `VITE_API_URL` en `frontend/.env` para apuntar al nuevo puerto

---

## 📚 Recursos Adicionales

- **Documentación de Prisma:** https://www.prisma.io/docs
- **Documentación de Express:** https://expressjs.com
- **Documentación de React:** https://react.dev
- **Documentación de Vite:** https://vitejs.dev

---

## 🆘 Soporte

Si encuentras problemas que no están cubiertos en esta guía:

1. Revisa los logs del backend y frontend en la consola
2. Consulta [docs/TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
3. Revisa los issues en el repositorio
4. Abre un nuevo issue con detalles del error

---

**Última actualización:** 2025-01-27


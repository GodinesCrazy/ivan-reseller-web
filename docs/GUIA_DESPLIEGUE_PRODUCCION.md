# 🚀 Guía de Despliegue a Producción - Ivan Reseller

**Para Desarrolladores y DevOps**

Esta guía describe cómo desplegar Ivan Reseller en un entorno de producción.

---

## 📋 Arquitectura del Sistema

### Servicios Necesarios

El sistema requiere los siguientes servicios:

1. **Backend API** (Node.js + Express + TypeScript)
   - Puerto: 3000 (interno)
   - Funcionalidad: API REST, WebSockets, Jobs

2. **Frontend** (React + Vite + TypeScript)
   - Puerto: 5173 (desarrollo) / 80/443 (producción con NGINX)
   - Funcionalidad: Interfaz de usuario

3. **PostgreSQL Database**
   - Puerto: 5432
   - Funcionalidad: Base de datos principal

4. **Redis Cache**
   - Puerto: 6379
   - Funcionalidad: Caché, sesiones, colas (BullMQ)

5. **NGINX** (Opcional pero recomendado)
   - Puerto: 80 (HTTP), 443 (HTTPS)
   - Funcionalidad: Reverse proxy, SSL termination

6. **Workers** (BullMQ Workers)
   - Funcionalidad: Procesamiento de jobs en background

---

## 🐳 Despliegue con Docker Compose

### Requisitos Previos

- Docker 20.10+
- Docker Compose 2.0+
- Git

### Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```bash
# Database
DATABASE_URL=postgresql://postgres:CHANGE_PASSWORD@postgres:5432/ivan_reseller

# JWT & Encryption
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
ENCRYPTION_KEY=your-encryption-key-minimum-32-characters

# Redis
REDIS_URL=redis://redis:6379

# CORS
CORS_ORIGIN=https://www.ivanreseller.com

# Environment
NODE_ENV=production
PORT=3000

# Frontend
VITE_API_URL=https://api.ivanreseller.com
VITE_WS_URL=wss://api.ivanreseller.com

# Optional: Email (SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-password

# Optional: External APIs (configurar según necesidad)
GROQ_API_KEY=your-groq-api-key
SCRAPER_API_KEY=your-scraper-api-key
ZENROWS_API_KEY=your-zenrows-api-key
```

### Pasos de Despliegue

#### 1. Clonar Repositorio

```bash
git clone <repository-url>
cd Ivan_Reseller_Web
```

#### 2. Configurar Variables de Entorno

```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Editar .env con tus valores reales
nano .env  # o usar tu editor preferido
```

**IMPORTANTE:** Cambia TODOS los valores por defecto, especialmente:
- `JWT_SECRET`: Genera una clave aleatoria de al menos 32 caracteres
- `ENCRYPTION_KEY`: Genera una clave aleatoria de al menos 32 caracteres
- `DATABASE_URL`: Usa una contraseña segura para PostgreSQL

#### 3. Construir Imágenes Docker

```bash
docker-compose -f docker-compose.prod.yml build
```

O si usas el archivo de desarrollo:

```bash
docker-compose build
```

#### 4. Levantar Servicios

```bash
docker-compose -f docker-compose.prod.yml up -d
```

Esto iniciará:
- PostgreSQL (puerto 5432)
- Redis (puerto 6379)
- Backend (puerto 3000)
- Frontend (puerto 5173)

#### 5. Ejecutar Migraciones de Base de Datos

```bash
# Esperar a que PostgreSQL esté listo (unos segundos)
docker-compose exec backend npx prisma migrate deploy
```

O si es la primera vez:

```bash
docker-compose exec backend npx prisma migrate dev
```

#### 6. (Opcional) Seed de Datos Iniciales

```bash
docker-compose exec backend npx prisma db seed
```

---

## 🔧 Configuración de NGINX (Recomendado)

### Archivo de Configuración NGINX

Crea `/etc/nginx/sites-available/ivanreseller`:

```nginx
upstream backend {
    server localhost:3000;
}

upstream frontend {
    server localhost:5173;
}

server {
    listen 80;
    server_name www.ivanreseller.com ivanreseller.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name www.ivanreseller.com ivanreseller.com;

    # SSL Configuration
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout para operaciones largas (scraping, etc.)
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### Activar Configuración

```bash
# Crear enlace simbólico
sudo ln -s /etc/nginx/sites-available/ivanreseller /etc/nginx/sites-enabled/

# Probar configuración
sudo nginx -t

# Reiniciar NGINX
sudo systemctl restart nginx
```

---

## 🔐 Variables de Entorno Imprescindibles

### Seguridad

```bash
# OBLIGATORIO: JWT Secret (mínimo 32 caracteres)
JWT_SECRET=generate-random-string-min-32-chars

# OBLIGATORIO: Encryption Key (mínimo 32 caracteres)
ENCRYPTION_KEY=generate-random-string-min-32-chars
```

**Generar claves seguras:**
```bash
# Opción 1: OpenSSL
openssl rand -base64 32

# Opción 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Base de Datos

```bash
# OBLIGATORIO: Database URL
DATABASE_URL=postgresql://user:password@host:5432/database_name
```

**Formato:**
```
postgresql://[user]:[password]@[host]:[port]/[database]?[params]
```

### Redis

```bash
# OBLIGATORIO: Redis URL
REDIS_URL=redis://host:6379
# O con contraseña:
REDIS_URL=redis://:password@host:6379
```

### CORS

```bash
# OBLIGATORIO: Frontend URL para CORS
CORS_ORIGIN=https://www.ivanreseller.com
# Múltiples orígenes (separados por coma):
CORS_ORIGIN=https://www.ivanreseller.com,https://admin.ivanreseller.com
```

---

## 📦 Pasos Básicos para Despliegue

### 1. Aplicar Migraciones

```bash
# Conectar al contenedor backend
docker-compose exec backend bash

# Dentro del contenedor
cd /app
npx prisma migrate deploy

# O para desarrollo
npx prisma migrate dev
```

**Si hay migraciones fallidas:**
- El sistema tiene lógica automática para resolverlas
- Revisa los logs: `docker-compose logs backend`

### 2. Levantar el Stack Completo

```bash
# Desarrollo
docker-compose up -d

# Producción
docker-compose -f docker-compose.prod.yml up -d
```

### 3. Verificar que Todo Funciona

**Health Check del Backend:**
```bash
curl http://localhost:3000/health
# Debe responder: {"status":"ok","timestamp":"..."}
```

**Health Check del Frontend:**
```bash
curl http://localhost:5173
# Debe devolver HTML de la aplicación
```

**Verificar Base de Datos:**
```bash
docker-compose exec postgres psql -U postgres -d ivan_reseller -c "SELECT COUNT(*) FROM users;"
```

**Verificar Redis:**
```bash
docker-compose exec redis redis-cli ping
# Debe responder: PONG
```

### 4. Crear Usuario Administrador

**Opción 1: Desde la aplicación (si hay acceso)**
- Hacer login si ya existe un admin
- Ir a Admin → Users → Create User

**Opción 2: Desde la base de datos**
```bash
docker-compose exec postgres psql -U postgres -d ivan_reseller

-- Ejecutar en psql:
INSERT INTO users (email, password, username, role, "isActive", "createdAt", "updatedAt")
VALUES (
  'admin@example.com',
  '$2b$10$...', -- Hash bcrypt de tu contraseña
  'admin',
  'ADMIN',
  true,
  NOW(),
  NOW()
);
```

**Generar hash bcrypt:**
```javascript
const bcrypt = require('bcrypt');
const hash = bcrypt.hashSync('tu-contraseña', 10);
console.log(hash);
```

---

## 🧪 Prueba Rápida del Sistema

Después de desplegar, verifica que todo funciona:

### 1. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"tu-contraseña"}'
```

Debe devolver un token JWT.

### 2. Health Check de APIs

```bash
# Con token JWT obtenido arriba
curl http://localhost:3000/api/health \
  -H "Authorization: Bearer TU_TOKEN_JWT"
```

### 3. Crear Producto de Prueba

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer TU_TOKEN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Producto de Prueba",
    "aliexpressUrl": "https://aliexpress.com/item/123",
    "aliexpressPrice": 10,
    "suggestedPrice": 20
  }'
```

### 4. Verificar Frontend

- Abrir navegador: `http://localhost:5173` (o tu dominio)
- Debe cargar la aplicación React
- Intentar hacer login

---

## 🔄 Actualizaciones y Mantenimiento

### Actualizar Código

```bash
# Pull último código
git pull origin main

# Reconstruir imágenes
docker-compose build

# Reiniciar servicios
docker-compose restart

# Aplicar nuevas migraciones (si las hay)
docker-compose exec backend npx prisma migrate deploy
```

### Ver Logs

```bash
# Todos los servicios
docker-compose logs -f

# Solo backend
docker-compose logs -f backend

# Solo frontend
docker-compose logs -f frontend

# Últimas 100 líneas
docker-compose logs --tail=100 backend
```

### Backup de Base de Datos

```bash
# Backup
docker-compose exec postgres pg_dump -U postgres ivan_reseller > backup_$(date +%Y%m%d).sql

# Restaurar
docker-compose exec -T postgres psql -U postgres ivan_reseller < backup_20250127.sql
```

### Reiniciar Servicio Específico

```bash
# Reiniciar backend
docker-compose restart backend

# Reiniciar frontend
docker-compose restart frontend

# Reiniciar todo
docker-compose restart
```

---

## 🚨 Troubleshooting

### Backend no inicia

**Problema:** Error de migración
```bash
# Ver logs
docker-compose logs backend

# Verificar migraciones
docker-compose exec backend npx prisma migrate status

# Aplicar migraciones manualmente
docker-compose exec backend npx prisma migrate deploy
```

### Base de datos no conecta

**Verificar:**
```bash
# Verificar que PostgreSQL está corriendo
docker-compose ps postgres

# Verificar conexión
docker-compose exec backend npx prisma db pull
```

### Redis no conecta

**Verificar:**
```bash
# Verificar que Redis está corriendo
docker-compose ps redis

# Probar conexión
docker-compose exec redis redis-cli ping
```

### Frontend no carga

**Verificar:**
```bash
# Ver logs
docker-compose logs frontend

# Verificar que el backend está accesible
curl http://localhost:3000/health
```

---

## 📝 Checklist Pre-Producción

Antes de poner en producción, verifica:

- [ ] Todas las variables de entorno configuradas
- [ ] `JWT_SECRET` y `ENCRYPTION_KEY` son seguros (32+ caracteres, aleatorios)
- [ ] Base de datos tiene contraseña segura
- [ ] Migraciones aplicadas correctamente
- [ ] SSL/HTTPS configurado (si usas NGINX)
- [ ] Backups automáticos configurados
- [ ] Logs configurados y accesibles
- [ ] Monitoreo configurado (opcional pero recomendado)
- [ ] Usuario administrador creado
- [ ] Health checks funcionando
- [ ] Frontend y backend se comunican correctamente

---

## 🔗 Referencias

- **README Principal:** `README.md`
- **Guía de Usuario:** `docs/GUIA_RAPIDA_USO_IVAN_RESELLER.md`
- **Guía de Admin:** `docs/GUIA_ADMIN_IVAN_RESELLER.md`
- **Informe QA:** `INFORME_QA_COMPLETO_SISTEMA.md`

---

**Última actualización:** 2025-01-27


# 🔐 Security Guide - Ivan Reseller

**Guía de seguridad y mejores prácticas**

**Última actualización:** 2025-01-27  
**Versión:** 1.0

---

## 📋 Índice

1. [Manejo de Secretos](#manejo-de-secretos)
2. [Autenticación y Autorización](#autenticación-y-autorización)
3. [Cifrado de Datos](#cifrado-de-datos)
4. [CORS y Headers de Seguridad](#cors-y-headers-de-seguridad)
5. [Rate Limiting](#rate-limiting)
6. [Validación de Entrada](#validación-de-entrada)
7. [Logging y Auditoría](#logging-y-auditoría)
8. [Backups](#backups)
9. [Checklist de Seguridad](#checklist-de-seguridad)

---

## 🔑 Manejo de Secretos

### Variables de Entorno Críticas

Las siguientes variables **NUNCA** deben committearse al repositorio:

- `JWT_SECRET` - Secret para firmar tokens JWT
- `ENCRYPTION_KEY` - Clave para cifrar credenciales de APIs
- `DATABASE_URL` - URL de conexión a PostgreSQL (incluye usuario y contraseña)
- `REDIS_URL` - URL de conexión a Redis (puede incluir contraseña)
- Credenciales de APIs (eBay, Amazon, PayPal, etc.)

### Generación de Secretos

#### JWT_SECRET

```bash
# Linux/Mac
openssl rand -base64 64

# Windows PowerShell
[Convert]::ToBase64String((1..64|%{Get-Random -Max 256}))
```

**Requisitos:**
- Mínimo 32 caracteres
- Único por ambiente (dev, staging, production)
- Rotar periódicamente (cada 6-12 meses)

#### ENCRYPTION_KEY

```bash
# Linux/Mac
openssl rand -base64 32

# Windows PowerShell
[Convert]::ToBase64String((1..32|%{Get-Random -Max 256}))
```

**Requisitos:**
- Exactamente 32 bytes (256 bits)
- Único por ambiente
- **CRÍTICO:** Si se pierde, no se pueden descifrar credenciales existentes

### Almacenamiento de Secretos

#### Desarrollo Local

- Usar archivo `.env` (NO committear)
- Agregar `.env` a `.gitignore`
- Usar `.env.example` como plantilla (sin valores reales)

#### Producción (Railway)

- Usar Railway Variables
- Marcar como "Secret" para ocultar en logs
- NO usar variables compartidas entre servicios

### Credenciales de APIs

Las credenciales de APIs (eBay, Amazon, PayPal, etc.) se almacenan:

1. **En Base de Datos** (tabla `ApiCredential`)
2. **Cifradas** con AES-256-GCM usando `ENCRYPTION_KEY`
3. **Por Usuario** (scope: `user` o `global`)

**Archivo relevante:** `backend/src/services/credentials-manager.service.ts`

---

## 🔐 Autenticación y Autorización

### JWT (JSON Web Tokens)

#### Implementación

- **Librería:** `jsonwebtoken`
- **Algoritmo:** HS256
- **Expiración:** Configurable (default: 24 horas)
- **Refresh Token:** Implementado con expiración más larga

#### Ubicación del Token

El token se envía en dos formas (prioridad):

1. **Cookie HTTP-only** (más seguro)
   - Nombre: `token`
   - HttpOnly: `true`
   - Secure: `true` (en producción)
   - SameSite: `None` (para CORS)

2. **Header Authorization** (fallback)
   - Formato: `Bearer <token>`
   - Para compatibilidad con clientes que no soportan cookies

**Archivo relevante:** `backend/src/middleware/auth.middleware.ts`

#### Roles y Permisos

El sistema implementa dos roles:

- **USER** - Usuario estándar
  - Acceso a sus propios datos
  - Puede configurar sus propias APIs
  - Puede crear productos y oportunidades

- **ADMIN** - Administrador
  - Acceso a todos los usuarios
  - Puede crear/editar/eliminar usuarios
  - Puede configurar APIs globales
  - Acceso a reportes y métricas del sistema

**Middleware de autorización:** `backend/src/middleware/auth.middleware.ts` → `authorize()`

#### Endpoints Protegidos

- Todos los endpoints bajo `/api/*` requieren autenticación (excepto `/api/auth/login`, `/api/auth/register` está deshabilitado)
- Endpoints de admin requieren rol `ADMIN`: `/api/admin/*`

---

## 🔒 Cifrado de Datos

### Credenciales de APIs

Las credenciales de APIs se cifran antes de almacenarse en la base de datos:

- **Algoritmo:** AES-256-GCM
- **Clave:** `ENCRYPTION_KEY` (32 bytes)
- **IV:** Generado aleatoriamente para cada cifrado
- **Auth Tag:** Incluido en el payload cifrado

**Archivo relevante:** `backend/src/services/credentials-manager.service.ts`

### Contraseñas de Usuarios

Las contraseñas se hashean con bcrypt:

- **Rounds:** 10 (configurable)
- **Salt:** Generado automáticamente por bcrypt
- **Nunca** se almacenan en texto plano

**Archivo relevante:** `backend/src/services/auth.service.ts`

---

## 🌐 CORS y Headers de Seguridad

### CORS (Cross-Origin Resource Sharing)

#### Configuración

- **Orígenes permitidos:** Configurados via `CORS_ORIGIN` (lista separada por comas)
- **Credentials:** `true` (permite cookies)
- **Methods:** GET, POST, PUT, PATCH, DELETE, OPTIONS
- **Headers:** Content-Type, Authorization, X-Requested-With, Accept

#### Implementación

**Archivo relevante:** `backend/src/app.ts`

- Middleware CORS aplicado **antes** de cualquier router
- Preflight OPTIONS manejado correctamente (204)
- Headers CORS presentes incluso en respuestas de error (401, 404, 500)

#### Validación

```bash
# Verificar CORS
curl -H "Origin: https://www.ivanreseller.com" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     https://tu-backend.up.railway.app/api/dashboard/stats
```

### Security Headers (Helmet)

El sistema usa `helmet` para agregar headers de seguridad:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (en producción con HTTPS)

**Archivo relevante:** `backend/src/app.ts`

---

## ⚡ Rate Limiting

### Implementación

El sistema implementa rate limiting para prevenir abuso:

- **Librería:** `express-rate-limit`
- **Configuración:** Via variables de entorno
- **Basado en:** IP o User ID (si está autenticado)

### Límites Configurables

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_DEFAULT=200      # Requests por 15 minutos (usuarios normales)
RATE_LIMIT_ADMIN=1000      # Requests por 15 minutos (ADMIN)
RATE_LIMIT_LOGIN=5         # Intentos de login por 15 minutos
RATE_LIMIT_WINDOW_MS=900000 # Ventana de tiempo (15 minutos)
```

**Archivo relevante:** `backend/src/middleware/rate-limit.middleware.ts`

### Endpoints Protegidos

- `/api/auth/login` - Rate limit estricto (5 intentos/15min)
- Todos los endpoints `/api/*` - Rate limit por rol

---

## ✅ Validación de Entrada

### Backend

El sistema usa **Zod** para validación de esquemas:

- Validación de tipos
- Validación de formato (email, URL, etc.)
- Validación de longitud y rangos
- Mensajes de error descriptivos

**Ejemplo:**
```typescript
// backend/src/api/routes/auth.routes.ts
const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: registerPasswordSchema, // Validación de contraseña fuerte
  fullName: z.string().optional(),
});
```

### Frontend

El frontend también valida antes de enviar:

- Validación de formularios con `react-hook-form`
- Validación de tipos con TypeScript
- Validación de esquemas compartidos (cuando es posible)

---

## 📝 Logging y Auditoría

### Logging Estructurado

El sistema usa **Winston** para logging:

- **Niveles:** error, warn, info, debug
- **Formato:** JSON estructurado (en producción)
- **Destinos:** Console (dev), archivos/cloud (prod)

### Información Registrada

- Requests HTTP (método, path, status, tiempo de respuesta)
- Errores con stack traces
- Autenticación (login exitoso/fallido)
- Acciones de admin (crear/editar/eliminar usuarios)
- Cambios en configuración de APIs

### Información NO Registrada

- Contraseñas (nunca)
- Tokens JWT completos (solo IDs)
- Credenciales de APIs (nunca)
- Datos sensibles de usuarios

**Archivo relevante:** `backend/src/config/logger.ts`

---

## 💾 Backups

### Base de Datos

#### Automático (Railway)

Railway proporciona backups automáticos de PostgreSQL:
- Frecuencia: Diaria
- Retención: 7 días (configurable)

#### Manual

```bash
# Backup de PostgreSQL
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Restaurar
psql $DATABASE_URL < backup_20250127.sql
```

### Credenciales Cifradas

**⚠️ IMPORTANTE:** Si pierdes `ENCRYPTION_KEY`, no podrás descifrar credenciales existentes.

**Recomendación:**
- Guardar `ENCRYPTION_KEY` en un gestor de secretos (1Password, LastPass, etc.)
- Documentar dónde se almacena
- Rotar periódicamente (requiere re-cifrar todas las credenciales)

---

## ✅ Checklist de Seguridad

### Pre-Deploy

- [ ] `JWT_SECRET` generado y configurado (mínimo 32 caracteres)
- [ ] `ENCRYPTION_KEY` generado y configurado (32 bytes)
- [ ] `.env` NO committeado
- [ ] Variables de entorno en Railway marcadas como "Secret"
- [ ] CORS configurado correctamente (solo dominios permitidos)
- [ ] Rate limiting habilitado
- [ ] HTTPS configurado (Railway lo hace automáticamente)

### Post-Deploy

- [ ] Health checks funcionando (`/health`, `/api/health`)
- [ ] CORS funcionando (verificar con `/api/cors-debug`)
- [ ] Autenticación funcionando (login/logout)
- [ ] Autorización funcionando (admin vs user)
- [ ] Logs no exponen información sensible
- [ ] Backups configurados

### Mantenimiento

- [ ] Rotar `JWT_SECRET` cada 6-12 meses
- [ ] Revisar logs periódicamente
- [ ] Actualizar dependencias (npm audit)
- [ ] Revisar accesos de usuarios (eliminar inactivos)
- [ ] Verificar que no haya credenciales expuestas en logs

---

## 📚 Recursos Adicionales

- **OWASP Top 10:** https://owasp.org/www-project-top-ten/
- **Node.js Security Best Practices:** https://nodejs.org/en/docs/guides/security/
- **Express Security Best Practices:** https://expressjs.com/en/advanced/best-practice-security.html

---

**Última actualización:** 2025-01-27


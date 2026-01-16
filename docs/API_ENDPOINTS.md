# API Endpoints Reference - Ivan Reseller Web
**�ltima actualizaci�n:** 2025-12-18  
**Base URL:** `https://ivan-reseller-web-production.up.railway.app`

---

## Tabla de Contenidos

1. [Health Checks](#1-health-checks)
2. [Authentication](#2-authentication)
3. [Users](#3-users)
4. [Products](#4-products)
5. [Sales](#5-sales)
6. [Marketplace](#6-marketplace)
7. [Webhooks](#7-webhooks)
8. [Admin](#8-admin)
9. [Reports](#9-reports)
10. [System](#10-system)

---

## 1. Health Checks

### GET /health
**Descripci�n:** Liveness probe - verifica que la aplicaci�n est� corriendo  
**Auth:** No requerida  
**Rate Limit:** No aplica

**Response 200:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-18T10:00:00.000Z",
  "uptime": 3600,
  "service": "ivan-reseller-backend",
  "version": "1.0.0",
  "environment": "production",
  "memory": { ... },
  "memoryHealthy": true
}
```

**Comando PowerShell:**
```powershell
curl.exe --max-time 10 https://ivan-reseller-web-production.up.railway.app/health
```

---

### GET /ready
**Descripci�n:** Readiness probe - verifica que la aplicaci�n puede servir tr�fico  
**Auth:** No requerida  
**Rate Limit:** No aplica

**Response 200 (ready):**
```json
{
  "ready": true,
  "checks": {
    "timestamp": "2025-12-18T10:00:00.000Z",
    "service": "ivan-reseller-backend",
    "environment": "production",
    "database": { "status": "healthy", "connected": true },
    "redis": { "status": "healthy", "connected": true }
  },
  "uptime": 3600
}
```

**Response 503 (not ready):**
```json
{
  "ready": false,
  "checks": {
    "database": { "status": "unhealthy", "connected": false, "error": "..." }
  }
}
```

**Comando PowerShell:**
```powershell
curl.exe --max-time 10 https://ivan-reseller-web-production.up.railway.app/ready
```

---

## 2. Authentication

### POST /api/auth/login
**Descripci�n:** Login de usuario  
**Auth:** No requerida  
**Rate Limit:** 5 intentos por 15 minutos (por IP)

**Request:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "role": "ADMIN"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Cookies (httpOnly):**
- `token` - JWT token (1 hora)
- `refreshToken` - Refresh token (30 d�as)

**Comando PowerShell:**
```powershell
curl.exe -X POST https://ivan-reseller-web-production.up.railway.app/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"username\":\"admin\",\"password\":\"admin123\"}'
```

---

### POST /api/auth/register
**Descripci�n:** Registro p�blico (DESHABILITADO)  
**Auth:** No requerida  
**Rate Limit:** No aplica

**Response 403:**
```json
{
  "success": false,
  "message": "Public registration is disabled. Please request access instead.",
  "action": "request_access",
  "requestUrl": "/api/access-requests",
  "frontendUrl": "/request-access"
}
```

---

### GET /api/auth/me
**Descripci�n:** Obtener informaci�n del usuario autenticado  
**Auth:** Requerida (Bearer token o cookie)  
**Rate Limit:** 200 req/15min

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "role": "ADMIN",
    "fullName": "Admin User"
  }
}
```

**Comando PowerShell:**
```powershell
curl.exe https://ivan-reseller-web-production.up.railway.app/api/auth/me `
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### POST /api/auth/refresh
**Descripci�n:** Refrescar token JWT  
**Auth:** No requerida (usa refreshToken)  
**Rate Limit:** 200 req/15min

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### POST /api/auth/logout
**Descripci�n:** Cerrar sesi�n  
**Auth:** Requerida  
**Rate Limit:** 200 req/15min

**Response 200:**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

---

## 3. Users

### GET /api/users
**Descripci�n:** Listar usuarios (solo ADMIN)  
**Auth:** Requerida (ADMIN)  
**Rate Limit:** 200 req/15min

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "role": "ADMIN"
    }
  ]
}
```

---

### GET /api/users/:id
**Descripci�n:** Obtener usuario por ID  
**Auth:** Requerida (ADMIN o mismo usuario)  
**Rate Limit:** 200 req/15min

---

## 4. Products

### GET /api/products
**Descripci�n:** Listar productos  
**Auth:** Requerida  
**Rate Limit:** 200 req/15min

**Query Params:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `search` (string, opcional)
- `marketplace` (string, opcional: 'ebay', 'mercadolibre', 'amazon')

**Response 200:**
```json
{
  "success": true,
  "data": {
    "products": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

---

### POST /api/products
**Descripci�n:** Crear producto  
**Auth:** Requerida  
**Rate Limit:** 200 req/15min

**Request:**
```json
{
  "title": "Product Title",
  "description": "Product description",
  "price": 99.99,
  "sourceUrl": "https://aliexpress.com/item/...",
  "marketplace": "ebay"
}
```

---

## 5. Sales

### GET /api/sales
**Descripci�n:** Listar ventas  
**Auth:** Requerida  
**Rate Limit:** 200 req/15min

**Query Params:**
- `page` (number)
- `limit` (number)
- `startDate` (ISO date)
- `endDate` (ISO date)
- `status` (string: 'pending', 'completed', 'cancelled')

---

### POST /api/sales
**Descripci�n:** Crear venta  
**Auth:** Requerida  
**Rate Limit:** 200 req/15min

---

## 6. Marketplace

### POST /api/marketplace/publish
**Descripci�n:** Publicar producto en marketplace  
**Auth:** Requerida  
**Rate Limit:** 200 req/15min

**Request:**
```json
{
  "productId": 1,
  "marketplace": "ebay",
  "title": "Product Title",
  "price": 99.99,
  "quantity": 1
}
```

---

### GET /api/marketplace/listings
**Descripci�n:** Listar publicaciones activas  
**Auth:** Requerida  
**Rate Limit:** 200 req/15min

---

## 7. Webhooks

### POST /api/webhooks/ebay
**Descripci�n:** Webhook de eBay  
**Auth:** Firma HMAC (header `X-Ebay-Signature`)  
**Rate Limit:** No aplica

**Headers:**
- `X-Ebay-Signature` - Firma HMAC-SHA256

**Request:**
```json
{
  "eventType": "ORDER_CREATED",
  "orderId": "123456",
  "data": { ... }
}
```

**Comando PowerShell (test):**
```powershell
curl.exe -X POST https://ivan-reseller-web-production.up.railway.app/api/webhooks/ebay `
  -H "Content-Type: application/json" `
  -H "X-Ebay-Signature: SIGNATURE_HERE" `
  -d '{\"eventType\":\"ORDER_CREATED\",\"orderId\":\"123456\"}'
```

---

### POST /api/webhooks/mercadolibre
**Descripci�n:** Webhook de MercadoLibre  
**Auth:** Firma HMAC  
**Rate Limit:** No aplica

---

### POST /api/webhooks/amazon
**Descripci�n:** Webhook de Amazon  
**Auth:** Firma HMAC  
**Rate Limit:** No aplica

---

## 8. Admin

### GET /api/admin/users
**Descripci�n:** Dashboard de usuarios (solo ADMIN)  
**Auth:** Requerida (ADMIN)  
**Rate Limit:** 1000 req/15min (ADMIN)

**Response 200:**
```json
{
  "success": true,
  "users": [...],
  "stats": {
    "total": 100,
    "active": 80,
    "inactive": 20
  }
}
```

---

### POST /api/admin/users
**Descripci�n:** Crear usuario (solo ADMIN)  
**Auth:** Requerida (ADMIN)  
**Rate Limit:** 1000 req/15min

**Request:**
```json
{
  "username": "newuser",
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "role": "USER",
  "commissionRate": 0.1
}
```

---

### PUT /api/admin/users/:id
**Descripci�n:** Actualizar usuario (solo ADMIN)  
**Auth:** Requerida (ADMIN)  
**Rate Limit:** 1000 req/15min

---

### DELETE /api/admin/users/:id
**Descripci�n:** Eliminar usuario (solo ADMIN)  
**Auth:** Requerida (ADMIN)  
**Rate Limit:** 1000 req/15min

---

## 9. Reports

### GET /api/reports/sales
**Descripci�n:** Reporte de ventas  
**Auth:** Requerida  
**Rate Limit:** 200 req/15min

**Query Params:**
- `format` (string: 'json', 'excel', 'pdf', 'html', default: 'json')
- `startDate` (ISO date)
- `endDate` (ISO date)
- `userId` (number, opcional)
- `marketplace` (string, opcional)

**Response (JSON):**
```json
{
  "success": true,
  "data": {
    "sales": [...],
    "summary": {
      "totalSales": 10000,
      "totalRevenue": 50000,
      "totalCommissions": 5000
    }
  }
}
```

**Response (Excel/PDF/HTML):**
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (Excel)
- Content-Type: `application/pdf` (PDF)
- Content-Type: `text/html` (HTML)

---

### GET /api/reports/products
**Descripci�n:** Reporte de productos  
**Auth:** Requerida  
**Rate Limit:** 200 req/15min

---

### GET /api/reports/executive
**Descripci�n:** Reporte ejecutivo (solo ADMIN)  
**Auth:** Requerida (ADMIN)  
**Rate Limit:** 200 req/15min

---

## 10. System

### GET /api/system/health/detailed
**Descripci�n:** Health check detallado (DB, Scraper)  
**Auth:** Requerida  
**Rate Limit:** 200 req/15min

**Response 200:**
```json
{
  "success": true,
  "data": {
    "checks": {
      "db": true,
      "scraper": true,
      "time": "2025-12-18T10:00:00.000Z"
    },
    "mode": "production"
  }
}
```

---

### POST /api/system/refresh-api-cache
**Descripci�n:** Refrescar cache de APIs (solo ADMIN)  
**Auth:** Requerida (ADMIN)  
**Rate Limit:** 1000 req/15min

**Request:**
```json
{
  "api": "ebay" // opcional, si no se especifica refresca todas
}
```

---

## Autenticaci�n

### M�todo 1: Bearer Token (Header)
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### M�todo 2: Cookie (httpOnly)
- Cookie `token` se env�a autom�ticamente si el request viene del mismo dominio o con `credentials: 'include'`

---

## Rate Limiting

**L�mites por defecto:**
- **Usuario normal:** 200 requests por 15 minutos
- **Admin:** 1000 requests por 15 minutos
- **Login:** 5 intentos por 15 minutos (por IP)

**Headers de respuesta:**
- `X-RateLimit-Limit` - L�mite total
- `X-RateLimit-Remaining` - Requests restantes
- `X-RateLimit-Reset` - Timestamp de reset

**Response 429 (Too Many Requests):**
```json
{
  "success": false,
  "error": "Too many requests, please try again later",
  "retryAfter": 900
}
```

---

## Errores Comunes

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Forbidden",
  "message": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Not Found",
  "message": "Route not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal Server Error",
  "message": "An unexpected error occurred"
}
```

---

## Swagger UI

**URL:** `https://ivan-reseller-web-production.up.railway.app/api-docs`  
**Disponible:** Solo en desarrollo o si `ENABLE_SWAGGER=true`

---

**�ltima revisi�n:** 2025-12-18  
**Mantenido por:** Backend Team

# ?? API Reference - Ivan Reseller

**Versión:** 1.0.0  
**Última actualización:** 2025-01-23

---

## ?? Índice

1. [Autenticación](#autenticación)
2. [Productos](#productos)
3. [Oportunidades](#oportunidades)
4. [Marketplaces](#marketplaces)
5. [Ventas](#ventas)
6. [Dashboard](#dashboard)
7. [Admin](#admin)

---

## ?? Autenticación

### POST /api/auth/login

**Descripción:** Iniciar sesión

**Request:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@ivanreseller.com",
    "role": "ADMIN"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "..."
}
```

**Códigos de error:**
- `400` - Campos faltantes
- `401` - Credenciales inválidas
- `429` - Rate limit excedido

**Evidencia:** `backend/src/api/routes/auth.routes.ts:38`

---

### GET /api/auth/me

**Descripción:** Obtener usuario actual

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@ivanreseller.com",
    "role": "ADMIN"
  }
}
```

**Evidencia:** `backend/src/api/routes/auth.routes.ts:281`

---

## ??? Productos

### GET /api/products

**Descripción:** Listar productos

**Query params:**
- `status` - PENDING, APPROVED, REJECTED, PUBLISHED, INACTIVE
- `limit` - Límite de resultados (default: 20)
- `offset` - Offset para paginación

**Response (200):**
```json
{
  "success": true,
  "products": [...],
  "total": 100
}
```

**Evidencia:** `backend/src/api/routes/products.routes.ts:47`

---

### POST /api/products

**Descripción:** Crear producto

**Request:**
```json
{
  "title": "Product Title",
  "aliexpressUrl": "https://...",
  "aliexpressPrice": 10.99,
  "suggestedPrice": 29.99,
  "description": "Product description",
  "category": "Electronics"
}
```

**Response (201):**
```json
{
  "success": true,
  "product": {
    "id": 1,
    "title": "Product Title",
    "status": "PENDING",
    ...
  }
}
```

**Evidencia:** `backend/src/api/routes/products.routes.ts:242`

---

## ?? Oportunidades

### GET /api/opportunities

**Descripción:** Buscar oportunidades

**Query params:**
- `query` - Término de búsqueda
- `maxItems` - Máximo resultados (1-10)
- `marketplaces` - CSV: `ebay,amazon,mercadolibre`
- `region` - `us,uk,mx,de,es,br`

**Response (200):**
```json
{
  "success": true,
  "opportunities": [
    {
      "title": "Product Title",
      "costUsd": 10.99,
      "suggestedPriceUsd": 29.99,
      "profitMargin": 63.3,
      "roiPercentage": 172.7,
      "confidenceScore": 85.5
    }
  ]
}
```

**Evidencia:** `backend/src/api/routes/opportunities.routes.ts:26`

---

## ?? Marketplaces

### POST /api/marketplace/publish

**Descripción:** Publicar producto en marketplace

**Request:**
```json
{
  "productId": 1,
  "marketplace": "ebay",
  "price": 29.99
}
```

**Response (200):**
```json
{
  "success": true,
  "listing": {
    "listingId": "123456",
    "listingUrl": "https://...",
    "marketplace": "ebay"
  }
}
```

**Evidencia:** `backend/src/api/routes/marketplace.routes.ts:146`

---

## ?? Ventas

### GET /api/sales

**Descripción:** Listar ventas

**Query params:**
- `status` - PENDING, PROCESSING, SHIPPED, DELIVERED
- `marketplace` - ebay, mercadolibre, amazon
- `limit` - Límite de resultados

**Response (200):**
```json
{
  "success": true,
  "sales": [...],
  "total": 50
}
```

**Evidencia:** `backend/src/api/routes/sales.routes.ts:29`

---

## ?? Dashboard

### GET /api/dashboard/stats

**Descripción:** Estadísticas del dashboard

**Response (200):**
```json
{
  "success": true,
  "stats": {
    "totalProducts": 100,
    "totalSales": 50,
    "totalRevenue": 5000,
    "pendingCommissions": 500
  }
}
```

**Evidencia:** `backend/src/api/routes/dashboard.routes.ts:24`

---

## ?? Admin

### GET /api/admin/users

**Descripción:** Listar todos los usuarios (solo ADMIN)

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "users": [...]
}
```

**Evidencia:** `backend/src/api/routes/admin.routes.ts:29`

---

**Nota:** Esta es una referencia parcial. El sistema tiene ~237 endpoints. Ver código fuente para lista completa.

**Próximos pasos:** Ver [Base de Datos](./11_database.md) para esquema completo.

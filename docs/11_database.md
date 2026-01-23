# ??? Base de Datos - Ivan Reseller

**Versión:** 1.0.0  
**Última actualización:** 2025-01-23

---

## ?? Índice

1. [ERD Textual](#erd-textual)
2. [Tablas Principales](#tablas-principales)
3. [Relaciones](#relaciones)
4. [Migraciones](#migraciones)

---

## ??? ERD Textual

### Entidades Principales

```
User (users)
??? id (PK)
??? username (UNIQUE)
??? email (UNIQUE)
??? password
??? role (ADMIN/USER)
??? commissionRate
??? fixedMonthlyCost
??? balance
??? totalEarnings
??? ...

Product (products)
??? id (PK)
??? userId (FK ? User)
??? aliexpressUrl
??? title
??? aliexpressPrice
??? suggestedPrice
??? currency
??? status (PENDING/APPROVED/REJECTED/PUBLISHED/INACTIVE)
??? ...

Sale (sales)
??? id (PK)
??? userId (FK ? User)
??? productId (FK ? Product)
??? orderId (UNIQUE)
??? marketplace
??? salePrice
??? status (PENDING/PROCESSING/SHIPPED/DELIVERED/CANCELLED)
??? ...

Commission (commissions)
??? id (PK)
??? userId (FK ? User)
??? saleId (FK ? Sale, UNIQUE)
??? amount
??? status (PENDING/SCHEDULED/PAID/FAILED)
??? ...

Opportunity (opportunities)
??? id (PK)
??? userId (FK ? User)
??? title
??? costUsd
??? suggestedPriceUsd
??? profitMargin
??? confidenceScore
??? ...

ApiCredential (api_credentials)
??? id (PK)
??? userId (FK ? User)
??? apiName
??? environment (sandbox/production)
??? credentials (encrypted)
??? scope (user/global)
??? ...

MarketplaceListing (marketplace_listings)
??? id (PK)
??? productId (FK ? Product)
??? userId (FK ? User)
??? marketplace
??? listingId (UNIQUE con marketplace)
??? ...

PurchaseLog (purchase_logs)
??? id (PK)
??? userId (FK ? User)
??? saleId (FK ? Sale, nullable)
??? productId (FK ? Product, nullable)
??? supplierUrl
??? purchaseAmount
??? status (PENDING/SUCCESS/FAILED/CANCELLED)
??? ...
```

**Evidencia:** `backend/prisma/schema.prisma`

---

## ?? Tablas Principales

### User

**Tabla:** `users`

**Campos clave:**
- `id` - INT PRIMARY KEY
- `username` - VARCHAR UNIQUE
- `email` - VARCHAR UNIQUE
- `password` - VARCHAR (bcrypt hashed)
- `role` - VARCHAR (ADMIN/USER)
- `commissionRate` - DECIMAL(6,4) (default: 0.20)
- `fixedMonthlyCost` - DECIMAL(18,2) (default: 0.00)
- `balance` - DECIMAL(18,2)
- `totalEarnings` - DECIMAL(18,2)
- `isActive` - BOOLEAN (default: true)

**Índices:**
- `email`
- `username`
- `role, isActive`
- `createdAt`

**Evidencia:** `backend/prisma/schema.prisma:15-68`

---

### Product

**Tabla:** `products`

**Campos clave:**
- `id` - INT PRIMARY KEY
- `userId` - INT FK ? User
- `aliexpressUrl` - VARCHAR
- `title` - VARCHAR
- `aliexpressPrice` - DECIMAL(18,2)
- `suggestedPrice` - DECIMAL(18,2)
- `currency` - VARCHAR (default: USD)
- `shippingCost` - DECIMAL(18,2) nullable
- `importTax` - DECIMAL(18,2) nullable
- `totalCost` - DECIMAL(18,2) nullable
- `status` - VARCHAR (PENDING/APPROVED/REJECTED/PUBLISHED/INACTIVE)
- `isPublished` - BOOLEAN (default: false)

**Índices:**
- `userId, status`
- `status, isPublished`
- `createdAt`

**Evidencia:** `backend/prisma/schema.prisma:98-134`

---

### Sale

**Tabla:** `sales`

**Campos clave:**
- `id` - INT PRIMARY KEY
- `userId` - INT FK ? User
- `productId` - INT FK ? Product
- `orderId` - VARCHAR UNIQUE
- `marketplace` - VARCHAR
- `salePrice` - DECIMAL(18,2)
- `aliexpressCost` - DECIMAL(18,2)
- `marketplaceFee` - DECIMAL(18,2)
- `grossProfit` - DECIMAL(18,2)
- `commissionAmount` - DECIMAL(18,2)
- `netProfit` - DECIMAL(18,2)
- `currency` - VARCHAR (default: USD)
- `status` - VARCHAR (PENDING/PROCESSING/SHIPPED/DELIVERED/CANCELLED/RETURNED)
- `trackingNumber` - VARCHAR nullable
- `buyerEmail` - VARCHAR nullable
- `buyerName` - VARCHAR nullable
- `shippingAddress` - VARCHAR nullable

**Índices:**
- `userId, status`
- `marketplace, status`
- `createdAt`
- `orderId`

**Evidencia:** `backend/prisma/schema.prisma:136-175`

---

### Commission

**Tabla:** `commissions`

**Campos clave:**
- `id` - INT PRIMARY KEY
- `userId` - INT FK ? User
- `saleId` - INT FK ? Sale UNIQUE
- `amount` - DECIMAL(18,2)
- `currency` - VARCHAR (default: USD)
- `status` - VARCHAR (PENDING/SCHEDULED/PAID/FAILED)
- `scheduledAt` - TIMESTAMP nullable
- `paidAt` - TIMESTAMP nullable

**Índices:**
- `userId, createdAt`
- `userId, status`
- `status, createdAt`

**Evidencia:** `backend/prisma/schema.prisma:177-198`

---

### Opportunity

**Tabla:** `opportunities`

**Campos clave:**
- `id` - INT PRIMARY KEY
- `userId` - INT FK ? User
- `title` - VARCHAR
- `costUsd` - DECIMAL(18,2)
- `shippingCost` - DECIMAL(18,2) nullable
- `importTax` - DECIMAL(18,2) nullable
- `totalCost` - DECIMAL(18,2) nullable
- `suggestedPriceUsd` - DECIMAL(18,2)
- `profitMargin` - DECIMAL(18,2)
- `roiPercentage` - DECIMAL(18,2)
- `confidenceScore` - DECIMAL(5,2)
- `status` - VARCHAR (PENDING/APPROVED/REJECTED/PUBLISHED)

**Índices:**
- `userId, status`
- `status, createdAt`
- `confidenceScore`

**Evidencia:** `backend/prisma/schema.prisma:359-391`

---

### ApiCredential

**Tabla:** `api_credentials`

**Campos clave:**
- `id` - INT PRIMARY KEY
- `userId` - INT FK ? User
- `apiName` - VARCHAR
- `environment` - VARCHAR (sandbox/production)
- `credentials` - VARCHAR (encrypted JSON)
- `isActive` - BOOLEAN (default: true)
- `scope` - ENUM (user/global)
- `sharedById` - INT FK ? User nullable

**Índices:**
- `userId, apiName, environment` (UNIQUE)
- `apiName, environment, isActive`
- `scope, isActive`

**Evidencia:** `backend/prisma/schema.prisma:70-91`

---

## ?? Relaciones

### User ? Product (1:N)
- Un usuario puede tener múltiples productos
- `Product.userId` ? `User.id`

### User ? Sale (1:N)
- Un usuario puede tener múltiples ventas
- `Sale.userId` ? `User.id`

### Product ? Sale (1:N)
- Un producto puede tener múltiples ventas
- `Sale.productId` ? `Product.id`

### Sale ? Commission (1:1)
- Una venta tiene una comisión
- `Commission.saleId` ? `Sale.id` (UNIQUE)

### User ? Opportunity (1:N)
- Un usuario puede tener múltiples oportunidades
- `Opportunity.userId` ? `User.id`

### Product ? MarketplaceListing (1:N)
- Un producto puede estar en múltiples marketplaces
- `MarketplaceListing.productId` ? `Product.id`

**Evidencia:** `backend/prisma/schema.prisma` (relaciones definidas con `@relation`)

---

## ?? Migraciones

### Migraciones Principales

**Ubicación:** `backend/prisma/migrations/`

**Migraciones importantes:**
1. `20251104_init_postgresql` - Migración inicial
2. `20251107_add_ai_suggestions` - Tabla AISuggestion
3. `20251108_add_manual_auth_sessions` - Tabla ManualAuthSession
4. `20251108_add_marketplace_auth_status` - Tabla MarketplaceAuthStatus
5. `20250127120000_add_autopilot_workflows` - Tabla AutopilotWorkflow
6. `20250127130000_add_meeting_room` - Tabla MeetingRoom
7. `20250128000000_add_purchase_log_and_sale_buyer_fields` - PurchaseLog y campos buyer
8. `20250128000000_add_shipping_tax_total_cost` - Campos de costos adicionales

**Evidencia:** `backend/prisma/migrations/`

### Ejecutar Migraciones

```bash
# Desarrollo
npx prisma migrate dev

# Producción
npx prisma migrate deploy
```

**Evidencia:** `backend/package.json:11-12`

---

**Próximos pasos:** Ver [Seguridad](./12_seguridad.md) para análisis de riesgos.

# FASE 1 ? Auditoría de consistencia Frontend / Backend / DB

Verificación realizada sin modificar arquitectura ni lógica funcional. Todo basado en código y schema reales.

---

## Frontend

### API base y endpoints

| Requerido | Verificado | Ubicación |
|-----------|------------|-----------|
| API base URL correcta | OK | `frontend/src/config/runtime.ts`: getApiBaseUrl(); producción = `/api` |
| /api/products | OK | products.api.ts, Products.tsx, Opportunities.tsx, etc. |
| /api/paypal/create-order | OK | orders.api.ts ? createPayPalOrder() |
| /api/paypal/capture-order | OK | orders.api.ts ? capturePayPalOrder() |
| /api/products/:id/status | OK | products.api.ts patchStatus(); Products.tsx PATCH con status APPROVED/REJECTED/PUBLISHED |
| /api/marketplace/auth-url/aliexpress-dropshipping | OK | APISettings.tsx: GET `/api/marketplace/auth-url/${apiName}` |

### Auth y checkout

- **Checkout requiere auth:** Backend `POST /api/paypal/capture-order` usa middleware `authenticate`; frontend envía requests con `api` (axios) que incluye Bearer token vía interceptor (localStorage `auth_token` o store).
- **userId:** Backend en capture-order hace `const userId = req.user?.userId` y lo guarda en `Order.userId`; no se envía en body desde frontend (se deriva del token).
- **Token Bearer:** api.interceptors.request usa `Authorization: Bearer ${token}` cuando hay token.
- **OAuth:** Flujo en APISettings; auth-url desde backend; callback /api/marketplace-oauth/callback.

---

## Backend

### Rutas montadas (app.ts)

| Ruta | Estado |
|------|--------|
| /api/products | OK productRoutes |
| /api/paypal | OK paypalRoutes |
| /api/orders | OK ordersRoutes |
| /api/marketplace | OK marketplaceRoutes |
| /api/marketplace-oauth | OK marketplaceOauthRoutes |
| /api/aliexpress | OK aliExpressRoutes (módulo) |
| /api/sales | OK saleRoutes |

### Servicios verificados

| Servicio | Uso en ciclo |
|----------|----------------|
| trends.service.ts | GET /api/trends/keywords; ciclo test-full-cycle-search-to-publish |
| opportunity-finder.service.ts | Descubrimiento de oportunidades; ciclo interno |
| product.service.ts | Crear/actualizar productos (POST/PUT /api/products) |
| order-fulfillment.service.ts | fulfillOrder(orderId); working-capital + purchaseRetry.attemptPurchase(..., order.userId) |
| aliexpress-auto-purchase.service.ts | executePurchase(request, userId); Dropshipping API primero, Puppeteer fallback |
| sale.service.ts | createSale, createSaleFromOrder; sendPayout (admin + user) |
| working-capital.service.ts | hasSufficientFreeCapital (degraded mode si balance no disponible) |
| balance-verification.service.ts | hasSufficientBalanceForPayout (degraded mode si balance no disponible) |

### executePurchase y Dropshipping API

- **executePurchase(request, userId):** Definido en `aliexpress-auto-purchase.service.ts`. Si `userId` y existen credenciales `aliexpress-dropshipping` con accessToken, usa `aliexpressDropshippingAPIService.placeOrder(...)`. No usa Puppeteer en ese camino; Puppeteer solo como fallback cuando API falla o no hay credenciales.

---

## Database (Prisma schema)

### Modelos

- **User:** id, username, email, role, etc. Relaciones: products, sales, orders, apiCredentials, etc.
- **Product:** id, userId, aliexpressUrl, title, status (PENDING|APPROVED|REJECTED|PUBLISHED|INACTIVE), isPublished, etc. Relación: user.
- **Order:** id (cuid), userId (opcional), productId, status (CREATED|PAID|PURCHASING|PURCHASED|FAILED), paypalOrderId, aliexpressOrderId, etc. Relación: user.
- **Sale:** id, userId, productId, orderId (String, unique), marketplace, salePrice, aliexpressCost, grossProfit, netProfit, adminPayoutId, userPayoutId, status, etc. Relaciones: user, product.
- **ApiCredential:** id, userId, apiName, environment, credentials (JSON encriptado), isActive. Relación: user.

### Relaciones e integridad

- Product.userId ? User.id (onDelete: Cascade).
- Order.userId ? User.id (onDelete: SetNull).
- Sale.orderId (String) referencia Order.id; Sale.productId ? Product.id; Sale.userId ? User.id (onDelete: Cascade).
- api_credentials.userId ? User.id (onDelete: Cascade).

Integridad referencial completa según schema.

---

## Cómo ejecutar FASE 2 (OAuth DB)

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/verify-oauth-db.ts
```

O en DB:

```sql
SELECT * FROM api_credentials WHERE "apiName" = 'aliexpress-dropshipping' AND "isActive" = true;
```

Comprobar que en credentials (desencriptado) haya accessToken y que no esté expirado (environment=production recomendado).

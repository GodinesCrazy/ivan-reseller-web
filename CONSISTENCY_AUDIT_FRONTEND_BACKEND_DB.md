# FASE 1 ? AUDITORÍA DE CONSISTENCIA FRONTEND / BACKEND / DB

## Frontend

### API base URL
- **Origen:** `frontend/src/config/runtime.ts` ? `getApiBaseUrl()`.
- **Producción:** `/api` (proxy Vercel, same-origin).
- **Desarrollo:** `VITE_API_URL` o fallback `http://localhost:4000`.
- **Uso:** `frontend/src/services/api.ts` ? `axios.create({ baseURL: API_BASE_URL, withCredentials: true })`.
- **Estado:** OK.

### Endpoints usados
| Endpoint | Uso en frontend | Estado |
|----------|------------------|--------|
| `/api/products` | GET (Products, Opportunities), POST (create), PATCH `/:id/status` (Products.tsx, products.api.ts) | OK |
| `/api/paypal/create-order` | POST (orders.api.ts) | OK |
| `/api/paypal/capture-order` | POST (orders.api.ts) | OK |
| `/api/products/:id/status` | PATCH con `{ status: 'PUBLISHED' \| 'APPROVED' \| 'REJECTED' }` (Products.tsx, products.api.ts) | OK |
| `/api/marketplace/auth-url/:apiName` | GET (APISettings: auth-url/${apiName}, incl. aliexpress-dropshipping) | OK |

### Checkout y auth
- **create-order:** Backend `POST /api/paypal/create-order` **no** usa `authenticate` (permite crear orden sin login).
- **capture-order:** Backend `POST /api/paypal/capture-order` usa **authenticate**; usa `req.user.userId` y lo guarda en `Order.userId`.
- **Frontend:** `orders.api.ts` usa el mismo `api` (axios) que envía Bearer token vía interceptor desde `localStorage.auth_token` o store; con `withCredentials: true` para cookies.
- **Conclusión:** Checkout de pago requiere auth en capture; userId se transmite correctamente; token Bearer y cookies soportados. OK.

### OAuth
- Frontend: GET `/api/marketplace/auth-url/${apiName}` (apiName incl. `aliexpress-dropshipping`), abre popup, escucha `postMessage` (oauth_success/oauth_error).
- Backend: GET `/api/marketplace/auth-url/:marketplace` en marketplace.routes; callback en marketplace-oauth.routes (`/api/marketplace-oauth/callback`).
- Estado: OK.

---

## Backend

### Rutas montadas (app.ts)
| Ruta | Router | Estado |
|------|--------|--------|
| `/api/products` | productRoutes | OK |
| `/api/paypal` | paypalRoutes | OK |
| `/api/orders` | ordersRoutes | OK |
| `/api/marketplace` | marketplaceRoutes (auth-url bajo GET /auth-url/:marketplace) | OK |
| `/api/marketplace-oauth` | marketplaceOauthRoutes | OK |
| `/api/aliexpress` | aliExpressRoutes | OK |
| `/api/sales` | saleRoutes | OK |

### Servicios verificados
| Servicio | Ubicación | Estado |
|----------|-----------|--------|
| trends.service.ts | backend/src/services/trends.service.ts | OK |
| opportunity-finder.service.ts | backend/src/services/opportunity-finder.service.ts | OK |
| product.service.ts | backend/src/services/product.service.ts | OK |
| order-fulfillment.service.ts | backend/src/services/order-fulfillment.service.ts | OK |
| aliexpress-auto-purchase.service.ts | backend/src/services/aliexpress-auto-purchase.service.ts | OK |
| sale.service.ts | backend/src/services/sale.service.ts | OK |
| working-capital.service.ts | backend/src/services/working-capital.service.ts | OK |
| balance-verification.service.ts | backend/src/services/balance-verification.service.ts | OK |

### executePurchase y Dropshipping API
- **aliexpress-auto-purchase.service.ts:**  
  - Si `userId` está presente, obtiene credenciales con `CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', env)`.  
  - Si existe `creds.accessToken`, usa **aliexpressDropshippingAPIService.placeOrder()** y **no** usa Puppeteer en el camino de éxito.  
  - Puppeteer solo se usa como fallback cuando no hay OAuth o falla la API (y no es ACCESS_TOKEN_EXPIRED).  
- **Conclusión:** executePurchase(request, userId) usa Dropshipping API cuando hay OAuth; no usa Puppeteer en ese caso. OK.

---

## Database

### Schema (Prisma)
| Modelo | Tabla | Relaciones relevantes | Estado |
|--------|--------|------------------------|--------|
| User | users | orders, sales, apiCredentials, products | OK |
| Product | products | userId, sales | OK |
| Order | orders | userId (Int?), aliexpressOrderId, status | OK |
| Sale | sales | userId, productId, orderId (String, unique), grossProfit, netProfit | OK |
| ApiCredential | api_credentials | userId, apiName, credentials | OK |

### Integridad referencial
- **Product.userId** ? User.id (onDelete: Cascade). OK.
- **Order.userId** ? User.id (onDelete: SetNull). OK.
- **Sale.userId** ? User.id, **Sale.productId** ? Product.id, **Sale.orderId** (String) vincula a Order.id en lógica (createSaleFromOrder usa order.id). OK.
- **api_credentials.userId** ? User.id (onDelete: Cascade). OK.

---

## Resumen Fase 1

- **Frontend:** API base correcta; endpoints /api/products, /api/paypal/create-order, /api/paypal/capture-order, /api/products/:id/status, /api/marketplace/auth-url/aliexpress-dropshipping usados correctamente; checkout con auth en capture; userId y token Bearer correctos; OAuth operativo.
- **Backend:** Rutas y servicios listados presentes; executePurchase usa Dropshipping API cuando hay OAuth y no usa Puppeteer en ese flujo.
- **Database:** User, Product, Order, Sale, api_credentials con relaciones e integridad referencial correctas.

**CONSISTENCY STATUS: OK**

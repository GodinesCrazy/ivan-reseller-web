# FASE 3 ? VALIDACIÓN FRONTEND ? BACKEND

**Auditoría Ivan Reseller ? Alineación y correcciones**

---

## 1. ENDPOINTS USADOS POR FRONTEND QUE NO EXISTEN O DIFIEREN

| Frontend (llamada) | Backend (real) | Acción |
|--------------------|----------------|--------|
| POST `/auth/login`, GET `/auth/me`, etc. | Rutas bajo `/api/auth/*` (app.use('/api/auth', authRoutes)) | **Corregir:** En desarrollo con baseURL=`http://localhost:4000` la URL final es `http://localhost:4000/auth/login` ? 404. Usar en auth.api.ts paths `/api/auth/login`, `/api/auth/me`, etc. En producción con baseURL=`/api` el interceptor quita `/api/` del path, por tanto path debe ser `/api/auth/login` para que final sea `/api/auth/login`. **Solución:** usar siempre `/api/auth/*` en auth.api.ts. |
| POST `/api/products/scrape` (products.api.ts) | No existe. Scrape vía POST /api/publisher/add_for_approval (body: aliexpressUrl, scrape: true) o jobs | **Opciones:** (A) A?adir POST /api/products/scrape en backend que delegue a scraping y creación de producto, o (B) Cambiar frontend para usar add_for_approval cuando la fuente sea URL de AliExpress. |
| GET `/api/ai-suggestions/keywords` (AISuggestionsPanel) | No existe en ai-suggestions.routes.ts | A?adir GET /api/ai-suggestions/keywords en backend o dejar de llamarlo en frontend y usar solo GET /api/ai-suggestions. |
| fetch('/api/dashboard') (RealOpportunityDashboard) | Backend tiene /api/dashboard/stats, /api/dashboard/recent-activity, etc., no GET /api/dashboard | Cambiar frontend a GET /api/dashboard/stats (o summary) o a?adir GET /api/dashboard en backend que devuelva resumen. |

---

## 2. ENDPOINTS QUE EXISTEN PERO EL FRONTEND NO USA (O USA MAL)

| Backend | Uso frontend | Nota |
|---------|--------------|------|
| GET /api/dashboard/summary | Dashboard usa /stats y /recent-activity | summary disponible para posible consolidación. |
| PUT /api/credentials/:apiName/toggle | Frontend usa PUT /api/credentials/:apiName/toggle (APISettings) | Coincide (api-credentials.routes tiene put('/:apiName/toggle')). |
| POST /api/auth/change-password | Frontend Settings llama POST /api/users/:id/password | Verificar: si users.routes tiene POST /:id/password; si no, frontend debe usar POST /api/auth/change-password. |

---

## 3. DATOS QUE EL FRONTEND ESPERA Y EL BACKEND ENVÍA

### Dashboard stats
- **Frontend (Dashboard.tsx):** totalSales, totalProfit, platformCommissionPaid, activeProducts, totalOpportunities, aiSuggestions, automationRules.
- **Backend (dashboard.routes /stats):** products (total, pending, approved, published, rejected), sales (totalSales, pendingSales, completedSales, etc., totalRevenue, totalCommissions), commissions (totalEarned, pendingPayout, etc.).
- **Alineación:** El frontend debe mapear la respuesta del backend (products, sales, commissions) a totalSales, totalProfit, etc. Verificar que Dashboard.tsx hace este mapeo correctamente (getStats en dashboard.api devuelve DashboardStats; backend devuelve objeto con products, sales, commissions). Si dashboard.api.getStats() espera campos planos, hay que normalizar en frontend o que backend devuelva también un summary con esos nombres.

### Orders
- **Frontend (orders.api):** Order con id, productId, title, price, currency, customerName, customerEmail, shippingAddress, status, paypalOrderId, aliexpressOrderId, etc.
- **Backend (orders.routes):** Lista y por id. Verificar que el modelo Order en backend devuelve los mismos campos.

---

## 4. CAMPOS INCONSISTENTES / NOMBRES INCORRECTOS

- **serpapi vs googletrends:** Backend mapea serpapi ? googletrends para el frontend (api-credentials.routes). OK.
- **Auth:** Paths sin /api en auth.api.ts provocan 404 en desarrollo. Ver sección 1.

---

## 5. CORRECCIONES APLICADAS EN ESTA FASE

1. **Auth paths (Fase 9):** Cambiar auth.api.ts para usar `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`, `/api/auth/me` para que funcionen con baseURL sin /api (dev) y con baseURL=/api (prod). Pendiente de aplicar en Fase 9.
2. **POST /api/products/scrape:** Pendiente: implementar en backend o sustituir en frontend por publisher add_for_approval.
3. **GET /api/ai-suggestions/keywords:** Pendiente: implementar en backend o eliminar llamada en AISuggestionsPanel.
4. **RealOpportunityDashboard fetch('/api/dashboard'):** Pendiente: usar GET /api/dashboard/stats o GET /api/dashboard/summary.

---

## 6. RESUMEN

| Tipo | Cantidad |
|------|----------|
| Endpoints frontend que fallan o no coinciden | 4 (auth paths, products/scrape, ai-suggestions/keywords, /api/dashboard) |
| Correcciones recomendadas | 4 |
| Campos/datos a verificar en uso real | Dashboard stats mapping, Order shape |

---

*Siguiente: Fase 4 (ciclo dropshipping), Fase 9 (aplicar correcciones automáticas).*

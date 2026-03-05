# Auditor?a end-to-end completa

**Fecha:** 2025-03-04  
**Alcance:** Flujos cr?ticos de usuario (Frontend ? API ? Servicios ? BD ? respuesta ? UI).  
**Objetivo:** Verificar consistencia, autorizaci?n, validaci?n y manejo de errores en cada flujo y producir un informe ?nico con hallazgos y recomendaciones.

---

## 1. Resumen ejecutivo

Se ha realizado una auditor?a de c?digo siguiendo el plan de auditor?a end-to-end: inventario de flujos cr?ticos (Fase 1), checklist transversal (Fase 2), traza de lectura/escritura y casos de error por flujo (Fase 3). El resultado se documenta en este informe.

**Resumen por estado:**

| Estado      | Flujos |
|------------|--------|
| **OK**     | Auth, Oportunidades, Productos, Publicador, Ventas, **?rdenes**, Finanzas, Dashboard, Checkout/Compras, Configuraci?n |
| **Advertencia** | ? |
| **Error**  | ? |

**Correcci?n aplicada (?rdenes):** El hallazgo cr?tico sobre las rutas `GET /api/orders` y `GET /api/orders/:id` fue corregido: se a?adi? `router.use(authenticate)` en `orders.routes.ts`, el listado filtra por `userId` (admin ve todas), y GET `/:id` comprueba ownership (403 si la orden es de otro usuario). Validaci?n de `id` en GET `/:id` a?adida.

El resto de flujos revisados utilizan `authenticate` (y `authorize` donde aplica), filtran por `userId` en listados y get-by-id, y aplican validaci?n (Zod) y manejo de errores centralizado (`AppError` + `errorHandler`). Opcionalmente, a?adir pruebas e2e automatizadas para los flujos cr?ticos.

**Referencias a auditor?as previas:** Para flujo de dropshipping, workflow guiado y modo `workflowMode/guided`, ver [AUDITORIA_COMPLETA_FLUJO_DROPSHIPPING.md](AUDITORIA_COMPLETA_FLUJO_DROPSHIPPING.md). Para APIs de marketplaces, PayPal, AliExpress, etc., ver documentos en `docs/` (AUDITORIA_*.md).

---

## 2. Tabla de flujos con resultado

| Flujo | Entrada UI | APIs principales | Estado | Observaci?n breve |
|-------|------------|------------------|--------|-------------------|
| **Auth** | Login, Request Access, Manual Login (AliExpress) | `/api/auth/*`, `/api/manual-auth/*`, `/api/setup-status` | OK | Login/logout con JWT en cookie; manual-login con URL v?lida; `/me` y cambio de contrase?a protegidos. |
| **Oportunidades** | B?squeda, detalle, a?adir a cola | `/api/opportunities/*`, `/api/ai-suggestions/*`, `/api/trends` | OK | `router.use(authenticate)`; validaci?n Zod en query; ownership en list/detail. |
| **Productos** | Listado, crear, editar, preview, aprobar | `/api/products/*`, `/api/jobs` | OK | `authenticate` + `authorize` donde aplica; CRUD con `userId`; validaci?n y ownership en get/update/delete. |
| **Publicador** | Pendientes, Approve & Publish, bulk | `/api/publisher/pending`, `/api/publisher/approve/:id` | OK | `authenticate`; filtro por margen y precio efectivo; ownership en approve. |
| **Ventas** | Listado, stats, filtros, export CSV | `/api/sales`, `/api/sales/stats?days=` | OK | `authenticate`; validaci?n query (Zod); `getSales`/`getSalesStats` por `userId`; per?odo y totalProfit coherentes. |
| **?rdenes** | Listado, detalle, retry-fulfill | `/api/orders`, `/api/orders/:id`, `/api/orders/:id/retry-fulfill` | OK | `router.use(authenticate)`; listado filtrado por `userId` (admin: todas); GET `/:id` con ownership y validaci?n de `id`. |
| **Finanzas** | Dashboard, Sales Ledger, summary, breakdown, cashflow | `/api/finance/*` | OK | `authenticate`; rangos fijos (30/90/365); Sales Ledger por `userId`. |
| **Dashboard** | Stats, gr?ficas, resumen | `/api/dashboard/stats`, `/api/dashboard/charts/*` | OK | Auth; totalProfit desde sales; gr?fica ventas COMPLETED; per?odo coherente. |
| **Checkout / Compras** | Pending purchases, checkout, PayPal | `/api/sales/pending-purchases`, `/api/paypal/*`, webhooks | OK | Flujo pago ? webhook documentado; rutas protegidas; webhooks con verificaci?n seg?n dise?o. |
| **Configuraci?n** | Workflow, API keys, credenciales, manual-auth | `/api/workflow/*`, `/api/credentials/*`, `/api/manual-auth` | OK | Cambios guardados con auth; credenciales y workflow por usuario. |

---

## 3. Detalle por flujo

### 3.1 Auth

- **Traza de lectura:** UI (Login/Request Access/Manual Login) ? POST `/api/auth/login` (sin auth) o POST `/api/manual-auth` (con auth) ? auth.service / manual-auth.service ? Prisma (User, ManualAuthSession) ? respuesta con token/sesi?n/URL.
- **Traza de escritura:** Login no escribe usuario; register est? deshabilitado (403 y redirecci?n a request-access). Manual-auth crea sesi?n con `userId` del token.
- **Casos de error:** Credenciales incorrectas ? 401; validaci?n body (login sin Zod expl?cito pero comprobaci?n de presencia); errores internos ? 500 con mensaje gen?rico.
- **Archivos clave:** `backend/src/api/routes/auth.routes.ts`, `backend/src/api/routes/manual-auth.routes.ts`, `backend/src/services/auth.service.ts`, `backend/src/middleware/auth.middleware.ts`.
- **Hallazgos:** Login usa comprobaci?n manual de body; `/me` y `/change-password` usan `authenticate`. Manual-login devuelve URL v?lida (PROVIDER_LOGIN_URLS). Rate limit aplicado en login seg?n dise?o.
- **Recomendaci?n:** Opcional: validar body de login con Zod para homogeneizar con el resto de rutas.

---

### 3.2 Oportunidades

- **Traza de lectura:** UI (b?squeda/detalle/cola) ? GET `/api/opportunities` (query validada) y GET `/api/opportunities/:id` ? `router.use(authenticate)` ? opportunity-finder / opportunity.service ? cache y BD seg?n dise?o.
- **Traza de escritura:** A?adir a cola implica creaci?n de producto/job con `userId` (flujo que pasa por products/jobs); oportunidades en s? son principalmente lectura + persistencia de resultados con ownership.
- **Casos de error:** ManualAuthRequiredError y otros convertidos a respuestas HTTP adecuadas; timeout y errores de servicio manejados.
- **Archivos clave:** `backend/src/api/routes/opportunities.routes.ts`, `backend/src/services/opportunity-finder.service.ts`, `backend/src/services/opportunity.service.ts`.
- **Hallazgos:** `authenticate` en todo el router; `opportunitiesQuerySchema` (Zod) para query; `userId` usado en list y en detalle. Coherente con auditor?as de oportunidades existentes.
- **Recomendaci?n:** Ninguna cr?tica.

---

### 3.3 Productos

- **Traza de lectura:** UI (listado, detalle, preview, workflow status) ? GET `/api/products`, GET `/api/products/:id`, etc. ? `router.use(authenticate)` ? productService.getProducts/getProductById con `userId` (e `isAdmin`) ? Prisma con `where: { userId }` para no-admin.
- **Traza de escritura:** Crear/actualizar producto con `userId: req.user.userId`; scraping y jobs asociados al usuario; aprobaci?n y delete comprueban ownership (o admin).
- **Casos de error:** AppError para producto no encontrado, validaci?n; errorHandler centralizado; validaci?n Zod en body donde aplica.
- **Archivos clave:** `backend/src/api/routes/products.routes.ts`, `backend/src/services/product.service.ts`, `backend/src/middleware/auth.middleware.ts`.
- **Hallazgos:** Uso consistente de `userId` e `isAdmin`; `authorize('ADMIN')` en rutas de mantenimiento y cambio de status; get-by-id con ownership.
- **Recomendaci?n:** Ninguna cr?tica.

---

### 3.4 Publicador

- **Traza de lectura:** GET `/api/publisher/pending` ? productos pendientes de publicar filtrados por usuario y por margen; precio mostrado v?a `getEffectiveListingPrice` (misma fuente que al publicar).
- **Traza de escritura:** Approve & Publish actualiza producto y llama a marketplace con credenciales del usuario; ownership verificado (producto del usuario).
- **Casos de error:** Respuestas claras cuando falla margen o publicaci?n; validaci?n de precio > costo.
- **Archivos clave:** `backend/src/api/routes/publisher.routes.ts`, `backend/src/services/marketplace.service.ts`, `backend/src/services/product.service.ts`.
- **Hallazgos:** Filtro por margen en GET pending; precio efectivo unificado; ownership en approve. Coherente con correcciones recientes de publicador.
- **Recomendaci?n:** Ninguna cr?tica.

---

### 3.5 Ventas

- **Traza de lectura:** GET `/api/sales` y GET `/api/sales/stats` con query validada (Zod); `saleService.getSales(userId, status)` y `getSalesStats(userId, days)`; filtro por usuario (admin puede ver todos).
- **Traza de escritura:** Creaci?n de venta con `userId`; validaci?n de producto y precios en sale.service.
- **Casos de error:** getSalesQuerySchema para status, page, limit; errores operativos con AppError; mapeo coherente al frontend.
- **Archivos clave:** `backend/src/api/routes/sales.routes.ts`, `backend/src/services/sale.service.ts`.
- **Hallazgos:** totalProfit desde backend; per?odo (days) en stats; gr?ficas y export alineados con mismos criterios. Consistencia de datos verificada.
- **Recomendaci?n:** Ninguna cr?tica.

---

### 3.6 ?rdenes (OK ? corregido)

- **Traza de lectura:** GET `/api/orders` y GET `/api/orders/:id` **no** llevan `router.use(authenticate)` ni middleware de auth en la ruta. El listado usa `where: userId ? {} : {}`, es decir, **nunca** filtra por `userId` (el modelo Order tiene `userId`). Cualquier cliente puede listar todas las ?rdenes y ver cualquier orden por id si conoce el identificador.
- **Traza de escritura:** POST `/api/orders/:id/retry-fulfill` s? usa `authenticate` y comprueba `order.userId === userId` antes de permitir retry.
- **Casos de error:** Errores de BD y validaci?n de retry devueltos correctamente en retry-fulfill; en GET no hay restricci?n de acceso.
- **Archivos clave:** `backend/src/api/routes/orders.routes.ts`, modelo `Order` en `backend/prisma/schema.prisma` (tiene `userId` e ?ndice).
- **Hallazgos:**
  1. **Cr?tico:** GET `/api/orders` y GET `/api/orders/:id` no est?n protegidos con autenticaci?n.
  2. **Cr?tico:** El listado no filtra por `userId` (debe ser `where: isAdmin ? {} : { userId }` o equivalente con `userId` del token).
  3. GET `/:id` no comprueba ownership: cualquier usuario autenticado (o sin auth si se a?ade auth despu?s) podr?a ver ?rdenes de otros si no se filtra por `userId`.
- **Recomendaciones (prioridad cr?tica):**
  - A?adir `router.use(authenticate)` en `orders.routes.ts` para todas las rutas (o al menos para GET `/` y GET `/:id`).
  - En GET `/`, filtrar por `userId`: `where: { ...(userId && !isAdmin ? { userId } : {}) }` (y si solo hay un tenant, `where: { userId }` para no-admin).
  - En GET `/:id`, obtener orden con `where: { id, ...(userId && !isAdmin ? { userId } : {}) }` o comprobar despu?s de `findUnique` que `order.userId === userId` (o es admin) y devolver 403 si no.

---

### 3.7 Finanzas

- **Traza de lectura:** GET `/api/finance/sales-ledger`, summary, breakdown, cashflow con `req.user.userId`; rangos fijos (week/month/quarter/year) implementados en sales-ledger y dem?s servicios.
- **Traza de escritura:** Finanzas es principalmente lectura; escritura en otros flujos (ventas, ?rdenes) ya auditada.
- **Casos de error:** Par?metros de rango validados; errores propagados con errorHandler.
- **Archivos clave:** `backend/src/api/routes/finance.routes.ts`, `backend/src/services/sales-ledger.service.ts`, servicios de working-capital, profit-projection, etc.
- **Hallazgos:** Rangos fijos (30/90/365 seg?n documento); totalRevenue vs totalSales documentado en c?digo/auditor?as; sin fallbacks incorrectos en totales.
- **Recomendaci?n:** Ninguna cr?tica.

---

### 3.8 Dashboard

- **Traza de lectura:** GET `/api/dashboard/stats` y charts con `userId` (o admin); totalProfit desde saleService.getSalesStats; gr?fica de ventas filtrada por estado COMPLETED.
- **Traza de escritura:** No aplica (solo lectura).
- **Casos de error:** Timeout de 25s manejado con 504; cache para reducir carga.
- **Archivos clave:** `backend/src/api/routes/dashboard.routes.ts`, `backend/src/services/sale.service.ts`, `backend/src/services/commission.service.ts`.
- **Hallazgos:** totalProfit sin fallback a comisiones; ventas en gr?ficas solo COMPLETED; per?odo coherente con frontend.
- **Recomendaci?n:** Ninguna cr?tica.

---

### 3.9 Checkout / Compras

- **Traza de lectura:** Pending purchases y flujo PayPal con auth; webhooks sin auth (firma/verificaci?n seg?n dise?o).
- **Traza de escritura:** Pago ? webhook ? actualizaci?n de venta/orden; trazabilidad en servicios de PayPal y ventas.
- **Casos de error:** Errores de PayPal y negocio devueltos con c?digos y mensajes claros; frontend muestra mensajes sin exponer detalles internos donde se ha revisado.
- **Archivos clave:** `backend/src/api/routes/sales.routes.ts` (pending-purchases), `backend/src/api/routes/paypal.routes.ts`, `backend/src/api/routes/webhooks.routes.ts`, servicios de venta y PayPal.
- **Hallazgos:** Flujo pago ? webhook ? actualizaci?n de venta/orden coherente; rutas de usuario protegidas; webhooks con verificaci?n seg?n documentaci?n existente (ver AUDITORIA_PAYPAL_API_COMPLETA.md si aplica).
- **Recomendaci?n:** Ninguna cr?tica.

---

### 3.10 Configuraci?n

- **Traza de lectura/escritura:** Workflow, API keys, credenciales y manual-auth con `authenticate`; cambios guardados por usuario (workflow-config, credentials-manager); uso de environment y stages en flujos posteriores.
- **Archivos clave:** `backend/src/api/routes/workflow-config.routes.ts`, `backend/src/api/routes/api-credentials.routes.ts`, `backend/src/api/routes/manual-auth.routes.ts`, servicios de configuraci?n y credenciales.
- **Hallazgos:** Auth en rutas; ownership impl?cito por usuario autenticado; credenciales encriptadas y no expuestas en respuestas.
- **Recomendaci?n:** Ninguna cr?tica.

---

## 4. Dimensiones transversales

### 4.1 Autorizaci?n y ownership

| ?rea | Estado | Notas |
|------|--------|--------|
| Rutas protegidas con `authenticate` | OK | Órdenes corregido: router.use(authenticate); resto de flujos OK. |
| Filtro por `userId` en listados | OK | Órdenes corregido: listado filtra por userId (admin: todas); products, sales, publisher, finance, dashboard, reports OK. |
| Get-by-id con ownership | OK | Órdenes corregido: GET `/:id` comprueba ownership (403 si orden de otro usuario); products, sales OK. |
| Admin / authorize | OK | Products y otras rutas usan `authorize('ADMIN')` donde corresponde. |

### 4.2 Consistencia de datos

- **Definiciones:** Ventas, revenue, profit (gross vs net) y per?odos alineados en Ventas, Finanzas y Dashboard (rangos fijos 30/90/365; totalProfit desde sales; gr?ficas COMPLETED). Reports y revenue-change revisados en auditor?as previas; no se detectan excepciones nuevas en esta pasada.
- **Precio/costo en Publicador:** Unificado con `getEffectiveListingPrice` y filtro por margen; misma fuente al publicar.

### 4.3 Validaci?n e inputs

- **Query/body:** Zod (u equivalente) en oportunidades, sales (query), products (body), y en otras rutas cr?ticas revisadas. ?rdenes: retry-fulfill valida estado y ownership; GET no recibe params sensibles pero la ruta debe estar protegida.
- **IDs y tokens:** IDs num?ricos validados en products; tokens de manual-auth validados. Recomendaci?n: validar `id` en GET `/api/orders/:id` (formato esperado) para evitar inyecci?n de queries.

### 4.4 Manejo de errores

- **Backend:** AppError con c?digos y mensajes; errorHandler centralizado; respuestas con status y formato coherente. Uso consistente en los flujos auditados.
- **Frontend:** Mensajes de error mostrados al usuario (toast/alert) sin revelar detalles internos en las p?ginas revisadas; se asume mismo criterio en el resto.

### 4.5 Seguridad

- **Secrets:** No se exponen en respuestas ni en logs en las rutas revisadas; credenciales encriptadas.
- **CORS y helmet:** Configurados en app (helmet, cors con origen y credenciales).
- **Webhooks:** Verificaci?n de firma/documentada seg?n dise?o (PayPal, etc.); no revisi?n exhaustiva de cada webhook en esta pasada.

---

## 5. Recomendaciones priorizadas

### Cr?tico

1. **?rdenes ? Autenticaci?n y ownership**
   - Aplicado: `router.use(authenticate)` en `backend/src/api/routes/orders.routes.ts`; GET `/` y GET `/:id` requieren autenticación.
   - Filtrar listado por `userId`: `where: { ...(userId && !isAdmin ? { userId } : {}) }` (ajustar si el modelo permite null en `userId` para ?rdenes legacy).
   - En GET `/:id`, asegurar que solo se devuelve la orden si pertenece al usuario (o es admin): bien con `findFirst({ where: { id, userId } })` para no-admin, o comprobando `order.userId === userId` tras `findUnique` y devolviendo 403 si no.

### Importante

2. **Órdenes – Validación de parámetros** (aplicado)  
   Validación de `req.params.id` en GET `/api/orders/:id` (string no vacío) implementada.

3. **Auth ? Homogeneizar validaci?n**  
   Validar body de POST `/api/auth/login` con Zod (igual que en otras rutas) para consistencia y mejor mensaje de error.

### Opcional

4. **Pruebas e2e**  
   A?adir pruebas e2e automatizadas (Playwright/Cypress) para flujos cr?ticos: login, listado de productos, publicador (pending + approve), ventas (listado + stats), ?rdenes (listado y retry con usuario propietario) y finanzas (sales-ledger). Incluir un caso que verifique que un usuario no puede ver ?rdenes de otro (403 o lista vac?a seg?n dise?o).

5. **Documentaci?n**  
   Enlazar este informe desde el README o desde `docs/` para que nuevas auditor?as y correcciones tengan referencia al estado e2e.

---

## 6. Referencias

- [AUDITORIA_COMPLETA_FLUJO_DROPSHIPPING.md](AUDITORIA_COMPLETA_FLUJO_DROPSHIPPING.md) ? Workflow guiado, workflowMode/guided, flujo dropshipping.
- Documentos `docs/AUDITORIA_*.md` ? APIs de marketplaces, PayPal, AliExpress, Slack, Twilio, etc.
- Plan de auditor?a: `auditoria_end_to_end_completa_da6ea424.plan.md` (no editado en esta tarea).

---

*Informe generado en el marco de la auditor?a end-to-end completa. Revisi?n de c?digo; no incluye ejecuci?n de tests e2e automatizados.*

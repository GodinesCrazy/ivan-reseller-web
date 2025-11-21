# ✅ CHECKLIST QA - IVAN RESELLER

**Fecha de Creación:** 2025-11-20  
**Estado:** 📋 **PENDIENTE**  
**Objetivo:** Lista de pruebas mínimas antes de abrir acceso a usuarios reales y hacer demo a inversionistas

---

## 📋 RESUMEN EJECUTIVO

Este checklist debe ejecutarse **COMPLETAMENTE** antes de:

1. ✅ **Abrir acceso a nuevos usuarios reales**
2. ✅ **Hacer demo a inversionistas**
3. ✅ **Marcar sistema como "Producción"**

**Criterio de Éxito:** ✅ Todas las pruebas pasan (100%)

---

## 🔴 CRÍTICO - Debe pasar 100%

### Seguridad Multi-Tenant

#### ✅ QA-CRIT-1: Aislamiento de Datos por Usuario

**Descripción:** Verificar que un usuario NO puede ver, modificar o eliminar recursos de otros usuarios.

**Pasos:**
1. Crear Usuario A y Usuario B
2. Usuario A crea producto X
3. Usuario A crea venta Y
4. Usuario A crea comisión Z
5. **Login como Usuario B**
6. Intentar acceder a producto X: `GET /api/products/X`
   - ✅ Esperado: 403 Forbidden o 404 Not Found
   - ❌ NO debe retornar el producto de Usuario A
7. Intentar acceder a venta Y: `GET /api/sales/Y`
   - ✅ Esperado: 403 Forbidden o 404 Not Found
8. Intentar acceder a comisión Z: `GET /api/commissions/Z`
   - ✅ Esperado: 403 Forbidden o 404 Not Found
9. Listar productos: `GET /api/products`
   - ✅ Esperado: Array vacío o solo productos del Usuario B
   - ❌ NO debe incluir productos de Usuario A
10. Intentar modificar producto X: `PUT /api/products/X`
    - ✅ Esperado: 403 Forbidden
11. Intentar eliminar producto X: `DELETE /api/products/X`
    - ✅ Esperado: 403 Forbidden

**Criterio de Éxito:** ✅ Usuario B NO puede ver, modificar o eliminar recursos de Usuario A

**Archivos Revisados:**
- `backend/src/services/product.service.ts`
- `backend/src/services/sale.service.ts`
- `backend/src/services/commission.service.ts`
- `backend/src/api/routes/*.routes.ts`

---

#### ✅ QA-CRIT-2: Admin Puede Ver Todo

**Descripción:** Verificar que un usuario ADMIN puede ver y gestionar recursos de TODOS los usuarios.

**Pasos:**
1. Crear Usuario A y Usuario B
2. Usuario A crea producto X
3. Usuario B crea producto Y
4. **Login como Admin**
5. Listar productos: `GET /api/products`
   - ✅ Esperado: Array con productos X e Y (de ambos usuarios)
6. Acceder a producto X: `GET /api/products/X`
   - ✅ Esperado: 200 OK con producto X
7. Acceder a producto Y: `GET /api/products/Y`
   - ✅ Esperado: 200 OK con producto Y
8. Modificar producto X: `PUT /api/products/X`
   - ✅ Esperado: 200 OK (admin puede modificar)
9. Modificar producto Y: `PUT /api/products/Y`
   - ✅ Esperado: 200 OK (admin puede modificar)

**Criterio de Éxito:** ✅ Admin puede ver y gestionar recursos de TODOS los usuarios

**Archivos Revisados:**
- `backend/src/services/product.service.ts`
- `backend/src/api/routes/*.routes.ts`
- `backend/src/middleware/auth.middleware.ts` (authorize)

---

#### ✅ QA-CRIT-3: Credenciales API Aisladas por Usuario

**Descripción:** Verificar que cada usuario tiene sus propias credenciales API aisladas.

**Pasos:**
1. Crear Usuario A y Usuario B
2. Usuario A configura credenciales de eBay
3. Usuario B configura credenciales de eBay (diferentes)
4. **Login como Usuario A**
5. Obtener credenciales: `GET /api/credentials/ebay`
   - ✅ Esperado: Credenciales de Usuario A (NO de Usuario B)
6. **Login como Usuario B**
7. Obtener credenciales: `GET /api/credentials/ebay`
   - ✅ Esperado: Credenciales de Usuario B (NO de Usuario A)

**Criterio de Éxito:** ✅ Cada usuario solo puede ver sus propias credenciales API

**Archivos Revisados:**
- `backend/src/services/credentials-manager.service.ts`
- `backend/src/api/routes/api-credentials.routes.ts`

---

### Autenticación y Autorización

#### ✅ QA-CRIT-4: Autenticación JWT Funcional

**Descripción:** Verificar que el sistema de autenticación JWT funciona correctamente.

**Pasos:**
1. Login con credenciales válidas: `POST /api/auth/login`
   - ✅ Esperado: 200 OK con token
   - ✅ Token en cookie httpOnly o en body
2. Usar token para acceder a recurso protegido: `GET /api/products` con token
   - ✅ Esperado: 200 OK con productos
3. Usar token inválido: `GET /api/products` con token inválido
   - ✅ Esperado: 401 Unauthorized
4. Usar token expirado: `GET /api/products` con token expirado
   - ✅ Esperado: 401 Unauthorized
5. Acceder sin token: `GET /api/products` sin token
   - ✅ Esperado: 401 Unauthorized
6. Refresh token: `POST /api/auth/refresh` con refresh token válido
   - ✅ Esperado: 200 OK con nuevo token

**Criterio de Éxito:** ✅ Sistema de autenticación JWT funciona correctamente

**Archivos Revisados:**
- `backend/src/middleware/auth.middleware.ts`
- `backend/src/services/auth.service.ts`
- `backend/src/api/routes/auth.routes.ts`

---

#### ✅ QA-CRIT-5: Protección de Rutas Admin

**Descripción:** Verificar que las rutas de admin están protegidas y solo admin puede acceder.

**Pasos:**
1. **Login como Usuario Normal (USER)**
2. Intentar acceder a `/api/admin/users`
   - ✅ Esperado: 403 Forbidden
3. Intentar acceder a `/api/admin/stats`
   - ✅ Esperado: 403 Forbidden
4. Intentar acceder a `/api/logs`
   - ✅ Esperado: 403 Forbidden
5. **Login como Admin**
6. Acceder a `/api/admin/users`
   - ✅ Esperado: 200 OK
7. Acceder a `/api/admin/stats`
   - ✅ Esperado: 200 OK
8. Acceder a `/api/logs`
   - ✅ Esperado: 200 OK

**Criterio de Éxito:** ✅ Rutas admin están protegidas y solo admin puede acceder

**Archivos Revisados:**
- `backend/src/middleware/auth.middleware.ts` (authorize)
- `backend/src/api/routes/admin.routes.ts`
- `backend/src/api/routes/logs.routes.ts`

---

### Flujos Críticos de Negocio

#### ✅ QA-CRIT-6: Flujo Completo de Búsqueda de Oportunidades

**Descripción:** Verificar que el flujo completo de búsqueda de oportunidades funciona end-to-end.

**Pasos:**
1. **Login como Usuario**
2. Ir a página `/opportunities`
3. Ingresar término de búsqueda (ej: "wireless earbuds")
4. Seleccionar marketplaces (eBay, Amazon, MercadoLibre)
5. Hacer clic en "Buscar"
   - ✅ Esperado: Sistema busca oportunidades en AliExpress
   - ✅ Esperado: Sistema analiza competencia en marketplaces
   - ✅ Esperado: Sistema calcula márgenes y ROI
   - ✅ Esperado: Sistema retorna lista de oportunidades
6. Verificar que oportunidades tienen:
   - ✅ Título
   - ✅ Precio AliExpress
   - ✅ Precio sugerido
   - ✅ Margen de ganancia
   - ✅ ROI
   - ✅ Imagen (si está disponible)
7. Seleccionar una oportunidad
8. Verificar que se puede importar como producto

**Criterio de Éxito:** ✅ Flujo completo de búsqueda funciona sin errores

**Archivos Revisados:**
- `frontend/src/pages/Opportunities.tsx`
- `backend/src/api/routes/opportunities.routes.ts`
- `backend/src/services/opportunity-finder.service.ts`

---

#### ✅ QA-CRIT-7: Flujo Completo de Creación y Publicación de Producto

**Descripción:** Verificar que el flujo completo de crear producto y publicarlo funciona end-to-end.

**Pasos:**
1. **Login como Usuario**
2. Ir a página `/products` o `/publisher`
3. Crear producto nuevo:
   - ✅ Ingresar título
   - ✅ Ingresar URL de AliExpress
   - ✅ Ingresar precio AliExpress
   - ✅ Ingresar precio sugerido
   - ✅ Subir imagen (opcional)
4. Guardar producto
   - ✅ Esperado: Producto creado con estado PENDING
5. Ir a página `/publisher`
   - ✅ Esperado: Producto aparece en lista de pendientes
6. Aprobar producto: `POST /api/publisher/approve/:id`
   - ✅ Esperado: Producto cambia a estado APPROVED
7. Configurar credenciales de eBay (si no están configuradas)
8. Publicar producto a eBay: `POST /api/publisher/publish/:id`
   - ✅ Esperado: Producto publicado exitosamente
   - ✅ Esperado: Producto cambia a estado PUBLISHED
   - ✅ Esperado: Se crea registro en MarketplaceListing

**Criterio de Éxito:** ✅ Flujo completo de creación y publicación funciona sin errores

**Archivos Revisados:**
- `frontend/src/pages/Products.tsx`
- `frontend/src/pages/Publisher.tsx`
- `backend/src/api/routes/products.routes.ts`
- `backend/src/api/routes/publisher.routes.ts`
- `backend/src/services/product.service.ts`
- `backend/src/services/marketplace.service.ts`

---

#### ✅ QA-CRIT-8: Flujo Completo de Venta y Comisión

**Descripción:** Verificar que el flujo completo de registro de venta y cálculo de comisión funciona end-to-end.

**Pasos:**
1. **Login como Usuario**
2. Tener producto publicado (del QA-CRIT-7)
3. Registrar venta: `POST /api/sales`
   - ✅ Ingresar orderId
   - ✅ Seleccionar producto publicado
   - ✅ Ingresar salePrice
   - ✅ Ingresar costPrice
   - ✅ Ingresar platformFees
4. Verificar que venta se crea:
   - ✅ Estado: PENDING
   - ✅ grossProfit calculado: salePrice - costPrice - platformFees
   - ✅ commissionAmount calculado: grossProfit * commissionRate
   - ✅ netProfit calculado: grossProfit - commissionAmount
5. Verificar que comisión se crea automáticamente:
   - ✅ Estado: PENDING
   - ✅ amount: igual a commissionAmount de la venta
   - ✅ saleId: vinculado a la venta
6. Verificar que balance del usuario se actualiza:
   - ✅ balance incrementado (o pendiente de pago)
7. Ir a página `/sales`
   - ✅ Esperado: Venta aparece en lista
8. Ir a página `/commissions`
   - ✅ Esperado: Comisión aparece en lista

**Criterio de Éxito:** ✅ Flujo completo de venta y comisión funciona sin errores

**Archivos Revisados:**
- `backend/src/api/routes/sales.routes.ts`
- `backend/src/services/sale.service.ts`
- `backend/src/services/commission.service.ts`
- `frontend/src/pages/Sales.tsx`
- `frontend/src/pages/Commissions.tsx`

---

### Validación de Credenciales

#### ✅ QA-CRIT-9: Validación de Credenciales Antes de Publicar

**Descripción:** Verificar que el sistema valida que las credenciales existen y son válidas antes de permitir publicar.

**Pasos:**
1. **Login como Usuario**
2. Crear producto (QA-CRIT-7 paso 4)
3. Aprobar producto (QA-CRIT-7 paso 6)
4. **NO configurar credenciales de eBay**
5. Intentar publicar producto a eBay: `POST /api/publisher/publish/:id`
   - ✅ Esperado: Error claro "eBay credentials not configured"
   - ✅ Esperado: Mensaje incluye instrucciones de cómo configurar
   - ❌ NO debe intentar publicar y fallar silenciosamente
6. Configurar credenciales de eBay inválidas
7. Intentar publicar producto a eBay
   - ✅ Esperado: Error claro "eBay credentials are invalid"
   - ✅ Esperado: Mensaje incluye instrucciones de cómo corregir
8. Configurar credenciales de eBay válidas
9. Intentar publicar producto a eBay
   - ✅ Esperado: Publicación exitosa

**Criterio de Éxito:** ✅ Sistema valida credenciales antes de permitir publicar

**Archivos Revisados:**
- `backend/src/services/marketplace.service.ts`
- `backend/src/api/routes/publisher.routes.ts`
- `frontend/src/pages/Publisher.tsx`

---

#### ✅ QA-CRIT-10: Mensajes de Error Amigables

**Descripción:** Verificar que los mensajes de error son amigables y orientan al usuario.

**Pasos:**
1. **Login como Usuario**
2. Intentar acceder a recurso de otro usuario: `GET /api/products/999` (producto de otro usuario)
   - ✅ Esperado: Error 403 con mensaje: "No tienes permiso para acceder a este recurso"
   - ❌ NO debe mostrar: "Product not found" (confunde)
3. Intentar publicar sin credenciales (QA-CRIT-9 paso 5)
   - ✅ Esperado: Mensaje claro: "Configura tus credenciales de eBay primero. Ve a Settings → API Settings"
   - ❌ NO debe mostrar: "Credentials not found" (no orienta)
4. Intentar crear producto sin campos requeridos: `POST /api/products` sin título
   - ✅ Esperado: Error 400 con mensaje: "El campo 'title' es requerido"
   - ❌ NO debe mostrar: "ValidationError: Invalid input" (no es específico)

**Criterio de Éxito:** ✅ Todos los mensajes de error son amigables y orientan al usuario

**Archivos Revisados:**
- `backend/src/middleware/error.middleware.ts`
- Todos los endpoints que retornan errores

---

## 🟠 ALTA PRIORIDAD - Debe pasar 100%

### Funcionalidad

#### ✅ QA-HIGH-1: Paginación en Listados

**Descripción:** Verificar que todos los listados tienen paginación.

**Pasos:**
1. **Login como Usuario**
2. Crear 25 productos (más del límite de 20 por página)
3. Listar productos: `GET /api/products`
   - ✅ Esperado: Retorna máximo 20 productos
   - ✅ Esperado: Retorna información de paginación:
     ```json
     {
       "items": [...],
       "pagination": {
         "page": 1,
         "limit": 20,
         "total": 25,
         "pages": 2,
         "hasNext": true,
         "hasPrev": false
       }
     }
     ```
4. Navegar a página 2: `GET /api/products?page=2`
   - ✅ Esperado: Retorna productos 21-25
5. Repetir para `/api/sales`, `/api/commissions`, `/api/opportunities`

**Criterio de Éxito:** ✅ Todos los listados tienen paginación

**Archivos Revisados:**
- `backend/src/api/routes/products.routes.ts`
- `backend/src/api/routes/sales.routes.ts`
- `backend/src/api/routes/commissions.routes.ts`
- `backend/src/api/routes/opportunities.routes.ts`

---

#### ✅ QA-HIGH-2: Manejo de Monedas Consistente

**Descripción:** Verificar que el sistema maneja monedas consistentemente en todo el flujo.

**Pasos:**
1. **Login como Usuario con baseCurrency = EUR**
2. Buscar oportunidad que retorne precio en USD
3. Verificar que precios se convierten a EUR:
   - ✅ Precio AliExpress mostrado en EUR
   - ✅ Precio sugerido mostrado en EUR
   - ✅ Margen calculado en EUR
4. Crear producto con precio en EUR
5. Configurar venta con precio en EUR
6. Verificar que comisión se calcula en EUR:
   - ✅ commissionAmount en EUR
   - ✅ netProfit en EUR
7. Repetir con diferentes monedas (USD, CLP, JPY)
   - ✅ CLP/JPY deben redondearse a enteros (0 decimales)
   - ✅ Otras monedas a 2 decimales

**Criterio de Éxito:** ✅ Sistema maneja monedas consistentemente en todo el flujo

**Archivos Revisados:**
- `backend/src/services/fx.service.ts`
- `backend/src/services/cost-calculator.service.ts`
- `backend/src/services/sale.service.ts`
- `backend/src/utils/currency.utils.ts`

---

#### ✅ QA-HIGH-3: Autopilot Manejo de Errores

**Descripción:** Verificar que Autopilot maneja errores correctamente y notifica al usuario.

**Pasos:**
1. **Login como Usuario**
2. Ir a página `/autopilot`
3. Configurar Autopilot sin credenciales de marketplace
4. Iniciar Autopilot
   - ✅ Esperado: Error claro: "Configura credenciales de eBay antes de iniciar Autopilot"
   - ✅ Esperado: Autopilot NO se inicia
5. Configurar credenciales inválidas
6. Iniciar Autopilot
   - ✅ Esperado: Error claro: "Credenciales de eBay son inválidas"
   - ✅ Esperado: Autopilot se detiene y notifica error
7. Configurar credenciales válidas
8. Iniciar Autopilot
   - ✅ Esperado: Autopilot funciona normalmente
   - ✅ Esperado: Si falla scraping, notifica: "Error al buscar oportunidades: [razón]"
   - ✅ Esperado: Si falla publicación, notifica: "Error al publicar producto X: [razón]"

**Criterio de Éxito:** ✅ Autopilot nunca falla silenciosamente y siempre notifica errores

**Archivos Revisados:**
- `backend/src/services/autopilot.service.ts`
- `frontend/src/pages/Autopilot.tsx`
- `backend/src/services/notification.service.ts`

---

### UX

#### ✅ QA-HIGH-4: Navegación Clara y Consistente

**Descripción:** Verificar que la navegación es clara y no hay páginas duplicadas confusas.

**Pasos:**
1. **Login como Usuario Nuevo**
2. Ir a página de inicio (`/dashboard`)
3. Verificar que menú lateral es claro:
   - ✅ Nombres de secciones son descriptivos
   - ✅ Iconos ayudan a identificar secciones
   - ✅ No hay secciones duplicadas
4. Verificar que flujo de navegación tiene sentido:
   - ✅ Búsqueda de oportunidades → Importar producto → Publicar producto → Ventas
   - ✅ No hay "callejones sin salida"
5. Verificar que breadcrumbs (si existen) muestran dónde está el usuario
6. Intentar acceder a todas las páginas desde el menú
   - ✅ Todas las páginas cargan correctamente
   - ✅ No hay enlaces rotos

**Criterio de Éxito:** ✅ Navegación es clara, consistente y no hay páginas duplicadas

**Archivos Revisados:**
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/App.tsx`
- Todas las páginas en `frontend/src/pages/`

---

#### ✅ QA-HIGH-5: Feedback en Acciones del Usuario

**Descripción:** Verificar que todas las acciones del usuario tienen feedback claro.

**Pasos:**
1. **Login como Usuario**
2. Crear producto
   - ✅ Esperado: Mensaje de éxito: "Producto creado exitosamente"
   - ✅ Esperado: Redirige a página de productos o muestra producto creado
3. Aprobar producto
   - ✅ Esperado: Mensaje de éxito: "Producto aprobado"
   - ✅ Esperado: Producto desaparece de lista de pendientes
4. Publicar producto
   - ✅ Esperado: Mensaje de éxito: "Producto publicado exitosamente"
   - ✅ Esperado: Estado cambia a PUBLISHED
5. Registrar venta
   - ✅ Esperado: Mensaje de éxito: "Venta registrada exitosamente"
   - ✅ Esperado: Venta aparece en lista de ventas
6. Acciones que fallan:
   - ✅ Esperado: Mensaje de error claro explicando qué pasó
   - ✅ Esperado: No hay errores silenciosos

**Criterio de Éxito:** ✅ Todas las acciones tienen feedback claro (éxito o error)

**Archivos Revisados:**
- Todas las páginas que tienen formularios o acciones
- `frontend/src/services/api.ts` (manejo de errores)

---

## 🟡 MEDIA PRIORIDAD - Recomendado pasar 80%+

### Performance

#### ✅ QA-MED-1: Performance de Listados

**Descripción:** Verificar que los listados cargan en tiempo razonable (< 2 segundos).

**Pasos:**
1. **Login como Usuario**
2. Crear 100 productos
3. Medir tiempo de carga de `/products`:
   - ✅ Esperado: Carga en < 2 segundos
4. Crear 100 ventas
5. Medir tiempo de carga de `/sales`:
   - ✅ Esperado: Carga en < 2 segundos
6. Crear 100 comisiones
7. Medir tiempo de carga de `/commissions`:
   - ✅ Esperado: Carga en < 2 segundos

**Criterio de Éxito:** ✅ Todos los listados cargan en < 2 segundos

**Archivos Revisados:**
- Todos los endpoints de listados
- `backend/src/api/routes/*.routes.ts`

---

#### ✅ QA-MED-2: Performance de Búsqueda de Oportunidades

**Descripción:** Verificar que la búsqueda de oportunidades completa en tiempo razonable (< 30 segundos).

**Pasos:**
1. **Login como Usuario**
2. Ir a página `/opportunities`
3. Ingresar término de búsqueda común (ej: "phone case")
4. Hacer clic en "Buscar"
5. Medir tiempo total de búsqueda:
   - ✅ Esperado: Completa en < 30 segundos
6. Verificar que hay indicador de progreso mientras busca:
   - ✅ Esperado: Spinner o mensaje "Buscando oportunidades..."
7. Si tarda más de 30 segundos:
   - ✅ Esperado: Mensaje: "La búsqueda está tomando más tiempo del esperado..."
   - ✅ Esperado: Opción de cancelar búsqueda

**Criterio de Éxito:** ✅ Búsqueda completa en < 30 segundos o muestra progreso claro

**Archivos Revisados:**
- `backend/src/services/opportunity-finder.service.ts`
- `frontend/src/pages/Opportunities.tsx`

---

### Robustez

#### ✅ QA-MED-3: Manejo de Redis No Disponible

**Descripción:** Verificar que el sistema funciona (aunque más lento) si Redis no está disponible.

**Pasos:**
1. **Desactivar Redis** (detener servicio o marcar como no disponible)
2. **Login como Usuario**
3. Verificar que sistema sigue funcionando:
   - ✅ Login funciona
   - ✅ Listar productos funciona
   - ✅ Crear productos funciona
   - ✅ Publicar productos funciona (aunque más lento sin jobs)
4. Verificar que sistema muestra advertencia:
   - ✅ Mensaje: "Redis no disponible, jobs ejecutándose directamente (más lento)"
5. **Reactivar Redis**
6. Verificar que sistema detecta y vuelve a usar Redis

**Criterio de Éxito:** ✅ Sistema funciona sin Redis (aunque más lento) y muestra advertencia

**Archivos Revisados:**
- `backend/src/config/redis.ts`
- `backend/src/services/job.service.ts`

---

#### ✅ QA-MED-4: Validación de Límites de Productos Pendientes

**Descripción:** Verificar que el sistema valida el límite de productos pendientes.

**Pasos:**
1. **Login como Usuario**
2. Configurar límite: `maxPendingProducts = 5`
3. Crear 5 productos (límite alcanzado)
4. Intentar crear producto 6:
   - ✅ Esperado: Error: "Has alcanzado tu límite de productos pendientes (5). Aproba o elimina productos pendientes para crear más."
5. Aprobar un producto (ahora hay 4 pendientes)
6. Intentar crear producto 6:
   - ✅ Esperado: Producto creado exitosamente

**Criterio de Éxito:** ✅ Sistema valida límite de productos pendientes

**Archivos Revisados:**
- `backend/src/services/product.service.ts`
- `backend/src/services/user-settings.service.ts`

---

## 🔵 BAJA PRIORIDAD - Nice to Have

### Documentación

#### ✅ QA-LOW-1: Documentación Completa

**Descripción:** Verificar que la documentación está completa y actualizada.

**Pasos:**
1. Revisar README.md:
   - ✅ Instrucciones de instalación claras
   - ✅ Variables de entorno documentadas
   - ✅ Ejemplos de uso
2. Revisar documentación de API (Swagger si existe):
   - ✅ Todos los endpoints documentados
   - ✅ Ejemplos de requests/responses
3. Revisar Help Center (`/help`):
   - ✅ Guías paso a paso
   - ✅ Preguntas frecuentes
   - ✅ Troubleshooting

**Criterio de Éxito:** ✅ Documentación completa y actualizada

**Archivos Revisados:**
- `README.md`
- `backend/src/config/swagger.ts`
- `frontend/src/pages/HelpCenter.tsx`

---

### Testing

#### ✅ QA-LOW-2: Tests E2E Completos

**Descripción:** Verificar que hay tests E2E para flujos críticos.

**Pasos:**
1. Revisar que hay tests E2E para:
   - ✅ Flujo de login
   - ✅ Flujo de búsqueda de oportunidades
   - ✅ Flujo de creación y publicación de producto
   - ✅ Flujo de registro de venta y comisión
2. Ejecutar todos los tests:
   - ✅ Todos los tests pasan (100%)
3. Revisar cobertura de código:
   - ✅ Al menos 70% de cobertura

**Criterio de Éxito:** ✅ Tests E2E completos y pasando

**Archivos Revisados:**
- `backend/src/__tests__/`
- `frontend/src/__tests__/`

---

## 📊 RESUMEN DE CHECKLIST

### Crítico (P0) - Debe pasar 100%
- ✅ QA-CRIT-1: Aislamiento de Datos por Usuario
- ✅ QA-CRIT-2: Admin Puede Ver Todo
- ✅ QA-CRIT-3: Credenciales API Aisladas
- ✅ QA-CRIT-4: Autenticación JWT Funcional
- ✅ QA-CRIT-5: Protección de Rutas Admin
- ✅ QA-CRIT-6: Flujo Completo de Búsqueda
- ✅ QA-CRIT-7: Flujo Completo de Creación y Publicación
- ✅ QA-CRIT-8: Flujo Completo de Venta y Comisión
- ✅ QA-CRIT-9: Validación de Credenciales
- ✅ QA-CRIT-10: Mensajes de Error Amigables

**Total Crítico:** 10 pruebas - **TODAS deben pasar 100%**

### Alta Prioridad (P1) - Debe pasar 100%
- ✅ QA-HIGH-1: Paginación en Listados
- ✅ QA-HIGH-2: Manejo de Monedas Consistente
- ✅ QA-HIGH-3: Autopilot Manejo de Errores
- ✅ QA-HIGH-4: Navegación Clara y Consistente
- ✅ QA-HIGH-5: Feedback en Acciones del Usuario

**Total Alta:** 5 pruebas - **TODAS deben pasar 100%**

### Media Prioridad (P2) - Recomendado pasar 80%+
- ✅ QA-MED-1: Performance de Listados
- ✅ QA-MED-2: Performance de Búsqueda
- ✅ QA-MED-3: Manejo de Redis No Disponible
- ✅ QA-MED-4: Validación de Límites

**Total Media:** 4 pruebas - **Recomendado 80%+**

### Baja Prioridad (P3) - Nice to Have
- ✅ QA-LOW-1: Documentación Completa
- ✅ QA-LOW-2: Tests E2E Completos

**Total Baja:** 2 pruebas - **Nice to Have**

---

## 🎯 CRITERIOS DE APROBACIÓN

### Para Abrir Acceso a Usuarios Reales

✅ **Debe cumplir:**
- ✅ TODAS las pruebas CRÍTICAS (10/10) - 100%
- ✅ TODAS las pruebas ALTA PRIORIDAD (5/5) - 100%
- ✅ AL MENOS 3 pruebas MEDIA PRIORIDAD (3/4) - 75%

**Total Mínimo Requerido:** 18/19 pruebas (95%)

---

### Para Demo a Inversionistas

✅ **Debe cumplir:**
- ✅ TODAS las pruebas CRÍTICAS (10/10) - 100%
- ✅ TODAS las pruebas ALTA PRIORIDAD (5/5) - 100%
- ✅ TODAS las pruebas MEDIA PRIORIDAD (4/4) - 100%
- ✅ AL MENOS 1 prueba BAJA PRIORIDAD (1/2) - 50%

**Total Mínimo Requerido:** 20/21 pruebas (95%)

---

### Para Producción Completa

✅ **Debe cumplir:**
- ✅ TODAS las pruebas (21/21) - 100%

**Total Requerido:** 21/21 pruebas (100%)

---

## 📝 NOTAS IMPORTANTES

1. **Ejecutar este checklist DESPUÉS de implementar correcciones de P0**
2. **Usar entorno de staging/pre-producción para pruebas**
3. **No usar datos de producción reales en pruebas**
4. **Documentar cualquier fallo encontrado en bug tracker**
5. **No marcar como "completado" hasta que TODAS las pruebas pasen**

---

**Próximo Paso:** Ejecutar este checklist después de implementar correcciones de P0 según `PLAN_TRABAJO_MEJORAS_IVAN_RESELLER.md`.


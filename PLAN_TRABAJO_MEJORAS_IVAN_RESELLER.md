# 📋 PLAN DE TRABAJO - MEJORAS IVAN RESELLER

**Fecha de Creación:** 2025-11-20  
**Estado:** 🔴 **PENDIENTE**  
**Objetivo:** Dejar el sistema listo para usuarios reales y demos con inversionistas

---

## 📊 RESUMEN EJECUTIVO

### Estimaciones Totales

| Prioridad | Tareas | Tiempo Estimado | Complejidad Promedio |
|-----------|--------|-----------------|---------------------|
| **P0 - Críticas** | 5 | 7-10 días | Media-Alta |
| **P1 - Altas** | 5 | 10-15 días | Media |
| **P2 - Medias** | 5 | 7-10 días | Baja-Media |
| **P3 - Bajas** | 3 | 5-7 días | Baja |
| **TOTAL** | 18 | **29-42 días** | - |

### Fechas Clave

- **ANTES DE USUARIOS REALES:** Resolver P0 (7-10 días)
- **ANTES DE DEMO INVERSIONISTAS:** Resolver P0 + P1 (17-25 días)
- **MEJORAS CONTINUAS:** P2 + P3 (12-17 días adicionales)

---

## 🔴 P0 - TAREAS CRÍTICAS (Deben resolverse antes de permitir uso real)

### P0.1 - Auditar y Corregir Brechas de Seguridad Multi-Tenant

**Descripción:** Revisar TODOS los servicios y rutas para asegurar que filtran correctamente por `userId`, evitando que usuarios vean o modifiquen recursos de otros.

**Tipo:** Seguridad / Bugfix

**Módulo/Ruta Afectada:**
- `backend/src/services/product.service.ts`
- `backend/src/services/sale.service.ts`
- `backend/src/services/commission.service.ts`
- `backend/src/services/opportunity.service.ts`
- `backend/src/api/routes/*.routes.ts` (todas las rutas)

**Complejidad:** Media-Alta

**Pasos:**
1. **Auditoría Completa (2 días)**
   - Revisar cada servicio que accede a datos
   - Verificar que todas las queries incluyen `where: { userId: ... }` cuando corresponde
   - Verificar que admin puede ver todo pero usuarios solo lo suyo
   - Crear lista de archivos afectados

2. **Corrección (3-4 días)**
   - Corregir cada servicio encontrado
   - Implementar función helper para filtrado consistente:
     ```typescript
     function buildUserFilter(userId?: number, isAdmin: boolean = false) {
       return isAdmin ? {} : { userId };
     }
     ```
   - Actualizar TODOS los servicios para usar helper
   - Agregar validación de ownership en métodos `getById`

3. **Testing (1-2 días)**
   - Crear tests de aislamiento de datos
   - Verificar que Usuario A NO puede acceder a datos de Usuario B
   - Verificar que Admin SÍ puede acceder a todo
   - Tests E2E para cada endpoint crítico

4. **Documentación (1 día)**
   - Documentar patrón de filtrado multi-tenant
   - Actualizar guía de desarrollo
   - Agregar checklist para nuevos endpoints

**Estimación Total:** 7-9 días

**Criterios de Éxito:**
- ✅ Todos los endpoints filtran correctamente por `userId`
- ✅ Admin puede ver todos los recursos
- ✅ Usuarios solo pueden ver sus propios recursos
- ✅ Tests de aislamiento pasan (100%)
- ✅ No hay fugas de datos entre usuarios

---

### P0.2 - Implementar o Marcar Claramente Funcionalidades Faltantes

**Descripción:** Funcionalidades mostradas en UI pero no implementadas completamente. Deben implementarse o marcarse claramente como "Coming Soon".

**Tipo:** Funcionalidad / UX

**Módulo/Ruta Afectada:**
- `frontend/src/pages/Products.tsx`
- `frontend/src/pages/Publisher.tsx`
- `frontend/src/pages/Reports.tsx`
- `backend/src/services/aliexpress-auto-purchase.service.ts`
- `backend/src/services/marketplace.service.ts` (syncProductPrice)
- `backend/src/services/reports.service.ts`

**Complejidad:** Media-Alta

**Pasos:**

#### P0.2.1 - Compra Automática en AliExpress (5 días)

**Problema:** Frontend sugiere que funciona automáticamente, pero no está conectado.

**Solución:**
1. **Implementar webhook handler (2 días)**
   - Crear `POST /api/webhooks/sale-created`
   - Cuando se registra una venta, activar compra automática
   - O mejor: Job en background que detecte ventas y compre automáticamente

2. **Conectar servicio existente (2 días)**
   - Revisar `aliexpress-auto-purchase.service.ts`
   - Conectar con webhook de ventas
   - Implementar manejo de errores (qué pasa si falla la compra)

3. **UI Feedback (1 día)**
   - Mostrar estado: "Compra automática pendiente"
   - Notificar cuando se complete la compra
   - O mostrar claramente: "Compra manual por ahora (automatización coming soon)"

**Alternativa (más rápida):** Marcar claramente como "Coming Soon" en UI

#### P0.2.2 - Sincronización de Precios con Marketplaces (3 días)

**Problema:** Botón "Sync Price" existe pero no sincroniza realmente.

**Solución:**
1. **Mejorar método syncProductPrice (2 días)**
   - `backend/src/services/marketplace.service.ts` línea ~900
   - Implementar actualización real de precio en eBay/Amazon/MercadoLibre
   - Manejar errores (qué pasa si el marketplace rechaza el precio)

2. **UI Feedback (1 día)**
   - Mostrar estado de sincronización
   - Notificar si la sincronización falló y por qué

**Alternativa (más rápida):** Deshabilitar botón con tooltip "Próximamente"

#### P0.2.3 - Reportes PDF/Excel (3 días)

**Problema:** Opciones de exportar existen pero no generan PDF/Excel real.

**Solución:**
1. **Implementar generación de PDF (2 días)**
   - Usar librería `pdfkit` o `jspdf`
   - Generar PDF con datos del reporte
   - Incluir branding Ivan Reseller

2. **Implementar generación de Excel (1 día)**
   - Usar librería `exceljs` (ya está en dependencias)
   - Generar Excel con datos del reporte
   - Formato profesional con columnas, filtros

**Alternativa (más rápida):** Mostrar mensaje "Exportación PDF/Excel próximamente. Descarga JSON por ahora."

**Estimación Total P0.2:** 11 días (o 3 días si solo se marcan como "Coming Soon")

**Criterios de Éxito:**
- ✅ Todas las funcionalidades mostradas en UI están implementadas O marcadas claramente como "Coming Soon"
- ✅ No hay botones que "no hacen nada" sin explicación
- ✅ Usuario sabe qué esperar de cada funcionalidad

---

### P0.3 - Mejorar Flujo de Autenticación AliExpress

**Descripción:** Cuando AliExpress requiere login manual, el flujo actual confunde al usuario. Debe ser más claro y guiado.

**Tipo:** UX / Flujo

**Módulo/Ruta Afectada:**
- `frontend/src/pages/Opportunities.tsx`
- `frontend/src/pages/ManualLogin.tsx`
- `backend/src/services/opportunity-finder.service.ts`
- `backend/src/services/manual-auth.service.ts`

**Complejidad:** Media

**Pasos:**

1. **Modal Explicativo ANTES de Abrir Ventana (1 día)**
   - Cuando se detecta que necesita login manual, mostrar modal:
     - Explicación clara: "Necesitamos que inicies sesión en AliExpress para continuar"
     - Pasos claros: "1. Se abrirá una ventana nueva, 2. Inicia sesión en AliExpress, 3. Haz clic en 'Guardar sesión'"
     - Botón "Entendido, Abrir Ventana"
   
2. **Mejorar Página ManualLogin (2 días)**
   - Agregar instrucciones paso a paso visuales
   - Mostrar estado: "Esperando inicio de sesión..."
   - Después de login exitoso: "¡Sesión guardada! Cierra esta ventana y vuelve a la búsqueda."

3. **Retomar Flujo Después de Login (2 días)**
   - Después de cerrar ventana de login, automáticamente retomar búsqueda
   - O mostrar botón "Continuar Búsqueda" en página principal
   - Guardar contexto de búsqueda en localStorage

4. **Alternativa: Scraping Sin Login (opcional, 3-4 días)**
   - Usar proxies rotativos
   - Rotate user agents
   - Implementar stealth techniques más avanzadas
   - Evitar necesidad de login manual completamente

**Estimación Total:** 5-7 días (o 9-11 días si se implementa scraping sin login)

**Criterios de Éxito:**
- ✅ Usuario entiende claramente qué hacer cuando se requiere login manual
- ✅ Flujo no se corta, usuario puede retomar búsqueda después de login
- ✅ No hay confusión sobre qué hacer

---

### P0.4 - Validación de Credenciales Antes de Publicar

**Descripción:** Sistema debe validar que las credenciales de marketplace existan y sean válidas antes de permitir publicar.

**Tipo:** UX / Validación

**Módulo/Ruta Afectada:**
- `frontend/src/pages/Products.tsx`
- `frontend/src/pages/Publisher.tsx`
- `backend/src/api/routes/marketplace.routes.ts`
- `backend/src/services/marketplace.service.ts`

**Complejidad:** Baja-Media

**Pasos:**

1. **Endpoint de Validación (1 día)**
   - Crear `GET /api/marketplace/validate/:marketplace`
   - Retornar estado: `{ exists: boolean, isValid: boolean, issues: string[] }`
   - Validar que las credenciales funcionan realmente (test API call)

2. **Verificar Credenciales Antes de Mostrar Botón "Publish" (1 día)**
   - En `/products` y `/publisher`, verificar credenciales antes de mostrar botón
   - Si faltan credenciales, mostrar mensaje: "Configura tus credenciales de eBay primero" + botón "Ir a Configuración"
   - Mostrar estado visual: ✅ Configurado / ❌ Falta Configurar

3. **Validación en Backend (1 día)**
   - En `publishProduct`, validar credenciales ANTES de intentar publicar
   - Si faltan o son inválidas, error claro: "eBay credentials not configured. Go to Settings → API Settings to configure."

4. **UI Mejoras (1 día)**
   - En página de configuración de APIs, mostrar checklist de marketplaces configurados
   - Link directo desde botón "Publish" deshabilitado a configuración

**Estimación Total:** 4 días

**Criterios de Éxito:**
- ✅ Usuario no puede intentar publicar sin credenciales configuradas
- ✅ Mensaje claro de qué hacer si faltan credenciales
- ✅ Link directo a configuración desde cualquier lugar donde se necesite

---

### P0.5 - Sistema de Registro/Solicitud de Acceso

**Descripción:** Actualmente el registro público está deshabilitado sin forma para que usuarios nuevos soliciten cuenta.

**Tipo:** Funcionalidad / UX

**Módulo/Ruta Afectada:**
- `frontend/src/pages/Login.tsx`
- `frontend/src/pages/RequestAccess.tsx` (nueva página)
- `backend/src/api/routes/auth.routes.ts`
- `backend/prisma/schema.prisma` (nueva tabla `access_requests`)

**Complejidad:** Media

**Pasos:**

#### Opción A: Sistema de Solicitudes (3 días)

1. **Tabla en Base de Datos (1 día)**
   - Crear `AccessRequest` model en Prisma
   - Campos: `email`, `username`, `fullName`, `reason`, `status` (PENDING, APPROVED, REJECTED)
   - Migración

2. **Página de Solicitud (1 día)**
   - Crear `/request-access` en frontend
   - Formulario: email, username, fullName, reason (opcional)
   - Submit → guardar en base de datos

3. **Panel Admin (1 día)**
   - Agregar sección en `/admin` para ver solicitudes pendientes
   - Botones: Aprobar (crear usuario) / Rechazar
   - Al aprobar, crear usuario y enviar email con credenciales

#### Opción B: Registro con Verificación por Email (5 días)

1. **Sistema de Verificación (2 días)**
   - Crear tabla `email_verifications`
   - Generar token único por registro
   - Enviar email con link de verificación

2. **Página de Registro (1 día)**
   - Habilitar endpoint `/api/auth/register`
   - Crear `/register` en frontend
   - Formulario completo con validación

3. **Verificación de Email (2 días)**
   - Usuario recibe email con link
   - Click en link → activa cuenta
   - Usuario puede hacer login

**Recomendación:** Opción A es más rápida y permite control del admin. Opción B es mejor UX pero requiere servicio de email configurado.

**Estimación Total:** 3 días (Opción A) o 5 días (Opción B)

**Criterios de Éxito:**
- ✅ Usuarios nuevos pueden solicitar acceso o registrarse
- ✅ Admin puede aprobar/rechazar solicitudes
- ✅ Usuario recibe confirmación de su solicitud/cuenta creada

---

## 🟠 P1 - TAREAS DE ALTA PRIORIDAD (Mejoran mucho estabilidad/claridad)

### P1.1 - Corregir Inconsistencias en Manejo de Monedas

**Descripción:** Sistema maneja múltiples monedas pero hay inconsistencias en conversiones y redondeo.

**Tipo:** Bugfix / Consistencia

**Módulo/Ruta Afectada:**
- `backend/src/services/fx.service.ts`
- `backend/src/utils/currency.utils.ts`
- `backend/src/services/cost-calculator.service.ts`
- `backend/src/services/sale.service.ts`

**Complejidad:** Media

**Pasos:**

1. **Revisar y Corregir Redondeo (2 días)**
   - CLP/JPY deben redondearse a enteros (0 decimales)
   - Otras monedas a 2 decimales (centavos)
   - Implementar función centralizada `roundCurrency(amount, currency)`

2. **Revisar Conversiones (2 días)**
   - Asegurar que TODAS las conversiones usan `fxService.convert()`
   - No hay conversiones manuales o hardcodeadas
   - Validar que se usa moneda base del usuario desde Settings

3. **Sincronizar Monedas en Cálculos (2 días)**
   - En `sale.service.ts`, asegurar que todos los cálculos usan misma moneda
   - Convertir `costPrice` a `saleCurrency` antes de calcular ganancias
   - Asegurar que comisiones están en la moneda correcta

4. **Testing (1 día)**
   - Tests con diferentes monedas (USD, EUR, CLP, JPY)
   - Verificar redondeo correcto
   - Verificar conversiones precisas

**Estimación Total:** 7 días

**Criterios de Éxito:**
- ✅ Todas las monedas se redondean correctamente
- ✅ Conversiones son consistentes en todo el sistema
- ✅ Cálculos de ganancias y comisiones usan misma moneda
- ✅ Tests pasan con múltiples monedas

---

### P1.2 - Mejorar Autopilot con Mejor Manejo de Errores

**Descripción:** Autopilot puede fallar silenciosamente. Debe notificar claramente cuando falla y por qué.

**Tipo:** Funcionalidad / UX

**Módulo/Ruta Afectada:**
- `backend/src/services/autopilot.service.ts`
- `frontend/src/pages/Autopilot.tsx`
- `backend/src/services/notification.service.ts`

**Complejidad:** Media-Alta

**Pasos:**

1. **Mejorar Manejo de Errores (3 días)**
   - Capturar TODOS los errores en cada etapa del ciclo
   - Si falla scraping → notificar: "Error al buscar oportunidades en AliExpress: [razón]"
   - Si faltan credenciales → notificar: "Configura credenciales de eBay antes de iniciar Autopilot"
   - Si falla publicación → rollback, notificar: "Error al publicar producto X: [razón]"

2. **Rollback Automático (2 días)**
   - Si la publicación falla, deshacer creación de producto
   - O marcar producto como "FAILED" con razón
   - Evitar productos "huérfanos" en estado inconsistente

3. **Notificaciones en Tiempo Real (2 días)**
   - Notificar cuando Autopilot inicia un ciclo
   - Notificar cuando encuentra oportunidades
   - Notificar cuando publica productos exitosamente
   - Notificar cuando falla con razón clara

4. **UI Mejoras (2 días)**
   - Mostrar estado en tiempo real: "Buscando oportunidades...", "Publicando producto X..."
   - Mostrar logs de errores en UI
   - Historial de ciclos con estados (success/failed) y razones

**Estimación Total:** 9 días

**Criterios de Éxito:**
- ✅ Autopilot nunca falla silenciosamente
- ✅ Usuario siempre sabe qué está pasando
- ✅ Si falla, usuario sabe por qué y qué hacer
- ✅ No hay productos "huérfanos" en estado inconsistente

---

### P1.3 - Implementar Paginación en Todos los Listados

**Descripción:** Varios endpoints retornan TODOS los resultados sin paginación, causando problemas de rendimiento.

**Tipo:** Performance / UX

**Módulo/Ruta Afectada:**
- `backend/src/api/routes/products.routes.ts`
- `backend/src/api/routes/sales.routes.ts`
- `backend/src/api/routes/opportunities.routes.ts`
- `backend/src/api/routes/commissions.routes.ts`
- Todos los listados en frontend

**Complejidad:** Media

**Pasos:**

1. **Backend: Agregar Paginación (3 días)**
   - Patrón consistente para TODOS los listados:
     ```typescript
     const page = parseInt(req.query.page as string) || 1;
     const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
     const skip = (page - 1) * limit;
     
     const [items, total] = await Promise.all([
       prisma.resource.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
       prisma.resource.count({ where })
     ]);
     
     return {
       items,
       pagination: {
         page,
         limit,
         total,
         pages: Math.ceil(total / limit),
         hasNext: page < Math.ceil(total / limit),
         hasPrev: page > 1
       }
     };
     ```
   - Actualizar TODOS los endpoints de listados
   - Agregar índices en base de datos para queries paginadas

2. **Frontend: Agregar Paginación UI (2 días)**
   - Componente reutilizable `<Pagination />`
   - Agregar a TODAS las listas
   - Guardar página en URL query params (para compartir links)

3. **Testing (1 día)**
   - Verificar que paginación funciona correctamente
   - Verificar que filtros + paginación funcionan juntos
   - Performance testing con 1000+ items

**Estimación Total:** 6 días

**Criterios de Éxito:**
- ✅ Todos los listados tienen paginación (máximo 100 items por página)
- ✅ UI muestra información de paginación (página X de Y, total items)
- ✅ Performance mejorado significativamente con muchos datos
- ✅ URL query params permiten compartir links a páginas específicas

---

### P1.4 - Consolidar Navegación Duplicada

**Descripción:** Hay múltiples páginas que hacen cosas similares, confundiendo al usuario.

**Tipo:** UX / Refactor

**Módulo/Ruta Afectada:**
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/pages/Opportunities.tsx`
- `frontend/src/pages/Publisher.tsx`
- `frontend/src/pages/APIConfiguration.tsx`
- `frontend/src/pages/APISettings.tsx`
- `frontend/src/pages/APIKeys.tsx`
- `frontend/src/pages/OtherCredentials.tsx`

**Complejidad:** Media

**Pasos:**

1. **Auditoría de Páginas Duplicadas (1 día)**
   - Identificar qué páginas hacen cosas similares
   - Decidir cuál consolidar en cuál
   - Crear plan de migración

2. **Consolidar Páginas de Credenciales (2 días)**
   - `/api-config`, `/api-settings`, `/api-keys`, `/other-credentials` → Una sola página `/settings/api`
   - Tabs dentro de la página para diferentes tipos de credenciales
   - Mantener rutas antiguas con redirect temporal

3. **Consolidar Oportunidades y Publisher (2 días)**
   - Evaluar si `/opportunities` y `/publisher` pueden ser una sola página
   - O mejorar navegación entre ellas (flujo más claro)
   - Breadcrumbs para mostrar dónde está el usuario

4. **Agregar Guía de Primeros Pasos (2 días)**
   - Página `/onboarding` para nuevos usuarios
   - Flujo guiado: "1. Configura credenciales, 2. Busca oportunidades, 3. Publica productos"
   - Checklist visual de pasos completados

**Estimación Total:** 7 días

**Criterios de Éxito:**
- ✅ No hay páginas duplicadas que hagan lo mismo
- ✅ Navegación es clara e intuitiva
- ✅ Nuevos usuarios saben por dónde empezar
- ✅ Breadcrumbs ayudan a entender dónde está el usuario

---

### P1.5 - Mejorar Jobs en Background con Fallback

**Descripción:** Jobs requieren Redis, pero si Redis falla, no hay fallback. Deben poder ejecutarse directamente.

**Tipo:** Funcionalidad / Robustez

**Módulo/Ruta Afectada:**
- `backend/src/config/redis.ts`
- `backend/src/services/job.service.ts`
- Todos los servicios que usan jobs

**Complejidad:** Media

**Pasos:**

1. **Implementar Fallback (3 días)**
   - Si Redis no está disponible, ejecutar jobs directamente (sincrónicamente)
   - Detectar cuando Redis está caído
   - Mostrar warning: "Redis no disponible, jobs ejecutándose directamente (más lento)"

2. **Notificaciones de Estado (1 día)**
   - Endpoint `/api/system/jobs-status` que retorna estado de Redis
   - Mostrar en UI si Redis está disponible o no
   - Notificar al usuario si jobs están ejecutándose lentamente

3. **Testing (1 día)**
   - Verificar que jobs funcionan sin Redis
   - Verificar que performance es aceptable sin Redis
   - Verificar que se restablece automáticamente cuando Redis vuelve

**Estimación Total:** 5 días

**Criterios de Éxito:**
- ✅ Jobs funcionan sin Redis (aunque más lentos)
- ✅ Sistema no se rompe si Redis está caído
- ✅ Usuario sabe si Redis está disponible o no
- ✅ Performance sin Redis es aceptable

---

## 🟡 P2 - TAREAS DE PRIORIDAD MEDIA (Mejoran experiencia, rendimiento o mantenibilidad)

### P2.1 - Mensajes de Error Amigables

**Descripción:** Errores técnicos se muestran directamente al usuario sin contexto amigable.

**Tipo:** UX

**Complejidad:** Baja

**Estimación:** 3 días

**Pasos:**
1. Crear mapeo de errores técnicos a mensajes amigables
2. Actualizar error middleware para usar mapeo
3. Agregar códigos de error y guías de solución

---

### P2.2 - Validación de Límites de Productos Pendientes

**Descripción:** Validar límite `maxPendingProducts` antes de crear productos.

**Tipo:** Control / Validación

**Complejidad:** Baja

**Estimación:** 2 días

**Pasos:**
1. Validar límite en `product.service.ts` antes de crear
2. Mensaje claro si se alcanza límite
3. UI muestra límite actual vs límite máximo

---

### P2.3 - Documentación de Webhooks

**Descripción:** Agregar guía paso a paso para configurar webhooks en marketplaces.

**Tipo:** Documentación

**Complejidad:** Baja

**Estimación:** 3 días

**Pasos:**
1. Documentar proceso para eBay, Amazon, MercadoLibre
2. Agregar a `/help` o crear página dedicada
3. Screenshots y ejemplos

---

### P2.4 - Health Check Mejorado

**Descripción:** Mejorar endpoint `/health` para monitoreo externo.

**Tipo:** Observabilidad

**Complejidad:** Baja

**Estimación:** 2 días

**Pasos:**
1. Agregar más información a `/health` (versión, servicios, base de datos)
2. Crear `/status` público con información útil
3. Formato JSON estructurado para monitoreo

---

### P2.5 - Logs Accesibles para Usuarios

**Descripción:** Permitir que usuarios vean logs relevantes de sus acciones.

**Tipo:** UX / Autoservicio

**Complejidad:** Media

**Estimación:** 3 días

**Pasos:**
1. Página `/my-activity` que muestra logs del usuario
2. Filtrar logs por usuario
3. Formato amigable (no raw logs)

---

## 🔵 P3 - TAREAS DE BAJA PRIORIDAD (Nice to Have)

### P3.1 - Documentación Técnica Completa

**Descripción:** Organizar y actualizar documentación técnica.

**Tipo:** Documentación

**Complejidad:** Baja

**Estimación:** 4 días

---

### P3.2 - Tests E2E Completos

**Descripción:** Agregar tests end-to-end para flujos críticos.

**Tipo:** Testing

**Complejidad:** Media-Alta

**Estimación:** 7 días

---

### P3.3 - Optimización de Performance (Índices)

**Descripción:** Agregar índices faltantes en base de datos.

**Tipo:** Performance

**Complejidad:** Baja

**Estimación:** 2 días

---

## 📊 RESUMEN DE PRIORIZACIÓN

### ANTES DE USUARIOS REALES (P0)
- ✅ P0.1: Seguridad Multi-Tenant (7-9 días)
- ✅ P0.2: Funcionalidades Faltantes (3-11 días)
- ✅ P0.3: Flujo AliExpress (5-7 días)
- ✅ P0.4: Validación Credenciales (4 días)
- ✅ P0.5: Sistema Registro (3-5 días)

**TOTAL P0:** 22-36 días (con mejoras) o 14-20 días (marcando "Coming Soon")

### ANTES DE DEMO INVERSIONISTAS (P0 + P1)
- ✅ Todas las P0 anteriores
- ✅ P1.1: Monedas (7 días)
- ✅ P1.2: Autopilot (9 días)
- ✅ P1.3: Paginación (6 días)
- ✅ P1.4: Navegación (7 días)
- ✅ P1.5: Jobs Fallback (5 días)

**TOTAL P0+P1:** 56-70 días (con mejoras) o 48-54 días (marcando "Coming Soon")

### MEJORAS CONTINUAS (P2 + P3)
- P2.1-P2.5: 13 días
- P3.1-P3.3: 13 días

**TOTAL P2+P3:** 26 días

---

## 🎯 ESTRATEGIA RECOMENDADA

### Fase 1: Mínimo Viable (2-3 semanas)
1. P0.1 - Seguridad Multi-Tenant (CRÍTICO)
2. P0.3 - Flujo AliExpress (CRÍTICO para UX)
3. P0.4 - Validación Credenciales (CRÍTICO para UX)
4. P0.5 - Sistema Registro (CRÍTICO para crecimiento)
5. P0.2 - Marcar funcionalidades como "Coming Soon" (RÁPIDO, no implementar)

**Resultado:** Sistema seguro y usable, aunque con algunas funcionalidades marcadas como "Coming Soon"

### Fase 2: Estabilidad y Claridad (2-3 semanas adicionales)
6. P1.1 - Monedas
7. P1.3 - Paginación
8. P1.4 - Navegación
9. P1.2 - Autopilot (parcial, al menos manejo de errores mejor)
10. P1.5 - Jobs Fallback

**Resultado:** Sistema estable, claro y listo para demo

### Fase 3: Mejoras Continuas (1-2 meses)
- P0.2 - Implementar funcionalidades marcadas como "Coming Soon"
- P2.1-P2.5 - Mejoras de UX
- P3.1-P3.3 - Optimizaciones y documentación

**Resultado:** Sistema completo y optimizado

---

**Próximo Paso:** Revisar `CHECKLIST_QA_IVAN_RESELLER.md` para lista de pruebas antes de lanzamiento.


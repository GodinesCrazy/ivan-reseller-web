# 📋 FASE 2 – BACKLOG DE CORRECCIONES
## Sistema Ivan Reseller Web - Plan de Trabajo Técnico

**Fecha:** 2025-11-17  
**Basado en:** AUDITORIA_FASE_1_COMPLETA.md  
**Prioridad:** Críticos → Medios → Bajos

---

## 🎯 RESUMEN EJECUTIVO

**Total de Ítems:** 47  
**Críticos (Alto Impacto):** 8  
**Medios (Impacto Medio):** 18  
**Bajos (Impacto Bajo):** 21

**Estimación Total:** 12-18 días de trabajo

---

## 🔴 PRIORIDAD 1: CRÍTICOS (Alto Impacto)

### A1 - Verificación Completa Multi-Tenant
- **ID:** A1
- **Tipo:** Seguridad / Multi-Tenant
- **Impacto:** ALTO
- **Zona:** Backend - Servicios
- **Archivos:** Todos los servicios que consultan DB
- **Descripción:** Verificar exhaustivamente que TODOS los servicios filtren correctamente por `userId` cuando `role !== 'ADMIN'`. Identificar y corregir cualquier data leakage.
- **Criterios de Aceptación:**
  - Todos los servicios verifican `req.user.role` antes de filtrar
  - USER solo ve sus datos
  - ADMIN puede ver todos los datos
  - Tests de aislamiento pasan (2 usuarios, verificar que no ven datos del otro)

### A2 - Verificación de Queries Prisma sin Filtro userId
- **ID:** A2
- **Tipo:** Seguridad / Multi-Tenant
- **Impacto:** ALTO
- **Zona:** Backend - Servicios
- **Archivos:** 
  - `dashboard.routes.ts` (línea 91: `prisma.sale.findMany`)
  - `reports.service.ts` (múltiples queries)
  - `finance.routes.ts` (múltiples queries)
  - `advanced-reports.service.ts` (múltiples queries)
  - `revenue-change.service.ts` (múltiples queries)
  - `ai-suggestions.service.ts` (líneas 417, 433, 445)
  - `anti-churn.service.ts` (líneas 98, 283)
  - `ai-opportunity.service.ts` (línea 803)
  - `ceo-agent.service.ts` (líneas 217, 287)
  - `publication-optimizer.service.ts` (líneas 31, 78)
  - `financial-alerts.service.ts` (múltiples queries)
- **Descripción:** Revisar todas las queries Prisma identificadas en grep para asegurar que filtran por `userId` cuando corresponde (excepto ADMIN).
- **Criterios de Aceptación:**
  - Todas las queries de USER incluyen `where: { userId }` o `where: { userId: req.user.userId }`
  - ADMIN puede omitir el filtro
  - Tests de aislamiento pasan

### A3 - Verificación de Rutas sin Protección userId
- **ID:** A3
- **Tipo:** Seguridad / Multi-Tenant
- **Impacto:** ALTO
- **Zona:** Backend - Routes
- **Archivos:** Todas las rutas en `backend/src/api/routes/`
- **Descripción:** Verificar que todas las rutas que devuelven datos de usuario filtren correctamente. Especial atención a:
  - `dashboard.routes.ts` - Stats globales vs por usuario
  - `finance.routes.ts` - Datos financieros
  - `reports.routes.ts` - Reportes por usuario
  - `ai-suggestions.routes.ts` - Sugerencias por usuario
- **Criterios de Aceptación:**
  - Todas las rutas verifican `req.user.role`
  - USER solo accede a sus datos
  - ADMIN puede acceder a todos los datos
  - Tests E2E de aislamiento pasan

### A4 - Amazon SP-API Completar Implementación
- **ID:** A4
- **Tipo:** Falta de Funcionalidad
- **Impacto:** ALTO
- **Zona:** Backend - Servicios
- **Archivos:** 
  - `amazon.service.ts`
  - `amazon.controller.ts`
  - `amazon.routes.ts`
- **Descripción:** Completar las funcionalidades faltantes de Amazon SP-API (actualmente ~70%). Implementar:
  - Gestión completa de inventario
  - Actualización de precios masiva
  - Sincronización de órdenes
  - Gestión de listings avanzada
  - Manejo de errores específicos de Amazon
- **Criterios de Aceptación:**
  - Todas las operaciones básicas funcionan
  - Manejo de errores robusto
  - Tests de integración pasan
  - Documentación Swagger completa

### A5 - Migrar Jobs Pesados a BullMQ
- **ID:** A5
- **Tipo:** Mejora / Escalabilidad
- **Impacto:** ALTO
- **Zona:** Backend - Jobs
- **Archivos:**
  - `scheduled-tasks.service.ts` (node-cron → BullMQ)
  - `scheduled-reports.service.ts` (node-cron → BullMQ)
  - `api-health-monitor.service.ts` (interval → BullMQ)
  - `autopilot.service.ts` (timer → BullMQ opcional)
- **Descripción:** Migrar jobs programados de `node-cron` a BullMQ para:
  - Retry automático en caso de fallo
  - Mejor escalabilidad (múltiples workers)
  - Monitoreo y logging mejorado
  - Priorización de jobs
- **Criterios de Aceptación:**
  - Todos los jobs críticos usan BullMQ
  - Retry automático configurado
  - Workers configurados correctamente
  - Dashboard de BullMQ muestra jobs

### A6 - Verificación de Autopilot Multi-Tenant
- **ID:** A6
- **Tipo:** Seguridad / Multi-Tenant
- **Impacto:** ALTO
- **Zona:** Backend - Autopilot
- **Archivos:**
  - `autopilot.service.ts`
  - `autopilot.routes.ts`
- **Descripción:** Verificar que Autopilot:
  - Usa credenciales del usuario correcto (no hardcodeadas)
  - Respeta `userId` en todas las operaciones
  - No accede a datos de otros usuarios
  - Respeta `WorkflowConfig` del usuario
- **Criterios de Aceptación:**
  - Autopilot usa `req.user.userId` o `userId` pasado como parámetro
  - Credenciales se obtienen del usuario correcto
  - Tests de aislamiento pasan (2 usuarios, Autopilot independiente)

### A7 - Verificación de Credenciales API Multi-Tenant
- **ID:** A7
- **Tipo:** Seguridad / Multi-Tenant
- **Impacto:** ALTO
- **Zona:** Backend - Servicios
- **Archivos:**
  - `api-availability.service.ts` (verificar que acepta userId)
  - `stealth-scraping.service.ts`
  - `ebay.service.ts`
  - `mercadolibre.service.ts`
  - `amazon.service.ts`
  - `marketplace.service.ts`
- **Descripción:** Verificar que todos los servicios de marketplace:
  - Obtienen credenciales del usuario correcto
  - No usan credenciales globales (SystemConfig) cuando deben ser per-user
  - `APIAvailabilityService` acepta `userId` como parámetro
- **Criterios de Aceptación:**
  - Todos los servicios aceptan `userId`
  - Credenciales se obtienen de `ApiCredential` con `userId`
  - No hay uso de `SystemConfig` para credenciales per-user
  - Tests de aislamiento pasan

### A8 - Verificación de Flujos de Dropshipping End-to-End
- **ID:** A8
- **Tipo:** Bug / Funcionalidad
- **Impacto:** ALTO
- **Zona:** Backend + Frontend
- **Archivos:** Múltiples (todo el flujo)
- **Descripción:** Verificar que los flujos completos funcionan:
  - **Manual Sandbox:** Usuario → Config APIs → Buscar oportunidad → Crear producto → Publicar → Venta → Comisión
  - **Manual Producción:** Mismo flujo con environment=production
  - **Autopilot Sandbox:** Config → Activar → Ciclo completo sin intervención
  - **Autopilot Producción:** Mismo con environment=production
- **Criterios de Aceptación:**
  - Todos los flujos funcionan end-to-end
  - No hay errores en ningún paso
  - Datos se guardan correctamente
  - Cálculos financieros correctos
  - Tests E2E pasan

---

## 🟡 PRIORIDAD 2: MEDIOS (Impacto Medio)

### B1 - Sanitización de Inputs de Usuario
- **ID:** B1
- **Tipo:** Seguridad
- **Impacto:** MEDIO
- **Zona:** Backend + Frontend
- **Archivos:** Rutas que reciben input de usuario
- **Descripción:** Verificar y mejorar sanitización de inputs para prevenir XSS y inyección.
- **Criterios de Aceptación:**
  - Todos los inputs se sanitizan
  - React escapa automáticamente (verificar)
  - Backend valida y sanitiza antes de guardar

### B2 - Tokens CSRF para Operaciones Críticas
- **ID:** B2
- **Tipo:** Seguridad
- **Impacto:** MEDIO
- **Zona:** Backend + Frontend
- **Archivos:** Rutas de operaciones críticas (pago, publicación, etc.)
- **Descripción:** Implementar tokens CSRF para operaciones críticas (pago de comisiones, publicación masiva, etc.).
- **Criterios de Aceptación:**
  - Tokens CSRF generados y validados
  - Frontend incluye tokens en requests críticos
  - Tests de CSRF pasan

### B3 - Revisión de Logs para Datos Sensibles
- **ID:** B3
- **Tipo:** Seguridad
- **Impacto:** MEDIO
- **Zona:** Backend
- **Archivos:** Todos los archivos que usan `logger`
- **Descripción:** Revisar todos los logs para asegurar que no se registran credenciales, tokens, o datos sensibles. Usar `redact.ts` donde sea necesario.
- **Criterios de Aceptación:**
  - No hay credenciales en logs
  - No hay tokens completos en logs
  - `redact.ts` se usa donde corresponde
  - Tests de redacción pasan

### B4 - Mejorar Manejo de Errores en Marketplaces
- **ID:** B4
- **Tipo:** Mejora
- **Impacto:** MEDIO
- **Zona:** Backend - Servicios Marketplace
- **Archivos:**
  - `ebay.service.ts`
  - `mercadolibre.service.ts`
  - `amazon.service.ts`
  - `marketplace.service.ts`
- **Descripción:** Mejorar manejo de errores específicos de cada marketplace (rate limits, autenticación, etc.) con mensajes claros y retry inteligente.
- **Criterios de Aceptación:**
  - Errores específicos de marketplace se manejan correctamente
  - Mensajes de error claros para el usuario
  - Retry automático cuando corresponde
  - Logs estructurados

### B5 - Completar PDF Reports (Puppeteer)
- **ID:** B5
- **Tipo:** Falta de Funcionalidad
- **Impacto:** MEDIO
- **Zona:** Backend - Reports
- **Archivos:** `reports.service.ts` - `generatePDFReport()`
- **Descripción:** Según el manual, PDF genera HTML en lugar de PDF real. Verificar y corregir para que genere PDF real con Puppeteer.
- **Criterios de Aceptación:**
  - PDF se genera correctamente con Puppeteer
  - Formato correcto (A4, márgenes, etc.)
  - Descarga funciona
  - Tests de generación pasan

### B6 - Verificar Autopilot Workflows Avanzados
- **ID:** B6
- **Tipo:** Falta de Funcionalidad
- **Impacto:** MEDIO
- **Zona:** Backend - Autopilot
- **Archivos:** `autopilot.routes.ts` - endpoints `/workflows`
- **Descripción:** Según el manual, endpoints de workflows avanzados pueden tener placeholders. Verificar y completar implementación.
- **Criterios de Aceptación:**
  - Endpoints de workflows funcionan
  - No hay placeholders
  - Tests de workflows pasan

### B7 - Mejorar Validación de Credenciales API
- **ID:** B7
- **Tipo:** Mejora
- **Impacto:** MEDIO
- **Zona:** Backend - Credentials
- **Archivos:** `credentials-manager.service.ts`
- **Descripción:** Mejorar validación de credenciales antes de guardar (verificar formato, hacer test de conexión opcional, etc.).
- **Criterios de Aceptación:**
  - Validación robusta de formato
  - Test de conexión opcional
  - Mensajes de error claros
  - Tests de validación pasan

### B8 - Optimizar Queries de Reportes
- **ID:** B8
- **Tipo:** Performance
- **Impacto:** MEDIO
- **Zona:** Backend - Reports
- **Archivos:** `reports.service.ts`, `advanced-reports.service.ts`
- **Descripción:** Optimizar queries de reportes para grandes volúmenes de datos (paginación, índices, agregaciones).
- **Criterios de Aceptación:**
  - Queries optimizadas con índices
  - Paginación implementada
  - Performance aceptable con 10k+ registros
  - Tests de performance pasan

### B9 - Mejorar Manejo de Rate Limits
- **ID:** B9
- **Tipo:** Mejora
- **Impacto:** MEDIO
- **Zona:** Backend - Servicios Marketplace
- **Archivos:** Servicios de marketplace
- **Descripción:** Mejorar manejo de rate limits de APIs externas (detectar, esperar, retry, notificar usuario).
- **Criterios de Aceptación:**
  - Rate limits se detectan correctamente
  - Retry automático después de espera
  - Usuario notificado cuando corresponde
  - Tests de rate limiting pasan

### B10 - Completar Tests de Integración
- **ID:** B10
- **Tipo:** Testing
- **Impacto:** MEDIO
- **Zona:** Backend - Tests
- **Archivos:** `backend/src/__tests__/integration/`
- **Descripción:** Completar tests de integración para flujos críticos:
  - Flujo completo de dropshipping (manual)
  - Flujo completo de Autopilot
  - Multi-tenant isolation
  - Publicación en marketplaces
- **Criterios de Aceptación:**
  - Tests de integración completos
  - Coverage > 70%
  - Todos los tests pasan

### B11 - Mejorar Manejo de Errores en Frontend
- **ID:** B11
- **Tipo:** UX / Mejora
- **Impacto:** MEDIO
- **Zona:** Frontend
- **Archivos:** Componentes y páginas principales
- **Descripción:** Mejorar manejo de errores en frontend (mensajes claros, retry automático, estados de error consistentes).
- **Criterios de Aceptación:**
  - Mensajes de error claros y útiles
  - Retry automático cuando corresponde
  - Estados de error consistentes
  - Tests de UI pasan

### B12 - Verificar Cálculo de Finanzas en Todos los Flujos
- **ID:** B12
- **Tipo:** Bug / Validación
- **Impacto:** MEDIO
- **Zona:** Backend - Services
- **Archivos:** `sale.service.ts`, `commission.service.ts`
- **Descripción:** Verificar que el cálculo de finanzas (ingresos, costos, fees, comisiones, ganancias) es correcto en todos los escenarios (ventas normales, devoluciones, cancelaciones, etc.).
- **Criterios de Aceptación:**
  - Cálculos correctos en todos los escenarios
  - Tests de cálculo pasan
  - Documentación de fórmulas actualizada

### B13 - Mejorar Monitoreo de Health de APIs
- **ID:** B13
- **Tipo:** Mejora
- **Impacto:** MEDIO
- **Zona:** Backend - Monitoring
- **Archivos:** `api-health-monitor.service.ts`
- **Descripción:** Mejorar monitoreo de health de APIs (latencia, disponibilidad, errores, alertas).
- **Criterios de Aceptación:**
  - Monitoreo robusto de todas las APIs
  - Alertas cuando APIs fallan
  - Dashboard de health disponible
  - Tests de monitoreo pasan

### B14 - Optimizar Scraping de AliExpress
- **ID:** B14
- **Tipo:** Performance
- **Impacto:** MEDIO
- **Zona:** Backend - Scraping
- **Archivos:** `stealth-scraping.service.ts`, `advanced-scraper.service.ts`
- **Descripción:** Optimizar scraping de AliExpress (cache, rate limiting, retry inteligente, paralelización).
- **Criterios de Aceptación:**
  - Scraping más rápido
  - Cache implementado
  - Rate limiting respetado
  - Tests de performance pasan

### B15 - Mejorar Notificaciones en Tiempo Real
- **ID:** B15
- **Tipo:** UX / Mejora
- **Impacto:** MEDIO
- **Zona:** Backend + Frontend
- **Archivos:** `notification.service.ts`, `useNotifications.ts`
- **Descripción:** Mejorar sistema de notificaciones en tiempo real (prioridades, categorías, persistencia, historial).
- **Criterios de Aceptación:**
  - Notificaciones funcionan correctamente
  - Prioridades y categorías implementadas
  - Historial de notificaciones disponible
  - Tests de notificaciones pasan

### B16 - Completar Documentación Swagger
- **ID:** B16
- **Tipo:** Documentación
- **Impacto:** MEDIO
- **Zona:** Backend
- **Archivos:** `swagger.ts`, rutas con Swagger docs
- **Descripción:** Completar documentación Swagger para todos los endpoints (ejemplos, schemas, respuestas).
- **Criterios de Aceptación:**
  - Todos los endpoints documentados
  - Ejemplos incluidos
  - Schemas completos
  - Swagger UI funciona correctamente

### B17 - Mejorar Validación de Formularios Frontend
- **ID:** B17
- **Tipo:** UX / Mejora
- **Impacto:** MEDIO
- **Zona:** Frontend
- **Archivos:** Formularios en páginas
- **Descripción:** Mejorar validación de formularios en frontend (validación en tiempo real, mensajes claros, prevención de envío inválido).
- **Criterios de Aceptación:**
  - Validación en tiempo real
  - Mensajes claros
  - Prevención de envío inválido
  - Tests de formularios pasan

### B18 - Verificar Consistencia de Estados
- **ID:** B18
- **Tipo:** Bug / Validación
- **Impacto:** MEDIO
- **Zona:** Backend + Frontend
- **Archivos:** Múltiples
- **Descripción:** Verificar consistencia de estados entre frontend y backend (productos, ventas, comisiones, etc.).
- **Criterios de Aceptación:**
  - Estados consistentes
  - Sincronización correcta
  - Tests de consistencia pasan

---

## 🟢 PRIORIDAD 3: BAJOS (Impacto Bajo)

### C1 - Eliminar Código con @ts-nocheck
- **ID:** C1
- **Tipo:** Mejora / Code Quality
- **Impacto:** BAJO
- **Zona:** Backend + Frontend
- **Archivos:** 13 archivos identificados anteriormente
- **Descripción:** Eliminar `@ts-nocheck` y corregir tipos TypeScript.
- **Criterios de Aceptación:**
  - No hay `@ts-nocheck` en código
  - Todos los tipos correctos
  - Compilación sin errores

### C2 - Eliminar Archivos Legacy
- **ID:** C2
- **Tipo:** Limpieza
- **Impacto:** BAJO
- **Zona:** Backend
- **Archivos:** `settings.routes.old.ts`
- **Descripción:** Eliminar archivos legacy que no se usan.
- **Criterios de Aceptación:**
  - Archivos legacy eliminados
  - No hay referencias rotas
  - Tests pasan

### C3 - Mejorar JSDoc en Servicios
- **ID:** C3
- **Tipo:** Documentación
- **Impacto:** BAJO
- **Zona:** Backend
- **Archivos:** Servicios sin JSDoc completo
- **Descripción:** Completar JSDoc en servicios que no lo tienen.
- **Criterios de Aceptación:**
  - JSDoc completo en todos los servicios
  - Documentación clara y útil

### C4 - Optimizar Imports
- **ID:** C4
- **Tipo:** Performance / Code Quality
- **Impacto:** BAJO
- **Zona:** Backend + Frontend
- **Archivos:** Todos
- **Descripción:** Optimizar imports (eliminar no usados, usar barrel exports donde corresponda).
- **Criterios de Aceptación:**
  - No hay imports no usados
  - Barrel exports donde corresponde
  - Build más rápido

### C5 - Mejorar Logging Estructurado
- **ID:** C5
- **Tipo:** Mejora
- **Impacto:** BAJO
- **Zona:** Backend
- **Archivos:** Todos los archivos que usan `logger`
- **Descripción:** Mejorar logging estructurado (contexto consistente, niveles correctos, metadata útil).
- **Criterios de Aceptación:**
  - Logging estructurado consistente
  - Niveles correctos
  - Metadata útil

### C6 - Agregar Tests Unitarios Faltantes
- **ID:** C6
- **Tipo:** Testing
- **Impacto:** BAJO
- **Zona:** Backend
- **Archivos:** Servicios sin tests
- **Descripción:** Agregar tests unitarios para servicios que no los tienen.
- **Criterios de Aceptación:**
  - Coverage > 70%
  - Todos los tests pasan

### C7 - Mejorar Manejo de Errores en Jobs
- **ID:** C7
- **Tipo:** Mejora
- **Impacto:** BAJO
- **Zona:** Backend - Jobs
- **Archivos:** Jobs en BullMQ y node-cron
- **Descripción:** Mejorar manejo de errores en jobs (logging, notificaciones, retry).
- **Criterios de Aceptación:**
  - Errores en jobs se manejan correctamente
  - Logging adecuado
  - Notificaciones cuando corresponde

### C8 - Optimizar Queries de Dashboard
- **ID:** C8
- **Tipo:** Performance
- **Impacto:** BAJO
- **Zona:** Backend - Dashboard
- **Archivos:** `dashboard.routes.ts`
- **Descripción:** Optimizar queries de dashboard (cache, agregaciones, índices).
- **Criterios de Aceptación:**
  - Dashboard carga rápido
  - Cache implementado
  - Queries optimizadas

### C9 - Mejorar UI de Configuración de APIs
- **ID:** C9
- **Tipo:** UX
- **Impacto:** BAJO
- **Zona:** Frontend
- **Archivos:** `APISettings.tsx`
- **Descripción:** Mejorar UI de configuración de APIs (validación visual, test de conexión, ayuda contextual).
- **Criterios de Aceptación:**
  - UI mejorada
  - Validación visual
  - Test de conexión disponible

### C10 - Agregar Métricas y Analytics
- **ID:** C10
- **Tipo:** Mejora
- **Impacto:** BAJO
- **Zona:** Backend
- **Archivos:** Nuevo servicio de métricas
- **Descripción:** Agregar sistema de métricas y analytics (performance, uso, errores).
- **Criterios de Aceptación:**
  - Métricas implementadas
  - Dashboard de analytics disponible
  - Tests de métricas pasan

### C11 - Mejorar Manejo de Archivos
- **ID:** C11
- **Tipo:** Mejora
- **Impacto:** BAJO
- **Zona:** Backend
- **Archivos:** Servicios que manejan archivos
- **Descripción:** Mejorar manejo de archivos (validación, tamaño, tipo, almacenamiento).
- **Criterios de Aceptación:**
  - Validación de archivos robusta
  - Almacenamiento correcto
  - Tests de archivos pasan

### C12 - Optimizar Bundle Size Frontend
- **ID:** C12
- **Tipo:** Performance
- **Impacto:** BAJO
- **Zona:** Frontend
- **Archivos:** `frontend/package.json`, imports
- **Descripción:** Optimizar bundle size del frontend (code splitting, tree shaking, lazy loading).
- **Criterios de Aceptación:**
  - Bundle size optimizado
  - Code splitting implementado
  - Lazy loading donde corresponde

### C13 - Mejorar Accesibilidad (a11y)
- **ID:** C13
- **Tipo:** UX
- **Impacto:** BAJO
- **Zona:** Frontend
- **Archivos:** Componentes
- **Descripción:** Mejorar accesibilidad (ARIA labels, keyboard navigation, screen readers).
- **Criterios de Aceptación:**
  - ARIA labels agregados
  - Keyboard navigation funciona
  - Tests de accesibilidad pasan

### C14 - Agregar Internacionalización (i18n)
- **ID:** C14
- **Tipo:** Mejora
- **Impacto:** BAJO
- **Zona:** Frontend
- **Archivos:** Componentes y páginas
- **Descripción:** Agregar soporte para múltiples idiomas (español, inglés).
- **Criterios de Aceptación:**
  - i18n implementado
  - Español e inglés disponibles
  - Cambio de idioma funciona

### C15 - Mejorar Manejo de Imágenes
- **ID:** C15
- **Tipo:** Mejora
- **Impacto:** BAJO
- **Zona:** Frontend
- **Archivos:** Componentes que muestran imágenes
- **Descripción:** Mejorar manejo de imágenes (lazy loading, optimización, fallbacks).
- **Criterios de Aceptación:**
  - Lazy loading implementado
  - Optimización de imágenes
  - Fallbacks cuando fallan

### C16 - Agregar Tests E2E
- **ID:** C16
- **Tipo:** Testing
- **Impacto:** BAJO
- **Zona:** E2E
- **Archivos:** Nuevos tests E2E
- **Descripción:** Agregar tests E2E para flujos críticos (Playwright o Cypress).
- **Criterios de Aceptación:**
  - Tests E2E implementados
  - Flujos críticos cubiertos
  - Tests pasan

### C17 - Mejorar Documentación de API
- **ID:** C17
- **Tipo:** Documentación
- **Impacto:** BAJO
- **Zona:** Backend
- **Archivos:** Swagger docs
- **Descripción:** Mejorar documentación de API (ejemplos más completos, guías de uso).
- **Criterios de Aceptación:**
  - Documentación completa
  - Ejemplos útiles
  - Guías de uso incluidas

### C18 - Agregar Health Checks Avanzados
- **ID:** C18
- **Tipo:** Mejora
- **Impacto:** BAJO
- **Zona:** Backend
- **Archivos:** `system.routes.ts`
- **Descripción:** Agregar health checks avanzados (DB, Redis, APIs externas, disk space).
- **Criterios de Aceptación:**
  - Health checks implementados
  - Monitoreo de dependencias
  - Tests de health pasan

### C19 - Mejorar Manejo de Caché
- **ID:** C19
- **Tipo:** Performance
- **Impacto:** BAJO
- **Zona:** Backend
- **Archivos:** Servicios que usan caché
- **Descripción:** Mejorar manejo de caché (TTL, invalidación, estrategias).
- **Criterios de Aceptación:**
  - Caché implementado correctamente
  - TTL apropiados
  - Invalidación funciona

### C20 - Optimizar Base de Datos
- **ID:** C20
- **Tipo:** Performance
- **Impacto:** BAJO
- **Zona:** Database
- **Archivos:** `schema.prisma`, migraciones
- **Descripción:** Optimizar base de datos (índices adicionales, queries optimizadas, VACUUM).
- **Criterios de Aceptación:**
  - Índices optimizados
  - Queries rápidas
  - Tests de performance pasan

### C21 - Mejorar Manejo de Variables de Entorno
- **ID:** C21
- **Tipo:** Mejora
- **Impacto:** BAJO
- **Zona:** Backend + Frontend
- **Archivos:** `.env`, `env.ts`
- **Descripción:** Mejorar manejo de variables de entorno (validación, defaults, documentación).
- **Criterios de Aceptación:**
  - Validación robusta
  - Defaults apropiados
  - Documentación completa

---

## 📊 RESUMEN POR PRIORIDAD

| Prioridad | Cantidad | Estimación |
|-----------|----------|------------|
| **Críticos (A)** | 8 | 5-7 días |
| **Medios (B)** | 18 | 5-8 días |
| **Bajos (C)** | 21 | 2-3 días |
| **TOTAL** | **47** | **12-18 días** |

---

## 🎯 ORDEN DE EJECUCIÓN RECOMENDADO

### Semana 1: Críticos de Seguridad
1. A1 - Verificación Completa Multi-Tenant
2. A2 - Verificación de Queries Prisma
3. A3 - Verificación de Rutas sin Protección
4. A7 - Verificación de Credenciales API Multi-Tenant
5. A6 - Verificación de Autopilot Multi-Tenant

### Semana 2: Funcionalidad y Escalabilidad
6. A4 - Amazon SP-API Completar
7. A5 - Migrar Jobs a BullMQ
8. A8 - Verificación de Flujos End-to-End
9. B10 - Completar Tests de Integración
10. B5 - Completar PDF Reports

### Semana 3: Mejoras y Optimizaciones
11. B1-B18 - Ítems Medios según prioridad
12. C1-C21 - Ítems Bajos según prioridad

---

## ✅ CRITERIOS DE COMPLETITUD

Un ítem se considera **COMPLETADO** cuando:
- ✅ Código implementado y revisado
- ✅ Tests pasan (unitarios, integración, E2E según corresponda)
- ✅ Documentación actualizada
- ✅ Sin errores de compilación
- ✅ Sin regresiones en funcionalidad existente

---

**Fin de FASE 2 - Backlog de Correcciones**


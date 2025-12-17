# Production Readiness Report - Ivan Reseller Web

**Última actualización:** 2025-01-XX  
**Rama:** `fix/production-100`  
**Estado general:** 🟡 EN PROGRESO

---

## 📋 Issues Identificados - Estado de Resolución

### 🔴 CRÍTICO - SIGSEGV en producción (health checks)
- **Estado:** 🟡 EN PROGRESO (FASE 1)
- **Fase:** FASE 1
- **Descripción:** Crashes SIGSEGV durante health checks automáticos cada 45-50 minutos
- **Ubicación:** `backend/src/services/api-availability.service.ts`
- **Acciones completadas:**
  - ✅ Feature flags agregados: `API_HEALTHCHECK_ENABLED`, `API_HEALTHCHECK_MODE`
  - ✅ Timeouts estrictos agregados a `getCached`/`setCached` (1 segundo)
  - ✅ Modo async implementado usando BullMQ
  - ✅ Monitor configurado para usar BullMQ en modo async
  - ✅ Concurrencia reducida en worker (2 en lugar de 3)
  - ✅ Timeout global de 30s en worker, 25s por job
- **Pendiente:**
  - [ ] Tests unitarios de getCached/setCached con timeouts
  - [ ] Tests del worker de BullMQ
  - [ ] Validar en staging que no hay SIGSEGV

### 🔴 CRÍTICO - Scraping (bridge Python faltante)
- **Estado:** 🔴 PENDIENTE
- **Fase:** FASE 2
- **Descripción:** Dependencia de microservicio Python no incluido en repo
- **Ubicación:** `backend/src/services/scraper-bridge.service.ts`
- **Problema:** Hardcode a `http://localhost:5000/scraping/aliexpress/search`
- **Acción requerida:** 
  - Crear env `SCRAPER_BRIDGE_URL`
  - Opción A: Incluir bridge Python en repo
  - Opción B: Eliminar bridge, usar solo stealth-scraping
  - Documentar en `docs/SCRAPING.md`

### 🔴 CRÍTICO - Webhooks sin validación de firma
- **Estado:** 🔴 PENDIENTE
- **Fase:** FASE 3
- **Descripción:** Webhooks aceptan payloads sin validar firmas HMAC
- **Ubicación:** `backend/src/api/routes/webhooks.routes.ts`
- **Riesgo:** Alto - Seguridad
- **Acción requerida:** Implementar validación HMAC por marketplace con feature flags

### 🔴 CRÍTICO - Compra automática sin guardrails
- **Estado:** 🔴 PENDIENTE
- **Fase:** FASE 4
- **Descripción:** Compra automática implementada pero sin validación en producción
- **Ubicación:** `backend/src/services/aliexpress-auto-purchase.service.ts`
- **Riesgo:** Alto - Financiero
- **Acción requerida:**
  - Feature flag `AUTO_PURCHASE_ENABLED=false` por defecto
  - Límites diarios/mensuales
  - Validación de capital robusta
  - Idempotencia
  - Modo dry-run
  - Tests

### 🟡 MEDIO - Inconsistencias frontend/backend (estados de APIs)
- **Estado:** 🟡 PENDIENTE
- **Fase:** FASE 5
- **Descripción:** UI muestra estados contradictorios ("Configurado" vs "No configurado")
- **Ubicación:** `frontend/src/pages/APISettings.tsx`
- **Acción requerida:** Unificar contrato de estado, eliminar lógica duplicada

### 🟡 MEDIO - Puppeteer puede fallar en Railway
- **Estado:** 🟡 PENDIENTE
- **Fase:** FASE 2
- **Descripción:** Puppeteer requiere Chromium que puede no estar disponible
- **Ubicación:** `backend/src/services/stealth-scraping.service.ts`, `backend/src/utils/chromium.ts`
- **Acción requerida:** Configurar Dockerfile, fallback robusto

### 🟡 MEDIO - Rate limiting sin configuración clara
- **Estado:** 🟡 PENDIENTE
- **Fase:** FASE 8
- **Descripción:** Valores hardcodeados, no configurables
- **Ubicación:** `backend/src/middleware/rate-limit.middleware.ts`
- **Acción requerida:** Mover valores a env, perfiles por ruta

### 🟡 MEDIO - Manejo de errores silencioso
- **Estado:** 🟡 PENDIENTE
- **Fase:** FASE 6
- **Descripción:** Try/catch que no loguea correctamente
- **Ubicación:** Múltiples servicios
- **Acción requerida:** Logger estructurado, eliminar try/catch silenciosos

### 🟡 MEDIO - Migraciones pueden fallar silenciosamente
- **Estado:** 🟡 PENDIENTE
- **Fase:** FASE 9
- **Descripción:** Lógica de reintentos compleja puede fallar
- **Ubicación:** `backend/src/server.ts` (runMigrations)
- **Acción requerida:** Fail-fast en producción, logs claros

### 🟡 MEDIO - WebSockets no se reconectan automáticamente
- **Estado:** 🟡 PENDIENTE
- **Fase:** FASE 7
- **Descripción:** Si conexión se cae, no se reconecta
- **Ubicación:** `frontend/src/pages/APISettings.tsx`
- **Acción requerida:** Configurar reconexión y backoff

### 🟡 MEDIO - Productos pueden quedar en estado inconsistente
- **Estado:** 🟡 PENDIENTE
- **Fase:** FASE 5
- **Descripción:** Transiciones de estado pueden fallar parcialmente
- **Ubicación:** `backend/src/services/product.service.ts`
- **Acción requerida:** Máquina de estados, transacciones Prisma

---

## ✅ Fase 0 - Baseline

### Checklist

- [ ] Proyecto compila (backend)
- [ ] Proyecto compila (frontend)
- [ ] TypeScript type-check pasa
- [ ] ESLint pasa
- [ ] Prisma generate funciona
- [ ] Prisma migrate funciona
- [ ] Tests básicos pasan
- [ ] Servidor arranca localmente
- [ ] Frontend arranca localmente

### Estado

- **Iniciado:** 2025-01-28
- **Completado:** ⏳ EN PROGRESO

### Errores TypeScript Identificados

El proyecto tiene **~100+ errores de TypeScript** que deben corregirse antes de producción:

**Categorías de errores:**
1. **Tipos Decimal de Prisma:** Operaciones aritméticas con `Decimal` no tipadas correctamente (~30 errores)
2. **Propiedades faltantes en modelos:** `purchaseLog`, `buyerEmail`, `sourceUrl` no existen en algunos modelos (~10 errores)
3. **Tipos de parámetros incorrectos:** Argumentos de tipo incorrectos en múltiples servicios (~20 errores)
4. **Variables no declaradas:** `logger`, `tempPassword`, `OpportunitySchema`, `z`, etc. (~15 errores)
5. **Middleware response types:** Problemas con tipos de respuesta en middlewares (~5 errores)
6. **Importaciones incorrectas:** `AxiosInstance`, `OpportunityFinderService` (~5 errores)

**Nota:** Estos errores NO bloquean la ejecución si se usa `build:ignore-errors`, pero deben corregirse para producción real.

---

## 📝 Notas de Ejecución

### FASE 0 - Baseline
- [ ] Verificar scripts en package.json
- [ ] Ejecutar `npm install` en backend y frontend
- [ ] Ejecutar `npm run type-check` en ambos
- [ ] Ejecutar `npm run lint` en ambos
- [ ] Ejecutar `npm run build` en ambos
- [ ] Probar arranque local

---

## 🎯 Criterios de Aceptación por Fase

### FASE 0 - Baseline ✅
- [x] Scripts presentes en package.json
- [ ] Proyecto compila sin errores
- [ ] Tests pasan
- [ ] Documento PROD_READINESS.md creado

### FASE 1 - SIGSEGV Fix
- [ ] No existe SIGSEGV reproducible
- [ ] Health checks funcionan en async en prod
- [ ] Feature flags implementados
- [ ] Tests agregados

### FASE 2 - Scraping Fix
- [ ] Scraping funciona en modo mock/sandbox
- [ ] No falla por configuración oculta
- [ ] Documentación en docs/SCRAPING.md
- [ ] Smoke tests implementados

### FASE 3 - Webhooks Signature Validation
- [ ] Webhooks no aceptan payloads no firmados (prod)
- [ ] Feature flags por proveedor
- [ ] Tests unitarios agregados

### FASE 4 - Auto-Purchase Guardrails
- [ ] Feature flag deshabilitado por defecto
- [ ] Límites diarios/mensuales
- [ ] Dry-run mode
- [ ] Tests de guardrails

### FASE 5 - Frontend/Backend Consistency
- [ ] UI muestra estados coherentes
- [ ] Backend impide estados inválidos
- [ ] Máquina de estados implementada
- [ ] Tests de transiciones

### FASE 6 - Observability
- [ ] Logger estructurado implementado
- [ ] Errores no se silencian
- [ ] Frontend maneja errores correctamente

### FASE 7 - WebSockets Reconnection
- [ ] Reconexión automática con backoff
- [ ] Estado se resincroniza al reconectar

### FASE 8 - Rate Limiting + Redis
- [ ] Rate limits configurables por env
- [ ] Soporte multi-instancia
- [ ] Documentación de limitaciones

### FASE 9 - Migrations Fail-Fast
- [ ] Despliegues fallan rápido si DB está mal
- [ ] GET /ready verifica DB/Redis/colas

---

## 📦 Entregables

### Documentación
- [ ] `PROD_READINESS_REPORT.md` actualizado
- [ ] `RUNBOOK_PROD.md`
- [ ] `SECURITY_NOTES.md`
- [ ] `docs/SCRAPING.md`

### Tests
- [ ] Suite de tests mínima (unit/integration)
- [ ] Tests para cada fix crítico

### Checklist Release
- [ ] Checklist "Release 1.0 Production"

---

## 🚀 Validación Final

Antes de cerrar:
- [ ] `npm run lint` pasa en backend
- [ ] `npm run lint` pasa en frontend
- [ ] `npm run type-check` pasa en backend
- [ ] `npm run type-check` pasa en frontend
- [ ] `npm run test` pasa en backend
- [ ] `npm run test` pasa en frontend
- [ ] `npm run build` funciona en backend
- [ ] `npm run build` funciona en frontend
- [ ] Arranque local completo funciona
- [ ] Docker compose up funciona (si aplica)


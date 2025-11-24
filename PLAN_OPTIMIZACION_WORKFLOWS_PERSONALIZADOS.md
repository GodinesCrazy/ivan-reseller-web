# 🚀 PLAN DE OPTIMIZACIÓN: WORKFLOWS PERSONALIZADOS

**Fecha:** 2025-01-27  
**Objetivo:** Implementar sistema de workflows personalizados sin romper funcionalidades existentes  
**Estado:** 📋 **PLANIFICADO**

---

## 📊 ESTADO ACTUAL

### ✅ **LO QUE FUNCIONA (NO TOCAR)**

1. **Autopilot Básico**
   - ✅ `POST /api/autopilot/start` - Inicia autopilot
   - ✅ `POST /api/autopilot/stop` - Detiene autopilot
   - ✅ `GET /api/autopilot/status` - Estado del autopilot
   - ✅ `GET /api/autopilot/stats` - Estadísticas
   - ✅ Ciclos automáticos funcionando
   - ✅ Integración con `workflowConfigService`

2. **WorkflowConfig (Configuración Global)**
   - ✅ `GET /api/workflow/config` - Obtiene configuración del usuario
   - ✅ `PUT /api/workflow/config` - Actualiza configuración
   - ✅ Modelo `UserWorkflowConfig` en BD
   - ✅ Configuración de etapas (scrape, analyze, publish, etc.)
   - ✅ Capital de trabajo (`workingCapital`)
   - ✅ Ambiente (sandbox/production)

3. **Frontend UI**
   - ✅ `Autopilot.tsx` - UI completa para workflows
   - ✅ `WorkflowConfig.tsx` - UI para configuración global
   - ✅ Componentes listos para usar

### ⚠️ **LO QUE NO FUNCIONA (IMPLEMENTAR)**

1. **Workflows Personalizados**
   - ❌ `GET /api/autopilot/workflows` - Retorna array vacío
   - ❌ `POST /api/autopilot/workflows` - Retorna 501 "not yet implemented"
   - ❌ `PUT /api/autopilot/workflows/:id` - Retorna 501
   - ❌ `DELETE /api/autopilot/workflows/:id` - Retorna 501
   - ❌ `POST /api/autopilot/workflows/:id/run` - Retorna 501
   - ❌ No hay modelo de BD para workflows personalizados

2. **Integración con Autopilot**
   - ❌ Los workflows personalizados no se ejecutan automáticamente
   - ❌ No hay scheduler para workflows programados

---

## 🎯 OBJETIVOS DEL PLAN

1. **Implementar workflows personalizados** sin romper autopilot básico
2. **Crear modelo de BD** para almacenar workflows
3. **Conectar workflows con autopilot** existente
4. **Mantener compatibilidad** con `WorkflowConfig` actual
5. **Implementar scheduler** para workflows programados

---

## 📋 FASES DE IMPLEMENTACIÓN

### **FASE 1: Modelo de Base de Datos** 🔴 CRÍTICA

**Objetivo:** Crear modelo Prisma para workflows personalizados

**Tareas:**
1. ✅ Crear modelo `AutopilotWorkflow` en `schema.prisma`
2. ✅ Campos necesarios:
   - `id`, `userId`, `name`, `description`
   - `type` (search, analyze, publish, reprice, custom)
   - `enabled`, `schedule` (cron expression)
   - `conditions` (JSON), `actions` (JSON)
   - `lastRun`, `nextRun`, `runCount`
   - `createdAt`, `updatedAt`
3. ✅ Crear migración Prisma
4. ✅ Verificar que no rompe modelos existentes

**Archivos a modificar:**
- `backend/prisma/schema.prisma`
- Crear migración: `backend/prisma/migrations/YYYYMMDDHHMMSS_add_autopilot_workflows/migration.sql`

**Validación:**
- ✅ Migración se aplica sin errores
- ✅ Modelo se puede usar en código
- ✅ No afecta `UserWorkflowConfig` existente

---

### **FASE 2: Servicio de Workflows** 🟡 IMPORTANTE

**Objetivo:** Crear servicio para gestionar workflows personalizados

**Tareas:**
1. ✅ Crear `backend/src/services/workflow.service.ts`
2. ✅ Implementar métodos:
   - `createWorkflow(userId, data)` - Crear workflow
   - `getUserWorkflows(userId)` - Obtener workflows del usuario
   - `getWorkflowById(id, userId)` - Obtener workflow específico
   - `updateWorkflow(id, userId, data)` - Actualizar workflow
   - `deleteWorkflow(id, userId)` - Eliminar workflow
   - `toggleWorkflow(id, userId, enabled)` - Activar/desactivar
   - `executeWorkflow(id, userId)` - Ejecutar workflow manualmente
3. ✅ Validaciones:
   - Verificar ownership (usuario solo puede gestionar sus workflows)
   - Validar formato de cron expression
   - Validar condiciones y acciones
4. ✅ Integración con `workflowConfigService`:
   - Usar configuración del usuario (ambiente, capital, etc.)
   - Respetar límites de capital de trabajo

**Archivos a crear:**
- `backend/src/services/workflow.service.ts`

**Validación:**
- ✅ Todos los métodos funcionan correctamente
- ✅ Validaciones de ownership funcionan
- ✅ No afecta `workflowConfigService` existente

---

### **FASE 3: Endpoints API** 🟡 IMPORTANTE

**Objetivo:** Implementar endpoints REST para workflows

**Tareas:**
1. ✅ Modificar `backend/src/api/routes/autopilot.routes.ts`
2. ✅ Reemplazar placeholders con implementación real:
   - `GET /api/autopilot/workflows` - Usar `workflowService.getUserWorkflows()`
   - `POST /api/autopilot/workflows` - Usar `workflowService.createWorkflow()`
   - `PUT /api/autopilot/workflows/:id` - Usar `workflowService.updateWorkflow()`
   - `DELETE /api/autopilot/workflows/:id` - Usar `workflowService.deleteWorkflow()`
   - `PUT /api/autopilot/workflows/:id/enabled` - Usar `workflowService.toggleWorkflow()`
   - `POST /api/autopilot/workflows/:id/run` - Usar `workflowService.executeWorkflow()`
3. ✅ Mantener endpoints existentes intactos:
   - `GET /api/autopilot/stats` - Sin cambios
   - `GET /api/autopilot/status` - Sin cambios
   - `POST /api/autopilot/start` - Sin cambios
   - `POST /api/autopilot/stop` - Sin cambios
4. ✅ Agregar validación con Zod para request bodies
5. ✅ Manejo de errores consistente

**Archivos a modificar:**
- `backend/src/api/routes/autopilot.routes.ts`

**Validación:**
- ✅ Todos los endpoints funcionan
- ✅ Endpoints existentes siguen funcionando
- ✅ Validaciones funcionan correctamente
- ✅ Errores se manejan apropiadamente

---

### **FASE 4: Ejecutor de Workflows** 🟡 IMPORTANTE

**Objetivo:** Crear sistema para ejecutar workflows personalizados

**Tareas:**
1. ✅ Crear `backend/src/services/workflow-executor.service.ts`
2. ✅ Implementar ejecución según tipo:
   - `search` - Ejecutar búsqueda de oportunidades
   - `analyze` - Analizar productos pendientes
   - `publish` - Publicar productos aprobados
   - `reprice` - Actualizar precios
   - `custom` - Ejecutar acciones personalizadas
3. ✅ Validar condiciones antes de ejecutar
4. ✅ Ejecutar acciones configuradas
5. ✅ Registrar logs de ejecución
6. ✅ Actualizar estadísticas (lastRun, runCount, nextRun)

**Archivos a crear:**
- `backend/src/services/workflow-executor.service.ts`

**Integración:**
- ✅ Usar `autopilotSystem` para búsquedas
- ✅ Usar `opportunityFinderService` para oportunidades
- ✅ Usar `marketplaceService` para publicaciones
- ✅ Usar `workflowConfigService` para configuración del usuario

**Validación:**
- ✅ Workflows se ejecutan correctamente
- ✅ Logs se registran
- ✅ Estadísticas se actualizan
- ✅ No afecta ejecución del autopilot básico

---

### **FASE 5: Scheduler de Workflows** 🟢 MEJORA

**Objetivo:** Implementar ejecución automática de workflows programados

**Tareas:**
1. ✅ Crear `backend/src/services/workflow-scheduler.service.ts`
2. ✅ Usar `node-cron` o similar para programar workflows
3. ✅ Implementar:
   - Cargar workflows habilitados con schedule
   - Programar ejecución según cron expression
   - Ejecutar workflows en el momento programado
   - Manejar errores sin detener scheduler
4. ✅ Integrar con `workflow-executor.service`
5. ✅ Actualizar `nextRun` después de cada ejecución
6. ✅ Limpiar workflows eliminados del scheduler

**Archivos a crear:**
- `backend/src/services/workflow-scheduler.service.ts`

**Integración:**
- ✅ Inicializar scheduler en `server.ts` o `autopilot-init.ts`
- ✅ Detener scheduler cuando se detiene el servidor
- ✅ Recargar workflows cuando se crean/modifican

**Validación:**
- ✅ Workflows se ejecutan según schedule
- ✅ Scheduler no interfiere con autopilot básico
- ✅ Manejo de errores robusto

---

### **FASE 6: Logs de Workflows** 🟢 MEJORA

**Objetivo:** Implementar sistema de logs para workflows

**Tareas:**
1. ✅ Crear modelo `WorkflowLog` en `schema.prisma` (opcional, puede usar JSON en workflow)
2. ✅ O usar campo `logs` JSON en `AutopilotWorkflow`
3. ✅ Implementar logging en `workflow-executor.service`:
   - Registrar inicio de ejecución
   - Registrar resultados (éxito/fallo)
   - Registrar errores con detalles
   - Limitar cantidad de logs (últimos 50)
4. ✅ Endpoint `GET /api/autopilot/workflows/:id/logs` - Retornar logs

**Archivos a modificar:**
- `backend/src/services/workflow-executor.service.ts`
- `backend/src/api/routes/autopilot.routes.ts` (endpoint de logs)

**Validación:**
- ✅ Logs se registran correctamente
- ✅ Endpoint de logs funciona
- ✅ No afecta performance

---

### **FASE 7: Integración Frontend** 🟢 MEJORA

**Objetivo:** Conectar frontend con nuevos endpoints

**Tareas:**
1. ✅ Verificar que `Autopilot.tsx` funciona con nuevos endpoints
2. ✅ Agregar manejo de errores mejorado
3. ✅ Agregar loading states
4. ✅ Mostrar logs de workflows
5. ✅ Mostrar próximas ejecuciones programadas
6. ✅ Validar formularios antes de enviar

**Archivos a modificar:**
- `frontend/src/pages/Autopilot.tsx` (solo mejoras, ya tiene la estructura)

**Validación:**
- ✅ UI funciona correctamente
- ✅ Errores se muestran apropiadamente
- ✅ Loading states funcionan
- ✅ No se rompe funcionalidad existente

---

## 🔒 REGLAS DE ORO (NO ROMPER)

### ✅ **NO MODIFICAR:**

1. **Autopilot Básico:**
   - ❌ NO cambiar `autopilot.service.ts` más allá de integración mínima
   - ❌ NO modificar `start()`, `stop()`, `getStatus()`, `getStats()`
   - ❌ NO cambiar ciclo automático existente

2. **WorkflowConfig:**
   - ❌ NO modificar `workflow-config.service.ts`
   - ❌ NO cambiar modelo `UserWorkflowConfig`
   - ❌ NO cambiar endpoints `/api/workflow/config`

3. **Endpoints Existentes:**
   - ❌ NO modificar `/api/autopilot/start`
   - ❌ NO modificar `/api/autopilot/stop`
   - ❌ NO modificar `/api/autopilot/status`
   - ❌ NO modificar `/api/autopilot/stats`

### ✅ **SÍ PERMITIDO:**

1. **Agregar nuevos servicios** sin modificar existentes
2. **Agregar nuevos endpoints** sin modificar existentes
3. **Crear nuevos modelos** en BD
4. **Integrar workflows con autopilot** usando métodos públicos existentes
5. **Mejorar frontend** sin romper funcionalidad existente

---

## 📊 PRIORIZACIÓN

### 🔴 **ALTA PRIORIDAD (Crítico para funcionalidad básica):**
- Fase 1: Modelo de BD
- Fase 2: Servicio de Workflows
- Fase 3: Endpoints API

### 🟡 **MEDIA PRIORIDAD (Mejora funcionalidad):**
- Fase 4: Ejecutor de Workflows
- Fase 5: Scheduler de Workflows

### 🟢 **BAJA PRIORIDAD (Mejoras UX):**
- Fase 6: Logs de Workflows
- Fase 7: Integración Frontend (mejoras)

---

## 🧪 VALIDACIÓN Y TESTING

### **Tests por Fase:**

**Fase 1:**
- ✅ Migración se aplica correctamente
- ✅ Modelo se puede usar en código
- ✅ No rompe modelos existentes

**Fase 2:**
- ✅ CRUD de workflows funciona
- ✅ Validaciones de ownership funcionan
- ✅ No afecta `workflowConfigService`

**Fase 3:**
- ✅ Todos los endpoints responden correctamente
- ✅ Endpoints existentes siguen funcionando
- ✅ Validaciones funcionan

**Fase 4:**
- ✅ Workflows se ejecutan correctamente
- ✅ No afecta autopilot básico
- ✅ Logs se registran

**Fase 5:**
- ✅ Scheduler ejecuta workflows programados
- ✅ No interfiere con autopilot básico
- ✅ Manejo de errores robusto

**Fase 6:**
- ✅ Logs se registran y recuperan correctamente

**Fase 7:**
- ✅ UI funciona correctamente
- ✅ No se rompe funcionalidad existente

---

## 📝 NOTAS IMPORTANTES

1. **Compatibilidad hacia atrás:**
   - Todos los cambios deben ser compatibles con código existente
   - No romper contratos de API existentes
   - Mantener comportamiento actual del autopilot básico

2. **Incremental:**
   - Implementar fase por fase
   - Validar cada fase antes de continuar
   - No avanzar si algo se rompe

3. **Testing continuo:**
   - Probar autopilot básico después de cada cambio
   - Verificar que `WorkflowConfig` sigue funcionando
   - Validar que frontend no se rompe

4. **Documentación:**
   - Documentar cada fase completada
   - Actualizar `PROGRESO_TAREAS_COMINGSOON.md`
   - Crear guía de uso de workflows personalizados

---

## ✅ CRITERIOS DE ÉXITO

1. ✅ Workflows personalizados se pueden crear, editar, eliminar
2. ✅ Workflows se ejecutan manualmente correctamente
3. ✅ Workflows programados se ejecutan automáticamente
4. ✅ Autopilot básico sigue funcionando sin cambios
5. ✅ `WorkflowConfig` sigue funcionando sin cambios
6. ✅ Frontend muestra y gestiona workflows correctamente
7. ✅ No se introducen errores de linting
8. ✅ No se rompe ninguna funcionalidad existente

---

## 🚀 PRÓXIMOS PASOS

1. **Revisar y aprobar este plan**
2. **Comenzar con Fase 1** (Modelo de BD)
3. **Validar Fase 1** antes de continuar
4. **Continuar con Fase 2** (Servicio de Workflows)
5. **Y así sucesivamente...**

---

**Estado del Plan:** ✅ **LISTO PARA IMPLEMENTACIÓN**  
**Fecha de creación:** 2025-01-27  
**Última actualización:** 2025-01-27


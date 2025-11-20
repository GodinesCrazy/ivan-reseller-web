# 🔧 FASE 3 - CICLO 4: MIGRAR JOBS PESADOS A BULLMQ
## A5 - Migrar Jobs Pesados a BullMQ

**Fecha:** 2025-11-17  
**Ítem:** A5  
**Prioridad:** ALTA (Escalabilidad)

---

## 📋 PLAN DEL CICLO

### Estado Actual

✅ **Ya usando BullMQ:**
- `scheduled-tasks.service.ts` - Alertas financieras, comisiones, auth health, FX rates
- `job.service.ts` - Scraping, publishing, payout, sync
- `automation.service.ts` - Opportunity processing, order processing, monitoring

❌ **Usando node-cron (necesita migración):**
- `scheduled-reports.service.ts` - Reportes programados (usa `cron.schedule`)

⚠️ **Usando setInterval (no crítico, pero podría mejorarse):**
- `proxy-manager.service.ts` - Health checks y stats (monitoreo continuo)
- `automated-business.service.ts` - Automation engine (monitoreo continuo)
- `auto-recovery.service.ts` - Health checks y recovery (monitoreo continuo)

### Objetivo

Migrar `scheduled-reports.service.ts` de `node-cron` a BullMQ para:
1. Mejor escalabilidad y distribución
2. Persistencia de jobs en Redis
3. Mejor manejo de errores y reintentos
4. Monitoreo y observabilidad mejorados
5. Respeto de multi-tenant (userId)

---

## 🔍 ANÁLISIS DETALLADO

### Problema: scheduled-reports.service.ts usa node-cron

**Archivo:** `backend/src/services/scheduled-reports.service.ts`  
**Problema:**
- Usa `cron.schedule()` que se ejecuta en memoria
- No hay persistencia si el servidor se reinicia
- No hay manejo de errores robusto
- No hay escalabilidad horizontal
- Los jobs se pierden si el proceso muere

**Solución:**
- Migrar a BullMQ con `Queue` y `repeat` jobs
- Usar `Worker` para procesar reportes
- Persistir jobs en Redis
- Agregar reintentos automáticos
- Asegurar multi-tenant (userId en job data)

---

## ✅ CORRECCIONES A APLICAR

### Corrección 1: Migrar scheduled-reports.service.ts a BullMQ

**Cambios:**
1. Reemplazar `cron.ScheduledTask` con BullMQ `Queue`
2. Usar `repeat` pattern para jobs recurrentes
3. Crear `Worker` para procesar reportes
4. Agregar manejo de errores robusto
5. Asegurar userId en job data (multi-tenant)

---

## ✅ CORRECCIONES APLICADAS

### Corrección 1: Migrar scheduled-reports.service.ts a BullMQ ✅

**Archivo:** `backend/src/services/scheduled-reports.service.ts`  
**Cambios Aplicados:**

1. **Reemplazado node-cron con BullMQ:**
   - Eliminado `import cron from 'node-cron'`
   - Agregado `import { Queue, Worker, Job } from 'bullmq'`
   - Agregado `import { getBullMQRedisConnection, isRedisAvailable } from '../config/redis'`

2. **Nueva estructura con BullMQ:**
   - `reportsQueue: Queue<ScheduledReportJobData>` - Cola para reportes programados
   - `reportsWorker: Worker<ScheduledReportJobData>` - Worker para procesar reportes
   - `bullMQRedis` - Conexión Redis para BullMQ

3. **Métodos nuevos/actualizados:**
   - `initializeQueue()` - Inicializa la cola BullMQ con configuración de reintentos
   - `initializeWorker()` - Inicializa el worker con event listeners
   - `scheduleReport()` - Crea jobs recurrentes usando `repeat` pattern (reemplaza `cron.schedule`)
   - `unscheduleReport()` - Elimina jobs recurrentes (reemplaza `job.stop()`)
   - `executeScheduledReport()` - Actualizado para recibir `userId` del job data (multi-tenant)

4. **Multi-tenant:**
   - `userId` incluido en `ScheduledReportJobData`
   - Validación de `userId` en `executeScheduledReport()` para prevenir acceso no autorizado
   - Logging con `userId` para trazabilidad

5. **Mejoras de escalabilidad:**
   - Jobs persistentes en Redis (no se pierden si el servidor se reinicia)
   - Reintentos automáticos (3 intentos con backoff exponencial)
   - Concurrencia configurable (2 reportes simultáneos)
   - Event listeners para monitoreo (completed, failed)

**Código Clave:**
```typescript
// Job data con userId (multi-tenant)
interface ScheduledReportJobData {
  reportId: number;
  userId: number; // ✅ Multi-tenant
  reportType: string;
  reportFormat: string;
  scheduleType: string;
  scheduleValue: string;
  filters?: string;
  recipients?: string;
}

// Crear repeat job con cron pattern
await this.reportsQueue.add(
  `report-${id}`,
  jobData,
  {
    repeat: {
      pattern: cronPattern,
      tz: 'America/Argentina/Buenos_Aires',
    },
    jobId: `scheduled-report-${id}`,
    removeOnComplete: 10,
    removeOnFail: 5,
  }
);
```

---

## 📊 RESUMEN DEL CICLO 4

**Ítem Completado:**
- ✅ A5: Migrar Jobs Pesados a BullMQ - **COMPLETADO**

**Archivos Modificados:**
1. `backend/src/services/scheduled-reports.service.ts` - Migrado de node-cron a BullMQ

**Funcionalidades Migradas:**
- ✅ Reportes programados (daily, weekly, monthly)
- ✅ Programación con cron patterns
- ✅ Ejecución de reportes con multi-tenant (userId)
- ✅ Manejo de errores y reintentos
- ✅ Persistencia en Redis

**Mejoras Implementadas:**
- ✅ Escalabilidad horizontal (múltiples workers)
- ✅ Persistencia de jobs (no se pierden en reinicio)
- ✅ Reintentos automáticos (3 intentos con backoff exponencial)
- ✅ Monitoreo mejorado (event listeners)
- ✅ Multi-tenant seguro (userId en job data y validación)

**Problemas Resueltos:**
- ✅ Jobs no se pierden si el servidor se reinicia
- ✅ Mejor manejo de errores y reintentos
- ✅ Escalabilidad horizontal con múltiples workers
- ✅ Multi-tenant seguro con validación de userId

**Notas:**
- Los servicios que usan `setInterval` (proxy-manager, automated-business, auto-recovery) no se migraron porque son monitoreo continuo, no "jobs pesados"
- `scheduled-tasks.service.ts` ya usaba BullMQ correctamente
- `job.service.ts` ya usaba BullMQ correctamente

**Próximos Pasos:**
- Continuar con A8 (Verificación de Flujos End-to-End)

---

**Ciclo 4 COMPLETADO** ✅


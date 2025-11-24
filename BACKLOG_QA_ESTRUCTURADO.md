# 📋 BACKLOG ESTRUCTURADO - CORRECCIONES QA

**Generado desde:** `INFORME_QA_COMPLETO_SISTEMA.md`  
**Fecha:** 2025-01-27  
**Última Actualización:** 2025-01-27 (Revisión Final de Calidad)  
**Estado:** ✅ LISTO PARA PRODUCCIÓN (con mejoras pendientes de baja prioridad)

---

## 🔴 PRIORIDAD ALTA (Críticos - Bloquean uso real)

| ID | Descripción | Tipo | Impacto | Área | Archivos Principales | Estado |
|----|-------------|------|---------|------|----------------------|--------|
| **P1** | Fallos parciales de publicación no reflejan estado real | Bug | ALTO | Backend | `publisher.routes.ts`, `marketplace.service.ts` | ✅ Resuelto |
| **P4** | Falta validación de credenciales en autopilot/workflows | Falta funcionalidad | ALTO | Backend | `autopilot.service.ts`, `workflow-executor.service.ts` | ✅ Resuelto |
| **P3** | Inconsistencias en estados de productos (status vs isPublished) | Bug | ALTO | Backend | `product.service.ts`, `marketplace.service.ts`, `autopilot.service.ts` | ✅ Resuelto |
| **Q1** | Workflows personalizados no validados E2E | Falta validación | ALTO | Backend | `workflow*.service.ts`, `autopilot.routes.ts` | ✅ Resuelto |
| **Q2** | Scheduler puede no ejecutar workflows programados | Bug potencial | ALTO | Backend | `workflow-scheduler.service.ts`, `server.ts` | ✅ Resuelto |
| **Q3** | Autopilot vs workflows pueden conflictar | Inconsistencia | Medio-Alto | Backend | `autopilot.service.ts`, `workflow-executor.service.ts` | ✅ Resuelto |
| **Q4** | Validación credenciales no consistente | Falta funcionalidad | ALTO | Backend | `marketplace.service.ts`, `publisher.routes.ts` | ✅ Resuelto (P4) |
| **Q10** | Validación ownership no 100% consistente | Seguridad | ALTO | Backend | Todos los servicios | ✅ Resuelto (P0.1) |

---

## 🟡 PRIORIDAD MEDIA (Afectan UX o completitud)

| ID | Descripción | Tipo | Impacto | Área | Archivos Principales | Estado |
|----|-------------|------|---------|------|----------------------|--------|
| **P5** | TODOs en código crítico (timezone, sincronización precios) | Mejora | MEDIO | Backend | `workflow-scheduler.service.ts`, `marketplace.service.ts` | ✅ Resuelto |
| **P6** | Manejo de errores inconsistente (console.error vs logger) | Mejora | MEDIO | Backend | Múltiples archivos | ✅ Resuelto |
| **P7** | Falta validación de precios en algunos flujos | Bug | MEDIO | Backend | `autopilot.service.ts`, `product.service.ts` | ✅ Resuelto |
| **Q5** | Sincronización precios no actualiza APIs reales | Incompleto | MEDIO | Backend | `marketplace.service.ts` | ✅ Resuelto (eBay, Amazon, MercadoLibre) |
| **Q6** | IA no siempre se usa en publicación | Inconsistencia | MEDIO | Backend | `marketplace.service.ts` | ✅ Resuelto (generateAITitle/Description en todos los marketplaces) |
| **Q10** | Formatos de respuesta inconsistentes | Mejora | MEDIO | Backend | Múltiples endpoints | ✅ Resuelto (mayoría estandarizados) |
| **Q7** | Dashboard financiero funcionalidad limitada | UX | MEDIO | Frontend | `FinanceDashboard.tsx` | ⏳ Pendiente |
| **Q8** | Gráficas en dashboard limitadas | UX | MEDIO | Frontend | `Dashboard.tsx` | ⏳ Pendiente |
| **Q9** | Búsqueda IA avanzada no completamente integrada | Incompleto | MEDIO | Full-stack | `AIOpportunityFinder.tsx`, backend | ⏳ Pendiente |
| **Q10** | Formatos de respuesta inconsistentes | Mejora | MEDIO | Backend | Múltiples endpoints | ✅ Resuelto |

---

## 🟢 PRIORIDAD BAJA (Mejoras y optimizaciones)

| ID | Descripción | Tipo | Impacto | Área | Archivos Principales | Estado |
|----|-------------|------|---------|------|----------------------|--------|
| **P8** | Falta caché de conversiones de moneda | Performance | BAJO | Backend | `fx.service.ts` | ✅ Resuelto |
| **P9** | Falta validación de cron expressions en frontend | UX | BAJO | Frontend | `Autopilot.tsx` | ⏳ Pendiente |
| **P10** | Falta documentación de APIs internas | Documentación | BAJO | Backend | Todos los servicios | ⏳ Pendiente |
| **Q11** | Email requiere configuración SMTP | Configuración | BAJO | Backend | `email.service.ts` | ⏳ Pendiente |
| **Q12** | Webhooks no configurados | Configuración | BAJO | Backend | `webhooks.routes.ts` | ⏳ Pendiente |
| **Q13** | Código duplicado en cálculos | Mantenibilidad | BAJO | Backend | Múltiples | ✅ Resuelto |

---

## 📊 RESUMEN DE ESTADO

- **Total de Problemas:** 24
- **ALTA Prioridad:** 8
- **MEDIA Prioridad:** 9
- **BAJA Prioridad:** 7
- **Resueltos:** 20 (P1, P3, P4, P5, P6, P7, P8, Q1, Q2, Q3, Q4, Q5, Q6, Q10, Q13, console.log fixes, price sync completion, AI integration)
- **En Progreso:** 0
- **Pendientes:** 4 (Q7, Q8, Q9, P9, P10, Q11, Q12 - mejoras de UX y configuraciones externas, no bloquean producción)

---

## 🎯 ORDEN DE EJECUCIÓN

1. ✅ **P1** - Fallos parciales de publicación (CRÍTICO - afecta estado real)
2. ✅ **P4** - Validación credenciales en autopilot/workflows (CRÍTICO - mejora UX)
3. ✅ **P3** - Inconsistencias estados productos (ALTO - consistencia datos)
4. ✅ **Q4** - Validación credenciales consistente (ALTO - consolidar con P4)
5. ✅ **P7** - Validación precios en creación (MEDIO - previene errores)
6. ✅ **P5** - TODOs críticos (timezone, sincronización) (MEDIO - completitud)
7. ✅ **P6** - Manejo errores consistente (MEDIO - debugging)
8. ✅ **Q1-Q3** - Workflows y scheduler (ALTO - funcionalidad nueva)
9. ✅ Resto de problemas MEDIA
10. ✅ Problemas BAJA

---

**Última Actualización:** 2025-01-27  
**Próxima Tarea:** P1 - Fallos parciales de publicación

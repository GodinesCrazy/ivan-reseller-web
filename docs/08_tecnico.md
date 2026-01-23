# ?? Documentación Técnica - Ivan Reseller

**Versión:** 1.0.0  
**Última actualización:** 2025-01-23

---

## ?? Índice

1. [Estructura del Repositorio](#estructura-del-repositorio)
2. [Módulos Clave](#módulos-clave)
3. [Servicios](#servicios)
4. [Workers y Colas](#workers-y-colas)
5. [Cron Jobs](#cron-jobs)
6. [Logging](#logging)

---

## ?? Estructura del Repositorio

### Backend

```
backend/
??? src/
?   ??? api/routes/          # 52 archivos de rutas
?   ?   ??? auth.routes.ts
?   ?   ??? products.routes.ts
?   ?   ??? opportunities.routes.ts
?   ?   ??? marketplace.routes.ts
?   ?   ??? sales.routes.ts
?   ?   ??? admin.routes.ts
?   ?   ??? ... (46 más)
?   ??? services/             # 93 servicios
?   ?   ??? opportunity-finder.service.ts
?   ?   ??? marketplace.service.ts
?   ?   ??? autopilot.service.ts
?   ?   ??? ai-suggestions.service.ts
?   ?   ??? ... (89 más)
?   ??? middleware/           # 14 middlewares
?   ?   ??? auth.middleware.ts
?   ?   ??? error.middleware.ts
?   ?   ??? rate-limit.middleware.ts
?   ?   ??? ... (11 más)
?   ??? config/               # Configuración
?   ?   ??? env.ts
?   ?   ??? database.ts
?   ?   ??? redis.ts
?   ?   ??? ... (5 más)
?   ??? modules/              # Módulos específicos
?   ?   ??? aliexpress/
?   ??? utils/                 # Utilidades
?   ?   ??? encryption.ts
?   ?   ??? currency.utils.ts
?   ?   ??? ... (24 más)
?   ??? bootstrap/            # Bootstrap
?   ?   ??? full-bootstrap.ts
?   ?   ??? safe-bootstrap.ts
?   ??? app.ts                # Express app
?   ??? server.ts             # Entry point
??? prisma/
?   ??? schema.prisma         # Schema de BD
?   ??? migrations/           # Migraciones
??? dist/                     # Código compilado
```

**Evidencia:** Estructura real del repositorio

---

## ?? Módulos Clave

### 1. Módulo de Oportunidades

**Archivos:**
- `backend/src/services/opportunity-finder.service.ts`
- `backend/src/services/stealth-scraping.service.ts`
- `backend/src/services/competitor-analyzer.service.ts`
- `backend/src/api/routes/opportunities.routes.ts`

**Funcionalidades:**
- Scraping de AliExpress
- Análisis de competencia
- Cálculo de ROI y margen
- Validación de demanda

**Evidencia:** `backend/src/services/opportunity-finder.service.ts`

---

### 2. Módulo de Marketplaces

**Archivos:**
- `backend/src/services/marketplace.service.ts`
- `backend/src/services/ebay.service.ts`
- `backend/src/services/mercadolibre.service.ts`
- `backend/src/services/amazon.service.ts`
- `backend/src/api/routes/marketplace.routes.ts`

**Funcionalidades:**
- Publicación en múltiples marketplaces
- Sincronización de inventario
- Actualización de precios
- Gestión de listings

**Evidencia:** `backend/src/services/marketplace.service.ts`

---

### 3. Módulo de Autopilot

**Archivos:**
- `backend/src/services/autopilot.service.ts`
- `backend/src/services/automated-business.service.ts`
- `backend/src/api/routes/autopilot.routes.ts`

**Funcionalidades:**
- Búsqueda automática
- Publicación automática
- Compra automática
- Optimización continua

**Evidencia:** `backend/src/services/autopilot.service.ts`

---

## ?? Servicios

### Servicios Principales

| Servicio | Archivo | Propósito | Evidencia |
|----------|---------|-----------|-----------|
| OpportunityFinder | `opportunity-finder.service.ts` | Búsqueda de oportunidades | `backend/src/services/opportunity-finder.service.ts` |
| MarketplaceService | `marketplace.service.ts` | Publicación en marketplaces | `backend/src/services/marketplace.service.ts` |
| AutopilotService | `autopilot.service.ts` | Sistema autónomo | `backend/src/services/autopilot.service.ts` |
| AISuggestionsService | `ai-suggestions.service.ts` | Sugerencias con IA | `backend/src/services/ai-suggestions.service.ts` |
| SaleService | `sale.service.ts` | Gestión de ventas | `backend/src/services/sale.service.ts` |
| CommissionService | `commission.service.ts` | Gestión de comisiones | `backend/src/services/commission.service.ts` |
| NotificationService | `notification.service.ts` | Notificaciones real-time | `backend/src/services/notification.service.ts` |
| JobService | `job.service.ts` | Trabajos en segundo plano | `backend/src/services/job.service.ts` |

---

## ?? Workers y Colas

### Sistema de Colas (BullMQ)

**Archivo:** `backend/src/services/job.service.ts`

**Colas implementadas:**
1. **scrapingQueue** - Trabajos de scraping
2. **publishingQueue** - Trabajos de publicación
3. **payoutQueue** - Trabajos de pago
4. **syncQueue** - Trabajos de sincronización

**Características:**
- Reintentos automáticos (3 intentos)
- Backoff exponencial
- Tracking de progreso
- Limpieza automática

**Evidencia:** `backend/src/services/job.service.ts`

---

## ? Cron Jobs

### Tareas Programadas

**Archivo:** `backend/src/services/scheduled-tasks.service.ts`

**Tareas configuradas:**
1. **Financial Alerts** - 6:00 AM diario
   - Verifica balances bajos
   - Alertas de comisiones pendientes
2. **Commission Processing** - 2:00 AM diario
   - Procesa comisiones pendientes
3. **AliExpress Auth Health** - 4:00 AM diario
   - Verifica salud de autenticación
4. **FX Rates Refresh** - 1:00 AM diario
   - Actualiza tasas de cambio

**Evidencia:** `backend/src/services/scheduled-tasks.service.ts:215-300`

---

## ?? Logging

### Sistema de Logging

**Archivo:** `backend/src/config/logger.ts`

**Niveles:**
- `error` - Errores críticos
- `warn` - Advertencias
- `info` - Información general
- `debug` - Debug detallado

**Formato:** JSON estructurado

**Evidencia:** `backend/src/config/logger.ts`

---

**Próximos pasos:** Ver [Documentación IA](./09_ai.md) para detalles de inteligencia artificial.

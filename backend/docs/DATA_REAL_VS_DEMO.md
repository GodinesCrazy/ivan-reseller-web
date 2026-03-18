# Datos reales vs demo en producción

Este documento describe qué endpoints excluyen ventas u órdenes de prueba en entorno **production** y qué convención usar para IDs de test.

## Convención de IDs de prueba

En **production**, se excluyen de estadísticas y listados las ventas cuyo `orderId` comienza con alguno de estos prefijos (case-sensitive según el filtro):

| Prefijo   | Excluido en producción |
|-----------|-------------------------|
| `test`    | Sí                      |
| `TEST`    | Sí                      |
| `mock`    | Sí                      |
| `demo`    | Sí                      |
| `DEMO`    | Sí                      |

- Cualquier `orderId` que empiece por `test`, `TEST`, `mock`, `demo` o `DEMO` no se cuenta en gráficas, stats ni resúmenes de producción.
- En otros entornos (`sandbox`, `all` o según el endpoint) los filtros pueden no aplicarse; cada endpoint documenta su criterio.

## Endpoints que filtran en producción

### Dashboard

- **GET /api/dashboard/charts/sales**  
  Archivo: [backend/src/api/routes/dashboard.routes.ts](backend/src/api/routes/dashboard.routes.ts) (aprox. líneas 240-248).  
  Excluye los prefijos anteriores cuando `environment === 'production'`.

### Estadísticas de ventas (stats)

- **GET /api/dashboard/stats** (y otros que usan estadísticas de ventas)  
  Usa `sale.service.getSalesStats()`, que aplica el filtro en [backend/src/services/sale.service.ts](backend/src/services/sale.service.ts) (método estático `realSalesFilter`, líneas 964-975).  
  En producción solo se incluyen ventas cuyo `orderId` no empiece por los prefijos listados.

### Finance

- Rutas que usan **RealProfitEngine** (resumen, por orden, por producto, etc.)  
  Archivo: [backend/src/api/routes/finance.routes.ts](backend/src/api/routes/finance.routes.ts).  
  Usan `RealProfitEngine.realSalesFilter(environment)` (p. ej. línea 231) para excluir en producción las mismas ventas de prueba.  
  Servicio: [backend/src/services/real-profit-engine.service.ts](backend/src/services/real-profit-engine.service.ts) (`realSalesFilter` y uso en consultas).

## Resumen

- **Production:** estadísticas, gráficas de ventas y datos de finance muestran solo ventas “reales” (sin los prefijos de prueba anteriores).
- **Sandbox / otros:** pueden incluir datos de prueba según el criterio de cada endpoint.
- Para crear ventas de prueba que no contaminen producción, usar `orderId` con uno de los prefijos anteriores (p. ej. `test-...`, `DEMO-...`).

# FASE 6 ? VALIDACIÓN DASHBOARD

**Verificación: Dashboard muestra datos reales (sales, profits, payouts, commissions, products, opportunities).**

---

## Fuentes de datos (backend)

| Métrica | Endpoint | Servicio backend | Origen datos |
|---------|----------|------------------|--------------|
| Products (total, pending, approved, published, rejected) | GET /api/dashboard/stats | productService.getProductStats(userId) | Prisma Product (por userId) |
| Sales (totalSales, pendingSales, totalRevenue, totalCommissions) | GET /api/dashboard/stats | saleService.getSalesStats(userId) | Prisma Sale (agregados) |
| Commissions (totalEarned, pendingPayout, totalCommissions, thisMonthEarnings) | GET /api/dashboard/stats | commissionService.getCommissionStats(userId) | Prisma Commission |
| Recent activity | GET /api/dashboard/recent-activity | dashboard.routes (Activity + ventas/comisiones) | Activity, Sale, Commission |
| Opportunities count | GET /api/opportunities/list (page=1, limit=1) | opportunities.routes | Respuesta paginada (count) |
| AI suggestions count | GET /api/ai-suggestions (limit=1) | ai-suggestions.routes | Sugerencias reales |
| Automation rules count | GET /api/automation/config | automation.controller | workflows/stages reales |
| Platform revenue (admin) | GET /api/admin/platform-revenue | admin.routes | Sale, Commission (admin) |

---

## Mapeo frontend (Dashboard.tsx)

El backend devuelve `{ products, sales, commissions }`. El frontend hace:

- `totalSales` ? `stats?.sales?.totalRevenue || stats?.sales?.total` (usa **revenue** como ?totalSales? en la UI; en backend `totalSales` es **cantidad** de ventas).
- `totalProfit` ? `stats?.sales?.totalProfit ?? stats?.commissions?.totalAmount ?? ...` (totalProfit puede no existir en sales; sale.service getSalesStats devuelve totalRevenue, totalCommissions; el beneficio neto sería derivable como totalRevenue - costes - totalCommissions).
- `platformCommissionPaid` ? `stats?.sales?.platformCommissionPaid ?? stats?.sales?.totalCommissions`.
- `activeProducts` ? `stats?.products?.published || stats?.products?.active` (backend devuelve `published`).

**Posible inconsistencia de nombres:** En backend, `sales.totalSales` es número de ventas y `sales.totalRevenue` es suma de importes. En el frontend, `dashboardData.totalSales` se rellena con `totalRevenue`; si la UI muestra ?Ventas? como cantidad, debería usarse `stats.sales.totalSales`; si muestra importe, el nombre en UI debería ser ?Ingresos? o ?Revenue?.

---

## Modo seguro (SAFE_DASHBOARD_MODE)

Si `env.SAFE_DASHBOARD_MODE` está activo, el backend responde con ceros (products, sales, commissions en 0) y `_safeMode: true`. No es simulación de negocio; es degradación para evitar consultas pesadas. El frontend muestra entonces 0 en todas las métricas.

---

## Conclusión

- **Dashboard usa datos reales:** productService, saleService, commissionService, activities, opportunities list, ai-suggestions, automation config, admin platform-revenue.
- **No hay simulación** de ventas, beneficios ni comisiones; solo modo seguro con ceros cuando SAFE_DASHBOARD_MODE está activo.
- **Recomendación:** Unificar en frontend el significado de ?totalSales? (cantidad vs revenue) y, si aplica, que backend exponga `totalProfit` o `netProfit` en sales stats para no depender de lógica condicional con commissions.

---

*Documento generado a partir del código real.*

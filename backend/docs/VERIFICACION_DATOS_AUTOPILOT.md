# Verificación: datos mostrados en la página Autopilot

Comprueba que toda la información del dashboard de Autopilot proviene de datos reales (API/DB) y no está hardcodeada.

---

## 1. Origen de cada dato

| Dato en pantalla | Origen | ¿Real? |
|------------------|--------|--------|
| **Estado "En ejecución"** | `GET /api/autopilot/status` → `running: true` (estado en memoria del `autopilotSystem`) | ✅ Sí |
| **Listados activos** (y eBay/ML/Amazon) | `GET /api/dashboard/autopilot-metrics` → `activeListings` = `prisma.marketplaceListing.count({ status: 'active' })`. Si la página muestra también desglose por marketplace, puede usar `GET /api/dashboard/inventory-summary` → `listingsByMarketplace` (mismo filtro `status: 'active'`) | ✅ Sí. Nota: si en Control Center ves "502 Active listings" y aquí "0", es porque el funnel usa `publishedAt: { not: null }` y esta métrica usa `status: 'active'`. Son definiciones distintas. |
| **Daily Sales** | `autopilot-metrics` → cuenta de `Sale` hoy, `status` no CANCELLED | ✅ Sí |
| **Winning Products** | `autopilot-metrics` → `winningProductsCount` desde `getProductPerformance(userId, 90)` (productos con winningScore > 75) | ✅ Sí |
| **Profit Today / Profit Month** | `autopilot-metrics` → suma de `netProfit` de ventas (hoy / mes), no canceladas | ✅ Sí |
| **Ciclos activos: 1** | **Frontend:** `autopilotRunning ? 1 : 0`. No viene del backend; indica "¿está el Autopilot principal en marcha?" (1 = sí, 0 = no) | ✅ Sí (derivado del estado real `running`) |
| **Total Runs** | `GET /api/autopilot/stats` → `autopilotSystem.getStatus().stats.totalRuns` (contador del ciclo principal del Smart Autopilot) | ✅ Sí |
| **Tasa de éxito (5,6%)** | `GET /api/autopilot/stats` → `stats.successRate` del Smart Autopilot (porcentaje de ciclos que se consideran "exitosos", p. ej. con al menos una publicación) | ✅ Sí |
| **Items Processed** | `GET /api/autopilot/stats` → `stats.totalProductsProcessed` del Smart Autopilot | ✅ Sí |
| **Marketplaces de publicación** (eBay 29%, etc.) | Config o agregado de listings por marketplace; si viene de inventory-summary, es real | ✅ Sí |
| **Workflows (tabla)** | `GET /api/autopilot/workflows` → workflows del usuario desde BD (`AutopilotWorkflow`). Cada fila: type, schedule, lastRun, nextRun, runCount, successRate, enabled | ✅ Sí |
| **Último ciclo / Last Run** | Status: `lastRun` del Smart Autopilot. Workflow: `lastRun` del registro del workflow en BD | ✅ Sí |

Conclusión: **toda la información mostrada proviene de APIs y base de datos**; no hay valores inventados. La única posible confusión es "Listados activos" (0) vs "Active listings" del Control Center (502) si el modelo usa `status: 'active'` en un caso y `publishedAt` en el otro.

---

## 2. Posible discrepancia: listados activos 0 vs 502

- **Autopilot (y autopilot-metrics):** cuenta `MarketplaceListing` con **`status: 'active'`**.
- **Control Center (funnel):** cuenta `MarketplaceListing` con **`publishedAt: { not: null }`** (sin filtrar por status).

Si en tu BD los listings tienen `publishedAt` pero su `status` no es `'active'` (p. ej. `'published'` u otro), Autopilot mostrará 0 y el funnel 502. Para unificar criterios se puede:
- usar en ambos el mismo criterio (p. ej. `publishedAt != null` para "activos"), o
- documentar en la UI que "Listados activos" = listings con status activo en marketplace (status = 'active').

---

## 3. Interpretación: cuántos ciclos hay y si es el mismo

**¿Cuántos ciclos hay activados?**

- **1 ciclo “principal” en marcha:** lo que muestra **"Ciclos activos: 1"** es el **Smart Autopilot** (el que se inicia con "Start Autopilot"). El frontend muestra 1 cuando `autopilotRunning === true`, y 0 cuando está parado. No es una suma de workflows; es “¿está el motor principal corriendo?”.
- **1 workflow programado:** en la tabla **Workflows** aparece **un** workflow (ej. tipo "minibatch"), programado cada 15 min, con su propio Run Count (66) y Success Rate (99,1%). Ese es un **flujo adicional** guardado en BD y ejecutado por el programador de workflows (cron).

**¿Es el mismo?**

- **No son el mismo mecanismo.** Son dos cosas distintas:
  1. **Ciclo principal (Smart Autopilot):** lo inicia "Start Autopilot", corre con un intervalo en memoria (p. ej. 15 min), y sus números (Total Runs, Tasa de éxito 5,6%, Items Processed) vienen de `autopilotSystem.getStatus().stats`.
  2. **Workflow "minibatch":** es una tarea programada en la BD (cron “cada 15 min”), con su propio contador de ejecuciones (Run Count) y tasa de éxito (99,1%) guardados en el registro del workflow.

- Puede que **ambos** se ejecuten cada 15 min y que el **66** coincida (66 ejecuciones del ciclo principal y 66 del workflow), pero:
  - **Tasa de éxito 5,6%** (Smart Autopilot) = porcentaje de esos ciclos en los que se publicó al menos un producto.
  - **Tasa de éxito 99,1%** (workflow) = porcentaje de ejecuciones del workflow que terminaron sin error (aunque no hayan publicado nada).

Por tanto: **hay 1 ciclo principal activo (Smart Autopilot) y 1 workflow programado (minibatch). No es “el mismo” ciclo; son dos automatismos que pueden correr en paralelo.**

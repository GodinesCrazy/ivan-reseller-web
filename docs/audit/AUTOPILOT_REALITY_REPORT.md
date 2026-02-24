# FASE 5 ? VALIDACIÓN AUTOPILOT REAL

**Verificación: autopilot.service.ts no simula; ejecuta flujo real hasta publicación.**

---

## Qué hace autopilot.service.ts (código real)

| Paso | Método / flujo | ?Real o simulado? | Evidencia |
|------|----------------|-------------------|-----------|
| 1. Obtener productos / oportunidades | `searchOpportunities()` ? `opportunityFinder.findOpportunitiesWithDiagnostics(userId, { query, maxItems })` | **Real** | opportunity-finder.service usa AliExpress Affiliate API y/o scraper (scraper-bridge, advanced-scraper). No hay datos mock. |
| 2. Analizar productos | `filterAffordableOpportunities()` (capital, umbrales minProfitUsd, minRoiPct), `getUserThresholds()` | **Real** | Filtrado por capital de trabajo (workflowConfigService.getWorkingCapital) y umbrales en DB (UserWorkflowConfig). |
| 3. Publicar productos | `processOpportunities()` ? `publishToMarketplace()` ? `marketplaceService.publishProduct(userId, {...})` | **Real** | marketplace.service publica a eBay/Amazon/MercadoLibre según config. Creación de Product en DB y llamada a API del marketplace. |
| 4. Ejecutar compras en AliExpress | No está en autopilot | N/A | Las compras se ejecutan en **order-fulfillment.service** al llamar a **POST /api/paypal/capture-order** (fulfillOrder). Autopilot no dispara compras. |
| 5. Ejecutar payouts PayPal | No está en autopilot | N/A | Los payouts se ejecutan en **sale.service** al crear una Sale (createSale) y en jobs/scheduled-tasks. Autopilot no ejecuta payouts. |

---

## Conclusión

- **Autopilot** hace de forma real: búsqueda de oportunidades (AliExpress/scraper), filtrado por capital y ROI, y **publicación** a marketplace. No simula esos pasos.
- **No** ejecuta compras en AliExpress ni payouts PayPal; eso corresponde al flujo post-venta (capture-order ? fulfillOrder, y createSale ? payouts).
- **Capacidades comprobadas:** API availability check (canScrapeAliExpress, canPublishToEbay/Amazon/MercadoLibre, canPayCommissions) se usa para decidir si arrancar; no implica que autopilot ejecute payouts, solo que el sistema tiene capacidad de hacerlo.

---

## Archivos clave

- `backend/src/services/autopilot.service.ts`: runSingleCycle, searchOpportunities, processOpportunities, publishToMarketplace.
- `backend/src/services/opportunity-finder.service.ts`: findOpportunitiesWithDiagnostics.
- `backend/src/services/marketplace.service.ts`: publishProduct.
- Compras: `order-fulfillment.service.ts`, `paypal.routes.ts` (capture-order).
- Payouts: `sale.service.ts` (createSale), `paypal-payout.service.ts`, `scheduled-tasks.service.ts`, `job.service.ts` (payout queue).

---

*Documento generado a partir del código real. No se encontró simulación en el ciclo de obtención, análisis ni publicación.*

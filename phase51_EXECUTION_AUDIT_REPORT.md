# Phase 51 — Ejecución: auditoría del sistema + acciones tomadas

**Fecha:** 2026-03-18  
**Alcance:** monorepo `Ivan_Reseller_Web` (`frontend/`, `backend/`, `scraper-bridge/`, `native-scraper/`)  
**Referencia:** `phase51_ai_dropshipping_full_system_audit_and_profit_protection.md`

---

## Phase 1 — Full system audit (obligatorio)

### TASK 1 — Mapa del pipeline (código real)

| Etapa | Componentes principales (backend) |
|--------|-------------------------------------|
| **Detección de oportunidades** | `ai-opportunity.service.ts`, `opportunities.routes.ts`, scripts `find-real-opportunities.ts`, scrapers / Affiliate |
| **Selección de producto** | `product-state-machine.service.ts`, `winner-detection.service.ts`, rutas `products.routes.ts` |
| **Selección de proveedor** | `aliexpressUrl` en `Product`; Phase 48 `smart-supplier-selector.service.ts` (post-venta / manual) |
| **Cálculo de coste** | `cost-calculator.service.ts`, `financial-calculations.service.ts`, `real-profit-engine.service.ts`, `profit-guard.service.ts`, `getEffectiveShippingCost` / `getDefaultShippingCost` en `shipping.utils.ts` |
| **Publicación** | `marketplace.service.ts` → `publishToEbay` / `publishToMercadoLibre` / `publishToAmazon` |
| **Venta** | PayPal / webhooks, `orders.routes.ts`, creación de `Order` |
| **Fulfillment** | `order-fulfillment.service.ts`, `aliexpress-dropshipping-api.service.ts` (`getProductInfo`, `placeOrder`), `manual-fulfillment.service.ts` |
| **Destino / país** | `destination.service.ts` (país desde credenciales marketplace) |

### TASK 2 — Puntos de fallo (validación ausente o débil)

| Área | Riesgo | Evidencia en código |
|------|--------|---------------------|
| **Coste de envío** | Alto | `getDefaultShippingCost()` → `DEFAULT_SHIPPING_COST_USD` (p. ej. **5.99 USD fijo**) cuando el producto no tiene `shippingCost`. No es coste API por país/línea logística. |
| **Publicación eBay** | Alto | `publishToEbay`: `totalCost` = `product.totalCost` **o** `aliexpressPrice + getEffectiveShippingCost + importTax`. La comprobación es **`price > totalCost`** sin incluir **fees de marketplace + pago** en ese umbral (los fees sí existen en otros servicios). Margen aparente > margen real. |
| **Profit guard** | Medio | `checkProfitGuard` se usa en **PayPal / pricing-engine / dynamic-pricing**; **no** está integrado de forma uniforme en el **primer paso** de `publishProduct` como “reality check” único. |
| **Proveedor → país comprador** | Alto | No hay en `publishProduct` un paso obligatorio **pre-publicación**: Dropshipping **`getProductInfo`** + comprobar envío/SKU para el **país destino** del listing (p. ej. US desde `EBAY_US`). La validación fuerte aparece **después de la venta** (fulfillment / Phase 48). |
| **Multi-proveedor** | Medio | Modelo predominante **1 producto → 1 URL AliExpress**; Phase 48 añade recomendación alternativa en **orden manual**, no en catálogo pre-venta. |
| **Asunciones** | Alto | Fees por defecto en calculadoras (`ebay` ~12.5% + payment ~2.9%, etc.) — útiles, pero deben alinearse con el **mismo** criterio que bloquea publicación. |

### TASK 3 — Registro estructurado de riesgos

**Riesgos financieros**

- Subestimación de coste total (envío por defecto, fees no incluidos en el gate de publicación eBay/ML/Amazon en el mismo criterio que `pricing-engine`).
- `product.totalCost` persistido desactualizado si precio/stock/envío del proveedor cambian tras publicar.

**Riesgos de fulfillment**

- `SKU_NOT_EXIST`, sin stock, o envío no disponible al país del comprador: detectable con API en fulfillment; **no** garantizado antes de publicar.
- Dependencia de credenciales y cuotas AliExpress Dropshipping en tiempo real.

**Inconsistencia de datos**

- Varios servicios calculan margen (`financial-calculations`, `cost-calculator`, `real-profit-engine`, `marketplace.service`); riesgo de **números distintos** según pantalla o flujo.

**Validaciones faltantes (resumen)**

- Pre-publish: **simulación** `getProductInfo` + SKU con stock + matriz país destino.
- Pre-publish: **coste de envío** desde API (o política explícita si API no devuelve).
- Pre-publish: **profit mínimo** unificado (incl. fees) alineado con `checkProfitGuard`.

---

## Phases 2–11 — Estado vs objetivo

| Fase | Objetivo | Estado en repo |
|------|-----------|----------------|
| 2 Reality validation | Motor pre-publicación | **Parcial:** compliance, precio > coste parcial; falta gate API unificado. |
| 3 True cost | Sin hardcodes | **Parcial:** default shipping sigue siendo pilar; fees dispersos. |
| 4 Country-aware | Validar por destino | **Parcial:** `destination.service` existe; falta enlace obligatorio con DS shipping/SKU. |
| 5 Multi-supplier | N proveedores | **Parcial:** Phase 48 en órdenes. |
| 6 Pre-publish test | getProductInfo antes de listar | **Pendiente** como paso estándar. |
| 7 AI decisions | Basadas en costes reales | Requiere integración de datos API en prompts/scoring. |
| 8 Self-correcting | Monitor stock/precio | `inventory-sync`, `listing-lifetime` — revisar enlace con riesgo financiero. |
| 9 Frontend | Confianza / riesgo | Mostrar breakdown alineado con backend unificado. |
| 10 Auditoría listings | Clasificar SAFE/RISKY/… | **Pendiente** como job/reporte global. |
| 11 Safety lock | Bloquear publicaciones | **Implementado** (ver abajo). |

---

## Acción ejecutada en código (Phase 11 — TASK 23)

- Variable de entorno **`BLOCK_NEW_PUBLICATIONS`** (`true` / `false`, default `false`).
- Si está en `true`, **`MarketplaceService.publishProduct`** lanza error y **no** publica en ningún marketplace.
- Documentado en `backend/.env.example`.

**Uso (Railway / local):** `BLOCK_NEW_PUBLICATIONS=true` hasta completar validaciones Phase 51.

---

## Próximos pasos recomendados (prioridad)

1. **Un solo “PrePublishValidator”** que combine: `destination` → país, `getProductInfo` (DS), stock SKU, y `checkProfitGuard` con breakdown completo (incl. fees).
2. **Sustituir o acotar** el uso de `getDefaultShippingCost` en la decisión de publicación cuando haya API de envío disponible; si no, marcar producto como **RISKY** y subir umbral de margen.
3. **Alinear** `publishToEbay` / ML / Amazon con el mismo `totalCost` que usa `pricing-engine` + profit guard.
4. **Job de auditoría** (TASK 20–22): listar productos publicados, reclasificar, endpoint o script para unpublish masivo con consentimiento.
5. **Frontend:** mostrar en ficha de producto el breakdown y **nivel de riesgo** (datos del validador).

---

## Cómo re-ejecutar esta auditoría

- Repetir búsqueda en `backend/src/services/` por: `totalCost`, `getDefaultShippingCost`, `checkProfitGuard`, `publishToEbay`, `getProductInfo`.
- Revisar integración PayPal vs publicación.
- Tras cambios, ejecutar: `cd backend && npm test` y `npx tsc -p tsconfig.json`.

---

*Informe generado como ejecución de las instrucciones Phase 51 sobre el estado actual del repositorio.*

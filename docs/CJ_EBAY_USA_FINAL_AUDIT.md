# Informe Final de Auditoría — CJ → eBay USA

Fecha de auditoría: 2026-04-14
Repositorio auditado: `C:\Ivan_Reseller_Web`

## 1. Resumen ejecutivo
- Veredicto general: la vertical CJ → eBay USA está ampliamente implementada en código, pero no existe evidencia de validación viva E2E completa en cuenta real durante esta auditoría.
- Estado global del software: base amplia y funcional por módulos, pero no demostrable como “100% operativo” en todas las integraciones externas bajo evidencia viva actual.
- Estado global de la vertical CJ → eBay USA: implementada en backend/DB/UI principal, con partes parciales (UI de alerts/profit/logs, automatización full de jobs) y con validación real pendiente.
- Clasificación operativa actual de la vertical: PARCIALMENTE LISTO.

## 2. Alcance auditado
Se auditó estructura, código y documentación relevante, incluyendo:
- Backend: `backend/src/app.ts`, `backend/src/api/routes/*.routes.ts`, `backend/src/services/*`, `backend/src/modules/cj-ebay/**`, `backend/src/modules/aliexpress/**`, `backend/src/modules/marketplace/**`.
- Frontend: `frontend/src/App.tsx`, `frontend/src/pages/**`, `frontend/src/pages/cj-ebay/**`, `frontend/src/components/cj-ebay/**`, `frontend/src/config/feature-flags.ts`.
- DB/Prisma: `backend/prisma/schema.prisma`, `backend/prisma/migrations/**`, `npx prisma migrate status`.
- Scripts: `scripts/run-cj-ebay-migrations.ts`, `scripts/export-evidence.ts`, `scripts/cj-ebay-3e4-flow.http`, `backend/scripts/cj-ebay-operational-validation.ts` y scripts CJ relacionados.
- Config/env: `backend/src/config/env.ts`, `backend/.env.example`.
- Plan y docs: `docs/CJ_EBAY_USA_MASTER_PLAN.md` + reportes CJ operativos.

Evidencia transversal del repo (inventario estructural):
- Backend TS/TSX: 600 archivos.
- Rutas backend (`*.routes.ts`): 61.
- Servicios backend (`*.service.ts`): 248.
- Frontend TS/TSX: 185.
- Páginas frontend: 58.
- Migraciones Prisma: 58.
- Documentos Markdown: 1388.

## 3. Arquitectura real encontrada
### Backend
- Router principal monta la vertical en `app.use('/api/cj-ebay', cjEbayRoutes)` (`backend/src/app.ts:1149`).
- Coexisten rutas legacy extensas (`/api/orders`, `/api/marketplace`, `/api/aliexpress`, `/api/webhooks`, `/api/dropshipping`, etc.).
- El módulo CJ está aislado por carpeta (`backend/src/modules/cj-ebay/**`) pero convive con puentes a legado de órdenes.

### Frontend
- Rutas CJ en `frontend/src/App.tsx` (`/cj-ebay/*`) detrás de `CjEbayModuleGate`.
- Flag frontend: `VITE_ENABLE_CJ_EBAY_MODULE` en `frontend/src/config/feature-flags.ts`.

### DB
- Vertical dedicada en `schema.prisma` con bloque `cj_ebay_*` y nota explícita de no acoplar a `Product/Order/Sale` legacy (`backend/prisma/schema.prisma`, bloque desde línea ~1529).
- Modelos CJ presentes: settings, productos, variantes, cotizaciones, evaluaciones, listings, órdenes, eventos, tracking, alertas, snapshots profit, trazas.

### Jobs/colas
- Jobs globales por BullMQ/Redis en `scheduled-tasks.service.ts`.
- Si Redis no está disponible, tareas programadas quedan deshabilitadas (log explícito en servicio).
- No existe aún un paquete de workers CJ verticales “3F masivo” dentro de `modules/cj-ebay`.

### Feature flags
- Backend: `ENABLE_CJ_EBAY_MODULE` y `BLOCK_NEW_PUBLICATIONS` definidos con default `false` (`backend/src/config/env.ts`).
- Frontend: `VITE_ENABLE_CJ_EBAY_MODULE`.
- En este entorno auditado, `ENABLE_CJ_EBAY_MODULE` estaba en `false (default)` (salida de `npm run cj-ebay:operational-validation`).

### Scripts
- Migración/operación 3E.4 reales en repo: `run-cj-ebay-migrations.ts`, `export-evidence.ts`, `cj-ebay-3e4-flow.http`.

## 4. Inventario del módulo CJ → eBay USA
### Backend (implementado)
- Rutas: `backend/src/modules/cj-ebay/cj-ebay.routes.ts`.
- Adapters CJ oficiales (shopping/freight/auth): `backend/src/modules/cj-ebay/adapters/**`.
- Servicios: qualification, pricing, listing, ingest, place, confirm/pay, status, tracking, trace, readiness, operational-flow, evidence-summary.
- Política de shipping honesta sin reusar estimador legacy AliExpress: `policies/cj-ebay-listing-shipping.policy.ts`.

### Frontend
- Implementadas: `Overview`, `Products`, `Listings`, `Orders`.
- Parciales/placeholder: `Alerts`, `Profit`, `Logs` (placeholder explícito: “No hay datos simulados de CJ ni eBay”).

### DB
- Migraciones CJ encontradas:
  - `20260412180000_cj_ebay_phase3a`
  - `20260413153000_cj_ebay_phase3c_pricing_settings`
  - `20260414203000_cj_ebay_phase3d_listing_draft`
  - `20260415120000_cj_ebay_phase3e_orders`
  - `20260416120000_cj_ebay_phase3e3_checkout`
- `npx prisma migrate status`: schema al día.

### Scripts
- `npm run cj-ebay:operational-validation`.
- `npm run cj-ebay:3e4:migrate`.
- `npm run cj-ebay:3e4:export-evidence`.

### Docs
- Plan maestro: `docs/CJ_EBAY_USA_MASTER_PLAN.md`.
- Reportes operativos CJ adicionales (varios archivos `docs/CJ_*`).

## 5. Estado funcional por componente

| Componente | Estado | Evidencia | Observaciones |
|---|---|---|---|
| Router CJ backend | IMPLEMENTADO COMPLETO + VALIDADO LOCAL | `backend/src/app.ts:1149`, `backend/src/modules/cj-ebay/cj-ebay.routes.ts` | Montado en `/api/cj-ebay`. |
| Gate backend del módulo | IMPLEMENTADO COMPLETO | `cj-ebay.routes.ts` (`moduleGate`, `CJ_EBAY_MODULE_DISABLED`) | Si flag off, todo 404 excepto `system-readiness`. |
| `system-readiness` 3E.4 | IMPLEMENTADO COMPLETO + VALIDADO LOCAL | `cj-ebay.routes.ts`, `cj-ebay-system-readiness.service.ts` | Diseñado sin llamadas CJ/eBay HTTP (solo readiness estructural). |
| Sourcing/CJ search | IMPLEMENTADO COMPLETO + VALIDADO LOCAL | `cj-opportunity-supply.service.ts`, `cj-supplier.adapter.ts` | Sin evidencia de corrida viva en esta auditoría. |
| Shipping quote CJ | IMPLEMENTADO COMPLETO + VALIDADO LOCAL | `cj-ebay-qualification.service.ts` + adapter freight oficial | Requiere prueba viva para declarar operación real cerrada. |
| Qualification + Pricing | IMPLEMENTADO COMPLETO + VALIDADO LOCAL | `cj-ebay-qualification.service.ts`, `cj-ebay-pricing.service.ts` | Reglas y defaults presentes; falta verificación con casos reales de negocio. |
| Listing draft/publish eBay | IMPLEMENTADO COMPLETO + VALIDADO LOCAL | `cj-ebay-listing.service.ts`, `cj-ebay-ebay-facade.service.ts` | Publicación real depende de credenciales/políticas eBay y flags. |
| Ingest order eBay | IMPLEMENTADO COMPLETO + VALIDADO LOCAL | `cj-ebay-order-ingest.service.ts` | Mapeo por `ebaySku` hacia `cj_ebay_listings`; si no mapea, `NEEDS_MANUAL`. |
| Create order CJ (`createOrderV2`) | IMPLEMENTADO COMPLETO + VALIDADO LOCAL | `cj-ebay-fulfillment.service.ts` | Usa `payType=3` y `shopLogisticsType=2`. |
| Confirm/Pay CJ | IMPLEMENTADO COMPLETO + VALIDADO LOCAL | `cj-ebay-cj-checkout.service.ts` | `payBalanceV2` no implementado (documentado como pendiente condicional). |
| Status/tracking + submit a eBay | IMPLEMENTADO COMPLETO + VALIDADO LOCAL | `cj-ebay-order-status.service.ts`, `cj-ebay-tracking.service.ts` | Submit a eBay depende de `lineItems` en `rawEbaySummary`. |
| Evidence/operational-flow | IMPLEMENTADO COMPLETO + VALIDADO LOCAL | `cj-ebay-operational-validation.service.ts`, `cj-ebay-order-evidence.service.ts` | Son helpers de evidencia DB; no sustituyen prueba viva. |
| UI CJ core (overview/products/listings/orders) | IMPLEMENTADO COMPLETO + VALIDADO LOCAL | `frontend/src/pages/cj-ebay/*.tsx` | Compila; sin pruebas UI automáticas CJ. |
| UI CJ alerts/profit/logs | IMPLEMENTADO PARCIAL | `CjEbayAlertsPage.tsx`, `CjEbayProfitPage.tsx`, `CjEbayLogsPage.tsx` | Placeholder explícito. |
| Feature flags frontend/backend | IMPLEMENTADO COMPLETO | `frontend/src/config/feature-flags.ts`, `backend/src/config/env.ts` | En entorno auditado, backend CJ flag estaba `false`. |
| Migraciones CJ | IMPLEMENTADO COMPLETO + VALIDADO LOCAL | migraciones `cj_ebay_*` + `prisma migrate status` | DB actualizada. |
| Automatización jobs CJ | IMPLEMENTADO PARCIAL | `scheduled-tasks.service.ts`, `supplier-postsale-sync.service.ts` | Depende de Redis; en entorno auditado Redis ausente. |
| Integración con legacy Order | IMPLEMENTADO PARCIAL | `marketplace-order-sync.service.ts`, `order-fulfillment.service.ts` | Hay puente `supplier='cj'`; sigue coexistiendo con lógica AliExpress-first. |
| Pruebas automáticas CJ backend | VALIDADO LOCAL PARCIAL | 5 suites CJ pasan (17 tests) | Cobertura acotada vs alcance completo E2E. |
| Pruebas automáticas CJ frontend | NO ENCONTRADO | búsqueda `*.test.*|*.spec.*` con `cj` en frontend | No hay tests CJ UI. |
| Validación real en cuenta viva (CJ/eBay) | NO EXISTE EN ESTA AUDITORÍA | DB `cj_ebay_*` en 0 filas; sin evidencia de corrida 3E.4 viva | Bloqueo principal para declarar terminado operativo. |

## 6. Auditoría del flujo extremo a extremo

### 6.1 Sourcing CJ
- Estado: IMPLEMENTADO COMPLETO / VALIDADO LOCAL.
- Evidencia: `cj-opportunity-supply.service.ts` usa `adapter.searchProducts`.
- Validación real: pendiente.

### 6.2 Shipping quote CJ
- Estado: IMPLEMENTADO COMPLETO / VALIDADO LOCAL.
- Evidencia: `quoteShippingToUsReal` en qualification.
- Validación real: pendiente.

### 6.3 Qualification
- Estado: IMPLEMENTADO COMPLETO / VALIDADO LOCAL.
- Evidencia: reglas `minMarginPct`, `minProfitUsd`, `maxShippingUsd`, `rejectOnUnknownShipping`, `maxRiskScore`.
- Validación real: pendiente con catálogo y costos reales.

### 6.4 Pricing
- Estado: IMPLEMENTADO COMPLETO / VALIDADO LOCAL.
- Evidencia: `cj-ebay-pricing.service.ts` con fees/incident buffer/breakdown.
- Validación real: pendiente (márgenes en operación real).

### 6.5 Listing draft
- Estado: IMPLEMENTADO COMPLETO / VALIDADO LOCAL.
- Evidencia: `POST /listings/draft` + `draftPayload` en `cj_ebay_listings`.
- Validación real: pendiente.

### 6.6 Listing publish
- Estado: IMPLEMENTADO COMPLETO / VALIDADO LOCAL.
- Evidencia: `POST /listings/publish`, fachada eBay dedicada.
- Observación: bloqueable por `BLOCK_NEW_PUBLICATIONS`.
- Validación real: pendiente.

### 6.7 Ingest order
- Estado: IMPLEMENTADO COMPLETO / VALIDADO LOCAL.
- Evidencia: `POST /orders/import` + mapeo por SKU a listing CJ.
- Observación: ingest manual explícito dentro del módulo.

### 6.8 Create order CJ
- Estado: IMPLEMENTADO COMPLETO / VALIDADO LOCAL.
- Evidencia: `POST /orders/:id/place` → `createOrderV2` (`payType=3`).

### 6.9 Confirm order CJ
- Estado: IMPLEMENTADO COMPLETO / VALIDADO LOCAL.
- Evidencia: `POST /orders/:id/confirm` (`confirmOrder`).

### 6.10 Pay balance CJ
- Estado: IMPLEMENTADO COMPLETO / VALIDADO LOCAL.
- Evidencia: `POST /orders/:id/pay` (`payBalance`).
- Observación: `payBalanceV2` no implementado.

### 6.11 Get order status
- Estado: IMPLEMENTADO COMPLETO / VALIDADO LOCAL.
- Evidencia: `GET /orders/:id/status` vía `getOrderDetail`.

### 6.12 Tracking
- Estado: IMPLEMENTADO COMPLETO / VALIDADO LOCAL.
- Evidencia: `POST /orders/:id/sync-tracking` + upsert en `cj_ebay_tracking`.

### 6.13 Submit tracking a eBay
- Estado: IMPLEMENTADO COMPLETO / VALIDADO LOCAL.
- Evidencia: `submitOrderShippingFulfillment` en tracking service.
- Condición: requiere `rawEbaySummary.lineItems`; si no, evento `TRACKING_EBAY_SKIPPED`.

### 6.14 Evidence / traces / operational-flow
- Estado: IMPLEMENTADO COMPLETO / VALIDADO LOCAL.
- Evidencia: endpoints `system-readiness`, `operational-flow`, `evidence-summary`; scripts de export.
- Observación: son instrumentos de verificación, no prueba viva en sí.

## 7. Verificación de operatividad real
### 7.1 Validado solo en código
- Implementación de rutas/servicios/migraciones CJ completas.
- Integración de fachada eBay dentro del módulo CJ.
- Estructura de estados y trazas CJ (`cj_ebay_order_events`, `cj_ebay_execution_traces`).

### 7.2 Validado localmente (esta auditoría)
- `backend`: `npm run type-check` OK.
- `backend`: `npm run build` OK.
- `frontend`: `npm run type-check` OK.
- `frontend`: `npm run build` OK.
- `backend`: 5 suites CJ/bridge en PASS (17 tests).
- `backend`: `npm run cj-ebay:operational-validation` OK.
- `backend`: `npx prisma migrate status` = schema al día.

### 7.3 Validado en cuenta real
- No se encontró evidencia ejecutada durante esta auditoría de ciclo completo vivo `import → place → confirm → pay → status → tracking → submit eBay` con evidencia cerrada.
- Estado de datos: `cj_ebay_products/variants/quotes/evaluations/listings/orders/events/tracking/traces = 0` en DB auditada.

### 7.4 No validado aún
- Publicación eBay real desde módulo CJ en entorno vivo auditado.
- Orden CJ real end-to-end en `cj_ebay_orders` con trazas completas.
- Confirmación de necesidad/no necesidad de `payBalanceV2` para la cuenta productiva objetivo.
- Automatización programada completa con Redis activo en este entorno (Redis reportado ausente por script de validación).

## 8. Estado de producción
Clasificación explícita: PARCIALMENTE LISTO.

Justificación:
- Implementación de código: alta (backend/DB/UI principal existentes).
- Validación local: sí (build, type-check, tests focalizados).
- Validación real E2E: no cerrada en esta auditoría.
- Operación automatizada real: no demostrable al 100% en este entorno (flag CJ en false + Redis ausente + sin datos CJ verticales en tablas dedicadas).

## 9. Bloqueos y faltantes exactos
1. Falta corrida viva documentada 3E.4 con evidencia completa (orden real de punta a punta en `cj_ebay_orders`).
2. Falta habilitar y operar el módulo en entorno objetivo (`ENABLE_CJ_EBAY_MODULE=true` y `VITE_ENABLE_CJ_EBAY_MODULE=true` de forma controlada).
3. Falta confirmar infraestructura de automatización (Redis activo para jobs programados relevantes).
4. Falta completar o declarar fuera de alcance actual las pantallas CJ de `Alerts`, `Profit`, `Logs` (hoy placeholders).
5. Falta validación operativa de tracking submit a eBay con payload real (`lineItems`) y evidencia de aceptación eBay.
6. Falta cierre de criterio productivo para `payBalanceV2` (si la cuenta real lo exige).
7. Falta evidencia reproducible de operación real persistida (no solo reportes narrativos).
8. Falta suite de pruebas frontend CJ (actualmente 0 tests CJ UI).

## 10. Riesgos críticos
### Técnicos
- Coexistencia vertical nueva + legado puede generar confusión de fuente de verdad entre `cj_ebay_orders` y `orders` legacy.
- Dependencia de datos eBay para mapeo SKU; si SKU no matchea, cae en `NEEDS_MANUAL`.
- Si Redis no está, la automatización por jobs se degrada a ejecución manual/puntual.

### Operativos
- Operador puede ejecutar en ruta equivocada (módulo CJ vs Orders legacy) y romper trazabilidad.
- Flags desalineados frontend/backend pueden ocultar o romper operación esperada.

### Integraciones
- Credenciales pueden existir pero no estar válidas/renovadas (existencia no equivale a operatividad).
- CJ pay path puede variar por cuenta; `payBalanceV2` sigue como potencial gap de compatibilidad.

### Datos
- Al no haber registros CJ verticales en tablas dedicadas en entorno auditado, no hay evidencia histórica de estabilidad del flujo real.

### Negocio
- No se puede declarar “dropshipping automatizado real terminado” sin orden viva cerrada y evidencia completa de postventa/tracking sobre eBay.

## 11. Actualización requerida del plan maestro
Fuente auditada: `docs/CJ_EBAY_USA_MASTER_PLAN.md`.

### Qué se corrige
- El documento mezcla estados actuales y secciones históricas obsoletas en el mismo archivo.
- Contradicción explícita detectada:
  - Encabezado declara 3A–3E.4 implementado en buena parte.
  - Secciones internas tempranas aún dicen “aún no está codificado” y “CJ no localizado”.

### Qué marcar como hecho
- 3A–3C: implementado en código.
- 3D: implementado en código (draft/publish).
- 3E/3E.1/3E.3: implementado en código (import/place/confirm/pay/status/tracking).
- 3E.4 (tooling): implementado en repo (`system-readiness`, `operational-flow`, `evidence-summary`, scripts).

### Qué dejar abierto
- 3E.4 (corrida viva y cierre operacional con evidencia real).
- 3F/3G de forma explícita, especialmente dashboard/alertas/profit/logs y workers masivos CJ.
- Cierre de compatibilidad `payBalanceV2` si la cuenta productiva lo requiere.

### Nuevas subtareas a agregar
1. Subtarea de validación viva obligatoria con evidencia archivada JSON y timestamps reales (no resumen narrativo).
2. Subtarea de activación controlada de flags en entorno objetivo y checklist de rollback.
3. Subtarea de verificación Redis/jobs y confirmación de ejecución periódica.
4. Subtarea de cierre de placeholders UI o declaración formal de alcance MVP.
5. Subtarea de pruebas automatizadas frontend CJ (mínimo smoke UI de pipeline/listings/orders).
6. Subtarea de reconciliación de fuente de verdad entre vertical CJ y órdenes legacy.

## 12. Veredicto final
“La vertical CJ → eBay USA está implementada pero no validada completamente en real”

Por qué:
- Existe implementación técnica extensa y coherente en backend/frontend/DB/scripts.
- Se validó compilación y pruebas locales focalizadas.
- No hay evidencia ejecutada en esta auditoría de operación viva E2E completa con datos reales en tablas `cj_ebay_*` ni cierre operacional final de postventa en cuenta real.

## 13. Formato obligatorio de cierre
1. QUÉ SE AUDITÓ
- Estructura completa backend/frontend/prisma/scripts/docs relevantes, módulo CJ completo, rutas legacy relacionadas, flags, jobs y plan maestro.

2. EVIDENCIA REAL EN EL CÓDIGO O SISTEMA
- Rutas y servicios CJ presentes y montados en API.
- Migraciones CJ aplicadas en DB.
- Build/type-check backend/frontend en verde.
- Tests CJ backend relevantes en PASS.
- Validación operacional local ejecutada con salida verificable.
- Estado DB auditado: tablas CJ en cero filas en este entorno.

3. QUÉ FALTA
- Validación viva 3E.4 completa en cuenta real.
- Activación controlada de flags en entorno objetivo.
- Redis operativo para automatización completa.
- Cierre de placeholders UI CJ.
- Evidencia productiva de tracking submit a eBay y compatibilidad final de pago.

4. ESTADO EXACTO
- Software global: operativo por componentes, no demostrable como 100% operativo integral bajo evidencia viva actual.
- Vertical CJ → eBay USA: implementada técnicamente, validada localmente de forma parcial, no cerrada operativamente en real.

## 14. Respuestas explícitas a las 10 preguntas obligatorias
1. ¿El software completo está operativo hoy?
- No se puede afirmar “100% operativo” con evidencia viva integral. Sí hay alta operatividad por módulos.

2. ¿La vertical CJ → eBay USA está realmente terminada?
- No en términos operativos reales; sí está mayormente implementada en código.

3. ¿La vertical está diseñada/implementada/validada local/validada real/lista producción?
- Diseñada: Sí.
- Implementada: Sí, mayoritariamente.
- Validada localmente: Sí, parcial/focal.
- Validada en cuenta real: No cerrada en esta auditoría.
- Lista para producción: No; está en estado de preparación parcial.

4. ¿Qué partes están completas?
- Core backend CJ, schema+migraciones CJ, endpoints 3E.4, flujo técnico principal de órdenes, UI core (overview/products/listings/orders).

5. ¿Qué partes están parciales?
- UI de alerts/profit/logs, automatización total por jobs, integración operativa completa con evidencia real.

6. ¿Qué partes están solo documentadas?
- Cierre operacional 100% en real (3E.4) y claims GO de varios reportes no sustituyen evidencia viva en tablas/ejecuciones de esta auditoría.

7. ¿Qué partes siguen dependiendo de validación real?
- Publish real, order real CJ completa, tracking submit eBay real, confirmación contractual de ruta de pago final por cuenta.

8. ¿Qué bloquea declarar “100% operativo”?
- Falta de evidencia E2E viva cerrada + flags/infrastructure de operación (módulo desactivado por default, Redis ausente en entorno auditado).

9. ¿Qué falta exactamente para cerrar el proyecto?
- Ejecutar y evidenciar corrida 3E.4 real completa, activar operación productiva controlada, cerrar placeholders críticos, consolidar automatización y pruebas UI.

10. ¿Qué debe actualizarse en el plan maestro?
- Limpiar contradicciones internas y reflejar estado real: implementado en código vs validado en real pendiente, con criterios de salida medibles.

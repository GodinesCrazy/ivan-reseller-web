# CJ Dropshipping → eBay USA — Plan maestro y auditoría

**Versión:** 2.19 (Hotfix: publish FAILED por eBay 25002 → nuevo estado OFFER_ALREADY_EXISTS + reconcile)  
**Última actualización:** 2026-04-16  
**Estado global del programa:** FASE 0–2 documentales; **FASE 3A–3C** en código; **FASE 3D** en código (listings) — **guardrail account policy block** + **OFFER_ALREADY_EXISTS reconcile** implementados; **FASE 3E + 3E.1–3E.4** en código (orders completo). **FASE 3F** implementada: **guardrail pago proveedor** (`SUPPLIER_PAYMENT_BLOCKED` / `CJ_BALANCE_INSUFFICIENT`), **modelo de devoluciones semi-manual** con estados y trazabilidad, **consola financiera profesional** (`/cj-ebay/profit`), **motor de alertas real** (`/cj-ebay/alerts`). **FASE 3W** implementada: **warehouse-aware fulfillment** (feature flag `CJ_EBAY_WAREHOUSE_AWARE`, probe US→CN fallback, `warehouseEvidence`, `originCountryCode` en DB, badge UI, origin dinámico en listing/descripción). **payBalanceV2** no está implementado. La postventa **sigue sin declararse “lista”** sin completar 3E.4 en cuenta real. **FASE 3G** (workers automáticos) pendiente.

Este documento es la **guía viva** para la vertical CJ → eBay USA. Debe actualizarse al confirmar hallazgos en código, al cerrar fases y al validar integraciones reales.

---

## 1. Resumen ejecutivo

El repositorio **Ivan Reseller Web** es una aplicación full-stack (backend Node/Express + TypeScript, frontend React/Vite, PostgreSQL vía Prisma) orientada a **dropshipping multicanal**, con fuerte acoplamiento operativo y de datos al ecosistema **AliExpress** (OAuth Dropshipping, affiliate, freight, SKU, compras postventa) y con integraciones maduras para **eBay** y **Mercado Libre** (Chile y pilotos).

Existe un **módulo `cj-ebay`** en código (API 2.0 CJ: catálogo, flete, listings eBay USA, **órdenes** con `createOrderV2` y `getOrderDetail` según doc oficial — ver §FASE 3E.1); la integración **no** debe considerarse validada en producción hasta pruebas con cuenta CJ viva.

El nuevo negocio exige una **vertical aislada**: sourcing CJ, calificación, pricing con costos reales, publicación eBay USA sin promesas de entrega falsas, órdenes → CJ → tracking → eBay, alertas y dashboard propio — **sin reutilizar de forma ciega** supuestos del flujo AliExpress ni mezclar modelos de datos legacy de forma peligrosa.

---

## 2. Objetivo del nuevo módulo

Construir un apartado profesional, escalable y **separado del legacy**, que permita operar de extremo a extremo (en fases):

- Catálogo y datos operativos desde **CJ** (producto, variantes, stock, costes, envío a USA, plazos cuando la API los provea).
- **Motor de calificación** que bloquee lo inviable antes de publicar.
- **Motor de pricing** CJ → eBay USA con fees, buffers y márgenes configurables.
- **Listing engine** eBay USA alineado a datos reales (handling time, promesa de envío coherente con origen/fulfillment).
- **Orquestación de órdenes** eBay → CJ → tracking → subida a eBay.
- **Monitoreo, alertas, métricas y trazabilidad** propias del canal.

---

## 3. Alcance exacto de esta etapa (MVP realista — por implementar)

Lo siguiente es el **alcance objetivo** de la primera entrega implementable; **aún no está codificado**:

- Conexión y cliente base **CJ** (auth, rate limits, errores, logs).
- Persistencia **dedicada** (tablas prefijadas o namespace claro `cj_ebay_*` / módulo Prisma separado por convención del repo).
- API REST bajo prefijo estable, p. ej. `/api/cj-ebay/...` (nombre final según convención).
- Calificación mínima viable + pricing mínimo viable con parámetros de configuración.
- Flujo de listing **preparado** para eBay USA reutilizando **solo** la capa técnica genérica de eBay (credenciales, llamadas API), **no** la lógica de coste/envío AliExpress.
- Dashboard React: rutas y secciones mínimas (ver sección 7 del brief del usuario y sección 13 más abajo).
- Alertas mínimas y tabla de eventos/logs de ejecución.

**FASE 0–1** eran solo documentación; **FASE 3A** añade el primer código del módulo (ver §FASE 3A).

---

## 4. Qué queda fuera por ahora

- Otros marketplaces (ML, Amazon) dentro de la vertical CJ.
- Multi-proveedor en la misma vertical.
- Optimización SEO/IA pesada de fichas si retrasa el MVP operativo.
- Sustitución del flujo AliExpress legacy.
- “100% funcionando en real” sin credenciales CJ + eBay producción y prueba E2E acordada (ver sección 18).

---

## 5. Diagnóstico del sistema actual (evidencia en código)

### 5.1 Estructura real del repositorio (no la de AGENTS.md genérico)

En este workspace la estructura operativa es:

- `backend/` — API Express, servicios, Prisma, jobs BullMQ.
- `frontend/` — React + TypeScript, Vite, rutas en `App.tsx`, páginas bajo `src/pages/`.
- `docs/` — amplia documentación histórica de fases (P0, P56, ML, eBay, etc.).

> **Nota:** `c:\AGENTS.md` describe un monorepo `xiw/zea/xyt`; **este checkout** usa `backend/` + `frontend/` en la raíz. El plan CJ debe alinearse a **esta** estructura.

### 5.2 Backend

- **Entrada HTTP:** `backend/src/app.ts` monta decenas de routers (auth, products, opportunities, marketplace, webhooks, jobs, dropshipping, AliExpress module, etc.).
- **Datos:** `backend/prisma/schema.prisma` — PostgreSQL.
- **Colas:** `backend/src/services/scheduled-tasks.service.ts` — **BullMQ** + Redis, con workers para fulfillment, tracking sync, órdenes por marketplace, pricing dinámico, inventario, etc. Patrón maduro para **añadir colas CJ sin tocar las existentes** si se nombra y aísla la cola.

### 5.3 Frontend

- **Enrutado:** `frontend/src/App.tsx` — páginas: Dashboard, Opportunities, Products, Orders, Listings, FlexibleDropshipping, Intelligent Publisher, etc.
- **Shell:** `Layout` compartido; autenticación vía store y API.

### 5.4 Base de datos (modelo mental)

Entidades centrales del legacy de dropshipping:

| Área | Modelo / lugar | Observación CJ |
|------|------------------|----------------|
| Producto catálogo usuario | `Product` | `aliexpressUrl`, `aliexpressSku`, costes y stock orientados a AliExpress |
| Venta | `Sale` | `aliexpressCost` — semántica AliExpress |
| Listing | `MarketplaceListing` | `productId` → `Product`; mezclar CJ en el mismo `Product` **sin diseño** sería contaminación |
| Oportunidad | `Opportunity` | Pipeline competencia/márgenes genérico pero alimentado desde flujos actuales |
| Orden postventa | `Order` | `aliexpressOrderId`, flujo PayPal → compra proveedor AliExpress |
| Webhooks ML | `MercadoLibreWebhookEvent` | Patrón idempotencia + BullMQ — referencia de diseño, no reutilizar dominio |

### 5.5 Integraciones existentes

- **AliExpress:** `backend/src/modules/aliexpress/`, `aliexpress-dropshipping-api.service.ts`, OAuth en `dropshipping.routes.ts`, adapters `adapters/aliexpress-supplier.adapter.ts`, normalizadores `aliexpress-freight-normalizer.ts`, `aliexpress-logistics-normalizer.ts`.
- **eBay:** `ebay.service.ts` (API grande), `ebay-fulfillment.service.ts` (tracking a eBay), `opportunity-full-cycle-ebay.service.ts` (ciclo oportunidad → producto → publicación), `ebay-us-delivery-estimate.ts`.
- **Mercado Libre:** múltiples servicios (`mercadolibre-*.service.ts`), webhooks, compliance Chile, imágenes, etc.

### 5.6 CJdropshipping

- **Código de integración:** no localizado en `backend/src` (búsqueda `cj` / `cjdropshipping` solo en docs y scripts de escaneo).
- **Implicación:** el módulo CJ será **greenfield** en backend + DB + UI, con riesgo controlado si se aísla.

### 5.7 Panel / dashboard actual

- Dashboard general y páginas de oportunidades/productos/órdenes/listings ya existentes; el nuevo apartado debe ser una **ruta y menú propios** (“CJ → eBay USA”) para no confundir operadores ni mezclar KPIs.

### 5.8 Autenticación / autorización

- Middleware `authenticate` en rutas API; credenciales por usuario en `ApiCredential` (`apiName` string: ebay, mercadolibre, etc.). **Extensión natural:** `apiName` dedicado para CJ o almacenamiento cifrado en JSON con convención documentada.

### 5.9 Pricing legacy

- `pricing-engine.service.ts`: competidor top N × factor, bandas de margen, fees eBay/PayPal por env; **asume `supplierPriceUsd` ya resuelto** — no es el motor CJ pero la **idea de fees post-candidato** puede inspirar una variante CJ-only con entradas explícitas (costo producto CJ + envío CJ real).

### 5.10 Publicación eBay legacy

- `opportunity-full-cycle-ebay.service.ts` encadena `findOpportunities` (pipeline actual) → creación de producto → `MarketplaceService` publish. Está acoplado al **mundo oportunidad/Affiliate** y a `Product` legacy.
- `ebay-us-delivery-estimate.ts` extrae hints de entrega desde `productData` y **normaliza cotizaciones AliExpress** (`normalizeAliExpressFreightQuoteResult`). **No debe usarse** para promesas CJ.

### 5.11 Órdenes y fulfillment legacy

- `Order` + `process-paid-orders` / `order-fulfillment` / AliExpress purchase — ciclo **PayPal + AliExpress**.
- `submitTrackingToEbay` en `ebay-fulfillment.service.ts` — **reutilizable como utilidad técnica** cuando el `ebayOrderId` y tracking vengan del flujo CJ.

### 5.12 Stock / shipping / tracking

- Inventario AliExpress en `Product.supplierStock`; sync en colas existentes.
- Tracking: `fulfillment-tracking-sync.service.ts`, `Sale.trackingNumber`, eBay fulfillment API.

---

## 6. Mapa de arquitectura actual (texto)

```
[ React frontend ] --JWT/cookies--> [ Express API ]
                                        |
                    +-------------------+-------------------+
                    |                   |                   |
              [ Prisma / PG ]      [ BullMQ / Redis ]   [ APIs externas ]
                    |                   |                   |
              Product/Sale/Order   cron workers      eBay, ML, Amazon,
              MarketplaceListing   (fulfillment,      AliExpress OAuth,
                                   pricing, sync...)   PayPal, etc.
```

**Flujo dominante hoy:** Oportunidad/scraping/Affiliate → `Product` (AliExpress) → publicación multicanal → venta → `Order`/`Sale` → compra AliExpress → tracking → eBay.

---

## 7. Riesgos detectados

| Riesgo | Severidad | Mitigación propuesta |
|--------|-----------|----------------------|
| Reutilizar `Product`/`Sale`/`Order` para CJ sin modelo claro | Alta | Tablas/entidades **nuevas** o relación explícita `cjProductId` en entidades CJ; no sobrescribir semántica AliExpress |
| Heredar `defaultChinaUsShippingUsd` u otras heurísticas como “verdad” | Alta | Config CJ separada; shipping obligatorio desde API CJ o estado “unknown → no publicar” |
| Reutilizar `ebay-us-delivery-estimate` con metadata AliExpress | Alta | Nuevo módulo de promesa eBay USA basado **solo** en datos CJ + buffers configurables |
| Tocar `scheduled-tasks.service.ts` sin disciplina | Media | Nuevos workers/queues con prefijo `cjEbay`; no modificar lógica de jobs existentes salvo hooks documentados |
| Confusión operativa en UI (mismo dashboard legacy) | Media | Ruta y navegación dedicadas |
| Credenciales CJ en `ApiCredential` sin convención | Baja | Documentar `apiName` y esquema JSON; rotación y scopes |

---

## 8. Propuesta de nueva arquitectura (vertical aislada)

### 8.1 Principios

1. **Namespace:** prefijos consistentes: `CjEbay` en TypeScript, rutas `/api/cj-ebay/`, tablas `cj_ebay_*` o similar.
2. **Puertos y adaptadores:** `CjSupplierAdapter` (HTTP CJ) separado de `EbayListingAdapter` (reusa llamadas bajas de `EbayService` vía fachada delgada **sin** pasar por opportunity-finder).
3. **Veracidad:** estados explícitos: `SHIPPING_QUOTE_MISSING`, `NOT_VIABLE`, `READY_TO_LIST`, etc.
4. **Trazabilidad:** tabla `cj_ebay_audit_log` o append-only JSON lines en DB para cada transición.

### 8.2 Diagrama lógico (nuevo)

```
[CJ API] <--> CjSupplierAdapter
                  |
                  v
         QualificationEngine --> PricingEngineCjEbay
                  |                    |
                  v                    v
            CjEbayProductState    ListingIntent / Draft
                  |                    |
                  +--------> EbayPublishFacade (Sell API)
                                   |
[Venta eBay] --> OrderSync (eBay) --> FulfillmentOrchestrator --> CJ order API
                                         |
                                         v
                               TrackingPoller --> submitTrackingToEbay (existente)
```

---

## 9. Módulos nuevos a crear (propuesta de carpetas)

> **Estructura exacta cerrada:** ver **FASE 2.2** (v2.0). Lo siguiente es el borrador histórico; prevalece FASE 2.2 si difiere.

Alineado al repo actual (`backend/src/...`, `frontend/src/...`):

**Backend (ejemplo)**

- `backend/src/modules/cj-ebay/cj-ebay.routes.ts`
- `backend/src/modules/cj-ebay/cj-ebay.controller.ts`
- `backend/src/modules/cj-ebay/services/cj-supplier.client.ts` (auth, retries)
- `backend/src/modules/cj-ebay/services/cj-ebay-qualification.service.ts`
- `backend/src/modules/cj-ebay/services/cj-ebay-pricing.service.ts`
- `backend/src/modules/cj-ebay/services/cj-ebay-listing.service.ts`
- `backend/src/modules/cj-ebay/services/cj-ebay-fulfillment.service.ts`
- `backend/src/modules/cj-ebay/services/cj-ebay-alerts.service.ts`
- `backend/src/modules/cj-ebay/cj-ebay.types.ts`

**Frontend**

- `frontend/src/pages/CjEbayDashboard.tsx` (o subrutas con layout interno)
- `frontend/src/features/cj-ebay/` — tablas, cards de overview, hooks API

**Prisma**

- Migración nueva solo con modelos CJ-eBay; sin alterar columnas AliExpress existentes salvo necesidad justificada.

---

## 10. Módulos legacy que NO deben romperse

- `modules/aliexpress/*`, `aliexpress-*.service.ts`, `dropshipping.routes.ts` (OAuth AliExpress).
- `order-fulfillment.service.ts`, `process-paid-orders.service.ts`, flujo `Order`/`PurchaseLog` AliExpress.
- `opportunity-full-cycle-ebay.service.ts` y pipeline `opportunity-finder` (eBay desde oportunidades Affiliate).
- Webhooks y colas ML (`mercadolibre-*`, `MercadoLibreWebhookEvent`).
- Publicación ML (`marketplace-publish.service.ts` ramas ML).

Cualquier cambio transversal (p. ej. `MarketplaceService`) debe ser **additive** (nueva rama o wrapper), con tests de regresión.

---

## 11. Modelo de datos propuesto (borrador)

> Nombres orientativos; ajustar a convención Prisma del proyecto al implementar.

| Entidad | Campos clave (idea) |
|---------|---------------------|
| `CjEbayAccountConfig` | userId, buffers, márgenes mínimos, fee overrides, sandbox flag |
| `CjProductSnapshot` | cjProductId, variant json, cost, currency, stock, warehouse, raw payload hash, fetchedAt |
| `CjShippingQuote` | snapshotId, dest country US, service, amount, minDays, maxDays, source, validUntil |
| `CjEbayQualification` | snapshotId, decision APPROVED/REJECTED/PENDING, reasons[], scores |
| `CjEbayListing` | internal id, ebay listing id, sku, price, qty, handlingTimeDays, lastSyncAt, status |
| `CjEbayOrder` | ebay order id, line item refs, cj order id, state machine, tracking, incidents |
| `CjEbayAlert` | type, severity, payload, acknowledgedAt |
| `CjEbayEventLog` | correlationId, step, message, meta JSON |

Relación con legacy: **opcional** `userId` igual que resto del sistema; **sin FK obligatoria** a `Product` salvo decisión explícita de “puente” solo lectura.

---

## 12. Flujos operativos

1. **Onboarding:** guardar credenciales CJ + verificar eBay (reuso lectura `ApiCredential` ebay).
2. **Import / búsqueda:** buscar en CJ por SKU/ID → persistir snapshot.
3. **Cotización envío USA:** si la API lo permite por destino; si no, política documentada (no publicar o usar tabla manual).
4. **Calificación:** reglas configurables + buffer.
5. **Pricing:** costo + envío + fees + margen mínimo → precio sugerido y piso.
6. **Listing:** construir payload eBay (título, imágenes, item specifics mínimos, handling time alineado a datos CJ + buffer).
7. **Venta eBay:** polling o notificación (según capacidad actual del sistema para eBay orders).
8. **Fulfillment CJ:** crear orden CJ, mapear variantes, registrar respuesta.
9. **Tracking:** poll CJ → `submitTrackingToEbay`.
10. **Alertas:** stock 0, costo ↑, envío inválido, tracking tardío, margen negativo.

---

## 13. Reglas de negocio (MVP)

- **R1 Veracidad:** no publicar handling/delivery que contradiga origen y datos CJ; si faltan datos de plazo, usar rango conservador **documentado** o bloquear.
- **R2 Solo viable:** sin cotización de coste producto + envío válida → no listing.
- **R3 Trazabilidad:** toda transición con actor (system/user), timestamp y motivo.
- **R4 Aislamiento:** ningún import automático desde CJ que escriba en `Product.aliexpressUrl` sin decisión explícita.
- **R5 Configurabilidad:** márgenes, buffers, fees, umbrales en `CjEbayAccountConfig` o `SystemConfig` con clave prefijada `cj_ebay_`.
- **R6 MVP:** menos superficies, más logs y estados claros.

---

## 14. Criterios de publicación

- Stock CJ > 0 (o umbral configurable).
- Envío a USA disponible y precio conocido.
- Precio de venta cumple margen mínimo **después** de fees.
- Imágenes y título cumplen políticas eBay mínimas (reutilizar validadores **genéricos** de imágenes eBay si aplica, no lógica AliExpress).
- Handling time ≥ `f(CJ_lead_time) + buffer` (función documentada al implementar).

---

## 15. Criterios de rentabilidad

- Utilidad estimada ≥ `minProfitUsd` (config).
- ROI ≥ umbral configurable o N/A si se usa solo margen absoluto.
- Incluir en costo: producto + envío CJ + fee eBay + fee pago + buffer incidencias (% configurable).

---

## 16. Criterios de alertas (mínimo)

- Stock out / caída brusca de stock.
- Subida de costo > X% respecto al snapshot al publicar.
- Envío ya no disponible o precio cambió fuera de tolerancia.
- Orden CJ en error o timeout.
- Tracking no recibido en N días desde pago.
- Listing activo con margen estimado negativo tras recálculo.

---

## 17. Criterios de “terminado” (apartado listo — definición del stakeholder)

Coincide con la lista del brief: apartado visible, aislado, consulta CJ estable, evaluación viable/no, pricing real, preparación/creación listing con nueva lógica, persistencia propia, dashboard mínimo, alertas mínimas, logs, sin romper legacy, documentación actualizada, checklist validación completado, prueba en sandbox/controlado documentada.

---

## 18. Criterios de “100% funcionando en real”

Solo si hay evidencia E2E con APIs reales (CJ + eBay USA) según el brief: conexión, producto/variante, costos operativos, evaluación correcta, listing real, orden real o equivalente validado, postventa hasta CJ, tracking real o mecanismo verificado, dashboard con datos reales, logs reales, sin inconsistencias graves.  
**Si faltan credenciales:** estado explícito **“parcialmente listo, pendiente validación externa”** — nunca afirmar “100% real”.

---

## 19. Plan de implementación por fases

| Fase | Contenido | Estado |
|------|-----------|--------|
| 0 | Documento maestro + gobernanza | **Hecho** |
| 1 | Auditoría profunda + mapa dependencias | **Hecho** (FASE 1 formal) |
| 2 | Diseño técnico vertical aislada (este doc §FASE 2) | **Hecho** (v2.0) |
| 3A | Prisma `cj_ebay_*`, router `/api/cj-ebay`, config/trace, UI rutas + flag | **Hecho** (código) |
| 3B | Cliente CJ API 2.0 + `ICjSupplierAdapter` + credencial `cj-dropshipping` + rutas `/cj/*` | **Parcial** (órdenes/tracking stub; ver §FASE 3B) |
| 3B.1 | Shipping USA real: `POST logistic/freightCalculate` payload oficial + `quoteShippingToUsReal` + trazas | **Hecho** (código; validar en cuenta CJ real) |
| 3C | Qualification + pricing engines, persistencia quotes/evaluations, `POST /evaluate` + `/pricing/preview`, overview, trazas, UI mínima `/cj-ebay/products` | **Parcial** (código completo según alcance 3C; validación real y reglas P4–P6/P8–P10 no implementadas) |
| 3D | Listing engine, fachada `EbayService` única en módulo, `POST /listings/draft|publish`, pause, GET listings, estados DRAFT…PAUSED, política shipping honesta CN | **Parcial** (código listo; **producción** solo tras prueba eBay real — ver §FASE 3D) |
| 3E–**3E.3** | Ingest → create → **confirm → pay** → status/tracking → eBay; settings `cjPostCreateCheckoutMode` | **Código 3E.3** en repo (§FASE 3E.3) |
| **3E.4** | Protocolo + checklist + `system-readiness` + `operational-flow` + plantilla + `evidence-summary` + scripts migración/export + `.http` | **Documentación + tooling** en repo (§FASE 3E.4); **corrida real** = operador |
| 3F–3G | Workers BullMQ, alertas, dashboard completo | Pendiente como **implementación masiva**; no sustituye 3E.4 (ver **FASE 2.9**) |

---

## 20. Checklist de validación (borrador)

- [ ] Migración aplicada en entorno de prueba.
- [ ] Llamada real o mock controlado a CJ documentado qué modo es.
- [ ] Caso “sin envío USA” → rechazo correcto.
- [ ] Caso margen bajo mínimo → no publica.
- [ ] Listing sandbox eBay creado/actualizado con handling coherente.
- [ ] Regresión: login, products legacy, orders legacy, ML webhook (smoke).
- [ ] Logs correlacionados por `correlationId`.

---

## 21. Checklist GO / NO-GO (semáforo)

**GO si:**

- Módulo aislado existe (rutas + tablas + UI dedicada).
- CJ conecta (al menos sandbox o entorno de prueba documentado).
- Pipeline básico: snapshot → qualify → price → draft/listing.
- Pricing incorpora costos CJ explícitos.
- Listing no usa supuestos AliExpress para plazos.
- Dashboard muestra datos persistidos reales o de sandbox genuino.
- Alertas mínimas encendidas.
- Legacy no roto (tests/smoke).

**NO-GO si:**

- Shipping/plazos basados en heurísticas China→US genéricas o AliExpress.
- Fulfillment “dibujado” sin integración CJ definida.
- Pricing sin envío real o sin bloqueo cuando falta.
- Dashboard solo mocks sin contrato API claro.
- Mezcla en `Product`/`Order` que rompa semántica AliExpress.

---

## 22. Riesgos pendientes (seguimiento)

- Documentación y límites exactos de la **API CJ** (endpoints, rate limits, campos de tiempo de entrega a USA).
- Política eBay para handling time vs carrier delivery estimates en listings dropshipping internacional.
- Coste de incidencias y devoluciones (solo estimación en MVP).
- Concurrencia: mismo SKU listado en legacy y CJ vertical → gestión operativa (fuera de MVP o regla de exclusión).

---

## 23. Decisiones técnicas tomadas (iniciales)

| Decisión | Detalle |
|----------|---------|
| Documento maestro | Ubicación `docs/CJ_EBAY_USA_MASTER_PLAN.md` |
| Alineación repo | Seguir `backend/` + `frontend/` reales, no el esqueleto xiw/zea/xyt del AGENTS.md genérico |
| No implementar en FASE 0–1 | Solo auditoría + plan; código CJ pendiente |
| eBay técnico | Reutilizar capacidades bajas (`EbayService`, `submitTrackingToEbay`) como **infra**, no el flujo `opportunity-full-cycle-ebay` como motor de negocio CJ |
| Datos | Nuevas tablas prefijadas; evitar reutilizar `Sale.aliexpressCost` para CJ |

---

## 24. Próximos pasos (orden seguro)

1. Revisar documentación oficial **CJ Open API** (auth, product detail, inventory, create order, tracking) y volcar endpoints/límites en sección nueva “Anexo API CJ”.
2. Diseñar contrato OpenAPI interno `/api/cj-ebay/*` (DTOs + errores).
3. Crear migración Prisma con modelos de la sección 11.
4. Implementar `CjSupplierClient` con retries y logs estructurados.
5. Añadir página React y entrada de menú bajo feature flag env (`ENABLE_CJ_EBAY_MODULE`).
6. Tests unitarios qualification/pricing; test integración con CJ mock o sandbox.

---

## FASE 1 — Auditoría profunda y cierre formal (pre-FASE 2)

Esta sección amplía el inventario hasta el nivel necesario para **diseñar la arquitectura CJ → eBay USA sin adivinar**. Clasificación de reutilización:

- **S0 — Sin riesgo:** infra genérica (HTTP, auth, logs, credenciales eBay como secreto).
- **S1 — Con adaptación:** API técnica eBay o utilidades si las entradas/salidas se desacoplan del dominio AliExpress.
- **S2 — No reutilizable como flujo de negocio:** pipelines que asumen `Product`/`Order` AliExpress u oportunidades Affiliate.
- **S3 — Peligroso mezclar:** mismas tablas/colas sin namespace; webhooks que exigen `aliexpressUrl`; pricing/envío que mezcla heurísticas AliExpress con “verdad” CJ.

---

### FASE 1.1 — Inventario detallado de servicios backend relacionados con eBay

| Archivo | Responsabilidad | Dependencias principales | Clasificación |
|--------|------------------|---------------------------|---------------|
| `backend/src/services/ebay.service.ts` | Cliente monolítico eBay: OAuth/token, Inventory API (item/offer/ubicación CN-US), `createListing`, precio, stock, `endListing`, Browse (`searchProducts`, arbitrage), órdenes (`getOrders`, `getOrderById`, `getOrderForFulfillment`), `createShippingFulfillment`; políticas y defaults | `axios`/interceptores, `env`, credenciales `EbayCredentials`, APIs REST eBay | **S1** (capa técnica reutilizable; no acoplar reglas de negocio CJ dentro de esta clase) |
| `backend/src/services/ebay-fulfillment.service.ts` | Subir tracking a eBay Sell Fulfillment (fulfillment externo) | `EbayService`, `MarketplaceService.getCredentials` | **S1** |
| `backend/src/services/ebay-webhook.service.ts` | Verificación de firma eBay, challenge, readiness de webhooks, utilidades endpoint | `axios`, `crypto`, `EbayService` | **S1** |
| `backend/src/services/ebay-traffic-sync.service.ts` | Sync vistas/impressions Analytics → `MarketplaceListing.viewCount` | Prisma, `CredentialsManager`, `workflowConfigService`, API Analytics | **S1** (solo si el listing está en el mismo modelo legacy; para vertical CJ valor limitado salvo puente) |
| `backend/src/services/ebay-image-processing.service.ts` | Procesamiento de imágenes para requisitos eBay | Sharp/imagen (según archivo) | **S1** |
| `backend/src/services/ebay-image-upload.service.ts` | Subida a EPS eBay | Credenciales token | **S1** |
| `backend/src/services/ebay-image-compliance.service.ts` | Auditoría tamaño/calidad + pipeline EPS + fallback | Procesamiento + upload anteriores | **S1** |
| `backend/src/modules/marketplace/ebay.publisher.ts` | Publicador “genérico” vía `EbayService.createListing`; usa **variables de entorno globales** (`EBAY_CLIENT_ID`, etc.), no credenciales por usuario del flujo principal | `EbayService`, env | **S2** para producción multi-usuario; **S1** solo si se limita a bootstrap/demos |
| `backend/src/modules/marketplace/marketplace-publish.service.ts` | Orquesta ML/eBay/Amazon; flag `ENABLE_EBAY_PUBLISH` | Publishers, fee checks | **S2** como orquestador legacy |
| `backend/src/services/marketplace.service.ts` | Corazón de publicación multicanal: `publishToEbay`, título/descripción IA, imágenes, **`buildEbayUsDropshipDeliveryRange` + `appendEbayUsDropshipShippingNotice`** (AliExpress/metadata), `calculateEbayPrice`, compliance | `EbayService`, `ebay-us-delivery-estimate`, `marketplace-fee-intelligence`, Prisma, muchos servicios | **S3** si se invoca tal cual para CJ (contamina promesa de entrega y costos) |
| `backend/src/services/marketplace-order-sync.service.ts` | `syncEbayOrdersForUser`, `upsertOrderFromEbayPayload` → `Order` con `paypalOrderId = ebay:{id}`; resuelve listing/product | Prisma, `EbayService`, `MarketplaceService` | **S1** para ingestión técnica de órdenes; **S3** si se espera que `fulfillOrder` compre en AliExpress |
| `backend/src/services/webhook-marketplace-order.service.ts` | `recordSaleFromWebhook`: crea `Order` PAID y llama **`orderFulfillmentService.fulfillOrder`** | Prisma, `order-fulfillment`, notificaciones | **S3** para CJ tal cual: **exige `product.aliexpressUrl`** (líneas 111–122) |
| `backend/src/services/opportunity-full-cycle-ebay.service.ts` | Ciclo oportunidad → `Product` → publicación (eBay o ML) desde pipeline Affiliate/trends | `opportunity-finder`, `ProductService`, `MarketplaceService`, env `ENABLE_EBAY_PUBLISH` | **S2** |
| `backend/src/services/opportunity-finder.service.ts` | Búsqueda de oportunidades; fallback fuente **eBay Browse** | `EbayService`, credenciales | **S2** (descubrimiento legacy, no sourcing CJ) |
| `backend/src/utils/ebay-us-delivery-estimate.ts` | Rango de entrega US dropship desde `productData` + **normalizador AliExpress freight** | `aliexpress-freight-normalizer` | **S3** para CJ |
| `backend/src/utils/ebay-inventory-location.util.ts` | Utilidades merchant location | env | **S1** |
| `backend/src/services/marketplace-fee-intelligence.service.ts` | `calculateEbayPrice` y fees; nombres y campos orientados a **`aliexpressCostUsd`** | env, reglas fees | **S1** si se parametriza costo proveedor genérico; **S3** si se asume semántica AliExpress |
| `backend/src/services/pricing-engine.service.ts` | Motor competidor + márgenes + fees (multimarketplace) | `profit-guard`, env fee rates | **S1** con entradas CJ explícitas; **S2** como pipeline actual acoplado a oportunidades |
| `backend/src/services/dynamic-pricing.service.ts` | Repricing por marketplace (incl. eBay) | Listings, APIs | **S2/S3** si actúa sobre listings mezclados sin etiqueta de vertical |
| `backend/src/services/listing-state-reconciliation.service.ts` | Reconciliación estado listing; rama eBay con `checkProductAvailability` | `EbayService` | **S1** técnico; **S3** si mezcla listings CJ y legacy sin criterio |
| `backend/src/services/listing-metrics-writer.service.ts` | Métricas agregadas (menciona eBay traffic sync) | Prisma | **S1** con scope de listing |
| `backend/src/services/order-fulfillment.service.ts` | **Compra AliExpress Dropshipping API** tras orden PAID; resuelve URL desde `aliexpressUrl` o `MarketplaceListing.supplierUrl`; gate de rentabilidad freight hacia **CL** en código | AliExpress DS, Prisma, `order-time-freight` | **S3** para pedidos eBay cuyo proveedor real sea CJ |
| `backend/src/services/fulfillment-tracking-sync.service.ts` | Obtiene tracking desde **AliExpress DS** y sube a eBay/ML/Amazon | `aliexpressDropshippingAPIService`, `submitTrackingToEbay` | **S3** para CJ (no obtendrá tracking CJ); **S1** la función `submitTrackingToEbay` aisladamente |
| `backend/src/services/process-paid-orders.service.ts` | Cola de órdenes pagadas hacia fulfillment (patrón general) | Orden/fulfillment | Revisar por rama; asume pipeline legacy |
| `backend/src/services/automated-business.service.ts` | Flujos automáticos; búsqueda eBay, `createListing`, tracking eBay vía `submitTrackingToEbay` en ramas | `EbayService`, imports dinámicos | **S2** |
| `backend/src/services/pre-publish-validator.service.ts` | Validación pre-publicación; política envío **eBay US** entre otras | Reglas marketplace | **S1** tras parametrizar fuentes de verdad |
| `backend/src/services/api-availability.service.ts` | Health eBay, estados flujo oportunidades | Circuit breaker, `marketplaceService.testConnection` | **S1** |
| `backend/src/services/onboarding.service.ts` | Flags `ebayConnected` | Prisma User | **S0** |
| `backend/src/services/launch-audit.service.ts` | Auditorías listings eBay/ML | Prisma | **S2** si mezcla verticales |
| `backend/src/services/listing-language-policy.service.ts` | Políticas de idioma por marketplace incl. eBay | — | **S1** |
| `backend/src/services/credentials-manager.service.ts` | Persistencia `ApiCredential` incl. `ebay` | Encriptación | **S0** |

*Nota:* Existen más referencias puntuales a la cadena `'ebay'` en servicios de estrategia, reportes, SEO, etc.; no alteran el diagnóstico: el **núcleo duro** es `marketplace.service` + `order-fulfillment` + `webhook-marketplace-order` + `fulfillment-tracking-sync`.

---

### FASE 1.2 — Inventario de endpoints backend (eBay: listings, órdenes, fulfillment, tracking, sync, schedulers)

#### Listings / publicación / economía

| Método y ruta (prefijo `/api` implícito salvo que se indique) | Rol |
|---------------------------------------------------------------|-----|
| `POST /publisher/ebay/listing-economics-preview` | Preview económico eBay (`calculateEbayPrice`) |
| `POST /publisher/listings/ebay-close-all-from-api` | Cierra listings eBay vía API |
| `POST /publisher/listings/ebay-close-all` | Cierra desde BD + sync |
| Varios bajo `/publisher/...` con body `marketplace: 'ebay'` | Publicación inteligente / drafts multicanal |
| `POST /opportunities/full-cycle-ebay` | Ciclo completo oportunidad → producto → publish |
| Rutas `/marketplace/...` con `marketplace === 'ebay'` | Test conexión, datos cuenta, flujos genéricos |
| `GET|POST /marketplace-oauth/oauth/.../ebay` (varias) | OAuth usuario eBay |
| `POST /internal/test-full-cycle-search-to-publish` (secret) | Misma lógica que full-cycle (handler) |
| `GET /debug/ebay/probe` | Probe Browse API |

#### Órdenes eBay / intake

| Método y ruta | Rol |
|---------------|-----|
| `POST /orders/import-ebay-order` | Import manual → `Order` + `paypalOrderId ebay:` |
| `POST /orders/fetch-ebay-order` | `EbayService.getOrderById` + upsert |
| `POST /orders/sync-marketplace` | Incluye sync eBay vía `runMarketplaceOrderSyncForUser` |
| `GET /orders/by-ebay-id/:ebayOrderId` | Lookup |
| `POST /orders/by-ebay-id/:ebayOrderId/mark-marketplace-cancelled` | Marca cancelado |
| `POST /orders/by-ebay-id/:ebayOrderId/promote-manual-fulfillment` | Cola manual |
| `POST /orders/by-ebay-id/:ebayOrderId/force-fulfill` | Dispara `fulfillOrder` |
| `GET /sales` (y afines) | Enriquece filas con `ebayOrderId` desde `paypalOrderId` |

#### Webhooks

| Método y ruta | Rol |
|---------------|-----|
| `GET /webhooks/ebay` | Challenge verificación |
| `POST /webhooks/ebay` | Eventos → `recordSaleFromWebhook` / cadena venta |

#### Internals operativos (secret `x-internal-secret`)

Incluyen: `ebay-connection-test`, `ebay-oauth-url`, `set-ebay-token`, `ebay-bootstrap-location`, `ebay-policies-diagnostic`, `ebay-bootstrap-fulfillment-policy`, `ebay-credential-state`, `ebay-disable-refresh-token`, `ebay-runtime-credentials`, `ebay-listing-diagnostic`, `ebay-inventory-item-diagnostic`, `ebay-offer-by-sku`, cierres masivos con `EbayService.endListing`, etc. (`internal.routes.ts`).

#### Schedulers / colas (eBay)

| Nombre cola / patrón | Archivo | Rol |
|---------------------|---------|-----|
| `ebay-traffic-sync` | `scheduled-tasks.service.ts` | Worker llama `syncAllUsersViewCounts` (`ebay-traffic-sync.service.ts`); cron `EBAY_TRAFFIC_SYNC_CRON` (def. `0 */12 * * *`) |
| `fulfillmentTrackingSyncQueue` / worker | `scheduled-tasks.service.ts` | Ejecuta `syncTrackingForEligibleOrders` → AliExpress tracking → **eBay** si `paypalOrderId` empieza por `ebay:` |
| `marketplaceOrderSyncQueue` | `scheduled-tasks.service.ts` | Incluye sync de órdenes eBay por usuario |
| Workers que llaman `EbayService.endListing` | `scheduled-tasks.service.ts` (p. ej. product unpublish / listing lifetime) | Cierre de ofertas eBay |

*(La definición exacta de cada cron/repeat vive en el mismo archivo; basta saber que **múltiples workers** pueden tocar cuentas eBay del usuario.)*

---

### FASE 1.3 — Flujo operativo legacy real (paso a paso)

1. **Opportunity detection:** `opportunity-finder.service.ts` (Affiliate, scrapers, AI, fallback eBay Browse) → ítems con URL proveedor típicamente AliExpress → persistencia en `Opportunity` / uso en pipelines autopilot.
2. **Pricing:** Competencia + `pricing-engine.service`, `marketplace-fee-intelligence.calculateEbayPrice` (costos `aliexpress` + shipping), `UserSettings`/env; en publicación eBay US, rango de entrega vía `ebay-us-delivery-estimate` (hints AliExpress).
3. **Listing creation:** `ProductService` crea/actualiza `Product` (campos AliExpress) → `MarketplaceService.publishToEbay` → `EbayService` Inventory/Offer; `MarketplaceListing` + `MarketplacePublication`; SKU patrón `IVAN-{productId}`; políticas envío CN/US vía env.
4. **Order intake:** (a) Webhook eBay → `recordSaleFromWebhook` → `Order` con `productUrl` = **AliExpress** obligatorio; (b) sync API → `upsertOrderFromEbayPayload`; (c) manual import/fetch en `orders.routes.ts`. Identificador unificado `paypalOrderId = ebay:{ebayOrderId}`.
5. **Supplier ordering:** `orderFulfillmentService.fulfillOrder` → AliExpress Dropshipping purchase (URL debe ser item AliExpress `.html`); validaciones freight/profit con foco **Chile** en tramos del código para ML.
6. **Fulfillment:** Estados `Order`: PAID → PURCHASING → PURCHASED / FAILED; `Sale` vía `saleService` en éxito; `aliexpressOrderId` en `Order`.
7. **Tracking upload:** `syncTrackingForEligibleOrders` lee tracking **desde AliExpress** y si marketplace es eBay llama `submitTrackingToEbay`.
8. **Alerting:** `financial-alerts`, notificaciones en webhook fulfillment fallido, dashboards genéricos; sin motor “CJ-specific”.

---

### FASE 1.4 — Tablas / modelos Prisma en el flujo eBay legacy

| Modelo | Uso en flujo | ¿Reutilizar para CJ? |
|--------|--------------|----------------------|
| `User` | Propietario, `ebayConnected` | **S0** (mismo usuario) |
| `ApiCredential` | OAuth eBay | **S0** |
| `Product` | Catálogo con `aliexpressUrl`, costos, imágenes, `productData` | **No como fila única CJ** — **S3** mezclar sin migración conceptual |
| `MarketplaceListing` | `marketplace = ebay`, `listingId`, `sku`, `supplierUrl` | **S1** solo si se añade discriminante de vertical o tablas paralelas CJ |
| `MarketplacePublication` | Historial publish | Igual que arriba |
| `Opportunity` | Pipeline oportunidades | **S2** para CJ (fuente distinta) |
| `Order` | Postventa; `paypalOrderId` prefijo marketplace; **`aliexpressOrderId`** | **S3** usar misma fila para CJ sin campos/ampliación explícita |
| `Sale` | **`aliexpressCost`**, tracking, fees | **S3** semántica AliExpress |
| `PurchaseLog` | Compras automáticas | AliExpress |
| `ListingMetric`, `ListingPublishError`, flags rentabilidad | Alrededor de listing | **S1** con alcance solo legacy o duplicado CJ |

**Recomendación de diseño (FASE 2):** nuevas tablas `cj_ebay_*` + relación opcional `userId`; evitar reutilizar `Order`/`Sale` sin **extensión** (nuevos campos o tipo `supplierChannel`) documentada.

---

### FASE 1.5 — Jobs / colas / tareas que afectan eBay hoy

- **BullMQ** central: `scheduled-tasks.service.ts`.
- Cola explícita **`ebay-traffic-sync`**: métricas de tráfico por listing eBay.
- **Fulfillment tracking sync**: empuja tracking a eBay cuando corresponde (tras AliExpress).
- **Marketplace order sync**: trae órdenes eBay a `Order`.
- **Unpublish / listing lifetime / dynamic pricing / reconciliation**: pueden invocar `EbayService.endListing` u operaciones de oferta para listings registrados en BD.
- **Phase 29** u otros servicios pueden encolar `ebay-traffic-sync` ad hoc (`phase29-autonomous-stabilization.service.ts`).

---

### FASE 1.6 — Inventario frontend (rutas, pantallas, APIs relacionadas con eBay en el negocio actual)

| Área | Ubicación | Notas |
|------|-----------|--------|
| Rutas | `frontend/src/App.tsx` | No hay ruta dedicada “solo eBay”; flujo repartido en Dashboard, Opportunities, Products, Orders, Listings, Sales, etc. |
| Oportunidades + ciclo eBay | `frontend/src/pages/Opportunities.tsx` | `POST /api/opportunities/full-cycle-ebay`, preview economía eBay, estados API |
| Investigación / filtros marketplace | `ProductResearch.tsx`, `AIOpportunityFinder.tsx`, `UniversalSearchDashboard.tsx` | `marketplaces` incluye `ebay` |
| Pedidos eBay | `frontend/src/pages/Orders.tsx`, `OrderDetail.tsx` | Import / fetch eBay, `forceFulfillByEbayOrderId`, badges `ebay:` |
| Listados | `Listings.tsx` | Filtro eBay, conteos |
| Ventas | `Sales.tsx` | Columna `ebayOrderId` |
| Credenciales | `APIConfiguration`, `APIKeys`, `CredentialTemplates`, OAuth steps | Flujo OAuth eBay |
| Readiness webhooks | `SalesReadinessPanel.tsx` | Estado eBay |
| Reports | `Reports.tsx` | Select eBay |
| Utilidades | `frontend/src/services/orders.api.ts` | `importEbayOrder`, `fetchEbayOrder`, `forceFulfillByEbayOrderId`, etc. |
| Validación Zod | `validations/api-credentials.schemas.ts` | `ebayCredentialsSchema` |

---

### FASE 1.7 — Clasificación formal de reutilización (resumen ejecutivo)

| Categoría | Piezas |
|-----------|--------|
| **S0 Sin riesgo** | JWT/auth, Prisma infra, `logger`, `CredentialsManager`, `ApiCredential` ebay, UI shell, `orders.api.ts` como patrón HTTP |
| **S1 Con adaptación** | `EbayService` (métodos puros API), `submitTrackingToEbay`, imágenes EPS/compliance, `upsertOrderFromEbayPayload` **solo** si el fulfillment posterior no es AliExpress obligatorio, utilidades inventario eBay |
| **S2 No reutilizable como flujo** | `opportunity-full-cycle-ebay`, `opportunity-finder` eBay Browse, `EbayPublisher` env-global, `marketplace-publish` orquestación actual |
| **S3 Peligroso mezclar** | `marketplace.service.publishToEbay` (delivery AliExpress), `recordSaleFromWebhook` (exige `aliexpressUrl`), `orderFulfillmentService.fulfillOrder` (compra AliExpress), `fulfillment-tracking-sync` (tracking solo AliExpress), `calculateEbayPrice`/`ebay-us-delivery-estimate` si se interpretan como verdad CJ |

---

### FASE 1.8 — Riesgos concretos de contaminación CJ ↔ legacy

1. **Webhook eBay:** Hoy **falla** sin `aliexpressUrl` en el `Product` vinculado al listing — un listing CJ referenciando el mismo `Product` rompería o exigiría hacks.
2. **Fulfillment:** `fulfillOrder` **solo** compra en AliExpress; una orden eBay CJ quedaría bloqueada o mal comprada si se reutiliza la cola sin bifurcación.
3. **Tracking sync:** No leerá tracking CJ; podría marcar órdenes como sin tracking indefinidamente o nunca subir a eBay.
4. **Descripción / handling US:** Texto y plazos generados desde metadata AliExpress — violación directa de la regla de veracidad CJ.
5. **Listings en BD:** Sin etiqueta de vertical, jobs de **reconciliación, unpublish o pricing** podrían actuar sobre listings CJ como si fueran legacy.
6. **Sales ledger:** `aliexpressCost` y métricas asumidas en informes mezclarían P&L CJ con semántica incorrecta.

---

### FASE 1.9 — Conclusión formal de FASE 1

- **Quedó entendido:** dónde vive la capacidad técnica eBay (`EbayService`), cómo entran las órdenes (webhook, sync, manual), cómo el postventa **está acoplado a AliExpress** en fulfillment y tracking, qué endpoints y colas tocan eBay, y qué pantallas del frontend exponen esos flujos.
- **Todavía no se sabe (sin spec externa):** límites y campos exactos de la API CJ (cotización US, tiempos, órdenes); detalle de cada repeat job en `scheduled-tasks.service.ts` línea a línea (no bloquea diseño si se aísla por colas nuevas); comportamiento eBay Browse en todos los edge cases de `ebay.service.ts` internos privados.
- **¿Suficiente evidencia para FASE 2?** **Sí**, para diseñar la vertical aislada: está claro **qué reutilizar como infra eBay** y **qué cadena de negocio no debe ejecutarse para CJ** sin nuevas entidades y ramas explícitas.

---

## FASE 2 — Diseño técnico completo (vertical aislada CJ → eBay USA)

Esta fase **cierra la arquitectura objetivo** sin implementación grande de código. Toda operación CJ es **independiente** de AliExpress, `orderFulfillmentService`, `fulfillment-tracking-sync`, `recordSaleFromWebhook` legacy y de `ebay-us-delivery-estimate` como fuente de verdad.

---

### FASE 2.1 — Arquitectura objetivo del nuevo módulo

#### Vista general

```
                    ┌─────────────────────────────────────┐
                    │  CJ → eBay USA vertical (nuevo)      │
                    │  Prefijo API: /api/cj-ebay/*         │
                    │  Tablas: cj_ebay_*                   │
                    └──────────────┬──────────────────────┘
                                   │
     ┌─────────────────────────────┼─────────────────────────────┐
     │                             │                             │
     ▼                             ▼                             ▼
CjSupplierAdapter            CjEbay* domain              CjEbayEbayFacade
(HTTP CJ API)                services                     (EbayService sólo transporte)
     │                             │                             │
     └─────────────────────────────┴─────────────────────────────┘
                                   │
                    Orquestación: órdenes eBay → filas cj_ebay_orders
                    Fulfillment: CJ API place order (no AliExpress)
                    Tracking: poll CJ → submitTrackingToEbay (infra legada aislada)
```

- **Entrada usuario:** dashboard React bajo ruta dedicada (`/cj-ebay/...`).
- **Persistencia:** solo tablas `cj_ebay_*` + `User` / `ApiCredential` como ancla de identidad y secretos.
- **Salida marketplace:** listings y órdenes eBay vía **fachada delgada** sobre `EbayService`; nunca vía `MarketplaceService.publishToEbay` para el flujo CJ.

#### Límites explícitos con el legacy

| Límite | Regla |
|--------|--------|
| Datos | Ningún `Product`, `Order`, `Sale`, `MarketplaceListing` legacy es **requerido** para operar CJ; no se añaden URLs AliExpress a filas CJ. |
| Código | No importar `opportunity-full-cycle-ebay`, `marketplace.service` (publish), `order-fulfillment.service`, `fulfillment-tracking-sync` dentro del módulo `cj-ebay`. |
| Webhooks eBay legacy | El handler que llama `recordSaleFromWebhook` **no** enruta órdenes CJ hasta existir **router explícito** que discrimine por `listingId`/`sku` presente solo en `cj_ebay_listings` (FASE 3); hasta entonces, intake CJ = **sync/polling/manual** del módulo. |
| Colas | Workers legacy no procesan filas `cj_ebay_*`. Nuevas colas con prefijo `cj-ebay-`. |

#### Dependencias permitidas

- **S0:** `authenticate`, `prisma`, `logger`, `env`, `AppError`, utilidades HTTP genéricas del repo, correlación.
- **Credenciales:** `CredentialsManager` / `ApiCredential` con **`apiName`** nuevo acordado, p. ej. `cjdropshipping` o `cj-dropshipping` (documentar en `api-credentials` y UI cuando se implemente).
- **eBay:** instanciación de `EbayService` **solo** dentro de `cj-ebay-ebay-facade.service.ts` (o nombre equivalente), usando credenciales `ebay` del usuario; llamadas: inventario/oferta/listing/fulfillment según necesidad, **sin** pasar por `buildEbayUsDropshipDeliveryRange` ni descripciones generadas por pipeline AliExpress.
- **Tracking eBay:** función `submitTrackingToEbay` importada como **biblioteca** (mismo contrato HTTP), no como flujo de orden legacy.
- **BullMQ:** registrar workers nuevos; patrón copiado desde `scheduled-tasks.service.ts` pero **código de registro** puede vivir en módulo o en un único `registerCjEbayWorkers()` llamado desde bootstrap.

#### Dependencias prohibidas

- Cualquier `aliexpress-*`, `AliExpress`, `adapters/aliexpress-supplier.adapter`.
- `ebay-us-delivery-estimate` para texto o plazos de listings CJ (solo datos CJ + buffers configurables).
- `marketplace-fee-intelligence.calculateEbayPrice` con semántica `aliexpressCostUsd` **sin** sustituir entradas por costos CJ explícitos (mejor: motor `cj-ebay-pricing` propio que **pueda** reutilizar la **fórmula** de fees si se extrae función pura; no el servicio acoplado a AliExpress).
- `webhook-marketplace-order.recordSaleFromWebhook` como camino por defecto.
- Reutilizar tabla `orders` (`Order`) como **única** fuente de verdad CJ en MVP si ello fuerza `aliexpressOrderId` o flujos de compra legacy; ver modelo §2.5.

#### Puntos de integración con el sistema existente

| Punto | Uso |
|-------|-----|
| `app.ts` | `app.use('/api/cj-ebay', cjEbayRoutes)` (tras autenticación). |
| `User.id` | FK `userId` en todas las tablas CJ. |
| `ApiCredential` | eBay existente + nueva entrada CJ. |
| Feature flag | `ENABLE_CJ_EBAY_MODULE` (env): oculta rutas UI y opcionalmente API. |
| Menú Layout | Nuevo ítem “CJ → eBay USA” condicionado al flag. |
| Futuro (opcional) | Webhook eBay enrutado por listingId hacia `cj_ebay_orders` cuando el listing exista solo en vertical CJ. |

---

### FASE 2.2 — Estructura exacta propuesta de carpetas y archivos

> Convención: módulo bajo `backend/src/modules/cj-ebay/`. Prisma: modelos con prefijo `CjEbay*` y `@@map("cj_ebay_snake_table")`.

#### Backend

```
backend/src/modules/cj-ebay/
├── cj-ebay.routes.ts                 # Router montado en /api/cj-ebay
├── cj-ebay.constants.ts              # API names, queue names, limits
├── cj-ebay.types.ts                  # DTOs compartidos dominio
├── schemas/
│   └── cj-ebay.schemas.ts            # Zod request/response
├── adapters/
│   ├── cj-supplier.adapter.interface.ts
│   ├── cj-supplier.adapter.ts        # Implementación que llama a CjSupplierClient
│   └── cj-supplier.errors.ts         # CjSupplierError, codes
├── services/
│   ├── cj-supplier.client.ts         # HTTP raw, auth headers, timeouts
│   ├── cj-ebay-config.service.ts     # Lee/guarda CjEbayAccountSettings + env merge
│   ├── cj-ebay-qualification.service.ts
│   ├── cj-ebay-pricing.service.ts
│   ├── cj-ebay-listing.service.ts    # Orquesta listing eBay US
│   ├── cj-ebay-ebay-facade.service.ts # Único lugar que importa EbayService
│   ├── cj-ebay-order-ingest.service.ts  # Polling eBay orders / manual import
│   ├── cj-ebay-fulfillment.service.ts # CJ place order
│   ├── cj-ebay-tracking.service.ts    # Poll CJ tracking → submitTrackingToEbay
│   ├── cj-ebay-alert.service.ts
│   ├── cj-ebay-profit.service.ts
│   └── cj-ebay-trace.service.ts      # Append cj_ebay_execution_traces
├── jobs/
│   ├── cj-ebay-queue-names.ts
│   ├── cj-ebay-job-types.ts
│   └── cj-ebay-worker-registry.ts    # registerWorkers(connection) — llamado desde server/scheduled bootstrap
└── __tests__/
    ├── cj-ebay-pricing.service.test.ts
    └── ...
```

**Prisma** (archivo existente `schema.prisma` o fragmento documentado hasta migración):

```
backend/prisma/
└── migrations/YYYYMMDDHHMMSS_cj_ebay_vertical/migration.sql  # (FASE 3A)
```

**Registro de jobs:** `backend/src/server.ts` o `scheduled-tasks.service.ts` — **una** llamada `registerCjEbayWorkers()` que no mezcle payloads con colas legacy.

#### Frontend

```
frontend/src/
├── pages/cj-ebay/
│   ├── CjEbayLayout.tsx              # Sub-nav: Overview | Products | Listings | Orders | Alerts | Profit | Logs
│   ├── CjEbayOverviewPage.tsx
│   ├── CjEbayProductsPage.tsx
│   ├── CjEbayListingsPage.tsx
│   ├── CjEbayOrdersPage.tsx
│   ├── CjEbayOrderDetailPage.tsx
│   ├── CjEbayAlertsPage.tsx
│   ├── CjEbayProfitPage.tsx
│   └── CjEbayLogsPage.tsx
└── features/cj-ebay/
    ├── api/cjEbay.api.ts             # axios wrappers → /api/cj-ebay/*
    ├── hooks/
    │   ├── useCjEbayOverview.ts
    │   ├── useCjEbayProducts.ts
    │   └── ...
    └── components/
        ├── CjEbayStatCard.tsx
        ├── CjEbayProductsTable.tsx
        ├── CjEbayListingsTable.tsx
        ├── CjEbayOrdersTable.tsx
        ├── CjEbayAlertBadge.tsx
        └── CjEbayTraceDrawer.tsx
```

**`App.tsx`:** rutas anidadas bajo `/cj-ebay/*` con `lazy` + `Layout` existente; visibilidad condicionada a `ENABLE_CJ_EBAY_MODULE` y rol si aplica.

#### Utilidades (backend, solo si hacen falta)

```
backend/src/modules/cj-ebay/utils/
├── cj-ebay-delivery-copy.ts          # Texto comprador US desde datos CJ + buffers (NO AliExpress)
└── cj-ebay-money.ts                # Decimal safe / redondeo comercial
```

---

### FASE 2.3 — Contratos del CJ Supplier Adapter

> Los nombres de métodos son **contrato interno**; el mapeo 1:1 a endpoints CJ se completará al integrar la documentación oficial CJ Open API.

#### Autenticación

- **Entrada:** credenciales desde `ApiCredential` (`apiName` CJ), p. ej. `apiKey` + `apiSecret` o token según CJ.
- **Comportamiento:** el cliente adjunta headers/query requeridos; refresco de token si CJ lo define.
- **Salida:** sesión lista o error `CJ_AUTH_INVALID`, `CJ_AUTH_EXPIRED`.

#### Catálogo / productos

- `getProductById(cjProductId: string): Promise<CjProductDetail>` — título, imágenes, descripción, categoría CJ, peso/dimensiones si existen.
- `searchProducts(query: CjSearchQuery): Promise<CjProductSummary[]>` — opcional, paginado.

#### Variantes

- `CjProductDetail` incluye `variants: CjVariant[]` (`cjSku`, atributos, precio proveedor, imagen).

#### Stock

- `getInventory(skuOrVariantIds: string[]): Promise<Map<string, number>>` o incluido en `getProductById` con `freshness` timestamp.
- Regla: stock **desconocido** tras error → no publicar (configurable).

#### Shipping / freight (USA)

- `quoteShippingToUs(params: { variantId: string; quantity: number; destCountry: 'US'; destZip?: string }): Promise<CjShippingQuote>`
- `CjShippingQuote` debe incluir: `amount`, `currency`, `serviceName`, `carrier` (si aplica), `estimatedMinDays`, `estimatedMaxDays` **solo si la API los devuelve**; si no, `confidence: 'unknown'` y el motor de calificación decide rechazo o “manual”.

#### Tiempos / aging

- Si CJ expone `processingDays`, `dispatchDays`, `transitDays`, persistirlos en snapshot; si no, no inventar: usar solo buffers de configuración en copy eBay.

#### Creación / sync de órdenes

- `createOrder(input: CjCreateOrderInput): Promise<CjOrderResult>` — dirección comprador, líneas (cjSku, qty), idempotency key interno.
- `getOrderStatus(cjOrderId: string): Promise<CjOrderStatus>` — pagos, picking, shipped.

#### Tracking

- `getTracking(cjOrderId: string): Promise<CjTrackingInfo | null>` — carrier code, número, eventos opcionales.

#### Manejo de errores

- Tipos: `CjSupplierError` con `code` (`RATE_LIMIT`, `INVALID_SKU`, `OUT_OF_STOCK`, `SHIPPING_UNAVAILABLE`, `NETWORK`, `UNKNOWN`), `httpStatus?`, `cjMessage?`, `retryable: boolean`.
- Propagación: servicios dominio traducen a estados `FAILED_*` y alertas.

#### Retry strategy

- **Idempotente:** `createOrder` usa clave idempotencia almacenada en `cj_ebay_order_events` o columna en `cj_ebay_orders`.
- **Backoff:** 1s, 2s, 4s, max 5 intentos para errores `retryable`; no retry en `INVALID_SKU` / `AUTH`.
- **Rate limit:** respetar `Retry-After` o cuota documentada CJ; cola BullMQ con concurrencia baja.

#### Logs esperados

- Cada llamada: `logger.info` con `correlationId`, `userId`, `cjProductId`/`cjOrderId`, `operation`, `durationMs`, `outcome`.
- Errores: `logger.warn` con payload sanitizado (sin secretos).
- Trazas persistidas: fila en `cj_ebay_execution_traces` (ver §2.5) para UI “Logs”.

---

### FASE 2.4 — Máquina de estados del nuevo flujo

#### A) Producto / snapshot / evaluación

| Estado | Significado |
|--------|-------------|
| `SYNCED` | Snapshot CJ guardado en `cj_ebay_products` (+ variants). |
| `EVAL_PENDING` | Esperando cotización envío US o datos. |
| `EVALUATED` | Evaluación calculada (aprobada o rechazada). |
| `APPROVED` | Puede listarse. |
| `REJECTED` | No listar; motivo en evaluation. |
| `STALE` | Snapshot caducado; revalidar antes de acción. |

**Transiciones:** `SYNCED` → `EVAL_PENDING` → `EVALUATED` → (`APPROVED` | `REJECTED`); cualquier cambio de precio/stock crítico desde CJ → `STALE` → re-run evaluación.

#### B) Listing (eBay)

| Estado | Significado |
|--------|-------------|
| `DRAFT` | Intención local, aún no publicado. |
| `PUBLISHING` | Llamada eBay en curso. |
| `ACTIVE` | Publicado y coherente con última sync. |
| `UPDATE_PENDING` | Cambio precio/qty pendiente. |
| `PAUSED` | Ended/paused en eBay o localmente. |
| `FAILED` | Error publicación o política. |
| `ARCHIVED` | Cerrado operativamente. |

**Transiciones:** `DRAFT` → `PUBLISHING` → (`ACTIVE` | `FAILED`); `ACTIVE` ↔ `UPDATE_PENDING` → `ACTIVE`; `ACTIVE` → `PAUSED` / `ARCHIVED`.

#### C) Orden (vertical CJ)

| Estado | Significado |
|--------|-------------|
| `DETECTED` | Vista en eBay, fila creada. |
| `VALIDATED` | Línea mapeada a `cj_ebay_product_variant`. |
| `CJ_ORDER_PLACING` | Llamada createOrder CJ. |
| `CJ_ORDER_PLACED` | Transitorio / histórico (create OK en textos antiguos). |
| `CJ_ORDER_CREATED` | Create OK (`payType=3`); pendiente confirm/pay — ver §FASE 3E.3. |
| `CJ_ORDER_CONFIRMING` / `CJ_PAYMENT_PENDING` / `CJ_PAYMENT_PROCESSING` / `CJ_PAYMENT_COMPLETED` | Checkout CJ — §FASE 3E.3. |
| `CJ_FULFILLING` | Procesamiento CJ (pago hecho o flujo equivalente). |
| `CJ_SHIPPED` | CJ indica enviado / tracking disponible. |
| `TRACKING_ON_EBAY` | `submitTrackingToEbay` OK. |
| `COMPLETED` | Cerrado OK. |
| `FAILED` | Fallo irrecuperable sin intervención. |
| `NEEDS_MANUAL` | Operador debe actuar. |

**Transiciones (3E.3):** `DETECTED` → `VALIDATED` → `CJ_ORDER_PLACING` → `CJ_ORDER_CREATED` → (`confirm` → `CJ_PAYMENT_PENDING`) → (`payBalance` → `CJ_FULFILLING`) → `CJ_SHIPPED` → `TRACKING_ON_EBAY` → `COMPLETED`; con `AUTO_CONFIRM_PAY` el servidor encadena confirm+pay tras el create. Cualquier paso puede ir a `FAILED` / `NEEDS_MANUAL` con evento.

#### D) Tracking (sub-estado o entidad)

| Estado | Significado |
|--------|-------------|
| `NOT_AVAILABLE` | Aún no en CJ. |
| `AVAILABLE` | Número obtenido. |
| `SUBMITTED_EBAY` | Enviado a eBay. |
| `CONFIRMED` | Verificación opcional lectura eBay. |

#### E) Alertas

| Estado | Significado |
|--------|-------------|
| `OPEN` | Requiere atención. |
| `ACKNOWLEDGED` | Vista por usuario. |
| `RESOLVED` | Cerrada. |
| `SUPPRESSED` | Regla ignora temporalmente. |

---

### FASE 2.5 — Modelo de datos propuesto

> **Crear nuevo:** solo tablas `cj_ebay_*`. **No extender** en MVP: `Product`, `Order`, `Sale` legacy. **No tocar** campos `aliexpress*` ni flujos que los lean.

#### Tablas / modelos (Prisma)

| Modelo Prisma | `@@map` sugerido | Propósito |
|---------------|------------------|-----------|
| `CjEbayAccountSettings` | `cj_ebay_account_settings` | Márgenes, buffers, límites shipping, flags por `userId` (único). |
| `CjEbayProduct` | `cj_ebay_products` | Snapshot producto CJ (`cjProductId`, título, imágenes JSON, raw hash, `syncedAt`, `status` snapshot). |
| `CjEbayProductVariant` | `cj_ebay_product_variants` | `cjSku`, attrs, costo unitario, stock último conocido. |
| `CjEbayShippingQuote` | `cj_ebay_shipping_quotes` | Cotización US por variant/cantidad; montos, días min/max o `unknown`; `validUntil`. |
| `CjEbayProductEvaluation` | `cj_ebay_product_evaluations` | Resultado reglas: `decision`, `reasons` JSON, márgenes estimados, refs a quote. |
| `CjEbayListing` | `cj_ebay_listings` | `ebayListingId`, `ebaySku`/`offerId` si aplica, `status`, precio listado, qty, `lastSyncedAt`, FK variant + product. |
| `CjEbayOrder` | `cj_ebay_orders` | `ebayOrderId`, line item ref, `cjOrderId?`, `status`, montos, buyer snapshot. |
| `CjEbayOrderEvent` | `cj_ebay_order_events` | Auditoría append-only: transiciones, payloads resumidos. |
| `CjEbayTracking` | `cj_ebay_tracking` | carrier, number, estado, `submittedToEbayAt`. |
| `CjEbayAlert` | `cj_ebay_alerts` | tipo, severidad, payload, `status`. |
| `CjEbayProfitDaily` (o `CjEbayProfitSnapshot`) | `cj_ebay_profit_snapshots` | Agregados diarios: ventas, fees, costo CJ, utilidad estimada. |
| `CjEbayExecutionTrace` | `cj_ebay_execution_traces` | CorrelationId, step, message, meta JSON, `createdAt` (UI Logs). |

**Relaciones:** todas con `userId` → `User`. Índices: `(userId, cjProductId)`, `(userId, ebayOrderId)`, `(userId, status)` en órdenes y listings.

**Qué no debe tocarse del legacy:** migraciones que alteren `products`, `orders`, `sales` para “soportar CJ” sin ADR; jobs que scan `marketplace_listings` para CJ (los listings CJ viven en `cj_ebay_listings` con su propio `ebayListingId`).

---

### FASE 2.6 — Reglas exactas de negocio

Parámetros numéricos viven en `CjEbayAccountSettings` (defaults en env).

| ID | Regla | Formalización |
|----|--------|----------------|
| P1 | Publicación permitida | Evaluación `APPROVED` + listing `DRAFT`/`FAILED` recuperable + credenciales eBay+CJ válidas + `ENABLE_CJ_EBAY_MODULE` + no `BLOCK_NEW_PUBLICATIONS` global si se respeta misma convención legacy. |
| P2 | Publicación rechazada | Cualquier: stock &lt; `minStock`; costo producto desconocido; quote envío US ausente o `confidence=unknown` y política `rejectOnUnknownShipping=true`; shipping &gt; `maxShippingUsd`; margen neto &lt; `minMarginPct` o utilidad &lt; `minProfitUsd`; categoría/producto en lista de exclusión; riesgo &gt; umbral. |
| P3 | Margen mínimo | `netMarginPct >= minMarginPct` donde neto = precio − costo producto − shipping CJ − fees eBay − fee pago − `incidentBufferPct`. |
| P4 | Costo mínimo / máximo | `productCostUsd >= minProductCostUsd` (evitar basura); opcional `maxProductCostUsd` para riesgo. |
| P5 | Shipping máximo aceptable | `quotedShippingUsd <= maxShippingUsd` (por tier o global). |
| P6 | Handling buffer | `handlingTimeDaysEbay = ceil(cjProcessingDays ?? 0) + handlingBufferDays` (si CJ no da processing, usar solo `defaultHandlingDays` configurado, documentado como conservador). |
| P7 | Riesgo | Score 0–100 desde señales (sin historial CJ: reglas simples: peso voluminoso, baterías/prohibidos si API etiqueta, precio volátil si variación &gt; X% en 7d). Rechazar si `riskScore > maxRiskScore`. |
| P8 | Stock mínimo | `stock >= minStock` (default 1 o más si política). |
| P9 | Actualización de precios | Si `|newCost - listedCostBasis| / listedCostBasis > priceChangePctReevaluate` → `STALE` + nueva evaluación; si listing `ACTIVE` y precio nuevo &lt; piso → alerta + pausa opcional. |
| P10 | Actualización de listings | Job `cj-ebay-listing-sync`: qty/precio en eBay alineados a CJ si aún `APPROVED` y dentro de márgenes; si no, `UPDATE_PENDING` → operador o auto-pausa según config. |
| A1 | Alertas críticas | `CRITICAL`: no colocar orden CJ tras pago; tracking ausente &gt; `maxDaysToTracking`; margen negativo en orden; shipping quote inválido post-publicación; API CJ down &gt; N min; eBay auth inválida. |

---

### FASE 2.7 — Diseño del dashboard

#### Rutas / pantallas

| Ruta | Pantalla |
|------|----------|
| `/cj-ebay` | Redirect → `/cj-ebay/overview` |
| `/cj-ebay/overview` | Resumen KPI |
| `/cj-ebay/products` | Productos + evaluaciones |
| `/cj-ebay/listings` | Listings eBay CJ |
| `/cj-ebay/orders` | Órdenes vertical |
| `/cj-ebay/orders/:id` | Detalle + timeline eventos |
| `/cj-ebay/alerts` | Alertas |
| `/cj-ebay/profit` | Métricas / snapshots |
| `/cj-ebay/logs` | Trazas `execution_traces` |

#### Widgets (Overview)

- Contadores: evaluados, aprobados, rechazados, listings activos, órdenes en curso, con tracking, alertas abiertas.
- Tarjetas: ingreso estimado (sum órdenes período), utilidad estimada (snapshots), salud API CJ / eBay (último ping).

#### Tablas

- **Products:** CJ ID, título, estado evaluación, costo, shipping quote, margen, motivo rechazo, última sync.
- **Listings:** ebay id, sku, precio, qty, estado listing, vínculo variant, última sync.
- **Orders:** ebay order id, variant, estado pipeline CJ, CJ order id, tracking, incidencias.
- **Alerts:** tipo, severidad, edad, acción “ack”.
- **Profit:** tabla por día o por SKU (según snapshot).

#### Acciones de usuario

- Sincronizar producto por ID CJ; re-ejecutar evaluación; publicar / pausar listing; forzar “submit tracking”; marcar alerta leída; export CSV (opcional FASE 3).

#### Filtros

- Estado, rango fechas, texto SKU/título, severidad alertas.

#### Estados visuales

- Badges alineados a máquinas de estados (colores consistentes: gris pendiente, verde OK, rojo fallo, ámbar manual).

#### Logs / traces

- Drawer o página con filas `cj_ebay_execution_traces` filtrables por `correlationId`.

---

### FASE 2.8 — Límites explícitos de reutilización (tabla)

| Componente legacy | Clasificación | Decisión | Justificación |
|-------------------|---------------|----------|----------------|
| `EbayService` | S1 | **Usar solo vía `cj-ebay-ebay-facade.service.ts`** | Transporte API; evita esparcir OAuth/listing por el módulo. |
| `submitTrackingToEbay` | S1 | **Reutilizar** | No lee AliExpress; sube tracking genérico. |
| `MarketplaceService.publishToEbay` | S3 | **Prohibido** para CJ | Mezcla delivery estimate y pipeline AliExpress. |
| `orderFulfillmentService` | S3 | **Prohibido** | Solo compra AliExpress. |
| `fulfillment-tracking-sync` | S3 | **Prohibido** para CJ | Tracking desde AliExpress. |
| `recordSaleFromWebhook` | S3 | **No usar** en MVP | Exige `aliexpressUrl`; diseño alterno por listing CJ en fase posterior. |
| `marketplace-order-sync` / `upsertOrderFromEbayPayload` | S2/S3 | **No usar** tal cual | Escribe en `Order` legacy y dispara fulfill AliExpress; para CJ: **ingest propio** a `cj_ebay_orders`. |
| `ebay-us-delivery-estimate` | S3 | **Prohibido** | Metadata AliExpress. |
| `calculateEbayPrice` (fee intelligence) | S2 | **Opcional extraer fórmula** | Nombres `aliexpressCostUsd`; mejor pricing propio con mismas tasas desde env. |
| Imágenes EPS eBay | S1 | **Opcional** | Pipeline técnico si URLs CJ cumplen políticas. |
| `User`, `ApiCredential`, JWT | S0 | **Reutilizar** | Identidad y secretos. |
| BullMQ infra | S0 | **Reutilizar** | Nueva cola `cj-ebay-*`. |

---

### FASE 2.9 — Plan de implementación por subfases (post-FASE 2)

| Subfase | Contenido |
|---------|-----------|
| **FASE 3A** | Migración Prisma `cj_ebay_*`; `cj-ebay.constants`, tipos base; router vacío + health; flag env. |
| **FASE 3B** | `CjSupplierClient` + `CjSupplierAdapter`; credenciales CJ en `ApiCredential`; tests con mock HTTP. |
| **FASE 3C** | `cj-ebay-qualification` + `cj-ebay-pricing` + persistencia `evaluations`/`shipping_quotes` — **ver §FASE 3C**. |
| **FASE 3D** | `cj-ebay-ebay-facade` + `cj-ebay-listing`; CRUD listing local → eBay US; logs traces — **ver §FASE 3D**. |
| **FASE 3E–3E.3** | **3E.1:** create/detail/tracking. **3E.2:** auditoría doc. **3E.3:** `confirmOrder`, `payBalance`, estados, endpoints, UI — §FASE 3E.3. |
| **FASE 3E.4** | Protocolo; `system-readiness`; scripts migración/export; `.http`; checklist; `operational-flow`; plantilla; `evidence-summary` — §FASE 3E.4. |
| **FASE 3F** | Workers BullMQ (`sync`, `tracking poll`, `price refresh`); `cj-ebay-alert`; frontend dashboard completo — **no** iniciar masivamente antes de cerrar 3E.4 operativamente. |
| **FASE 3W** | **Warehouse-aware fulfillment** (feature flag `CJ_EBAY_WAREHOUSE_AWARE`): probe `freightCalculate(startCountryCode=US)` para detectar bodega USA vs China, `warehouseEvidence` enum, `originCountryCode` en DB, 4-tier ranking (operable+US > operable+CN > stock_unknown > unavailable), badge UI, origen dinámico en listing y descripción HTML. |
| **FASE 3G** | Tests e2e sandbox/controlados; actualizar este documento con “real vs simulado”; checklist GO/NO-GO. |

---

### FASE 2.10 — Criterio de salida de FASE 2

- **Decisiones cerradas:** módulo bajo `modules/cj-ebay`, API `/api/cj-ebay`, tablas dedicadas, sin dependencia de fulfillment/tracking AliExpress, uso acotado de `EbayService`, ingesta de órdenes separada del modelo `Order` legacy en MVP, máquinas de estado y reglas de negocio documentadas.
- **Supuestos externos:** forma exacta de auth CJ, endpoints de cotización US y tracking; deben confirmarse con documentación CJ y credenciales reales antes de marcar “100% real”.
- **¿Se puede pasar a implementación segura?** **Sí**, siguiendo subfases 3A–3G y sin importar servicios S3 listados en §2.8.

---

## FASE 3A — Implementación (armazón técnico)

### Estado de la fase

- **Completitud:** **implementación parcial a completa del alcance 3A**: lo pedido para “base estructural mínima” está en repo; **no** incluye cliente CJ, fachada eBay, jobs BullMQ ni listado de traces en UI.
- **Migración SQL:** añadida `backend/prisma/migrations/20260412180000_cj_ebay_phase3a/migration.sql`. Debe aplicarse en cada entorno con `npx prisma migrate deploy` (o `migrate dev` en local). **Sin aplicar migración**, las rutas que usan Prisma fallarán en runtime.

### Archivos creados

| Archivo |
|---------|
| `backend/prisma/migrations/20260412180000_cj_ebay_phase3a/migration.sql` |
| `backend/src/modules/cj-ebay/cj-ebay.routes.ts` |
| `backend/src/modules/cj-ebay/cj-ebay.constants.ts` |
| `backend/src/modules/cj-ebay/cj-ebay.types.ts` |
| `backend/src/modules/cj-ebay/schemas/cj-ebay.schemas.ts` |
| `backend/src/modules/cj-ebay/adapters/cj-supplier.adapter.interface.ts` |
| `backend/src/modules/cj-ebay/adapters/cj-supplier.errors.ts` |
| `backend/src/modules/cj-ebay/services/cj-ebay-config.service.ts` |
| `backend/src/modules/cj-ebay/services/cj-ebay-trace.service.ts` |
| `frontend/src/config/feature-flags.ts` |
| `frontend/src/pages/cj-ebay/CjEbayModuleGate.tsx` |
| `frontend/src/pages/cj-ebay/CjEbayLayout.tsx` |
| `frontend/src/pages/cj-ebay/CjEbayOverviewPage.tsx` |
| `frontend/src/pages/cj-ebay/CjEbayPlaceholderPage.tsx` |
| `frontend/src/pages/cj-ebay/CjEbayProductsPage.tsx` |
| `frontend/src/pages/cj-ebay/CjEbayListingsPage.tsx` |
| `frontend/src/pages/cj-ebay/CjEbayOrdersPage.tsx` |
| `frontend/src/pages/cj-ebay/CjEbayAlertsPage.tsx` |
| `frontend/src/pages/cj-ebay/CjEbayProfitPage.tsx` |
| `frontend/src/pages/cj-ebay/CjEbayLogsPage.tsx` |

### Archivos modificados

| Archivo |
|---------|
| `backend/prisma/schema.prisma` (modelos `CjEbay*` + relaciones en `User`) |
| `backend/src/config/env.ts` (`ENABLE_CJ_EBAY_MODULE`) |
| `backend/src/app.ts` (montaje `/api/cj-ebay`) |
| `backend/.env.example` |
| `frontend/src/App.tsx` (rutas `cj-ebay/*`) |
| `frontend/src/components/layout/Sidebar.tsx` (menú condicionado) |
| `frontend/.env.example` (`VITE_ENABLE_CJ_EBAY_MODULE`) |

### Qué quedó listo

- Tablas y modelos Prisma aislados `cj_ebay_*` sin tocar `Product` / `Order` / `Sale`.
- API autenticada: `GET/POST` config, `GET overview` (conteos reales vía `count`), `GET health`.
- Flag backend: sin `ENABLE_CJ_EBAY_MODULE=true` → `404` `{ error: 'CJ_EBAY_MODULE_DISABLED' }`.
- Flag frontend: sin `VITE_ENABLE_CJ_EBAY_MODULE=true` → sin menú y gate redirige `/cj-ebay` a `/dashboard`.
- Trazas: cada request al módulo (habilitado) escribe `request.start` + `request.complete` en `cj_ebay_execution_traces`.

### Qué no quedó listo (explícito)

- Implementación `ICjSupplierAdapter` / cliente HTTP CJ (solo interfaz + `CjSupplierError`).
- `cj-ebay-ebay-facade`, publicación eBay, ingesta de órdenes, workers.
- Página Logs: placeholder; no hay endpoint `GET` de listado de traces aún.
- **Stub honesto:** no se simulan ventas ni datos CJ.

---

## FASE 3B — Cliente y adaptador CJ (inicio controlado)

### Estado de la fase

- **Completitud:** **PARCIAL**. Hay cliente HTTP (`cj-supplier.client.ts`) y adaptador (`cj-supplier.adapter.ts`) contra rutas **oficiales** listadas en [API V2.0](https://developers.cjdropshipping.com/en/api/api2/). **No** se implementan `createOrder`, `getOrderStatus` ni `getTracking` (lanzan `CJ_NOT_IMPLEMENTED`).
- **Confirmado (documentación CJ consultada en esta iteración):**
  - Base `https://developers.cjdropshipping.com/api2.0/v1/`.
  - `POST authentication/getAccessToken`, `POST authentication/refreshAccessToken`, header `CJ-Access-Token`.
  - `POST setting/get` como comprobación post-token.
  - `POST product/query`, `POST product/variant/query`, `POST product/stock/queryByVid`, `POST logistic/freightCalculate` (rutas en el índice oficial).
  - Glosario de campos: `pid`, `productName`, `pageNum`, `pageSize`, `vid`, `variantSku`, `variantSellPrice`, `storageNum`, `logisticPrice`, `logisticName` — [field.html](https://developers.cjdropshipping.com/zh/api/api2/standard/field.html) (zh).
- **Pendiente / frágil (fuera de shipping simple):**
  - `product/query`: merge opcional `productQueryBody` + campos del glosario; validar con catálogo real.
  - **`product/stock/queryByVid`:** `getStockForSkus` trata cada string como **`vid`** (documentado en JSDoc).
  - **Otro modo CJ:** `freightCalculateTip` (otros campos obligatorios, p. ej. dimensiones/peso) **no** está implementado; solo el modo **simple** §1.1.
- **Credenciales:** `ApiCredential.apiName` = **`cj-dropshipping`** (constante `CJ_EBAY_API_CREDENTIAL_NAME`); JSON `{ "apiKey": "CJUserNum@api@..." }`. Fallback env: `CJ_DROPSHIPPING_API_KEY`. Tipo TypeScript: `CjDropshippingCredentials` en `api-credentials.types.ts`.

### Archivos creados (FASE 3B)

| Archivo |
|---------|
| `backend/src/modules/cj-ebay/adapters/cj-supplier.client.ts` |
| `backend/src/modules/cj-ebay/adapters/cj-supplier.adapter.ts` |
| `backend/src/modules/cj-ebay/adapters/cj-freight-calculate.official.ts` (**FASE 3B.1** — payload/respuesta `freightCalculate` según doc CJ) |

### Archivos modificados (FASE 3B)

| Archivo |
|---------|
| `backend/src/modules/cj-ebay/cj-ebay.routes.ts` (rutas `POST /cj/test-connection`, `GET /cj/product/:cjProductId`, `POST /cj/search`, `POST /cj/shipping-quote`) |
| `backend/src/modules/cj-ebay/schemas/cj-ebay.schemas.ts` (schemas búsqueda / shipping) |
| `backend/src/modules/cj-ebay/adapters/cj-supplier.adapter.interface.ts` (`productQueryBody`, `variantId`/`productId` shipping, `quoteShippingToUsReal`) |
| `backend/src/modules/cj-ebay/cj-ebay.constants.ts` (pasos de traza `cj.freight.*`) |
| `backend/src/modules/cj-ebay/adapters/cj-supplier.errors.ts` (`CJ_NOT_IMPLEMENTED`) |
| `backend/src/types/api-credentials.types.ts` (`CjDropshippingCredentials`, mapa `'cj-dropshipping'`) |
| `backend/src/services/credentials-manager.service.ts` (`normalizeApiName`, `loadFromEnv`, `normalizeCredentialShape` para CJ) |
| `backend/.env.example` (`CJ_DROPSHIPPING_API_KEY`) |

### Endpoints de prueba (requieren módulo habilitado + JWT)

| Método | Ruta |
|--------|------|
| POST | `/api/cj-ebay/cj/test-connection` |
| GET | `/api/cj-ebay/cj/product/:cjProductId` |
| POST | `/api/cj-ebay/cj/search` |
| POST | `/api/cj-ebay/cj/shipping-quote` |

---

## FASE 3B.1 — Shipping real CJ → USA (`freightCalculate` simple)

### Documentación oficial

- **Sección:** [6 Logistics → 1.1 Freight Calculation (POST)](https://developers.cjdropshipping.com/en/api/api2/api/logistic.html#_1-1-freight-calculation-post)
- **URL:** `POST https://developers.cjdropshipping.com/api2.0/v1/logistic/freightCalculate`
- **Modo “más preciso” alternativo:** [1.2 Freight Calculation Tip](https://developers.cjdropshipping.com/en/api/api2/api/logistic.html#_1-2-freight-calculation-tip-post) — **no implementado** aquí (contrato distinto: `reqDTOS`, peso/volumen, `freightTrialSkuList`, etc.).

### Request (payload real, según CURL de la doc)

Campos obligatorios en el JSON:

| Campo | Tipo | Uso |
|--------|------|-----|
| `startCountryCode` | string | Origen; en implementación default **`CN`** (como el ejemplo oficial). |
| `endCountryCode` | string | Destino; para USA **`US`**. |
| `products` | array | Lista de líneas. |
| `products[].quantity` | int | Cantidad. |
| `products[].vid` | string | **Variant id** (no `pid` en este endpoint). |

Opcionales en la raíz (tabla de parámetros de la misma sección): `zip`, `taxId`, `houseNumber`, `iossNumber`.  
**Warehouse / `storageId`:** no figuran en §1.1; no se envían (el modo Tip usa `storageIdList` con otro contrato).

### Resolución `vid` en nuestra API

- `POST /api/cj-ebay/cj/shipping-quote` acepta **`variantId`** (recomendado, = CJ `vid`) y/o **`productId`** (= CJ `pid`).
- Si solo viene **`productId`**, el servidor llama a `product/variant/query`: **debe haber exactamente una variante con `vid`**; si hay varias, error claro pidiendo `variantId`.

### Respuesta CJ (`data`)

La doc muestra `data` como **array** de opciones, p. ej. `logisticPrice` (USD), `logisticName`, `logisticAging` (string, ej. `"2-5"`), más `logisticPriceCn`, y opcionalmente `taxesFee`, `clearanceOperationFee`, `totalPostageFee`.

### Formato normalizado interno (API y adaptador)

```json
{
  "cost": "<number — logisticPrice de la opción elegida; fallback totalPostageFee si aplica>",
  "method": "<string — logisticName>",
  "estimatedDays": "<number | null — límite superior si logisticAging es rango \"a-b\">",
  "raw": "<array completo devuelto en data por CJ>"
}
```

Selección: entre las filas con coste USD usable, se elige la de **menor coste** para un único `cost`/`method`/`estimatedDays`; todas las opciones siguen en `raw`.

### Comportamiento técnico

- **Sin `cjBody` manual** en el cliente HTTP público.
- **Reintentos:** hasta 3 intentos ante errores de red marcados `retryable` (`CJ_NETWORK`).
- **Trazas** (`cj_ebay_execution_traces`): pasos `cj.freight.request`, `cj.freight.response`, `cj.freight.error` con payload enviado, respuesta y `durationMs` (ver `cj-ebay.routes.ts` + `cj-ebay.constants.ts`).

---

## Anexo A — Piezas reutilizables sin riesgo (resumen)

*(Clasificación completa S0–S3: **FASE 1.7**.)*

- Autenticación JWT y middleware `authenticate`.
- `CredentialsManager` / `ApiCredential` para secretos por usuario.
- `logger`, `correlationMiddleware`, `http-client` base.
- Prisma + patrones de migración.
- Frontend: `Layout`, tablas, hooks de API, routing.
- BullMQ infraestructura para nuevos jobs.
- `submitTrackingToEbay` como último paso de tracking.

## Anexo B — Piezas que NO deben reutilizarse ciegamente

*(Riesgos de contaminación: **FASE 1.8**.)*

- `UserSettings.defaultChinaUsShippingUsd` y similares como sustituto de envío CJ.
- `ebay-us-delivery-estimate.ts` con freights AliExpress.
- `opportunity-full-cycle-ebay.service.ts` como plantilla de negocio CJ.
- `Product` / `Order` campos `aliexpress*` para semántica CJ.
- `aliexpress-freight-normalizer` / checkout AliExpress para costes CJ.

## Anexo C — Mapa de dependencias (alto nivel)

- **eBay (vertical CJ):** `ebay.service.ts` **solo** vía `cj-ebay-ebay-facade.service.ts` (FASE 2.1–2.2); tracking final vía `submitTrackingToEbay`. Sin `marketplace.service` para publish CJ.
- **eBay (legacy):** sigue usando `marketplace.service` y flujos auditados en FASE 1.
- **Supplier:** AliExpress vía `modules/aliexpress` — **sin** relación de herencia con `CjSupplierAdapter` (CJ vertical aislada).
- **Dashboard CJ:** solo tablas `cj_ebay_*`.
- **Pricing CJ:** `cj-ebay-pricing.service.ts` (no el pipeline global de oportunidades).

---

## Declaración de cierre FASE 0 y FASE 1 (formato obligatorio)

### 1. QUÉ SE ANALIZÓ O IMPLEMENTÓ

- Inventario ampliado de **servicios** con responsabilidad eBay o cadena eBay→AliExpress (`ebay.service`, `marketplace.service`, `marketplace-order-sync`, `webhook-marketplace-order`, `order-fulfillment`, `fulfillment-tracking-sync`, imágenes eBay, publishers, pre-publish, pricing/fee intelligence, oportunidades, analytics, onboarding, etc.).
- Inventario de **endpoints** en `publisher`, `opportunities`, `orders`, `sales`, `webhooks`, `marketplace`, `marketplace-oauth`, `internal`, `debug`, `dashboard`, `products`.
- **Flujo legacy** de extremo a extremo documentado (detección → pricing → listing → intake → compra AliExpress → tracking → alertas).
- **Modelos Prisma** tocados y política de no mezcla con CJ sin tablas/ramas nuevas.
- **Colas BullMQ** con nombre o efecto directo en eBay (`ebay-traffic-sync`, tracking sync, order sync, unpublish/listing lifetime).
- **Frontend:** páginas y servicios que operan eBay u órdenes eBay.
- Clasificación **S0–S3** y riesgos de **contaminación** CJ ↔ legacy.

### 2. EVIDENCIA REAL EN EL CÓDIGO O SISTEMA

- Servicios y rutas citados existen bajo `backend/src/services/*.ts`, `backend/src/api/routes/*.ts`, `backend/src/modules/marketplace/ebay.publisher.ts`.
- Acoplamiento AliExpress en: `webhook-marketplace-order.service.ts` (fallo sin `aliexpressUrl`), `order-fulfillment.service.ts` (compra DS + comentarios ML/CL), `fulfillment-tracking-sync.service.ts` (tracking desde AliExpress), `marketplace.service.ts` + `ebay-us-delivery-estimate.ts` (promesa US desde metadata AliExpress).
- Colas: `scheduled-tasks.service.ts` (`ebay-traffic-sync`, workers que importan `ebay-traffic-sync.service`, `fulfillment-tracking-sync`, `EbayService.endListing`).
- Frontend: `frontend/src/pages/Opportunities.tsx`, `Orders.tsx`, `orders.api.ts`, `Listings.tsx`, `Sales.tsx`, componentes API/OAuth eBay.

### 3. QUÉ FALTA (no bloqueante para FASE 2 de diseño)

- Lectura **línea a línea** de los ~2150 LOC de `ebay.service.ts` (métodos privados y ramas de error) para una “ficha técnica” exhaustiva — opcional antes de implementar; los **métodos públicos** relevantes ya están listados en FASE 1.1.
- Catálogo de **cada** `repeat`/cron de todos los workers del archivo de scheduled tasks (doc puede ampliarse al implementar colas CJ en paralelo).
- Especificación **externa** API CJ (fuera del repo).

### 4. ESTADO EXACTO

- **FASE 0:** implementado completo.
- **FASE 1:** **implementado completo** a nivel de auditoría de código para arquitectura (inventarios y flujos formales en este documento).
- **Validado en entorno interno / real:** no aplica al módulo CJ (aún no existe); evidencia = revisión estática del repositorio.

---

## Declaración de cierre FASE 2 (formato obligatorio)

### 1. QUÉ SE ANALIZÓ O IMPLEMENTÓ

- Elaboración del **diseño técnico completo** de la vertical aislada: arquitectura, límites legacy, dependencias permitidas/prohibidas, puntos de integración, **estructura exacta** de carpetas backend/frontend, contrato del CJ Supplier Adapter, máquinas de estado, modelo Prisma `cj_ebay_*`, reglas de negocio formales, diseño del dashboard, tabla de reutilización (énfasis `EbayService` vs flujos prohibidos), plan 3A–3G y criterios de salida de FASE 2.

### 2. EVIDENCIA REAL EN EL CÓDIGO O SISTEMA

- Diseño documentado en **v2.0**; a partir de **FASE 3A** la evidencia incluye además `backend/src/modules/cj-ebay/*`, migración `20260412180000_cj_ebay_phase3a`, y rutas frontend bajo `frontend/src/pages/cj-ebay/`.

### 3. QUÉ FALTA

- Tras 3A: FASE 3B en adelante (cliente CJ, fachada eBay, workers, UI completa de logs).
- Alineación de nombres de métodos del adapter con **documentación oficial CJ** al abrir FASE 3B.
- Opcional posterior: webhook eBay unificado con routing por listing CJ (fuera del MVP de ingesta documentado).

### 4. ESTADO EXACTO

- **FASE 2:** **solo diseñado** — completo en documentación; el **código** del módulo comienza en **FASE 3A** (no invalida el diseño FASE 2).
- **Validado en real:** no aplica.

---

## Declaración de cierre FASE 3A (formato obligatorio)

### 1. QUÉ SE ANALIZÓ O IMPLEMENTÓ

- Modelos Prisma `CjEbay*` + migración SQL; módulo `backend/src/modules/cj-ebay` con rutas, config, trace, schemas, interfaz adapter (sin implementación CJ); `ENABLE_CJ_EBAY_MODULE`; montaje en `app.ts`; frontend feature flag, menú, rutas, overview con datos de `count` reales, placeholders en demás páginas; actualización de este documento.

### 2. EVIDENCIA REAL EN EL CÓDIGO O SISTEMA

- Archivos listados en **FASE 3A — Archivos creados/modificados**; `grep`/`read` confirman **no** hay imports de `orderFulfillmentService`, `fulfillment-tracking-sync`, `MarketplaceService.publishToEbay`, ni `ebay-us-delivery-estimate` en el módulo nuevo.

### 3. QUÉ FALTA

- Aplicar migración en bases de datos de cada entorno (`npx prisma migrate deploy` desde `backend/`).
- Alinear `VITE_ENABLE_CJ_EBAY_MODULE` con `ENABLE_CJ_EBAY_MODULE` en despliegues.
- FASE 3C–3G según plan (FASE 3B iniciada — ver §FASE 3B).

### 4. ESTADO EXACTO

- **FASE 3A:** **implementado completo** respecto al alcance “armazón mínimo” definido por el usuario; **no** es integración CJ/eBay real.
- **Verificación estática en repo:** migración `20260412180000_cj_ebay_phase3a` alineada con modelos `CjEbay*` en `schema.prisma` (tablas `cj_ebay_*`, FKs a `users`).
- **Validado en real E2E:** depende de tu BD local y credenciales; no sustituye a `migrate` + smoke HTTP en tu máquina.

---

## Declaración de cierre FASE 3B (formato obligatorio)

### 1. QUÉ SE ANALIZÓ O IMPLEMENTÓ

- Cliente HTTP mínimo para CJ API 2.0 v1, adaptador que implementa `ICjSupplierAdapter` excepto órdenes/tracking (stubs que lanzan `CJ_NOT_IMPLEMENTED`).
- Convención de credenciales `cj-dropshipping` + tipo `CjDropshippingCredentials` + fallback `CJ_DROPSHIPPING_API_KEY`.
- Cuatro endpoints REST bajo `/api/cj-ebay/cj/*` para probar conexión, producto por `pid`, búsqueda y cotización.
- Throttle ~1.1s entre llamadas CJ; refresh de token en memoria + lectura opcional de tokens en JSON cifrado.
- **FASE 3B.1:** cotización USA vía payload oficial `freightCalculate` (sin cjBody manual), método `quoteShippingToUsReal`, trazas y reintentos de red.

### 2. EVIDENCIA REAL EN EL CÓDIGO O SISTEMA

- Archivos listados en **FASE 3B — Archivos creados/modificados** y **FASE 3B.1**; rutas en `cj-ebay.routes.ts`; `cj-freight-calculate.official.ts` cita URL ancla de la doc CJ.
- `grep` del módulo `cj-ebay` sin `orderFulfillmentService`, `fulfillment-tracking-sync`, `MarketplaceService.publishToEbay`, `aliexpress` en los archivos del adaptador CJ.

### 3. QUÉ FALTA

- Validar E2E con credenciales CJ reales (productos/variantes reales, comparar precios/plazos con el panel CJ).
- Endurecer `product/query` / búsqueda si hiciera falta.
- `freightCalculateTip` u otros endpoints logísticos si el negocio exige el modo “Tip”.
- Tests HTTP con mock, `createOrder` / tracking cuando el contrato CJ esté cerrado.

### 4. ESTADO EXACTO

- **FASE 3B:** **PARCIAL** — órdenes/tracking stub; búsqueda/producto con mapeos defensivos.
- **FASE 3B.1 (shipping simple):** **implementado en código** según doc §1.1; **no sustituye** validación en cuenta real ni el modo Tip.

---

## Declaración de cierre FASE 3B.1 — Shipping (formato obligatorio)

### 1. QUÉ SE IMPLEMENTÓ

- Módulo `cj-freight-calculate.official.ts` con payload y normalización alineados al CURL y tabla de §1.1 Logistics.
- `quoteShippingToUsReal` + `quoteShippingToUs` delegando; resolución `vid` desde `variantId` o `productId` (una sola variante).
- `POST /api/cj-ebay/cj/shipping-quote` sin `cjBody`; respuesta `{ shipping: { cost, method, estimatedDays, raw } }`.
- Reintentos de red en `authedWithNetworkRetry`; trazas `cj.freight.*` con payload, respuesta y duración.

### 2. EVIDENCIA

- `backend/src/modules/cj-ebay/adapters/cj-freight-calculate.official.ts`, `cj-supplier.adapter.ts`, `cj-ebay.routes.ts`, `cj-ebay.schemas.ts`, `cj-ebay.constants.ts`, `cj-supplier.adapter.interface.ts`.
- Doc actualizada: §FASE 3B.1 en este archivo.

### 3. QUÉ FALTA

- Pruebas reales contra CJ; decidir si hace falta exponer **todas** las opciones de envío al frontend (hoy `raw` las contiene).
- Evaluar `freightCalculateTip` para casos que el modo simple no cubra.

### 4. ESTADO

- **Shipping modo simple:** **cerrado en código** respecto a “no cjBody manual” y endpoint/payload oficiales §1.1.
- **Pricing FASE 3C:** ver **§FASE 3C** (implementado en código en v2.4).

---

## FASE 3C — Calificación + pricing + persistencia (corazón financiero)

### Alcance cerrado en código

- **Qualification engine** (`cj-ebay-qualification.service.ts`): recibe producto/variante CJ, llama `quoteShippingToUsReal`, persiste snapshot en `cj_ebay_products` / `cj_ebay_product_variants`, crea fila en `cj_ebay_shipping_quotes`, calcula breakdown y escribe `cj_ebay_product_evaluations` con `decision` y `reasons` JSON.
- **Pricing engine** (`cj-ebay-pricing.service.ts`): fórmulas puras CJ-only; **no** importa `ebay-us-delivery-estimate`, `MarketplaceService.publishToEbay`, ni servicios AliExpress. Reutilización conceptual: la **idea** “fees como % del precio de venta + fijo de pasarela” es estándar en retail; los números por defecto (`PRICING_DEFAULT_*`) son **placeholders operativos** documentados en el archivo hasta que el usuario guarde `CjEbayAccountSettings`.
- **Configuración** (`CjEbayAccountSettings`): `minMarginPct`, `minProfitUsd`, `maxShippingUsd`, `minStock`, `handlingBufferDays`, `rejectOnUnknownShipping`, `maxRiskScore`, `incidentBufferPct`, `defaultEbayFeePct`, `defaultPaymentFeePct`, `defaultPaymentFixedFeeUsd` (migración Prisma fase 3C).
- **Endpoints:** `POST /api/cj-ebay/pricing/preview`, `POST /api/cj-ebay/evaluate` (body: `productId`, `variantId`, `quantity`, `destPostalCode` opcional). El JSON de `breakdown` sustituye `NaN` por `null` para respuestas HTTP seguras.
- **Overview:** `GET /api/cj-ebay/overview` incluye `evaluationsPending` y `shippingQuotes`.
- **Trazas** (`cj_ebay_execution_traces`): pasos `qualification.start`, `qualification.result` (éxito o error de evaluate), `pricing.preview` (inicio/fin de preview), `pricing.error` (fallos de cálculo CJ o excepciones en preview).
- **Frontend:** `frontend/src/pages/cj-ebay/CjEbayProductsPage.tsx` — formulario mínimo + desglose + decisión + razones + IDs persistidos.

### Fórmulas de pricing (implementadas)

Con \(P\) = precio de lista (en la práctica el **suggested** = máximo entre mínimos factibles), \(S\) = costo proveedor línea, \(H\) = envío USD, \(r_e\) / \(r_p\) = fees eBay y pasarela como fracción, \(F_{fix}\) = fee fijo pasarela, \(b\) = `incidentBufferPct` como fracción sobre \((S+H)\):

- `incidentBufferUsd` = \((S + H) \times b\)
- `ebayFeeUsd` = \(P \times r_e\)
- `paymentFeeUsd` = \(P \times r_p + F_{fix}\)
- `totalCostUsd` = \(S + H +\) fees anteriores
- `netProfitUsd` = \(P - \text{totalCostUsd}\)
- `netMarginPct` = \((\text{netProfitUsd}/P)\times 100\) si \(P>0\)

**Precio mínimo** `minimumAllowedPriceUsd`: máximo de los candidatos que satisfacen por separado `minMarginPct` y `minProfitUsd` cuando ambos están configurados (ver función `computeMinimumListPrice`); si el denominador \(1 - r_e - r_p - m\) es no positivo → no factible.

**No se marca APPROVED** si faltan `minMarginPct` o `minProfitUsd` en cuenta: decisión **PENDING** con razón `THRESHOLDS_INCOMPLETE` (P3). Costo desconocido → **REJECTED** con `SUPPLIER_COST_UNKNOWN` y breakdown con campos numéricos nulos en JSON.

### Reglas de calificación realmente implementadas (etiqueta plan maestro)

| Regla | Código / tema | Comportamiento |
|-------|----------------|----------------|
| P1 | `ALL_CHECKS_PASSED` | Info cuando todo pasa. |
| P2 | `STOCK_BELOW_MIN`, `SUPPLIER_COST_UNKNOWN`, `SHIPPING_EXCEEDS_CAP`, `SHIPPING_TIME_UNKNOWN` | Stock vs `minStock`; costo positivo; `maxShippingUsd`; ventana de días nula + `rejectOnUnknownShipping`. |
| P3 | `THRESHOLDS_INCOMPLETE`, `NET_MARGIN_BELOW_MIN`, `NET_PROFIT_BELOW_MIN` | Ambos umbrales obligatorios para aprobar; margen/utilidad vs breakdown al **suggested** price. |
| P7 | `RISK_ABOVE_MAX` | Heurística por palabras (baterías, armas) vs `maxRiskScore`. |

**No implementadas en esta fase:** P4–P6, P8–P10 (categorías eBay, MAP, restricciones legales extendidas, historial de incidentes, etc.) — documentar al abrir listing engine o fases de compliance.

### Archivos creados o tocados (evidencia)

- `backend/src/modules/cj-ebay/services/cj-ebay-qualification.service.ts`
- `backend/src/modules/cj-ebay/services/cj-ebay-pricing.service.ts` (incl. `pricingBreakdownForResponse` para JSON sin `NaN`)
- `backend/src/modules/cj-ebay/cj-ebay.routes.ts` (preview, evaluate, overview; cuerpo Zod re-mapeado a tipo estricto)
- `backend/src/modules/cj-ebay/cj-ebay.constants.ts` (pasos de traza)
- `backend/src/modules/cj-ebay/schemas/cj-ebay.schemas.ts`, `cj-ebay.types.ts`, `services/cj-ebay-config.service.ts`
- `backend/prisma/schema.prisma` — campos FASE 3C documentados con comentarios `///` (Prisma no valida `/** */` entre atributos de campo); migración `20260413153000_cj_ebay_phase3c_pricing_settings` para columnas fees + `cjVid`
- Eliminado `backend/src/modules/cj-ebay/services/cj-ebay-evaluate-run.service.ts` (stub duplicado, imports rotos, sin uso)
- `frontend/src/pages/cj-ebay/CjEbayProductsPage.tsx`, `CjEbayOverviewPage.tsx`

### Qué quedó cubierto después (FASE 3D)

- Ver **§FASE 3D** — listing draft/publish, `handlingBufferDays` en texto de ficha, fachada eBay.

---

## FASE 3D — Listing engine + fachada eBay (implementación)

### Alcance implementado en código

- **`cj-ebay-ebay-facade.service.ts`**: único archivo del módulo `cj-ebay` que **instancia `EbayService`**. Expone: `verifyConnection`, `suggestCategory`, `publishInventoryFixedPrice` (delega en `createListing` = inventory + offer + publish), `pauseListing` (`endListing` / withdraw), `getOfferSnapshotBySku`. Credenciales: `CredentialsManager.getCredentialEntry` producción → sandbox, con persistencia de token al refrescar (mismo patrón que marketplace, **sin** `MarketplaceService.publishToEbay`).
- **`cj-ebay-listing.service.ts`**: draft y publish con reglas: solo evaluación **APPROVED** más reciente por variante; **cotización de envío enlazada y no stale** (48h / `validUntil`); **evaluación no stale** (24h); pricing recalculado con `computeFullPricingPreview`; **imágenes HTTPS** obligatorias en snapshot; SKU interno `CJE{userId}P{productId}V{variantId}`; estados `DRAFT`, `PUBLISHING`, `ACTIVE`, `FAILED`, `PAUSED` (y `ARCHIVED` reservado en constantes).
- **`policies/cj-ebay-listing-shipping.policy.ts`**: texto HTML honesto — origen **China**, handling = `handlingBufferDays` (+1 día hábil si `confidence` de plazo CJ es `unknown`); tránsito solo si `estimatedMinDays`/`estimatedMaxDays` existen en quote; si no, disclaimer explícito **sin** usar `ebay-us-delivery-estimate`.
- **`EbayService.getInventoryOfferBySku`**: método genérico para resolver `offerId` tras publicar.
- **Prisma / DB**: columnas `draftPayload`, `lastError`, `evaluationId`, `shippingQuoteId`, `handlingTimeDays`, `publishedAt` en `cj_ebay_listings`; relaciones a evaluación y quote. Migración `20260414203000_cj_ebay_phase3d_listing_draft`.
- **Endpoints**: `POST /api/cj-ebay/listings/draft`, `POST /api/cj-ebay/listings/publish`, `POST /api/cj-ebay/listings/:listingId/pause`, `GET /api/cj-ebay/listings`, `GET /api/cj-ebay/listings/:listingId`.
- **Trazas** (`cj_ebay_execution_traces`): `listing.draft.start`, `listing.draft.created`, `listing.publish.start`, `listing.publish.success`, `listing.publish.error`, `listing.pause`.
- **Frontend**: `CjEbayProductsPage` — botón “Crear draft listing” si APPROVED; `CjEbayListingsPage` — tabla, publicar, pausar, detalle/errores.

### Qué reutiliza de `EbayService` y qué no

| Reutiliza | No reutiliza en 3D |
|-----------|-------------------|
| `testConnection`, `suggestCategory`, `createListing`, `endListing`, `getInventoryOfferBySku` | `MarketplaceService.publishToEbay`, `ebay-us-delivery-estimate`, `orderFulfillmentService`, `fulfillment-tracking-sync` |
| Resolución de políticas/ubicación **dentro** de `createListing` (`getListingDefaults`, ship-from CN si env/config) | Mezcla con `Product` / `Order` / `Sale` legacy |

### Regla de salida (producción)

- **No** marcar 3D “lista para producción” sin: (1) al menos una publicación eBay real exitosa en sandbox o prod verificada manualmente; (2) listing con datos completos (imágenes, precio, texto de política); (3) handling/shipping coherentes con lo comunicado al comprador. El código está **parcial / pre-producción** hasta esa evidencia.

### Archivos creados o modificados (3D)

- `backend/src/modules/cj-ebay/services/cj-ebay-ebay-facade.service.ts` (**nuevo**)
- `backend/src/modules/cj-ebay/services/cj-ebay-listing.service.ts` (**nuevo**)
- `backend/src/modules/cj-ebay/policies/cj-ebay-listing-shipping.policy.ts` (**nuevo**)
- `backend/src/modules/cj-ebay/cj-ebay.routes.ts`, `cj-ebay.constants.ts`, `schemas/cj-ebay.schemas.ts`
- `backend/src/services/ebay.service.ts` (`getInventoryOfferBySku`)
- `backend/prisma/schema.prisma`, `backend/prisma/migrations/20260414203000_cj_ebay_phase3d_listing_draft/migration.sql`
- `frontend/src/pages/cj-ebay/CjEbayProductsPage.tsx`, `CjEbayListingsPage.tsx`, `CjEbayLayout.tsx`
- `docs/CJ_EBAY_USA_MASTER_PLAN.md`

---

## FASE 3D.QUALITY — Calidad del draft listing (2026-04-15)

### Objetivo

Mejorar la calidad del draft CJ→eBay en todos los campos que dependen del software, sin tocar el bloqueo de cuenta. El draft debe tener la mayor probabilidad de éxito cuando eBay autorice la cuenta.

### Mejoras implementadas

#### Título (`sanitizeCjTitle`)

- Colapsa whitespace / tabs / saltos de línea → espacio
- Reemplaza pipes `|` y backslashes `\` (ruido común en catálogo CJ) por espacio
- Elimina caracteres de puntuación ruido al inicio y fin del título
- Trunca en 80 caracteres (límite eBay)
- Resultado: título más limpio sin modificar el contenido semántico

#### Descripción (`buildListingDescriptionHtml`)

- **Eliminado**: línea `Supplier shipping reference: X — internal freight estimate USD Y (for our cost planning; buyer pays per eBay checkout)` — exponía un detalle de coste interno al comprador
- **Reemplazado por**: `Shipping method: X. Carrier and delivery window are confirmed at checkout under our eBay business policies.` — buyer-safe, profesional
- El parámetro `shippingCostUsd` ya no se usa en la descripción (marcado `@deprecated` en la firma)
- El resto de la estructura (ships from China, handling time, transit estimate, disclaimer) se mantiene sin cambios

#### Imágenes (deduplicación)

- `parseImages()` ahora deduplica vía `Set` antes de aplicar el límite de 12
- CJ a veces devuelve URLs duplicadas; antes se ocupaban slots innecesarios

#### Item specifics / Aspects (`buildAspectsFromVariant`)

- Siempre incluye `Brand: ['Generic']`
- Si la variante tiene atributos CJ (e.g. `Color`, `Size`, `Material`), los mapea directamente como eBay aspects
- Limita cada valor a 65 chars (límite eBay por aspecto)
- Fallback: `{ Brand: ['Generic'], Type: ['Product'] }` solo cuando no hay atributos
- Los aspects se incluyen en el `draftPayload` y se recuperan y pasan a `EbayProduct.aspects` durante el publish

#### Quality warnings (no bloqueantes)

`buildDraftQualityWarnings()` genera avisos accionables para el operador:

| Código | Condición | Mensaje |
|--------|-----------|---------|
| `TITLE_TOO_SHORT` | título < 20 chars | Recomienda 30+ para visibilidad |
| `TITLE_SANITIZED` | título fue modificado por sanitizeCjTitle | Indica revisar el título limpio |
| `SINGLE_IMAGE` | solo 1 imagen disponible | 3+ imágenes convierten mejor |
| `NO_VARIANT_ATTRIBUTES` | no hay atributos de variante | Item specifics reducidos a Brand=Generic |
| `DESCRIPTION_BODY_EMPTY` | descripción CJ vacía/muy corta | Considerar enriquecer tras publish |

Los warnings se devuelven en la respuesta del `POST /listings/draft`, se muestran en la página Products tras crear el draft, y se muestran en el panel de detalle de Listings.

### Cambios en UX

#### Productos CJ

- El recuadro debug `productId: X · variantId: Y` (verde, main flow) fue reemplazado por una línea legible: atributos de la variante + costo + stock + ID entre corchetes en pequeño
- El mensaje tras crear el draft ya no dice "Ir a Listings → Publicar" sino "Draft listo — Ver en Listings" + nota sobre el bloqueo de cuenta
- Los quality warnings del draft se muestran en un bloque ámbar justo debajo del mensaje de éxito

#### Listings CJ

- Nuevo banner de estado del módulo en la parte superior: lista los 7 componentes del pipeline con su estado (✓ listo / ○ pendiente) — incluye nota de por qué publish y postventa están pendientes
- Descripción de la página simplificada (eliminado texto interno "FASE 3D:")
- Panel de detalle: muestra quality warnings si existen, antes del JSON del payload
- "draftPayload (JSON)" renombrado a "Draft payload (JSON)"

### Qué no se tocó

- Motor de pricing, qualify, evaluate — sin cambios
- Account policy block guardrail — sin cambios
- Cualquier lógica de órdenes — sin cambios
- Esquema Prisma — sin cambios (no se requiere migración)

---

## FASE 3D.GUARDRAIL — Account policy block eBay overseas warehouse (2026-04-15)

### Contexto y causa raíz

Al intentar publicar un listing CJ con `ship-from China` en la cuenta eBay, el sistema recibía:

- **eBay error 25019** (`API_INVENTORY`)
- Mensaje: *Overseas Warehouse Block Policy*
- Parámetro: *forward-deployed item*
- Señal: *Location_Mismatch_Inventory_Block*
- `merchantLocationKey: "cn_default_location"` (ubicación de inventario en China)

**Este error NO es un problema de contenido del listing** (título, descripción, precio, categoría).  
Es un **bloqueo de cuenta/política eBay**: la cuenta no está aprobada para el modelo de overseas warehouse / Global Seller con inventario ship-from China (CJ Dropshipping).

### Diagnóstico de comportamiento anterior (incorrecto)

Antes de este guardrail:
- El sistema guardaba el listing como `FAILED` (estado genérico de error)
- El error se mostraba como texto crudo sin contexto de cuenta/política
- El botón "Publicar" permanecía activo → reintentos infinitos, todos rechazados por eBay
- No había distinción entre "error de contenido" y "bloqueo de cuenta"

### Implementación del guardrail

**Archivos modificados:**

| Archivo | Cambio |
|---------|--------|
| `cj-ebay.constants.ts` | Nuevo status `ACCOUNT_POLICY_BLOCK`; nuevo trace step `LISTING_PUBLISH_ACCOUNT_POLICY_BLOCK` |
| `cj-ebay-listing.service.ts` | `isEbayOverseasWarehouseBlock()` detecta error 25019 + señales textuales; pre-publish guard; catch clasifica como `ACCOUNT_POLICY_BLOCK` en vez de `FAILED` |
| `CjEbayListingsPage.tsx` | Banner ámbar de bloqueo de cuenta; badge `POLICY BLOCK`; botón "Publicar" reemplazado por "Bloqueado (política)"; panel de detalle con contexto claro |

**Señales de detección (`isEbayOverseasWarehouseBlock`):**
- `errorId === 25019`
- Texto: `Overseas Warehouse Block`, `Location_Mismatch_Inventory_Block`, `forward-deployed item`, `overseas.*warehouse`, `overseas.*block.*polic`

**Flujo tras el guardrail:**
1. Publish falla → `isEbayOverseasWarehouseBlock(err) === true`
2. Listing → status `ACCOUNT_POLICY_BLOCK`, `lastError = ACCOUNT_POLICY_BLOCK_MESSAGE`
3. Trace: `listing.publish.account_policy_block`
4. Respuesta HTTP 423 con mensaje explicativo
5. Siguientes intentos de publish → pre-publish guard devuelve HTTP 423 inmediatamente (sin llamar a eBay)

### Estado del draft

El draft se **conserva íntegro** bajo el listing en estado `ACCOUNT_POLICY_BLOCK`. No se destruye ni se modifica el `draftPayload`. Cuando la cuenta obtenga la autorización de eBay, el operador puede:
1. Cambiar el estado del listing a `DRAFT` (intervención de administración directa en DB)
2. Reintentar publish desde la UI

### Condición para reabrir publish

**Solo una condición desbloquea el publish CJ China:**  
> eBay aprueba la cuenta como Global Seller / overseas warehouse authorized.

Tras esa aprobación:
- El `merchantLocationKey` de China (`cn_default_location`) dejará de disparar error 25019
- El operador debe cambiar el estado del listing de `ACCOUNT_POLICY_BLOCK` a `DRAFT`
- Luego el publish normal puede ejecutarse

### Plazo de envío (FASE 5 auditoría)

El plazo de envío CJ está calculado correctamente y **no fue modificado**:
- `handlingTimeDays` = `handlingBufferDays` del operador + suplemento si confianza de cotización es `unknown` (ver `computeHandlingTimeDays` en `cj-ebay-listing-shipping.policy.ts`)
- `shippingMinDays` / `shippingMaxDays` = directo del `shippingQuote.estimatedMinDays/MaxDays` (cotización CJ real, no AliExpress)
- No se usa `ebay-us-delivery-estimate` ni ninguna heurística legacy
- La descripción HTML del listing declara origen China + estimado con confianza explícita
- El guardrail de account policy block **es independiente** del cálculo de plazo: el listing sigue bloqueado aunque el plazo sea correcto, hasta que la cuenta esté autorizada

### Qué no se tocó

- Search / preview / evaluate / draft — sin cambios
- Órdenes y fulfillment — sin cambios
- Cálculo de pricing — sin cambios
- Listing content (título, descripción, imágenes) — sin cambios
- Ningún otro módulo del sistema

---

## FASE 3E — Pipeline órdenes CJ → eBay USA (código)

### Alcance 3E (base, ya en código)

- **Ingest** (`cj-ebay-order-ingest.service.ts`): import manual por `ebayOrderId`; `cj-ebay-ebay-facade` (`getFulfillmentOrderById`); `cj_ebay_orders` + eventos; mapeo por `ebaySku`; estados `DETECTED`, `VALIDATED`, `NEEDS_MANUAL`.
- **API / UI:** listado, detalle, import, place, sync tracking; página `/cj-ebay/orders`.
- **Reglas:** sin `marketplace-order-sync`, `recordSaleFromWebhook`, `orderFulfillmentService`, `fulfillment-tracking-sync`; sin `Order` legacy como fuente de `cj_ebay_orders`.

---

### FASE 3E.1 — Integración real Shopping API (documentación oficial CJ)

**Referencias oficiales (mismo contrato que el código):**

| Operación | Método + ruta (relativa a `https://developers.cjdropshipping.com/api2.0/v1/`) | Doc |
|-----------|---------------------------------------------------------------------------------|-----|
| Crear pedido | `POST shopping/order/createOrderV2` | [Shopping — Create Order V2](https://developers.cjdropshipping.com/en/api/api2/api/shopping.html#_1-1-create-order-v2post) |
| Estado + tracking | `GET shopping/order/getOrderDetail?orderId={cjOrderId}` | [Shopping — Query Order](https://developers.cjdropshipping.com/en/api/api2/api/shopping.html#_1-7-query-order-get) |

**No** se inventan campos: el cuerpo de `createOrderV2` sigue la tabla de parámetros oficial (obligatorios: `orderNumber`, `shippingCountryCode`, `shippingCountry`, `shippingProvince`, `shippingCity`, `shippingCustomerName`, `shippingAddress`, `logisticName`, `fromCountryCode`, `products[]`; opcionales usados si existen en nuestra orden: `shippingAddress2`, `shippingZip`, `shippingPhone`). Cada producto: `vid`, `quantity`, y si aplica `sku`, `storeLineItemId`.

**Headers POST (CURL oficial):** `CJ-Access-Token`, `platformToken` vacío, `Content-Type: application/json`.

**Valores fijados en vertical (documentados):** `payType: 3` (solo crear pedido sin pago en página/balance, según doc), `shopLogisticsType: 2` (seller logistics). **`logisticName`** debe coincidir con un método devuelto por el cálculo de flete: en código se toma de `cj_ebay_shipping_quotes.serviceName` o `carrier` del listing vinculado.

**Respuesta `createOrderV2` (`data`):** se persiste resumen seguro (`orderId`, `orderNumber`, `orderStatus`, `logisticsMiss`) en eventos; **`orderId` es el id CJ** usado después en `getOrderDetail`.

**Tracking:** la doc de Shopping no define un endpoint aparte “solo tracking” en el alcance usado; **`getTracking` en el adapter** es el mapeo de `getOrderDetail` → `trackNumber`, `trackingUrl`, `logisticName`, `orderStatus`.

**Endpoints backend:** `POST /api/cj-ebay/orders/:orderId/place`, `GET /api/cj-ebay/orders/:orderId/status`, `POST /api/cj-ebay/orders/:orderId/sync-tracking` (+ los de ingest/listado ya existentes).

**Trazas añadidas:** `cj.order.create.start|success|error`, `cj.order.status.start|success|error`, `cj.tracking.start|success|error` (se mantienen también `order.place.*` y `tracking.sync.*`).

**Archivos 3E.1:** `cj-shopping-order.official.ts`, `cj-supplier.client.ts` (GET + `platformToken` en POST), `cj-supplier.adapter.ts`, `cj-supplier.adapter.interface.ts`, `cj-ebay-fulfillment.service.ts`, `cj-ebay-tracking.service.ts`, `cj-ebay-order-status.service.ts` (**nuevo**), `cj-ebay.constants.ts`, `cj-ebay.routes.ts`.

### Qué falta antes de FASE 3F / producción postventa

- Probar **con cuenta CJ real**: `payType=3` puede exigir pasos posteriores (confirmación, pago balance, etc.) según tu cuenta — revisar [Shopping](https://developers.cjdropshipping.com/en/api/api2/api/shopping.html) (`confirmOrder`, `payBalance`, …) si el pedido no avanza solo.
- Workers, ingest automático, alertas, tests E2E, reconciliación listings.

### Declaración de cierre FASE 3E + 3E.1 (formato obligatorio)

#### 1. QUÉ SE IMPLEMENTÓ

Pipeline postventa **con llamadas HTTP reales** a CJ: `createOrderV2`, `getOrderDetail` para estado y números de guía; persistencia `cjOrderId`, eventos, idempotencia de `orderNumber` estable por orden, validaciones de dirección / `cjVid` / quote de envío; `submitTrackingToEbay` vía fachada cuando hay tracking; trazas `cj.order.*` y `cj.tracking.*`.

#### 2. EVIDENCIA

Rutas y servicios anteriores; constantes de ruta en `cj-shopping-order.official.ts` enlazadas a la doc; `CjSupplierHttpClient.getWithAccessToken`; implementación en `cj-supplier.adapter.ts` (sin `CJ_NOT_IMPLEMENTED` en create/status/tracking).

#### 3. QUÉ FALTA

Validación **operativa** en CJ vivo (pago/confirmación si aplica tras `payType=3`); automatización 3F; cobertura de tests E2E.

#### 4. ESTADO EXACTO

- **FASE 3E.1 (código vs doc oficial):** **IMPLEMENTADO** — no queda stub de create/status/tracking en el adapter para los endpoints anteriores.
- **Postventa “cerrada” en negocio:** **PARCIAL** hasta validar en cuenta real el ciclo completo (CJ + eBay) y cualquier paso de pago/confirmación requerido por CJ.

---

### FASE 3E.2 — Validación viva y análisis de flujo post-createOrder

Esta subfase **no añade código**: consolida **auditoría técnica** del repositorio y **citas** a la documentación oficial CJ (área **Shopping**), para decidir si el flujo actual basta para negocio o exige **confirmación / pago** adicional.

#### 1) Código auditado (resumen técnico)

| Pieza | Ubicación principal | Comportamiento |
|-------|---------------------|----------------|
| **createOrderV2** | `cj-supplier.adapter.ts` → `POST …/shopping/order/createOrderV2` | Construye el cuerpo JSON con campos alineados a la tabla oficial (`orderNumber`, dirección, `logisticName`, `fromCountryCode`, `products[]` con `vid`/`quantity`/`sku`/`storeLineItemId`, `payType`, `shopLogisticsType`). |
| **getOrderDetail** | `cj-supplier.adapter.ts` → `GET …/shopping/order/getOrderDetail?orderId=` | Lee `data`: `orderStatus`, `orderId`, `trackNumber`, `trackingUrl`, `logisticName`, etc. |
| **Tracking** | `getTracking()` → llama internamente a `getOrderStatus()` (mismo GET) | Devuelve `trackingNumber`, `carrierCode` (desde `logisticName`), `trackingUrl`, `cjOrderStatus`. |
| **Place orden vertical** | `cj-ebay-fulfillment.service.ts` | Fuerza `payType: 3`, `shopLogisticsType: 2`; `orderNumber` = `cj-ebay-{id}` truncado a 50 caracteres. |
| **Estado CJ → fila `cj_ebay_orders`** | `cj-ebay-order-status.service.ts` (`mapCjStatusToLocal`) | `SHIPPED` / `DELIVERED` → `CJ_SHIPPED`; `CANCELLED` → `FAILED`; `UNSHIPPED` → `CJ_FULFILLING` si `cjPaidAt` está fijado (3E.3). Resto: solo evento `CJ_STATUS_POLL`. |

#### 2) Contrato implementado (qué se envía, qué devuelve CJ, qué se persiste)

**Endpoint:** `POST https://developers.cjdropshipping.com/api2.0/v1/shopping/order/createOrderV2`  
**Doc:** [Shopping — Create Order V2](https://developers.cjdropshipping.com/en/api/api2/api/shopping.html#_1-1-create-order-v2post)

**Payload (campos que el adapter envía siempre que apliquen):**

- **Críticos obligatorios en nuestro flujo:** `orderNumber`, `shippingCountryCode`, `shippingCountry`, `shippingProvince`, `shippingCity`, `shippingCustomerName`, `shippingAddress`, `fromCountryCode`, `logisticName`, `payType` (=3), `shopLogisticsType` (=2), `products[]` con al menos `{ vid, quantity }` y opcionalmente `sku`, `storeLineItemId`.
- **Opcionales si vienen de eBay:** `shippingAddress2`, `shippingZip`, `shippingPhone`.

**Respuesta CJ (`data`, uso en código):**

- **`orderId`:** obligatorio para seguir; se guarda en `cj_ebay_orders.cjOrderId`.
- **`orderStatus`:** se usa como `result.status` y en `rawSummary`; si falta, el adapter asume `'CREATED'`.
- Otros campos del ejemplo oficial (`cjPayUrl`, importes, `productInfoList`, `interceptOrderReasons`, `logisticsMiss`, …) pueden venir en la respuesta; hoy solo se **resumen** en evento (`rawSummary`: `orderId`, `orderNumber`, `orderStatus`, `logisticsMiss`).

**Persistencia tras place exitoso (`cj-ebay-fulfillment.service.ts`) — actualizado 3E.3:**

1. `status` → `CJ_ORDER_PLACING` (antes de la llamada).
2. Tras éxito: `cjOrderId`; `status` → **`CJ_ORDER_CREATED`** + evento con `rawSummary`.
3. Si `cjPostCreateCheckoutMode` = **`AUTO_CONFIRM_PAY`**: servidor llama `confirmOrder` y `payBalance`; estado final típico **`CJ_FULFILLING`**; si falla el auto, `needsManual` en respuesta y estado según punto de fallo.
4. Si modo **`MANUAL`**: el operador usa `POST .../confirm` y `POST .../pay`.
5. **`NEEDS_MANUAL`:** residual `CJ_NOT_IMPLEMENTED` en adapter o errores de checkout registrados en eventos.
6. **`FAILED`:** error en create; se re-lanza (mapeo `CjSupplierError` en rutas).

**Endpoint:** `GET …/shopping/order/getOrderDetail?orderId={cjOrderId}`  
**Doc:** [Shopping — Query Order](https://developers.cjdropshipping.com/en/api/api2/api/shopping.html#_1-7-query-order-get)

**Tracking en vertical:** `cj-ebay-tracking.service.ts` usa `getTracking` → si hay `trackNumber`, actualiza/crea `cj_ebay_tracking`, puede poner `cj_ebay_orders.status` en `CJ_SHIPPED` y luego `TRACKING_ON_EBAY` si el envío a eBay tiene éxito.

#### 3) Qué confirma la documentación oficial CJ (Shopping)

Fuente: [CJ Docs — 05. Shopping](https://developers.cjdropshipping.com/en/api/api2/api/shopping.html) (secciones citadas al 2026-04-12 en la web oficial).

- **`payType` (Create Order V2, texto introductorio y tabla):**
  - `1` (u omitido): pago en página; devuelve `cjPayUrl`.
  - `2`: pago con **balance**; el pedido sigue por **add-to-cart, confirmación de orden y descuento de balance**.
  - **`3`: “create the order only without initiating payment, add-to-cart, or order confirmation”.**  
  → **Confirmado en doc:** con `payType=3` **no** se ejecuta en ese llamado el flujo de carrito/confirmación/pago que sí describe `payType=2`. **No** afirma la doc que el pedido quede “fulfillment-ready” solo con ese paso; deja el pedido creado en un estado previo al flujo de pago/confirmación que el resto de la API modela aparte.

- **Pasos posteriores explícitos en la misma área Shopping:**
  - **`PATCH shopping/order/confirmOrder`** — cuerpo JSON oficial: `{ "orderId": "<id>" }`.  
  - **`POST shopping/pay/payBalance`** — cuerpo: `{ "orderId": "<id>" }`.  
  - **`POST shopping/pay/payBalanceV2`** — cuerpo: `shipmentOrderId`, `payId` (flujo distinto; no improvisar uso sin leer tabla completa y respuestas).

- **Estados de pedido** (tabla “Order Status” junto a `getOrderDetail`):  
  `CREATED` (create order, wait confirm), `IN_CART` (wait confirm), `UNPAID` (confirm order, CJ order number create), `UNSHIPPED` (paid, wait for sending), `SHIPPED` (in transit, get tracking number), `DELIVERED`, `CANCELLED`.  
  En otra tabla del mismo documento aparece además el valor **`OTHER`** como posible status en ciertos filtros — no unificar con la máquina interna sin validar en API viva.

#### 4) Supuestos que siguen siendo supuestos

- Que un pedido creado con **`payType=3`** avance solo hasta **UNSHIPPED/SHIPPED** en tu cuenta sin llamar **`confirmOrder`** y/o **`payBalance`** (o sin usar **`payType=2`** en su lugar).
- Que **`logisticName`** elegido desde nuestra quote coincida siempre con el que CJ acepta en create en todos los escenarios de cuenta.
- Que el mapeo mínimo **`SHIPPED`/`DELIVERED` → `CJ_SHIPPED`** sea suficiente para UX/ops (ignoramos transiciones finas `UNPAID` → `UNSHIPPED` en estado local).

#### 5) Qué probar obligatoriamente en cuenta CJ real

1. Tras **Place** (`payType=3`): registrar **`orderStatus`** devuelto en create y el devuelto por **`getOrderDetail`** en los minutos/horas siguientes (¿se queda en `CREATED`/`UNPAID`?).
2. Si el pedido **no avanza** a preparación/envío: probar en el panel CJ y/o con API el orden **`confirmOrder` → `payBalance`** (o evaluar **`payType=2`** en entorno de prueba, consciente del cargo a balance).
3. Validar que **`getOrderDetail.trackNumber`** se rellena cuando la doc indica “SHIPPED” y que nuestro **sync tracking** + **eBay** funciona con tus credenciales.
4. Anotar si CJ devuelve **`shipmentOrderId`** / **`payId`** en algún paso intermedio relevante para **payBalanceV2** (solo si la cuenta lo exige).

#### 6) Qué faltaría para declarar la postventa “realmente lista”

- **Criterio de salida sugerido:** al menos una orden **eBay mapeada** que recorra: create (o create+confirm+pay según tu política) → estado CJ hasta **envío** → **tracking** en CJ → **upload** a eBay, con capturas o logs de `getOrderDetail` en cada hito.
- **Código:** si la prueba demuestra que hace falta **confirm/pago** tras `payType=3`, implementar **FASE 3E.3** (abajo), no ampliar workers antes.

#### 7) FASE 3E.3 (implementación en código — ver § siguiente bloque «FASE 3E.3 — …»)

El pseudoplan de la versión 2.8 se **materializó** en la subfase **3E.3** (adapter PATCH/POST, servicio checkout, Prisma `cjConfirmedAt` / `cjPaidAt` / `cjPostCreateCheckoutMode`, rutas y UI). **No** se implementó **`payBalanceV2`** (faltan `shipmentOrderId` / `payId` fiables desde nuestro flujo sin improvisar). **No** se cambió el create a **`payType=2`** automático (riesgo de cargo a balance sin UX explícita).

**Declaración de cierre FASE 3E.2 (formato obligatorio)**

| # | Contenido |
|---|-----------|
| **1. QUÉ SE IMPLEMENTÓ** | Solo **documentación** en este plano: auditoría del código existente y síntesis de la **doc oficial Shopping** sobre `payType`, `confirmOrder`, `payBalance` y estados de `getOrderDetail`. |
| **2. EVIDENCIA** | Archivos citados arriba; enlaces CJ Shopping oficiales; ausencia de cambios de código en el repositorio para 3E.2. |
| **3. QUÉ FALTA** | Ejecución de las **pruebas en cuenta viva** (§5 de 3E.2); validar secuencia real create→confirm→pay. |
| **4. ESTADO EXACTO** | **FASE 3E.2:** **CERRADA EN DOCUMENTACIÓN** (auditoría). La **implementación** de confirm/pago corresponde a **§FASE 3E.3**. |

---

### FASE 3E.3 — Confirmación y pago CJ post-createOrder (código)

#### Significado de `payType` (doc Shopping — Create Order V2)

| Valor | Comportamiento documentado |
|-------|----------------------------|
| **1** (u omitido) | Pago en **página**; respuesta puede incluir `cjPayUrl`. |
| **2** | Pago con **balance**; el pedido sigue por **add-to-cart, confirmación y descuento de balance** en el flujo que describe la doc (no es el camino implementado por defecto en vertical; **riesgo** de cargo automático). |
| **3** | **Solo crea** el pedido **sin** iniciar pago, **sin** add-to-cart ni **confirmación** en esa misma llamada. |

#### Qué deja hecho `createOrderV2` con `payType=3` (confirmado en doc)

- Pedido creado en CJ con `orderId` devuelto; estado CJ típico inicial **CREATED** (u otros previos a pago según cuenta).
- **No** ejecuta `confirmOrder` ni `payBalance` por sí solo.

#### Cuándo usar `confirmOrder` / `payBalance` (doc)

- **`PATCH shopping/order/confirmOrder`** — cuerpo `{ "orderId": "<cjOrderId>" }` — cuando el flujo de negocio requiere **confirmar** el pedido en CJ después del create (tabla de estados en doc: **UNPAID** asociado a “confirm order, CJ order number create”).
- **`POST shopping/pay/payBalance`** — cuerpo `{ "orderId": "<cjOrderId>" }` — para **cobrar** el pedido contra **balance** de la cuenta CJ tras la confirmación (estado típico posterior: pagado → **UNSHIPPED** según doc).

#### `payBalanceV2`

- Doc exige `shipmentOrderId` y `payId`. **No implementado** en 3E.3: no hay fuente documentada en nuestro flujo actual para rellenarlos sin suposiciones.

#### Estados internos `cj_ebay_orders.status` (3E.3)

| Estado | Uso |
|--------|-----|
| `CJ_ORDER_PLACING` | Llamada `createOrderV2` en curso. |
| `CJ_ORDER_CREATED` | Create OK; pendiente confirm (manual o auto). |
| `CJ_ORDER_CONFIRMING` | `confirmOrder` en curso. |
| `CJ_PAYMENT_PENDING` | `confirmOrder` OK; pendiente `payBalance` (alineado doc: UNPAID típico). |
| `CJ_ORDER_CONFIRMED` | Reservado / compatible con pay (pay admite también este estado). |
| `CJ_PAYMENT_PROCESSING` | `payBalance` en curso. |
| `CJ_PAYMENT_COMPLETED` | `payBalance` OK (evento; de inmediato pasa a `CJ_FULFILLING`). |
| `CJ_FULFILLING` | CJ procesando envío (doc: UNSHIPPED→…). |
| `CJ_SHIPPED` / `TRACKING_ON_EBAY` / … | Sin cambio respecto a 3E.1. |
| `NEEDS_MANUAL` / `FAILED` | Errores o pasos no aplicables. |

**Persistencia adicional:** `cjConfirmedAt`, `cjPaidAt` (timestamps). **Config:** `cj_ebay_account_settings.cjPostCreateCheckoutMode` = `MANUAL` \| `AUTO_CONFIRM_PAY`.

#### API backend

- `POST /api/cj-ebay/orders/:orderId/confirm`
- `POST /api/cj-ebay/orders/:orderId/pay`
- `GET /api/cj-ebay/orders/:orderId/status` (ya existía)

#### Trazas

- `cj.order.confirm.start|success|error`, `cj.order.pay.start|success|error`

#### Archivos principales

- `cj-supplier.client.ts` (`patchWithAccessToken`)
- `cj-supplier.adapter.ts` (`confirmOrder`, `payBalance`)
- `cj-shopping-order.official.ts` (rutas confirm/pay)
- `cj-ebay-cj-checkout.service.ts`
- `cj-ebay-fulfillment.service.ts` (create → `CJ_ORDER_CREATED`; opción auto confirm+pay)
- `cj-ebay.constants.ts`, `cj-ebay.routes.ts`, `cj-ebay-config.service.ts`, `schemas`, migración Prisma `20260416120000_cj_ebay_phase3e3_checkout`
- `frontend/.../CjEbayOrdersPage.tsx`
- **3E.4:** `cj-ebay-system-readiness.service.ts`, `cj-ebay-operational-validation.service.ts`, `cj-ebay-order-evidence.service.ts`, rutas `GET …/system-readiness`, `…/operational-flow`, `…/evidence-summary` en `cj-ebay.routes.ts`; scripts raíz `scripts/run-cj-ebay-migrations.ts`, `scripts/export-evidence.ts`, `scripts/cj-ebay-3e4-flow.http`

#### ¿Se puede pasar a FASE 3F?

- **Código:** sí se puede **planificar 3F** (workers) en paralelo si no bloquean el checkout.
- **Negocio / GO postventa:** **no** declarar lista hasta **prueba real** create → confirm → pay → envío → tracking → eBay.

#### Declaración de cierre FASE 3E.3 (formato obligatorio)

| # | Contenido |
|---|-----------|
| **1. QUÉ SE IMPLEMENTÓ** | Subflujo post-create con **doc oficial** (`confirmOrder`, `payBalance`), estados y timestamps, modo **MANUAL** / **AUTO_CONFIRM_PAY**, endpoints, trazas, UI mínima. |
| **2. EVIDENCIA** | Archivos listados arriba; `npx tsc --noEmit` backend/frontend OK tras cambios. |
| **3. QUÉ FALTA** | `prisma migrate deploy` en entornos; prueba en **cuenta CJ viva**; `payBalanceV2` si tu cuenta lo exige y se obtienen `shipmentOrderId`/`payId` por doc/webhook; opcional **payType=2** como alternativa explícita (producto). |
| **4. ESTADO EXACTO** | **FASE 3E.3:** **IMPLEMENTADA EN CÓDIGO** según doc citada; **postventa global:** **NO** “lista producción” sin evidencia en cuenta real. **3F:** permitido iniciar **solo** si se acepta que workers no sustituyen esa validación. |

---

### FASE 3E.4 — Protocolo de validación viva (CJ → eBay)

**Objetivo:** ejecutar **una** prueba manual controlada del flujo ya implementado:  
`createOrderV2` (**payType=3**) → **`confirmOrder`** → **`payBalance`** → **`getOrderDetail`** (vía API interna de estado) → **tracking** → preparación / ejecución de **`submitTrackingToEbay`** (vía `POST …/sync-tracking`).

**Alcance:** documentación operativa + endpoint de inspección **sin workers** y **sin** tocar el modelo `Order` legacy.

#### Guía exacta de prueba manual (qué preparar)

| Tema | Requisito |
|------|-----------|
| **Módulo** | `ENABLE_CJ_EBAY_MODULE=true` en entorno del backend (`env`). Si el flag está en `false`, todas las rutas `/api/cj-ebay/*` responden **404** `CJ_EBAY_MODULE_DISABLED`. |
| **Auth API** | Usuario autenticado (JWT/sesión según el resto del backend); todas las rutas del router usan `authenticate`. |
| **Migraciones** | `npx prisma migrate deploy` (o flujo equivalente) en la base del backend. Imprescindible la migración **`20260416120000_cj_ebay_phase3e3_checkout`** (`cjConfirmedAt`, `cjPaidAt`, `cjPostCreateCheckoutMode`) además del resto de tablas `cj_ebay_*`. |
| **Credencial CJ** | `ApiCredential` con `apiName` **`cj-dropshipping`** y cuerpo JSON con **`apiKey`** (convención documentada en `api-credentials.types.ts`). El adapter usa entorno **`production`** fijo (`createCjSupplierAdapter`). |
| **Credencial eBay** | Misma cuenta/usuario: credenciales **eBay** (producción o sandbox) que consuma `cj-ebay-ebay-facade` para **import** de la orden y para **submit** de tracking. |
| **Balance CJ** | La cuenta CJ debe poder completar **`payBalance`** (saldo suficiente). Si la cuenta exige otro camino (**p. ej. `payBalanceV2`**), esta prueba **fallará** hasta producto/datos adicionales — no improvisar. |
| **Modo checkout** | Para seguir los pasos **uno a uno**, `POST /api/cj-ebay/config` con `{ "cjPostCreateCheckoutMode": "MANUAL" }`. Con `AUTO_CONFIRM_PAY`, tras `place` el servidor encadena confirm+pay y debe documentarse el resultado observado igualmente. |
| **Orden eBay de prueba** | Un **pedido real o sandbox** en eBay cuyo **SKU de línea** coincida con `cj_ebay_listings.ebaySku` de un listing **ACTIVE** o **PAUSED** del mismo `userId`, con **producto/variante** sincronizados (**`cjVid`**, **`cjSku`**) y listing con **shipping quote** ligada (**`logisticName`**). Dirección de envío en eBay: **nombre, línea1, ciudad, país**; si país **US**, **estado** obligatorio (validación en `placeCjOrder`). |

#### Orden recomendado de endpoints (`/api/cj-ebay` base)

0. **`GET /system-readiness`** — **sin llamadas CJ/eBay**: `ready` y `checks[]` (DB, migraciones CJ-eBay, flag, credenciales). Funciona aunque `ENABLE_CJ_EBAY_MODULE=false` (el resto de rutas devolverán 404 hasta activar el flag).
1. **(Opcional)** `GET /config` — verificar `cjPostCreateCheckoutMode`.
2. **(Opcional)** `POST /cj/test-connection` — **sí** llama CJ; usar solo cuando el operador quiera prueba de red (fuera del alcance “solo preparación”).
3. `POST /orders/import` — cuerpo `{ "ebayOrderId": "<id eBay>" }` → devuelve `orderId` (UUID interno `cj_ebay_orders`).
4. `GET /orders/:orderId/operational-flow` — **inspección**: `gates.*.ok` y `suggestedSequence` deben alinearse con el siguiente paso (solo lectura DB + trazas con `meta.orderId`).
5. **(Tras cada paso crítico o al cierre)** `GET /orders/:orderId/evidence-summary` — JSON sanitizado para pegar o anexar a la **plantilla de evidencia** (timeline + trazas; no sustituye request/response por paso).
6. `POST /orders/:orderId/place` — `createOrderV2` **payType=3** → esperar `status` **`CJ_ORDER_CREATED`** (o `CJ_FULFILLING` si auto checkout OK).
7. Si **MANUAL**: `POST /orders/:orderId/confirm` → luego `POST /orders/:orderId/pay`.
8. `GET /orders/:orderId/status` — llama CJ **`getOrderDetail`**; revisar `cjOrderStatus`, `trackNumber`, `localStatusUpdated`.
9. Repetir **8** cuando CJ deba mostrar avance (p. ej. **UNSHIPPED** tras pago).
10. `POST /orders/:orderId/sync-tracking` — cuando haya tracking en CJ; puede **crear/actualizar** `cj_ebay_tracking` y, si hay `lineItemId` en `rawEbaySummary`, llamar **Sell Fulfillment** vía fachada.

#### Respuestas y estados internos esperados (referencia)

| Paso | HTTP esperado (caso OK) | `cj_ebay_orders.status` típico después |
|------|-------------------------|----------------------------------------|
| import + mapping OK | 200, `mapped: true` | `VALIDATED` |
| place OK (MANUAL) | 200, `cjOrderId` | `CJ_ORDER_CREATED` |
| confirm OK | 200 | `CJ_PAYMENT_PENDING`, `cjConfirmedAt` ≠ null |
| pay OK | 200 | `CJ_FULFILLING`, `cjPaidAt` ≠ null |
| GET status | 200, `cjOrderStatus` coherente con CJ | puede actualizar a `CJ_FULFILLING` si CJ **UNSHIPPED** y `cjPaidAt` set |
| sync-tracking (sin número aún) | 200, mensaje tipo “No tracking yet” | sin cambio de estado obligatorio |
| sync-tracking (con número + eBay OK) | 200, `submittedToEbay: true` | `TRACKING_ON_EBAY` si fulfillment OK |

Errores 4xx del checkout incluyen **siguiente paso sugerido** en el mensaje (`place` / `confirm` / `operational-flow`).

#### Qué revisar en CJ (panel / API)

- Tras **place:** pedido visible con el **`orderId`** devuelto; estado acorde a doc (**CREATED** / previo a pago).
- Tras **confirm:** transición hacia flujo **UNPAID**/listo para cargo según doc.
- Tras **pay:** cargo a **balance** y estado que permita preparación de envío (**UNSHIPPED** típico).
- Cuando aplique: **tracking** o URL/número en detalle de pedido.

#### Qué revisar en eBay

- Orden importada coincide con **fulfillment** leído por la fachada.
- Tras `sync-tracking` con éxito: envío reflejado en la orden (según políticas de la cuenta sandbox/producción).

#### Criterios de éxito / fallo

- **Éxito parcial 3E.4:** create + confirm + pay + **getOrderDetail** coherente en API interna, estados y timestamps persistidos, trazas `cj.order.*` y `order.place.*` presentes, **sin** errores no explicados en `lastError`.
- **Éxito completo (hacia “postventa lista”):** lo anterior **más** tracking desde CJ **más** `submitTrackingToEbay` exitoso (o causa documentada si eBay sandbox limita).
- **Fallo:** cualquier paso bloqueado por **credenciales**, **mapping**, **balance**, **payBalanceV2** requerido y no implementado, o **datos eBay** insuficientes (`rawEbaySummary.lineItems` → evento `TRACKING_EBAY_SKIPPED`).

#### Checklist exacto de prueba (marcar en la corrida)

- [ ] Orden **creada** en CJ (`cjOrderId` en DB y en panel CJ).
- [ ] Orden **confirmada** (`cjConfirmedAt`, traza `cj.order.confirm.success`).
- [ ] Orden **pagada** con balance (`cjPaidAt`, traza `cj.order.pay.success`).
- [ ] Estado visible en **`GET …/status`** alineado con CJ (`cjOrderStatus`).
- [ ] **Tracking** visible en CJ cuando el fulfillment lo provea; `sync-tracking` refleja número o mensaje explícito de “aún no”.
- [ ] Transiciones **`cj_ebay_orders.status`** según tabla anterior (sin saltos imposibles).
- [ ] **Trazas** en `cj_ebay_execution_traces` con `meta.orderId` = id interno (visibles en `operational-flow`).
- [ ] **Sin contaminación legacy:** fila solo en `cj_ebay_orders`; no se exige ni se escribe en tablas del flujo `Order` antiguo para esta vertical.

#### Plantilla de evidencia de validación viva 3E.4

Uso: **una fila o un bloque por cada llamada HTTP** (o por cada hito si se agrupa), más **una hoja de cierre** por corrida. Los campos deben poder archivarse en Confluence/Notion/PDF **sin datos personales del comprador** (direcciones, teléfono, email: **no**; usar solo “coincide con panel eBay” o capturas **recortadas** en anexo restringido).

**Identificación de la corrida**

| Campo | Valor |
|--------|--------|
| **Fecha / hora (TZ)** | |
| **Entorno** | p. ej. `staging` / `prod` / `local` + URL base API |
| **Usuario** | ID interno o alias (sin credenciales) |
| **listingId** | |
| **ebayOrderId** | |
| **orderId interno cj-ebay** | UUID `cj_ebay_orders.id` |
| **cjOrderId** | |
| **variantId** | |
| **cjVid** | |
| **cjSku** | |

**Paso registrado**

| Campo | Valor |
|--------|--------|
| **Endpoint ejecutado** | p. ej. `POST /api/cj-ebay/orders/:orderId/place` |
| **Request sanitizado** | Cuerpo sin tokens; solo IDs y flags necesarios |
| **Response sanitizada** | Sin PII; truncar payloads largos |
| **Estado interno antes** | `cj_ebay_orders.status` (y timestamps si aplica) |
| **Estado interno después** | |
| **Trazas relevantes** | `step` + `message` + hora (desde `evidence-summary` o UI logs) |

**Verificación externa (paneles)**

| Campo | Valor |
|--------|--------|
| **Resultado CJ visible en panel** | Estado / pantalla (descripción textual o referencia a captura anexa) |
| **Resultado eBay visible en panel** | |
| **Tracking obtenido** | Número / carrier (si aplica; coherente con `sync-tracking`) |
| **submitTrackingToEbay realizado** | Sí / No / N/A (motivo) |

**Cierre del bloque**

| Campo | Valor |
|--------|--------|
| **Observaciones** | Incidencias, códigos HTTP, mensajes CJ/eBay (sin secretos) |
| **Conclusión de esa corrida** | p. ej. “OK hasta pay”; “bloqueo payBalanceV2”; “tracking OK, eBay 4xx” |

**Apoyo del repositorio**

- Tras los pasos en API, **`GET /api/cj-ebay/orders/:orderId/evidence-summary`** devuelve un JSON con: datos mínimos de orden, **`variant.cjVid` / `cjSku`**, listing resumido, tracking + `submitTrackingToEbayDone`, **`eventsTimeline`** (órden cronológico), **`tracesRelated`** (trazas con `meta.orderId`), y **`rawEbaySummarySlim`** (solo `orderId` fulfillment, `fulfillmentStatus`, `lineItems` con `lineItemId`/`sku`/`quantity`). El **`buyerPayload`** no se exporta; campos sensibles en `meta` se sustituyen por `[redacted]`. Completar igualmente **request/response por paso** desde Postman/Insomnia (sanitizado), porque el endpoint **no** almacena respuestas HTTP completas de CJ.

#### Guía operativa para ejecución 3E.4

**Antes de tocar CJ/eBay en vivo**

1. **Variables de entorno (backend)** — ver `backend/.env.example`: `ENABLE_CJ_EBAY_MODULE=true`, `DATABASE_URL`, opcional `CJ_DROPSHIPPING_API_KEY` (si no usas solo credencial en DB). eBay para import/tracking: **OAuth en `ApiCredential` (`ebay`)** para el usuario operador (producción o sandbox).
2. **Migraciones** — Cinco carpetas esperadas en `backend/prisma/migrations/`:  
   `20260412180000_cj_ebay_phase3a`, `20260413153000_cj_ebay_phase3c_pricing_settings`, `20260414203000_cj_ebay_phase3d_listing_draft`, `20260415120000_cj_ebay_phase3e_orders`, `20260416120000_cj_ebay_phase3e3_checkout`.  
   Aplicar pendientes: **`npx tsx scripts/run-cj-ebay-migrations.ts`** (desde raíz del monorepo) o **`cd backend && npm run cj-ebay:3e4:migrate`** — equivale a **`prisma migrate deploy`** (no reset, no borrado masivo). **Producción:** solo con aprobación explícita del operador.
3. **`GET /api/cj-ebay/system-readiness`** (JWT del operador) — revisar `ready` y cada ítem de `checks` (DB, tabla `cj_ebay_orders`, migraciones anteriores aplicadas, flag, CJ, eBay). **No** invoca APIs externas CJ/eBay.
4. **Colección** — `scripts/cj-ebay-3e4-flow.http`: completar `baseUrl`, `token`, `ebayOrderId`, `orderId`. Ejecutar manualmente; los pasos marcados como REAL consumen CJ/eBay.

**Durante la corrida**

| Paso operador | Qué hacer | Qué validar |
|---------------|-----------|-------------|
| Preparación | `system-readiness` | `checks` en verde lógico (`ready: true` ideal) |
| Import | `POST …/orders/import` | `mapped: true`, anotar **orderId** |
| Gates | `GET …/operational-flow` | `gates.placeCjOrder` / `confirm` / `pay` antes de cada POST |
| Checkout | confirm, pay (MANUAL) | HTTP 200, timestamps en evidencia |
| Estado CJ | `GET …/status` | `cjOrderStatus`, `trackNumber` |
| Tracking | `POST …/sync-tracking` | `submittedToEbay` si aplica |
| Evidencia | `GET …/evidence-summary` o `npm run cj-ebay:3e4:export-evidence` | `summary.order` (**id**, **status**, **cjOrderId**), **tracking**, **eventsTimeline**, **tracesRelated** |

**`operational-flow`:** semáforo entre pasos; leer `gates.*.reason` si `ok: false`.

**`evidence-summary`:** base del anexo JSON de la plantilla; completar a mano requests/responses y capturas de paneles.

**`scripts/export-evidence.ts`:** variables `CJ_EBAY_API_BASE`, `CJ_EBAY_JWT`, `CJ_EBAY_ORDER_ID`; opcional `--out`. Requiere módulo habilitado y token válido.

#### Resultado esperado (cierre conceptual)

| Señal | Interpretación |
|-------|----------------|
| Todos los ítems del checklist OK en **cuenta viva**, con capturas o logs archivados | Evidencia fuerte de que la **postventa CJ→eBay** está **lista para producción controlada** (sujeto a políticas de cuenta y límites API). |
| Fallo en **pay** o CJ exige **V2** u otro flujo | **Falta ajuste** de producto o implementación; **no** declarar lista; documentar respuesta CJ cruda (sin secretos). |
| Tracking OK en CJ pero **eBay** rechaza fulfillment | **Falta ajuste** en fachada/credenciales/scopes o en datos de línea; revisar `lastError` y eventos `TRACKING_EBAY_ERROR`. |
| Solo llega hasta **pay** sin tracking en plazo razonable | Proceso operativo normal de CJ; **3F** podría automatizar **poll**, pero **no** sustituye constatar que el tracking **eventual** encaja con `sync-tracking`. |

**¿Pasamos a FASE 3F después de 3E.4?** Solo si se acepta que **workers** son automatización del mismo flujo ya **probado**; si 3E.4 queda en **fallo** o **incompleto**, **no** iniciar **3F masivo** hasta resolver o documentar el bloqueo.

#### Declaración FASE 3E.4 (formato obligatorio)

| # | Contenido |
|---|-----------|
| **1. QUÉ SE IMPLEMENTÓ** | Protocolo; **plantilla**; **`GET /api/cj-ebay/system-readiness`**; **`operational-flow`**; **`evidence-summary`**; `scripts/run-cj-ebay-migrations.ts`, `scripts/export-evidence.ts`, `scripts/cj-ebay-3e4-flow.http`; `npm run cj-ebay:3e4:*` en backend; guía operativa §3E.4. |
| **2. EVIDENCIA** | `cj-ebay-system-readiness.service.ts`; `cj-ebay-operational-validation.service.ts`; `cj-ebay-order-evidence.service.ts`; `cj-ebay.routes.ts`; `backend/package.json` scripts; `npx tsc --noEmit` backend OK. |
| **3. QUÉ FALTA** | Ejecución real del protocolo en cuenta CJ + eBay; **rellenar plantilla** y archivar constancia; decisión explícita sobre inicio **acotado** de 3F. |
| **4. ESTADO EXACTO** | **3E.4** en repo: **documentación + helpers + plantilla** listos; **validación viva documentada** = **pendiente** hasta corrida con archivo de evidencias; **3F** no masivo aún. |

---

## Declaración de cierre FASE 3D (formato obligatorio)

### 1. QUÉ SE IMPLEMENTÓ

Flujo **evaluado APPROVED → draft persistido → publish vía fachada eBay → ACTIVE / FAILED**, pausa con withdraw, API y UI mínima; política de envío/handling documentada e implementada en descripción de ficha.

### 2. EVIDENCIA

Archivos listados en **§FASE 3D — Archivos creados o modificados**; en `cj-ebay` solo `cj-ebay-ebay-facade.service.ts` importa/instancia `EbayService` (más `import type` de `EbayProduct` en listing service).

### 3. QUÉ FALTA

Prueba de publicación eBay **real** obligatoria para GO producción; refinamiento de categorías/políticas; órdenes y tracking (FASE 3E+).

### 4. ESTADO EXACTO

- **FASE 3D:** **PARCIAL** — implementación de código **completa** según alcance arriba; **no** “lista para producción” hasta validación eBay real (regla de salida).

---

## Declaración de cierre FASE 3C (formato obligatorio)

### 1. QUÉ SE IMPLEMENTÓ

Motores de **calificación** y **pricing** CJ → eBay USA con persistencia en `cj_ebay_shipping_quotes` y `cj_ebay_product_evaluations`, configuración ampliada, endpoints de prueba, overview ampliado, trazas y UI mínima en productos.

### 2. EVIDENCIA

Archivos listados en **§FASE 3C — Archivos creados o tocados**; búsqueda en el módulo `cj-ebay` sin imports de `MarketplaceService.publishToEbay`, `orderFulfillmentService`, `fulfillment-tracking-sync`, ni `ebay-us-delivery-estimate` en los servicios nuevos de pricing/qualification.

### 3. QUÉ FALTA

Validación con cuenta CJ real; reglas P4–P6/P8–P10; listing engine; workers; dashboard completo; tests.

### 4. ESTADO EXACTO

- **FASE 3C:** **PARCIAL** — alcance de código **completo** para el corazón financiero/decisión descrito arriba; **no** sustituye validación externa ni el resto de fases.

---

## FASE 3F — Buscador de productos CJ en Products (2026-04-14)

> **Decisión de producto:** La pantalla *Products* pasa a ser la puerta de entrada real al ciclo CJ → eBay USA. El flujo anterior basado en `productId`/`variantId` manuales queda disponible como modo avanzado/debug. El buscador vive dentro del mismo módulo, sección Products. No se creó un módulo separado.

### Problema resuelto

El flujo de entrada original exigía conocer IDs técnicos CJ (`productId`, `variantId`/vid/SKU) antes de poder operar. Esto era una barrera de entrada que rompía la usabilidad para cualquier operador sin acceso directo al portal CJ.

### Nuevo flujo en Products

```
[Sección A] Input de búsqueda textual → POST /api/cj-ebay/cj/search
[Sección B] Grid de resultados: imagen, título, precio, botón Seleccionar
[Sección C] Producto seleccionado → GET /api/cj-ebay/cj/product/:id
            - Variante única: auto-selección
            - Múltiples variantes: picker con atributos/precio/stock
[Sección D] Configuración (quantity, destPostalCode) + botones pipeline
            - Vista previa pricing
            - Evaluar y persistir
            - Crear draft listing
[Sección E] Modo avanzado / manual (colapsado por defecto)
            - Inputs para productId, variantId manual
            - Mismos botones de pipeline
```

### Backend

Sin cambios. Los endpoints necesarios ya existían:

| Endpoint | Existía | Uso |
|---|---|---|
| `POST /api/cj-ebay/cj/search` | Sí | Búsqueda textual CJ |
| `GET /api/cj-ebay/cj/product/:cjProductId` | Sí | Detalle + variantes |
| `POST /api/cj-ebay/pricing/preview` | Sí | Preview sin persistir |
| `POST /api/cj-ebay/evaluate` | Sí | Evaluar + persistir |
| `POST /api/cj-ebay/listings/draft` | Sí | Crear draft |

### Frontend

Archivo modificado: `frontend/src/pages/cj-ebay/CjEbayProductsPage.tsx`

Nuevos tipos: `CjProductSummary`, `CjVariantDetail`, `CjProductDetail`  
Nuevo estado: `searchQuery/Results/Loading/Error`, `selectedProduct`, `selectedVariantKey`, `advancedOpen`  
Nuevas funciones: `runSearch()`, `selectProduct()`, `chooseVariant()`, `extractApiError()`, `variantLabel()`, `variantKey()`  
Conservado intacto: `runPreview()`, `runEvaluate()`, `runDraft()`, `body()`, paneles de decisión y pricing

### Documentación

Nuevo documento de diseño: `docs/CJ_EBAY_USA_PRODUCT_SEARCH_PLAN.md`

### Estado

- **UX de entrada en Products:** implementada en código y desplegada en producción (commit `3ff579d`).
- **Validación real ejecutada (2026-04-15):**
  - `POST /cj/search` → retorna productos reales CJ ✅
  - `GET /cj/product/:id` → retorna variantes reales con `cjVid` ✅
  - `POST /pricing/preview` con `cjVid` real → retorna breakdown completo, sin error 500 ✅
  - Bug `imageUrls` (JSON array string) corregido en adapter (commit siguiente) ✅
- **No es FASE 3F completa.** La FASE 3F del plan maestro comprende workers BullMQ, sistema de alertas y dashboard de profit. Eso sigue pendiente.
- Esta mejora es la **entrada usable al ciclo** — reemplaza el flujo de IDs manuales por búsqueda visual — sin ampliar el alcance de las demás fases.

### Fix stock-awareness — 2026-04-15 (commit `d51aa7a`)

**Síntoma:** todos los productos en buscador y picker de variantes mostraban `stock: 0`.

**Causas raíz corregidas:**
1. `parseVariantRow` solo leía `storageNum` — CJ usa también `inventoryNum`, `inventory`, `stock`, `quantity`. Fix: aliases en cascada.
2. `getStockForSkus` / `product/stock/queryByVid` devuelve `data` como array. `asRecord(array)` → null → 0 siempre. Fix: `extractCjStockNum` maneja array y objeto.
3. `rowToSummary` no capturaba `inventoryTotal` de `product/listV2`. Fix: lectura de `inventoryNum/inventory/inventoryQuantity/stock`.

**UX resultante:**
- Sección B: resultados ordenados stock>0 > desconocido > 0; badge verde/amber por card; warning si todos son 0.
- Sección C: etiqueta de stock por variante con color; dimmed si stock 0; banner si todas las variantes son 0.
- Sección C variante única: badge verde/amber según stock.
- Ruta `/cj/search` emite `stockCoverage: { withStock, unknownStock, zeroStock }` para diagnóstico.

---

## FASE 3E.5 — Postventa CJ: UI propia, ruta aislada, detalle por orden (2026-04-15)

### Causa raíz detectada (auditoría)

El módulo CJ → eBay USA **ya estaba correctamente enrutado** (`/cj-ebay/orders` → `CjEbayOrdersPage`). No había mezcla de routing ni de API. El problema real era:

1. **`CjEbayOperatorPathCallout`** incluía un bullet que enlazaba a la ruta legacy `/orders` desde dentro del módulo CJ, generando confusión visual y operativa.
2. **No existía ruta de detalle propia** (`/cj-ebay/orders/:orderId`). El detalle era un expand inline en la tabla, sin URL propia, sin usar los endpoints `operational-flow` ni `evidence-summary`.
3. La tabla de órdenes carecía de columnas de fecha, total USD y colores de estado.

### Cambios de routing

| Ruta | Estado anterior | Estado actual |
|---|---|---|
| `/cj-ebay/orders` | `CjEbayOrdersPage` ✓ | Igual ✓ (sin cambio) |
| `/cj-ebay/orders/:orderId` | No existía | **Nueva → `CjEbayOrderDetailPage`** |
| `/orders` (legacy) | Sin cambio | Sin cambio ✓ |

### Cambios en sidebar / menú

Sin cambios. El ítem `{ path: '/cj-ebay/orders', label: 'Órdenes', icon: Truck }` ya apuntaba correctamente a la ruta propia del módulo.

### Cómo quedó CJ → eBay USA → Orders

**`CjEbayOrdersPage`** (`/cj-ebay/orders`):
- Banner de readiness del ciclo postventa (Import / Place / Confirm / Pay / Tracking / Validación viva).
- KPI strip: total órdenes · en progreso · fallo/manual.
- Tabla con columnas: eBay order · Estado (badge con color semántico) · CJ order · SKU · Total USD · Actualizado · Acciones.
- Botón **Detalle** navega a `/cj-ebay/orders/:orderId` (ya no expande inline).
- Acciones rápidas (Place CJ / CJ status / Tracking / Confirmar / Pagar) disponibles por fila.
- El callout de operador ya **no enlaza a legacy `/orders`**.

### Cómo quedó el detalle de orden (`CjEbayOrderDetailPage`)

**`CjEbayOrderDetailPage`** (`/cj-ebay/orders/:orderId`):
- Header con eBay order ID, badge de estado con color, botón refrescar, breadcrumb "Órdenes".
- Sección **Datos de la orden**: mapping eBay ↔ CJ completo (ebayOrderId, cjOrderId, ebaySku, qty, totalUsd, listingId, ebayListingId, cjConfirmedAt, cjPaidAt).
- Sección **Acciones del ciclo postventa**: 5 botones (Place CJ / Confirmar / Pagar / Actualizar estado / Sync tracking) habilitados según estado actual. Spinner individual por acción.
- Sección **Tracking** (si existe): estado, número de tracking, carrier.
- Sección **Timeline de eventos**: lista cronológica de todos los `OrderEvent` con step, mensaje y timestamp.
- Sección **Flujo operacional** (nuevo): consume `GET /api/cj-ebay/orders/:orderId/operational-flow`. Muestra `suggestedNext`, gates del flujo (met/pendiente), últimas trazas.
- Sección **Evidencia resumida** (nueva, colapsable): consume `GET /api/cj-ebay/orders/:orderId/evidence-summary`. Audit trail para referencia.
- Sección **Raw eBay summary** (colapsable): payload eBay original.
- Banners de error y confirmación de acciones propios del módulo CJ.

### Endpoints que usa la vista CJ Orders

| Endpoint | Usado en |
|---|---|
| `GET /api/cj-ebay/orders` | Lista de órdenes (orders page) |
| `POST /api/cj-ebay/orders/import` | Import por ebayOrderId |
| `GET /api/cj-ebay/orders/:orderId` | Detalle base |
| `GET /api/cj-ebay/orders/:orderId/status` | Sync estado CJ |
| `GET /api/cj-ebay/orders/:orderId/operational-flow` | Gates + suggested next |
| `GET /api/cj-ebay/orders/:orderId/evidence-summary` | Audit trail |
| `POST /api/cj-ebay/orders/:orderId/place` | Place CJ order |
| `POST /api/cj-ebay/orders/:orderId/confirm` | Confirm CJ order |
| `POST /api/cj-ebay/orders/:orderId/pay` | Pay CJ balance |
| `POST /api/cj-ebay/orders/:orderId/sync-tracking` | Sync tracking |

Todos bajo el prefijo `/api/cj-ebay/`. **Cero dependencia de `/api/orders`.**

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `frontend/src/pages/cj-ebay/CjEbayOrderDetailPage.tsx` | **Nuevo** — página de detalle con timeline, flujo operacional, evidencia, acciones |
| `frontend/src/pages/cj-ebay/CjEbayOrdersPage.tsx` | Reescrito — sin inline detail, navega al detalle, columns mejoradas, status badges, readiness banner |
| `frontend/src/App.tsx` | Nueva ruta `orders/:orderId` dentro del módulo CjEbay |
| `frontend/src/components/cj-ebay/CjEbayOperatorPathCallout.tsx` | Eliminado el link a legacy `/orders`; callout ahora scoped al módulo |
| `docs/CJ_EBAY_USA_MASTER_PLAN.md` | Este bloque |
| `docs/CJ_EBAY_USA_POSTSALE_UI_FLOW.md` | Nuevo documento de referencia del flujo UI postventa |

### Estado del ciclo postventa (2026-04-15)

| Paso | Estado en código | Pendiente |
|---|---|---|
| Import orden eBay | ✅ Listo | — |
| Place CJ (createOrderV2) | ✅ Listo | — |
| Confirm CJ (confirmOrder) | ✅ Listo | — |
| Pay CJ (payBalance) | ✅ Listo | Requiere `CJ_PHASE_D_ALLOW_PAY=true` en producción |
| Sync tracking desde CJ | ✅ Listo | — |
| Validación con cuenta real | ⏳ Pendiente | Primera orden real en cuenta CJ activa |
| Workers BullMQ (FASE 3F) | ⏳ Pendiente | Sin iniciar hasta criterio explícito post-3E.4 |

---

---

## FASE 3F — Devoluciones / Refunds · Guardrail pago proveedor · Consola financiera · Alertas reales

**Fecha de implementación:** 2026-04-15  
**Versión:** 2.16

---

### Auditoría previa (estado real antes de FASE 3F)

| Área | Estado anterior |
|---|---|
| Devoluciones / refunds | **Inexistente** — sin modelo, sin estados, sin UI |
| Guardrail saldo CJ insuficiente | **Inexistente** — `payCjOrder` trataba todos los errores igual (NEEDS_MANUAL genérico) |
| Consola financiera `/cj-ebay/profit` | **Placeholder vacío** — `CjEbayProfitPage` solo mostraba texto estático |
| Alertas `/cj-ebay/alerts` | **Placeholder vacío** — `CjEbayAlertsPage` solo mostraba texto estático |
| Confusión CJ vs PayPal | **No presente** — la vertical usa `payBalance` CJ correctamente |

---

### FASE 3F.1 — Guardrail pago a proveedor (saldo CJ insuficiente)

#### Problema resuelto

`payCjOrder` capturaba todos los errores de `adapter.payBalance()` con un handler genérico que dejaba la orden en `CJ_PAYMENT_PENDING` + `NEEDS_MANUAL`. No distinguía saldo insuficiente de otros fallos.

#### Solución implementada

**Nuevo estado de orden:** `SUPPLIER_PAYMENT_BLOCKED`  
**Nuevo campo en DB:** `paymentBlockReason` (texto) en `cj_ebay_orders`  
**Nuevo error code:** `CJ_INSUFFICIENT_BALANCE` en `CjSupplierErrorCode`  
**Constante:** `CJ_EBAY_PAYMENT_BLOCK_REASON.CJ_BALANCE_INSUFFICIENT`

**Detección:** función `isCjBalanceInsufficientError(msg)` en `cj-ebay-cj-checkout.service.ts` — detecta patrones en el mensaje de error CJ:
- `"insufficient balance"`, `"balance is not enough"`, `"insufficient funds"`, `"余额不足"`, `"no balance"`, código `1600001`.

**Flujo:**
1. `adapter.payBalance()` falla.
2. `isCjBalanceInsufficientError()` → `true`.
3. Orden pasa a `SUPPLIER_PAYMENT_BLOCKED` con `paymentBlockReason = CJ_BALANCE_INSUFFICIENT`.
4. Evento registrado en `cj_ebay_order_events`.
5. Trace `cj.order.pay.balance_blocked`.
6. HTTP 402 con mensaje accionable para el operador.
7. La UI (`CjEbayOrderDetailPage`) muestra un **banner rojo** con instrucción de recarga.
8. El estado `SUPPLIER_PAYMENT_BLOCKED` está incluido en `PAY_FROM` → permite reintentar `/pay` después de recargar balance.

**UI — Orders page:**  
`SUPPLIER_PAYMENT_BLOCKED` aparece como badge rojo "Pago bloqueado" con `NEXT_STEP` = "Recargar balance CJ y reintentar".

**payBalanceV2:** sigue sin implementarse. Documentado como pendiente. Si la cuenta real lo exige, la orden quedará bloqueada con el guardrail hasta que se implemente o se use `payBalance` estándar.

---

### FASE 3F.2 — Modelo de devoluciones / refunds (semi-manual)

#### Contexto

CJ Dropshipping **no expone una API formal de returns/refunds** en el flujo actual (`payType=3` / `payBalance`). El modelo implementado es **semi-manual con trazabilidad completa**: el operador registra y avanza los estados; la coordinación con CJ y eBay se realiza manualmente desde sus portales.

#### Modelo de datos

**Nueva tabla:** `cj_ebay_order_refunds` — modelo `CjEbayOrderRefund` en Prisma.

| Campo | Descripción |
|---|---|
| `orderId` | FK a `cj_ebay_orders` |
| `status` | Estado del ciclo (ver máquina de estados) |
| `refundType` | `FULL` / `PARTIAL` |
| `amountUsd` | Monto del reembolso (null = total de la orden) |
| `reason` | Razón del retorno (texto libre) |
| `ebayReturnId` | ID del caso eBay si el comprador abrió return request |
| `cjRefundRef` | Referencia CJ manual si aplica |
| `events` | Timeline append-only (JSON array) |
| `notes` | Notas internas del operador |

#### Máquina de estados (semi-manual)

```
RETURN_REQUESTED
  ├──► RETURN_APPROVED ──► RETURN_IN_TRANSIT ──► RETURN_RECEIVED ──► REFUND_PENDING
  │                                                                        │
  ├──► RETURN_REJECTED                                                     ├──► REFUND_PARTIAL ──► REFUND_COMPLETED
  │                                                                        ├──► REFUND_COMPLETED (terminal)
  └──► NEEDS_MANUAL_REFUND ◄──────────────── (cualquier estado) ──────────└──► REFUND_FAILED ──► REFUND_PENDING (retry)
```

Transiciones inválidas son bloqueadas por el servicio con error 400.

#### Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/cj-ebay/orders/:orderId/refunds` | Crear refund (RETURN_REQUESTED) |
| `GET` | `/api/cj-ebay/orders/:orderId/refunds` | Listar refunds de una orden |
| `PATCH` | `/api/cj-ebay/orders/:orderId/refunds/:refundId` | Avanzar estado |

#### UI

- Sección **"Devoluciones / Reembolsos"** en `CjEbayOrderDetailPage` (después de Tracking, antes de Eventos).
- Botón "+ Abrir devolución" abre formulario inline.
- Lista de refunds existentes con timeline colapsable.
- Nota de honestidad: "CJ no expone API formal de returns — flujo semi-manual".

---

### FASE 3F.3 — Consola financiera profesional (`/cj-ebay/profit`)

#### Qué existía

`CjEbayProfitPage` era un placeholder con texto estático. `CjEbayProfitSnapshot` existía en el schema pero no tenía datos ni servicio.

#### Qué se implementó

**Nuevo servicio:** `cj-ebay-profit.service.ts`

Calcula KPIs desde:
- `cj_ebay_orders` (totalUsd, status, cjPaidAt)
- `cj_ebay_listings` → `cj_ebay_product_evaluations` (estimatedMarginPct)
- `cj_ebay_order_refunds` (devoluciones activas y completadas)
- `cj_ebay_profit_snapshots` (snapshots históricos cuando existan)

**KPIs implementados:**

| KPI | Tipo | Fuente |
|---|---|---|
| Ingresos brutos eBay | Real (sumado) | `totalUsd` de órdenes activas |
| Costo proveedor CJ | **Estimado** | `totalUsd * (1 - marginPct)` |
| Utilidad bruta | **Estimada** | `totalUsd * marginPct` |
| Margen promedio | **Estimado** | Promedio de `estimatedMarginPct` |
| Total / activas / completadas / atención / bloqueadas | Real | Conteo por status |
| Refunds activos / completados / monto devuelto | Real | `cj_ebay_order_refunds` |

**HONESTIDAD:** los campos estimados se marcan explícitamente en UI con nota. La utilidad realizada requiere la factura real de CJ (no disponible en este flujo).

**Endpoint:** `GET /api/cj-ebay/profit?from=ISO&to=ISO`

**UI:**
- KPI cards (ingresos, costo, utilidad, margen)
- KPI operativos (estados de órdenes, refunds)
- Nota de honestidad en banner ámbar
- Tabla de desglose por orden (con profit estimado por fila, highlight rojo si pérdida)
- Filtros por fecha y búsqueda libre

---

### FASE 3F.4 — Motor de alertas real (`/cj-ebay/alerts`)

#### Qué existía

`CjEbayAlertsPage` era un placeholder. `CjEbayAlert` existía en schema pero sin creación ni resolución.

#### Qué se implementó

**Nuevo servicio:** `cj-ebay-alerts.service.ts`

**Tipos de alerta implementados:**

| Tipo | Severidad | Descripción |
|---|---|---|
| `REFUND_PENDING` | warning | Reembolso pendiente de emisión |
| `RETURN_IN_PROGRESS` | warning | Devolución activa en seguimiento |
| `SUPPLIER_PAYMENT_BLOCKED` | error | Balance CJ insuficiente — acción requerida |
| `ORDER_FAILED` | error | Orden en estado FAILED |
| `ORDER_NEEDS_MANUAL` | warning | Orden requiere intervención manual |
| `TRACKING_MISSING` | warning | Orden enviada sin número de tracking |
| `REFUND_COMPLETED` | info | Reembolso procesado exitosamente |
| `REFUND_FAILED` | error | Reembolso fallido |
| `ORDER_LOSS` | warning | Margen estimado negativo |

**Creación automática:** las alertas de refund (`REFUND_PENDING`, `REFUND_COMPLETED`, `REFUND_FAILED`) se crean automáticamente desde `cj-ebay-refund.service.ts`. No se duplican si ya existe una OPEN para la misma orden.

**Endpoints:**

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/cj-ebay/alerts?status=OPEN` | Listar alertas |
| `POST` | `/api/cj-ebay/alerts/:id/acknowledge` | Marcar como vista |
| `POST` | `/api/cj-ebay/alerts/:id/resolve` | Resolver (cerrar) |

**UI:**
- Lista de cards con color por severidad (rojo=error, ámbar=warning, azul=info)
- Filtro por estado (Todas / Abiertas / Vistas / Resueltas)
- Acciones: "Marcar vista" + "Resolver" por alerta
- Estado vacío informativo cuando no hay alertas

---

### Archivos creados (FASE 3F)

| Archivo | Descripción |
|---|---|
| `backend/src/modules/cj-ebay/services/cj-ebay-refund.service.ts` | Servicio de devoluciones/refunds |
| `backend/src/modules/cj-ebay/services/cj-ebay-alerts.service.ts` | Servicio de alertas del módulo |
| `backend/src/modules/cj-ebay/services/cj-ebay-profit.service.ts` | Servicio de KPIs financieros |
| `backend/prisma/migrations/20260415180000_cj_ebay_phase3f_refunds_guardrail/migration.sql` | SQL de la migración |

### Archivos modificados (FASE 3F)

| Archivo | Cambio |
|---|---|
| `backend/src/modules/cj-ebay/cj-ebay.constants.ts` | `SUPPLIER_PAYMENT_BLOCKED`, `CJ_EBAY_PAYMENT_BLOCK_REASON`, `CJ_EBAY_REFUND_STATUS`, `CJ_EBAY_ALERT_TYPE`, nuevos trace steps |
| `backend/src/modules/cj-ebay/adapters/cj-supplier.errors.ts` | `CJ_INSUFFICIENT_BALANCE` error code |
| `backend/src/modules/cj-ebay/services/cj-ebay-cj-checkout.service.ts` | Guardrail balance: `isCjBalanceInsufficientError`, `SUPPLIER_PAYMENT_BLOCKED`, retry desde ese estado |
| `backend/src/modules/cj-ebay/cj-ebay.routes.ts` | Rutas `/orders/:id/refunds`, `/alerts`, `/profit` |
| `backend/prisma/schema.prisma` | `CjEbayOrderRefund` model, `paymentBlockReason` en `CjEbayOrder`, relación en `User` |
| `frontend/src/pages/cj-ebay/CjEbayProfitPage.tsx` | Reescrito — implementación real con KPIs + tabla |
| `frontend/src/pages/cj-ebay/CjEbayAlertsPage.tsx` | Reescrito — implementación real con lista + acknowledge |
| `frontend/src/pages/cj-ebay/CjEbayOrderDetailPage.tsx` | Sección refunds, banner pago bloqueado, `canPay` expandido |
| `frontend/src/pages/cj-ebay/CjEbayOrdersPage.tsx` | `SUPPLIER_PAYMENT_BLOCKED` en labels, colors, next step, filtros |

---

### Estado del ciclo postventa (2026-04-15, post-FASE 3F)

| Componente | Estado | Pendiente |
|---|---|---|
| Import orden eBay | ✅ | — |
| Place / Confirm / Pay CJ | ✅ | Validación con cuenta real |
| Guardrail saldo CJ insuficiente | ✅ | Validar con error real de CJ |
| Sync tracking | ✅ | — |
| Devoluciones / refunds | ✅ semi-manual | API CJ de returns (no disponible) |
| Consola financiera | ✅ estimados | Integrar factura real CJ |
| Alertas reales | ✅ | Poblar desde más eventos |
| Warehouse-Aware Fulfillment (FASE 3W) | ✅ | `CJ_EBAY_WAREHOUSE_AWARE=false` default; activar en Railway para habilitar |
| Workers BullMQ (FASE 3G) | ⏳ | Pendiente post-3E.4 en cuenta real |
| payBalanceV2 | ⏳ | No implementado — contrato distinto |

---

---

## Hotfix 2026-04-16 — "Database error" en POST /evaluate (FASE 3W)

### Causa raíz exacta

`POST /api/cj-ebay/evaluate` fallaba con `PrismaClientKnownRequestError` ("Database error")
al intentar `prisma.cjEbayShippingQuote.create` con el campo `originCountryCode` introducido por FASE 3W.

La migración `20260416200000_cj_ebay_warehouse_aware_origin` (que añade la columna a
`cj_ebay_shipping_quotes`) **nunca se aplicó en Railway** porque:

- `railway.toml` tenía `startCommand = "npm run start"` → solo arranca el servidor, **sin `prisma migrate deploy`**.
- El Release Command (`node scripts/railway-migrate-deploy.js`) estaba documentado como comentario
  en `railway.toml` pero **no era un campo versionado** — dependía de configuración manual en Railway UI
  que nunca se completó (o no persistió entre deploys).
- Resultado: columna `originCountryCode` inexistente en producción → `PrismaClientKnownRequestError`.

**Evidencia de que es FASE 3W y no un bug previo:** `preview` (sin DB writes) funcionaba; solo `evaluate`
(que escribe `originCountryCode`) fallaba.

### Tabla/columna afectada

| Tabla | Columna | Tipo | Nullable | Default |
|---|---|---|---|---|
| `cj_ebay_shipping_quotes` | `originCountryCode` | `TEXT` | Sí | `'CN'` |

### Fix aplicado (commit `43fc9c9`)

| Archivo | Cambio |
|---|---|
| `railway.toml` | Añadido `releaseCommand = "node scripts/railway-migrate-deploy.js"` — ahora versiona la migración en el pipeline de deploy, no depende de UI |
| `backend/Procfile` | Cambio a `npm run start:prod` (incluye `prisma migrate deploy`) como safety net |
| `backend/src/middleware/error.middleware.ts` | Expone `prismaCode` / `prismaMeta` en details del error Database error para diagnóstico futuro |
| `frontend/src/pages/cj-ebay/CjEbayProductsPage.tsx` | FASE 5 UX: badge de origen logístico (🇺🇸/🇨🇳) + ETA en la sección de producto seleccionado, visible **antes** de ejecutar Evaluar |

### Flujo de Railway tras el fix

```
push → build (npm ci && npm run build → prisma generate + tsc)
     → releaseCommand (node scripts/railway-migrate-deploy.js → prisma migrate deploy)
     → startCommand (npm run start → node dist/server-bootstrap.js)
```

### Estado del pipeline post-fix

| Flujo | Estado |
|---|---|
| search → preview | ✅ sin cambios |
| search → preview → evaluate → persist | ✅ restaurado |
| evaluate → draft listing | ✅ sin cambios |
| warehouse-aware (originCountryCode) | ✅ persiste correctamente en DB |
| UX: origen/ETA antes de Evaluar | ✅ nuevo (FASE 5) |

---

---

## Hotfix 2026-04-16 — Publish FAILED por eBay 25002 "Offer entity already exists"

### Causa raíz exacta

`POST /api/cj-ebay/listings/publish` terminaba en estado `FAILED` con mensaje:

```
eBay listing creation error: La oferta ya existe en eBay (offerId: 152707440011).
No se pudo obtener el listing; revisa en Seller Hub si ya está publicado...
```

**Secuencia real del fallo:**

1. `createListing()` llama `cleanupUnpublishedOffersForSku(sku)` — sólo elimina offers sin `listingId`; la offer publicada (id 152707440011) no se toca.
2. POST `/sell/inventory/v1/offer` → eBay devuelve **error 25002** "Offer entity already exists" (ya existe para SKU `CJE1P1V1`).
3. `handleOfferAlreadyExists()` extrae `offerId = 152707440011`.
4. GET `/sell/inventory/v1/offer/152707440011` → `listingId: null` (inconsistencia temporal de la API eBay).
5. POST `/sell/inventory/v1/offer/152707440011/publish` → falla con 25002 "already published".
6. Todos los reintentos agotados → catch genérico → **status = `FAILED`**.

La oferta **sí existía en eBay**. El problema era la inconsistencia de la API eBay al devolver `listingId: null` y la ausencia de un estado diferenciado.

### Fix (commit en main, 2026-04-16)

| Archivo | Cambio |
|---|---|
| `ebay.service.ts` — `handleOfferAlreadyExists()` | Early-return si getOffers por SKU incluye `listingId`; final fallback GET por SKU; tagged error con `ebayOfferAlreadyExists=true` + `resolvedOfferId`; outer catch preserva el tag sin re-wrap |
| `cj-ebay.constants.ts` | Nuevo status `OFFER_ALREADY_EXISTS`; trace steps `LISTING_PUBLISH_OFFER_ALREADY_EXISTS`, `LISTING_RECONCILE_*` |
| `cj-ebay-listing.service.ts` | `publish()` detecta tag y guarda `OFFER_ALREADY_EXISTS` + offerId; guardrail bloquea re-publish; nuevo `reconcile()` |
| `cj-ebay.routes.ts` | `POST /listings/:id/reconcile` |
| `CjEbayListingsPage.tsx` | Badge `OFFER EXISTS`, banner informativo, botón Reconciliar, detalle explicativo |

### Estados de listing post-fix

| Estado | Causa | Acción |
|---|---|---|
| `DRAFT` | Creado, no publicado | Publicar |
| `ACTIVE` | Publicado correctamente | — |
| `FAILED` | Error genérico | Revisar log, reintentar |
| `ACCOUNT_POLICY_BLOCK` | Error 25019 — cuenta no autorizada | Esperar aprobación eBay |
| `OFFER_ALREADY_EXISTS` | Error 25002 — offer existe, listingId no recuperado aún | **Reconciliar** (no Publicar) |

### Advertencia ENCRYPTION_SALT (independiente del incidente)

Logs muestran `"Usando salt por defecto..."`. No es bloqueante. Acción post-incidente: configurar `ENCRYPTION_SALT` como variable de entorno Railway con valor aleatorio de 64 chars.

---

*Fin del documento v2.19 (actualizado 2026-04-16).*

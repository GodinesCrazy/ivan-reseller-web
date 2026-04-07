# Auditoría — Ciclo real de dropshipping end-to-end

**Alcance:** Repositorio `Ivan_Reseller_Web` (backend Node/TS, frontend React).  
**Estado de producción / Railway:** **No verificado** en esta auditoría (sin acceso a despliegue ni credenciales reales).

---

## Mapa del ciclo (11 pasos)

| # | Paso | Automatizado | Semiautomático | Manual / dependiente | Evidencia (código) |
|---|------|--------------|----------------|----------------------|-------------------|
| 1 | Hallazgo de oportunidad | **Parcial** | Sí | Filtros, credenciales scraper/Ali | `opportunity-finder.service.ts`, `AIOpportunityEngine`, `Opportunities.tsx` |
| 2 | Validación económica | **Parcial** | Sí | Reglas y fees simplificados | `cost-calculator.service.ts`, `profitability.service.ts`, `financial-calculations.service.ts` |
| 3 | Asset del producto | **Parcial** | Sí | Imágenes ML: pipeline canónico + remediación | `mercadolibre-image-remediation.service.ts`, `ml-chile-canonical-pipeline.service.ts`, `mercadolibre.publisher.ts` |
| 4 | Traducción / localización | **Parcial** | Sí | Política idioma CL→es; no traducción automática completa verificada en publish | `listing-language-policy.service.ts`, `marketplace-context.service.ts`, `pre-publish-validator.service.ts` |
| 5 | Pricing final | **Parcial** | Sí | Múltiples rutas; riesgo de inconsistencia | Varios servicios de coste; `resolvePrice` en publisher |
| 6 | Publicación marketplace | **Sí (código)** | Credenciales OAuth, políticas ML | `MarketplaceService.publishProduct`, `MercadoLibrePublisher.publishProduct`, `MercadoLibreService.createListing` |
| 7 | Estabilidad post-publicación | **Parcial** | Sync jobs, métricas | `mercadolibre-metrics-ingestion.service.ts`, scripts internos (no probados aquí) |
| 8 | Monitoreo de órdenes | **Parcial** | Webhooks + sync | `webhooks.routes.ts`, `mercadolibre-order-sync.service.ts` |
| 9 | Compra al proveedor | **Sí (si API/capital/URL OK)** | Límites diarios, capital, DS | `order-fulfillment.service.ts` → `purchaseRetryService.attemptPurchase` |
| 10 | Tracking / fulfillment | **Parcial** | eBay/ML reglas distintas | Comentarios Phase 39 en `order-fulfillment.service.ts` |
| 11 | Entrega / fondos / profit real | **Parcial** | `Sale` / ladder; no verificado en prod | `recordSaleFromWebhook`, `PostSaleProofLadderPanel.tsx` (UI advierte límites) |

---

## Hallazgos (formato obligatorio)

### F-001
- **Área:** E2E
- **Título:** Publicación ML bloqueada si imágenes no son `publishSafe`
- **Estado:** **Verificado** (código)
- **Severidad:** Informativa (diseño intencional)
- **Impacto técnico:** `MercadoLibrePublisher.publishProduct` llama `resolveMercadoLibrePublishImageInputs`; si falla, no publica.
- **Impacto operativo:** Operador debe resolver pack / remediación / revisión humana.
- **Impacto económico:** Evita publicar listing con portada no compliant o bajo floor comercial (P85/P86).
- **Impacto autonomía:** Aumenta rechazos automáticos correctos; reduce ventas “mal listadas”.
- **Evidencia:** `backend/src/modules/marketplace/mercadolibre.publisher.ts` (líneas ~100–113).
- **Riesgo si no se entiende:** Usuario cree que “el bot no publica” por bug; es gate.
- **Recomendación:** UI debe mostrar `publishSafe` y razones (parcialmente hecho vía operational truth).
- **Bloquea prueba real:** No (si assets y credenciales OK).
- **Bloquea escalado:** No.

### F-002
- **Área:** E2E / Postventa
- **Título:** Webhook ML → orden PAID → `fulfillOrder` inmediato
- **Estado:** **Verificado** (código)
- **Severidad:** Alta si webhooks o credenciales AliExpress DS fallan
- **Impacto técnico:** `webhooks.routes.ts` `recordSaleFromWebhook` crea `Order` y llama `orderFulfillmentService.fulfillOrder`.
- **Impacto operativo:** Compra automática o notificación “Compra manual requerida”.
- **Impacto económico:** Depende de capital libre, límites diarios, precio proveedor vs `order.price`.
- **Impacto autonomía:** Alto cuando todo está configurado; frágil si falta `aliexpressUrl` o formato URL item.
- **Evidencia:** `webhooks.routes.ts` ~192–217; `order-fulfillment.service.ts` ~134–162.
- **Riesgo:** Orden creada pero `fulfillOrder` falla (capital, API, URL).
- **Recomendación:** Prueba real debe incluir verificación webhook ML firmado + DS OAuth usuario.
- **Bloquea prueba real:** **Sí** si webhooks no llegan o credenciales incompletas.
- **Bloquea escalado:** **Sí** (postventa es core).

### F-003
- **Área:** E2E / Pricing
- **Título:** Múltiples modelos de coste (calculator vs profitability vs financial)
- **Estado:** **Parcialmente verificado**
- **Severidad:** Media–Alta
- **Impacto técnico:** Divergencia posible entre “precio sugerido” en oportunidades y precio en publish.
- **Impacto operativo:** Decisiones de margen inconsistentes.
- **Impacto económico:** Pérdida o precio no competitivo.
- **Impacto autonomía:** Reduce confianza en autopilot.
- **Evidencia:** Tres servicios distintos en `backend/src/services/` y `profitability.service.ts`.
- **Recomendación:** Prerequisite prueba real: una sola fuente de verdad para precio publicado + auditoría de fees ML Chile.
- **Bloquea prueba real:** **Recomendado corregir antes** (riesgo económico).
- **Bloquea escalado:** **Sí**.

### F-004
- **Área:** E2E
- **Título:** `fulfillOrder` resuelve `productUrl` primero desde producto; listing eBay para supplier en fallback
- **Estado:** **Verificado** (código)
- **Severidad:** Media
- **Impacto técnico:** Para ML, producto debe tener `aliexpressUrl` guardado.
- **Impacto operativo:** Sin URL, orden queda PAID con mensaje de error en español.
- **Evidencia:** `order-fulfillment.service.ts` ~99–145.
- **Bloquea prueba real:** **Sí** si el producto publicado no tiene `aliexpressUrl` consistente.

---

## Conclusión sección A

El **código** describe un ciclo E2E **cerrable**: oportunidad → producto → publish (con gates de imagen) → webhook → orden → compra AliExpress. La **prueba real** depende de configuración externa **no verificada** aquí (OAuth ML, webhook secreto, AliExpress Dropshipping por usuario, capital, precios correctos).

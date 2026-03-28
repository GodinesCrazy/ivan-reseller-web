# Minimum import truth contract (Opportunities → Products)

## Alcance

Aplica cuando el cliente envía `importSource: "opportunity_search"` en `POST /api/products` (flujo real de la página Opportunities).

## Garantías en `productData` (raíz del JSON)

| Campo / bloque | Contenido |
|----------------|-----------|
| `importSource` | `"opportunity_search"` |
| `opportunityImport.importSource` | `"opportunity_search"` |
| `opportunityImport.importedAt` | ISO timestamp |
| `opportunityImport.aliExpressItemId` | ID de ítem AliExpress cuando se conoce (payload `aliExpressItemId` o parseo de URL `/item/<id>`) |
| `opportunityImport.targetMarketplaces` | Lista enviada por el frontend (intención de publicación) |
| `preventivePublish.marketplace` | Primer marketplace normalizado (`mercadolibre`, `ebay`, `amazon`) o `mercadolibre` por defecto |
| `preventivePublish.shipCountry` | `targetCountry` del DTO si existe |
| `preventivePublish.resolvedLanguage` | `"es"` por defecto |
| `preventivePublish.selectedSupplier` | Objeto mínimo con `productId` (ítem AE), `skuId` null hasta enriquecer, `source: "opportunity_import_pending_sku"` |

## Garantías tras enriquecimiento (Affiliate API, mismo request)

Si las credenciales **aliexpress-affiliate** (production) del usuario están configuradas:

| Campo DB | Origen |
|----------|--------|
| `aliexpressSku` | Primer SKU con stock > 0 si existe; si no, primer SKU con id (honesto si no hay variantes en respuesta) |
| `shippingCost` | `shippingInfo.shippingCost` de `getProductDetails` si el producto aún no tenía envío persistido; **0** es válido (envío gratis) |
| `totalCost` | Se recalcula si faltaba: `aliexpressPrice + shippingCost + importTax` (tax 0 si null) |

`productData.opportunityImport` se actualiza con `affiliateEnrichment`: `ok` | `partial` | `failed` | `skipped` y razón cuando aplica.

## Lo que no se promete en import

- SKU definitivo para todas las variantes sin respuesta de API (si la API no devuelve SKUs, el producto puede seguir bloqueado por `missingSku` de forma honesta).
- Cumplimiento de política preventiva completa: en `PENDING` se usa el bloqueador explícito `preventiveAuditPending` hasta pasar auditorías posteriores.
- URLs acortadas sin ID de ítem ni `aliExpressItemId`: no se puede enriquecer hasta que exista ID resoluble.

## Downstream

Publicación y `pre-publish` siguen siendo la fuente de verdad final; este contrato evita “caparazones” vacíos y alinea la reconciliación operativa con datos reales o explícitamente pendientes.

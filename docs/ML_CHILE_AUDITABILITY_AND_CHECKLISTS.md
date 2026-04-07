# ML Chile Auditability and Checklists
**Fecha:** 2026-04-04

---

## Logs del Sistema — Mapa de Cobertura

### Logs de Publicación

| Evento | Logger | Datos clave |
|---|---|---|
| Pre-publish preventive validation | `[ML Publish]` | productId, marketplace, price |
| Token refresh antes de publicar | `[ML Publish] Token refreshed` | userId, env |
| Imágenes seleccionadas | `[ML Publish] Using pre-publish ML-compliant image inputs` | count |
| Footer appended | `[ML Publish] ML Chile import footer appended` | productId, footerAppended |
| Business truth at publish | `[ML-CHILE-COMPLIANCE] Business truth at publish time` | origin, eta, shippingTruth, legalTexts, readiness |
| createListing attempt | `[MercadoLibre] createListing attempt` | title, price, category, pictureCount |
| me2 enforced | `[MercadoLibre] me2 shipping enforced post-creation` | itemId, handlingTime |
| me2 NOT enforced | `[MercadoLibre] SHIPPING_TRUTH_NOT_ENFORCED_ON_ML` | itemId, error, impact |
| Listing status post-creation | `[MARKETPLACE] ML listing created but NOT active` | itemId, mlStatus |
| Shipping truth status persisted | (en updateProductMarketplaceInfo) | shippingTruthStatus, legalTextsAppended |

### Logs de Fulfillment (Post-Venta)

| Evento | Logger | Datos clave |
|---|---|---|
| fulfillOrder start | `[ORDER-FULFILLMENT]` | orderId, status |
| Daily limits check | `[ORDER-FULFILLMENT]` | limitCheck result |
| Shipping address parsed | `[ORDER-FULFILLMENT]` | address fields |
| productUrl resolved | `[ORDER-FULFILLMENT]` | source (product/listing) |
| Freight truth at order time | `[ORDER-TIME-FREIGHT]` | freightCost, country |
| Profitability gate | `[ORDER-TIME-FREIGHT]` | saleUsd, costUsd, profitUsd, ok/blocked |
| AliExpress DS purchase | `[ORDER-FULFILLMENT]` | aliexpressOrderId |
| Order PURCHASED | `[ORDER-FULFILLMENT]` | final status |
| Order FAILED | `[ORDER-FULFILLMENT]` | error, escalated |
| Manual queue escalation | `[ORDER-FULFILLMENT]` | orderId, MANUAL_ACTION_REQUIRED |

### Logs de Shipping Truth

| Evento | Logger | Datos clave |
|---|---|---|
| Business truth at publish | `[ML-CHILE-COMPLIANCE]` | originCountry, etaLabel, etaBasis, shippingTruthStatus, legalTextsAppended |

---

## Campos Auditables en Base de Datos

### `marketplace_listings` (nuevos campos)

```sql
shippingTruthStatus    VARCHAR  -- me2_enforced | me2_attempted_not_enforced | not_specified | unknown
legalTextsAppended     BOOLEAN  -- true si footer legal fue incluido en descripción al publicar
importHandlingTimeDays INTEGER  -- días de handling configurados al momento de publicar
```

**Queries útiles para auditoría:**

```sql
-- Listings sin textos legales (publicados antes de la implementación)
SELECT id, listingId, publishedAt FROM marketplace_listings
WHERE marketplace = 'mercadolibre' AND legalTextsAppended = false AND status = 'active';

-- Listings con shipping truth problem
SELECT id, listingId, shippingTruthStatus FROM marketplace_listings
WHERE marketplace = 'mercadolibre' AND shippingTruthStatus = 'me2_attempted_not_enforced';

-- Listings publicados con handling time alto (>40 días)
SELECT id, listingId, importHandlingTimeDays FROM marketplace_listings
WHERE marketplace = 'mercadolibre' AND importHandlingTimeDays > 40;
```

### `orders` (campos existentes)

```sql
status                 VARCHAR  -- CREATED|PAID|PURCHASING|PURCHASED|FAILED|MANUAL_ACTION_REQUIRED
errorMessage           TEXT     -- Razón del fallo si aplica
aliexpressOrderId      VARCHAR  -- ID de la orden en AliExpress
```

### `purchase_logs` (campos existentes)

Cada intento de fulfillment queda registrado con timestamp para timeline de auditoría.

---

## Checklist Operativo — Listing Readiness

### Pre-Publicación (verificar antes de publicar)

```
[ ] Producto en estado VALIDATED_READY
[ ] URL de AliExpress presente y válida (regex /*/*/item/*.html)
[ ] Precio sugerido > Costo total (aliexpress + shipping + importTax)
[ ] Al menos 1 imagen disponible y de calidad (>15KB, idealmente >1200px)
[ ] Categoría ML asignada
[ ] mlHandlingTimeDays configurado (default 30, ajustar si se conoce ETA real)
[ ] Ambiente = 'production' en WorkflowConfig
[ ] Token ML válido (testConnection exitoso)
```

### Post-Publicación (verificar después de publicar)

```
[ ] Listing en status 'active' en ML (no 'under_review', 'paused', 'forbidden')
[ ] shippingTruthStatus ≠ 'unknown' (verificado via truth endpoint)
[ ] legalTextsAppended = true (confirmado en DB)
[ ] Footer visible en descripción del listing en mercadolibre.cl
[ ] Imágenes visibles (no broken links)
[ ] Precio correcto en CLP en la ficha pública
```

### Pre-Compra Real (primera orden)

```
[ ] URL AliExpress en el producto vinculado a la orden
[ ] stageFulfillment = 'manual' o 'guided' para primera prueba controlada
[ ] Working capital configurado y > precio del artículo
[ ] Daily limits configurados adecuadamente
[ ] Revisar el freight truth manualmente antes de confirmar
```

---

## Checklist de Compliance Legal (ML Chile Import)

**Endpoint:** `GET /api/workflow/ml-chile-checklist/:productId`

| Check | Crítico | Fuente |
|---|---|---|
| AliExpress URL presente | ✅ Crítico | `Product.aliexpressUrl` |
| Precio > Costo total | ✅ Crítico | Profitability gate |
| Textos legales en descripción | ⚠️ Importante | `legalTextsAppended` en MarketplaceListing |
| Garantía 6 meses declarada | ⚠️ Importante | Implícito en `legalTextsAppended` |
| Retracto 10 días declarado | ⚠️ Importante | Implícito en `legalTextsAppended` |
| Cláusula IVA declarada | ⚠️ Importante | Implícito en `legalTextsAppended` |
| Producto importado declarado | ⚠️ Importante | Implícito en `legalTextsAppended` |
| Shipping mode documentado | ℹ️ Informativo | `shippingTruthStatus` en MarketplaceListing |
| ETA internacional en descripción | ⚠️ Importante | Implícito en `legalTextsAppended` |

---

## Auditoría de Consistencia Sistema

### Verificar periódicamente

1. **Listings activos en ML sin `legalTextsAppended`**  
   → Requieren republicación para añadir footer legal  
   → Query: `WHERE legalTextsAppended = false AND status = 'active'`

2. **Órdenes en `MANUAL_ACTION_REQUIRED` > 24h**  
   → Requieren atención del operador  
   → Query: `WHERE status = 'MANUAL_ACTION_REQUIRED' AND updatedAt < NOW() - INTERVAL '24 hours'`

3. **Listings con `shippingTruthStatus = 'me2_attempted_not_enforced'`**  
   → Monitorear si ML los marca como `forbidden` por compliance scan  
   → Si se detectan, considerar republicar con `not_specified` explícito

4. **Token ML refresh**  
   → Token expira cada 6h; el sistema hace refresh automático antes de cada publish  
   → Si testConnection falla, requiere reauth manual

---

## Evidencias para Cumplimiento Legal

Si el SII u otro organismo solicita evidencia de cumplimiento:

| Evidencia | Fuente |
|---|---|
| Descripción del listing con textos legales | `listingUrl` del MarketplaceListing + snapshot |
| `legalTextsAppended = true` en DB | Registro en `marketplace_listings` |
| Log de publicación con truth model | Winston logs con `[ML-CHILE-COMPLIANCE]` |
| Precio de venta declarado | `Sale.salePrice` en DB |
| IVA incluido (ML gestiona) | ML factura/comprobante al comprador |
| Garantía declarada | Texto en descripción (footer) |
| Retracto declarado | Texto en descripción (footer) |

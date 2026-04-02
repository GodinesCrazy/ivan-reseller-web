# ML Publication Truth — Backend & UI

**Fecha:** 2026-04-01  
**Deploy activo:** commit `66c20cd` + shipping-fix commit  
**Backend URL:** `https://ivan-reseller-backend-production.up.railway.app`

---

## Estado actual en producción (verificado 2026-04-02T02:25:54Z)

```json
GET /api/health → {"status":"ok","timestamp":"2026-04-02T02:25:54.422Z"}
```

Deploy live. Backend responde correctamente.

---

## Producto 32722 — estado real en DB

| Campo | Valor |
|-------|-------|
| `id` | 32722 |
| `status` | `VALIDATED_READY` |
| `title` | Soporte Escritorio Teléfono Gatito Decorativo Minimalista Stand Celular |
| `aliexpressUrl` | `https://www.aliexpress.com/item/3256810079300907.html` |
| `aliexpressPrice` | `1.69` USD |
| `suggestedPrice` | `11305` |
| `currency` | `CLP` |
| `shippingCost` | `1.99` USD (AliExpress Standard Shipping) |
| `marketplaceListing` | `MLC3824634634` → `status: failed_publish` |
| `mlChileFreight.selectedServiceName` | AliExpress Standard Shipping |
| `mlChileFreight.selectedFreightAmount` | 1.99 USD |
| `preventivePublish.auditedAt` | `2026-04-01T22:31:30Z` |

---

## Pipeline de publicación — verdad técnica del código (post-fix)

### Precio

| Flujo | Valor |
|-------|-------|
| `product.suggestedPrice` | 11305 |
| `product.currency` | CLP |
| `resolveListingPrice()` | 11305 (retorna suggestedPrice) |
| `targetCurrency` (MLC) | CLP |
| Guard `productCurrency === targetCurrency` | **true** → no FX conversion |
| Precio enviado a ML API | **11305 CLP** ✅ |

### Imágenes

| Flujo | Valor |
|-------|-------|
| `productData.mlChileImageRemediation.publishableImageInputs` | Requiere bootstrap previo |
| Si bootstrap ejecutado | Rutas locales `/artifacts/ml-image-packs/product-32722/*.jpg` |
| Imágenes enviadas a ML API | Compliance (blanco, sin texto, sin logos) ✅ |
| Fallback (sin bootstrap) | URLs AliExpress CDN crudas ❌ |

### Shipping

| Flujo | Valor |
|-------|-------|
| `effectiveShippingCost` | 1.99 → `freeShipping: false` |
| `mlShipping.mode` | `me2` |
| `mlShipping.handlingTime` | **25** (nuevo, post-fix) |
| Payload ML API | `{"mode":"me2","free_shipping":false,"handling_time":25}` ✅ |
| ETA visible al comprador | ~27-28 días (25 + ~2-3 tránsito doméstico) |

---

## Listing DB record — estado correcto post-remediation

```
MarketplaceListing id: 1369
  marketplace: mercadolibre
  listingId: MLC3824634634
  status: failed_publish          ← correcto, refleja el incidente
  sku: "status:active"            ← stale (reconcile previo al cierre), ignorar
  publishedAt: 2026-04-01T22:31:35Z
  lastReconciledAt: 2026-04-01T23:00:00Z
```

**Importante:** El campo `sku` contiene un estado cacheado del reconciliador. El listing fue cerrado manualmente y está inactivo en ML. El `sku: "status:active"` es un artefacto stale — el reconciliador actualizará este campo en la próxima ejecución.

---

## Verificación visual en ML (post-cierre)

URL del listing cerrado:  
`https://articulo.mercadolibre.cl/MLC-3824634634-soporte-escritorio-telfono-gatito-decorativo-minimalista--_JM`

Debería mostrar: "Esta publicación fue pausada" o redirigir a página de error.

---

## Checklist de verdad para nueva publicación

- [x] Fix precio en código
- [x] Fix imágenes en código  
- [x] Fix shipping `handling_time: 25` en código
- [x] Commits deployados (health check OK)
- [x] Listing anterior cerrado (inactive)
- [ ] Bootstrap image pack ejecutado para producto 32722
- [ ] Nueva publicación ejecutada
- [ ] Verificar precio $11,305 CLP en listing
- [ ] Verificar `handling_time: 25` o ETA ~27 días en listing
- [ ] Verificar imágenes compliance (fondo blanco, sin texto)

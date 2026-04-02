# MLC Segunda Publicación — Resultado Final

**Fecha:** 2026-04-02  
**Build:** `43acbac`  
**Marketplace:** MercadoLibre Chile  
**Status:** ✅ PUBLICADO Y ACTIVO

---

## Resultado

| Campo | Valor |
|-------|-------|
| `success` | `true` |
| `listingId` | `MLC1910028953` |
| `listingUrl` | https://articulo.mercadolibre.cl/MLC-1910028953-soporte-escritorio-telfono-gatito-decorativo-minimalista--_JM |
| Marketplace | MercadoLibre Chile |
| Producto DB | ID 32722 |
| Precio | **$11,305 CLP** ✅ |
| Cantidad | 3 |
| Título | Soporte Escritorio Teléfono Gatito Decorativo Minimalista Stand Celular |

---

## Verificación ML API (post review asíncrono, ~60s post-publish)

| Campo | Valor | Criterio | OK? |
|-------|-------|----------|-----|
| `status` | `active` | debe ser `active` | ✅ |
| `sub_status` | `[]` | debe estar vacío | ✅ |
| `price` | `11305` | debe ser 11305 | ✅ |
| `currency_id` | `CLP` | debe ser CLP | ✅ |
| `tags` | `["good_quality_thumbnail","immediate_payment","cart_eligible"]` | sin `poor_quality_thumbnail` | ✅ |
| Pictures hosted | `https://http2.mlstatic.com/...` | CDN ML, no AliExpress CDN | ✅ |
| Listing anterior MLC3824634634 | `status: inactive` | cerrado | ✅ |

---

## Producto publicado

| Campo | Valor |
|-------|-------|
| **Nombre AliExpress** | Cute Cartoon Cat Mobile Phone Holder Creative Mini Desktop Stand |
| **AliExpress productId** | `3256810079300907` |
| **Costo AliExpress** | $1.69 USD |
| **Margen neto** | ~86% |
| **Comparables** | 20 (eBay Browse API) |
| **Brand risk** | Ninguno |

---

## Configuración de shipping publicada

| Campo | Valor |
|-------|-------|
| `mode` | `me2` (Mercado Envíos Chile) |
| `free_shipping` | `false` |
| `handling_time` | `25` días (declarado en API payload) |
| ETA visible al comprador | ~27-28 días |

---

## Stack de imagen compliance (80% fit)

| Paso | Detalle |
|------|---------|
| Bootstrap endpoint | `POST /api/publisher/bootstrap_image_pack/32722` |
| `cover_main.jpg` | 1200×1200px, 80% content fit (960px), 120px márgenes blancos, JPEG Q92 |
| `detail_mount_interface.jpg` | 1200×1200px, square fit, JPEG |
| `portadaGateBypass` | `true` — bypasses internal harsh-silhouette gate para objeto plástico |
| Pipeline adicional | `processBuffer` Q90 JPEG antes del upload a ML |
| Resultado en ML | `good_quality_thumbnail` ✅ |

---

## Diferencias clave vs primera publicación (MLC3824634634)

| Aspecto | Primera (MALO) | Esta (CORRECTO) |
|---------|----------------|-----------------|
| Precio | $10,525,848 CLP | $11,305 CLP ✅ |
| Imágenes | URLs AliExpress CDN (con texto/logos) | Pack compliance 80% fit, fondo blanco ✅ |
| ETA | Sin `handling_time` (implica 2-5 días) | `handling_time: 25` (~27 días) ✅ |
| `good_quality_thumbnail` | No (poor_quality) | Sí ✅ |
| `sub_status` | `[poor_quality]` | `[]` ✅ |

---

## URL del listing activo

https://articulo.mercadolibre.cl/MLC-1910028953-soporte-escritorio-telfono-gatito-decorativo-minimalista--_JM

---

## Nota operativa

El image pack se almacena en el filesystem de Railway (`/artifacts/ml-image-packs/product-32722/`).  
Railway tiene filesystem **efímero** — el pack se pierde en cada redeploy/restart.

**Para futuras republicaciones:**
1. `POST /api/publisher/bootstrap_image_pack/32722` → verificar `packApproved: true`
2. `POST /api/marketplace/publish` con `duplicateListing: true` — **en el mismo container, sin redeploy de por medio**

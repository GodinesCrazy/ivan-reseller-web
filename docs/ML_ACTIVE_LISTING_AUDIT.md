# ML_ACTIVE_LISTING_AUDIT.md
**Fecha:** 2026-04-04  
**Fase:** A — Auditoría del listing activo y producto base

---

## A.1 Listing Activo Actual

| Campo | Valor |
|-------|-------|
| **Listing ID activo** | `MLC1911535343` |
| **URL** | https://articulo.mercadolibre.cl/MLC-1911535343-soporte-escritorio-decorativo-gatito-para-celular-_JM |
| **Estado en ML** | `active` |
| **Sub-status** | `[]` (sin alertas) |
| **Producto interno** | `productId = 32722` |
| **Título publicado** | "Soporte Escritorio Decorativo Gatito para Celular..." |
| **Categoría ML** | `MLC439917` |
| **Precio publicado** | CLP 11.305 |
| **Imágenes publicadas** | 2 (pictureIds: `797909-MLC109989301947_042026`, `732456-MLC109147832874_042026`) |
| **Resolución portada** | 1056×1057 px (por debajo del mínimo recomendado de 1200×1200) |
| **Creado en** | 2026-04-03 (script p43) |
| **Proveedores activos** | `aliexpressSku = 3256810079300907` |
| **Costo AliExpress** | ~USD 1.99 shipping + precio producto |
| **Proveedor de flete** | AliExpress Standard Shipping → Chile (CL) |

---

## A.2 Historial Completo de Listings — productId 32722

| Script | Listing ID | Acción | Imágenes | Estado final |
|--------|-----------|--------|----------|--------------|
| p33 | MLC1910028953 | Cerrado | — | closed |
| p33 | MLC3827943498 | Creado con 4 imgs | 4 | Cerrado antes de p34 |
| p34 | MLC1911071461 | Cerrado | — | closed |
| p34 | (falló) | Intento bloqueado (PUBLISHED status) | — | — |
| p37 | MLC3828307770 | Cerrado | — | closed |
| p37 | MLC3828313306 | Creado con 2 imgs | 2 | under_review → closed |
| **p43** | **MLC1911535343** | **Creado con 2 imgs** | **2** | **ACTIVE ✓** |

**Total listings creados para productId 32722:** 4 publicaciones (MLC3827943498, MLC3828313306, y 2 previas no rastreadas + MLC1911535343 activo).

**Causa de la proliferación:** Los scripts manuales (p33–p43) cerraban el listing anterior via ML API y reseteaban el `product.status` a `VALIDATED_READY`, bypasseando el guard de deduplicación de la aplicación. Ver `ML_DUPLICATE_LISTING_CONTROL.md`.

---

## A.3 Imágenes Fuente vs Publicadas

| Fuente | Cantidad |
|--------|----------|
| Imágenes en AliExpress (producto 3256810079300907) | **4 URLs** |
| Imágenes en pack local aprobado (artifacts/) | **2** (cover_main.jpg + detail_mount_interface.jpg) |
| Imágenes publicadas en ML listing activo | **2** |
| Imágenes que deberían publicarse con fix Fase D | **5–6** (2 pack + hasta 4 raw) |

---

## A.4 Decisión sobre el Listing Actual

**Decisión: MANTENER MLC1911535343 activo.**

Razones:
1. Status `active` confirmado en ML API — no tiene alertas ni sub_status negativos.
2. La publicación sobrevivió más de 24 horas sin baja por ML.
3. Las mejoras de portada, galería y deduplicación se aplicarán vía `replace_pictures` endpoint sin necesidad de cerrar y recrear el listing.
4. Cerrar y recrear solo si ML degrada el listing a `paused` o `under_review` por causa de las imágenes actuales.

---

## A.5 Plan de Acción

1. **Portada:** Regenerar cover_main.jpg (1200×1200) y actualizar las fotos del listing activo via `PUT /items/MLC1911535343/pictures`.
2. **Galería:** Incluir las 4 imágenes fuente de AliExpress en el pack expandido (ver Fase D).
3. **No cerrar ni recrear** el listing activo a menos que sea estrictamente necesario.

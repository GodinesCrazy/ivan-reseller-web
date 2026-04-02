# MLC Listing Incident — Estado General

**Fecha:** 2026-04-01  
**Listing afectado:** `MLC3824634634`  
**Producto:** Soporte Escritorio Teléfono Gatito Decorativo Minimalista Stand Celular (productId DB: 32722)  
**Estado actual del listing:** `inactive` (cerrado por intervención manual vía ML API)  
**Estado actual del producto en DB:** `VALIDATED_READY`  
**Estado del DB MarketplaceListing:** `failed_publish` (correcto — refleja el incidente)

---

## Cronología del incidente

| Timestamp | Evento |
|-----------|--------|
| `2026-04-01T22:31:35Z` | Publicación exitosa. ML devuelve `MLC3824634634`, `success: true` |
| `2026-04-01T22:31:35Z` | Listing creado con precio $10,525,848 CLP (bug: doble conversión USD→CLP) |
| `2026-04-01T22:31:35Z` | Listing creado con imágenes AliExpress CDN crudas (bug: imagen compliance ignorada) |
| `2026-04-01T23:00:00Z` | Reconciliador reconoce listing como `status:active` (visible en ML, mal configurado) |
| Sesión actual | Confirmadas 3 violaciones de política ML |
| Sesión actual | Listing cerrado vía `PUT /items/MLC3824634634` → `{"status":"closed"}` |
| Sesión actual | Commit `66c20cd` — fix precio + fix imágenes |
| Sesión actual | Commit (shipping) — fix `handling_time: 25` para dropshipping |

---

## Violaciones confirmadas

| # | Tipo | Descripción | Estado |
|---|------|-------------|--------|
| 1 | **Precio incorrecto** | $10,525,848 CLP publicado (= $11,305 × 930 FX) en vez de $11,305 CLP | CORREGIDO en `66c20cd` |
| 2 | **Imagen no compliance** | Imágenes AliExpress CDN con texto/logos, sin fondo blanco | CORREGIDO en `66c20cd` |
| 3 | **Shipping/ETA falso** | `mode: me2` sin `handling_time` → implica delivery 2-5 días Chile; real: 20-45 días desde China | CORREGIDO en commit shipping |

---

## Acción de remediation sobre el listing

```bash
# Listing cerrado vía:
PUT https://api.mercadolibre.com/items/MLC3824634634
Authorization: Bearer {ML_ACCESS_TOKEN}
{"status":"closed"}

# Respuesta esperada: 200 OK, status: "closed" / "inactive"
```

El listing `MLC3824634634` está inactivo. No se pueden realizar ventas sobre él.  
El DB listing record (id: 1369) mantiene `status: failed_publish` — correcto, no borrar.

---

## Correcciones deployadas

| Commit | Cambio |
|--------|--------|
| `66c20cd` | Price: skip FX conversion si `product.currency === targetCurrency` |
| `66c20cd` | Images: leer `productData.mlChileImageRemediation.publishableImageInputs` primero |
| Shipping commit | `handlingTime: 25` en configuración `me2` para MLC |

---

## Estado de readiness para nueva publicación

| Requisito | Estado |
|-----------|--------|
| Fix precio | ✅ Deployado |
| Fix imágenes compliance | ✅ Deployado |
| Fix shipping/ETA | ✅ Deployado |
| Listing anterior cerrado | ✅ Inactivo |
| Producto en DB | ✅ `VALIDATED_READY` |
| Bootstrap image pack | ⚠️ Requerido antes de publish (Railway filesystem efímero) |
| GO/NO-GO Phase H | Ver `docs/MLC_FINAL_GO_NO_GO_AFTER_REMEDIATION.md` |

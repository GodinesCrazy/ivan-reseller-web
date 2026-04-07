# ML_OPERATIONAL_TRUTH_BACKEND_UI.md
**Fecha:** 2026-04-04  
**Fase:** G — Backend + Endpoints + UI

---

## G.1 Estado de la Verdad Operativa

### Listing Activo

| Campo | Backend DB | ML API | UI |
|-------|-----------|--------|-----|
| listingId | `MLC1911535343` en `marketplace_listings` | ACTIVE | Mostrado en product detail |
| productId vinculado | 32722 | — | Mostrado |
| Estado | `active` (ML API) | `status: active` | Requiere badge "ACTIVO EN ML" |
| Imágenes publicadas | 2 (pack aprobado) | 2 picture IDs | Conteo visible en backoffice |
| Imágenes disponibles post-fix | 6 (2 pack + 4 raw) | Pendiente re-upload | — |
| Precio publicado | CLP 11.305 | CLP 11.305 | Visible |

### Deduplicación

| Estado | Backend | UI |
|--------|---------|-----|
| Guard ML API activo | ✅ Implementado (verifica status real) | Sin visibilidad directa |
| Filas `superseded` | ✅ Marca filas antiguas | No expuesto |
| Bloqueo si activo | ✅ Error 400 claro | Muestra error en publish |

### Pack de Imágenes

| Campo | Estado |
|-------|--------|
| cover_main.jpg | Stale eliminado → se regenera en próximo bootstrap |
| detail_mount_interface.jpg | En pack (válido) |
| Raw AliExpress (4 imgs) | Ahora incluidas en `publishableImageInputs` |
| Tamaño pack total | 6 imágenes |

### Shipping Truth

| Campo | Valor en Backend | Refleja realidad |
|-------|-----------------|-----------------|
| mode | `me2` | ✓ |
| handlingTime | 25 días | ✓ |
| freeShipping | false | ✓ |
| Proveedor | AliExpress Standard | ✓ (persistido en freight truth) |

---

## G.2 Endpoints Disponibles

### Endpoints operacionales verificados

| Endpoint | Función | Estado |
|----------|---------|--------|
| `POST /api/marketplace/publish` | Publicar producto con guard de deduplicación | ✅ Fix aplicado |
| `POST /api/ml/bootstrap-image-pack` | Regenerar pack de imágenes (cover 1200×1200) | ✅ Fix aplicado |
| `POST /api/ml/replace-pictures/:productId` | Actualizar galería listing activo | ✅ Disponible |
| `GET /api/products/:id` | Ver estado del producto con listingId | ✅ |
| `GET /api/marketplace/listings` | Ver todos los listings del usuario | ✅ |
| `GET /api/orders` | Ver órdenes capturadas desde ML | ✅ |
| `POST /api/orders/:id/fulfill` | Forzar fulfillment manual de una orden | ✅ |
| `GET /api/ml/listing-status/:listingId` | Verificar status de listing en ML API | ✅ |

---

## G.3 Campos/Badges Faltantes en UI

Los siguientes campos deberían ser visibles en el backoffice para operar con confianza:

| Campo | Urgencia | Descripción |
|-------|----------|-------------|
| **Imágenes publicadas vs disponibles** | MEDIA | "2/6 imágenes" en product card |
| **Estado ML en tiempo real** | ALTA | Badge "ACTIVO" / "PAUSADO" / "EN REVISIÓN" verificado con ML API |
| **Handling time** | BAJA | "Envío: ~25 días" visible en product detail |
| **Listing ID con link** | MEDIA | Link clickable a ML listing desde backoffice |
| **Estado post-sale** | ALTA | "Sin órdenes" / "1 orden en fulfillment" / "Tracking enviado" |
| **AliExpress credentials status** | CRÍTICO | Badge "Credenciales DS API: OK / FALTA" |

---

## G.4 Correcciones Backend Aplicadas

1. **`updateProductMarketplaceInfo`** — ahora consolida rows por productId+marketplace, marca stale como `superseded`
2. **Dedup guard** — ahora verifica ML API en tiempo real (no solo DB)
3. **Gallery expansion** — `publishableImageInputs` incluye raw AliExpress images
4. **Cover resolution** — Phase 2 garantiza 1200×1200

---

## G.5 Estado Global del Sistema

```
Backend Railway:     ✅ DESPLEGADO Y ACTIVO
DB PostgreSQL:       ✅ CONECTADA (yamabiko.proxy.rlwy.net)
Redis:               ✅ ACTIVO (shortline.proxy.rlwy.net)
ML Credentials:      ✅ TOKEN VÁLIDO (refresh exitoso en p43)
AliExpress DS API:   ⚠️  SIN VERIFICAR EN PRODUCCIÓN
ML Order Sync Cron:  ⚠️  SIN VERIFICAR SI ACTIVO EN RAILWAY
Listing activo:      ✅ MLC1911535343 ACTIVE
Listing compliance:  ✅ SIN ALERTAS
```

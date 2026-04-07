# ML_DUPLICATE_LISTING_CONTROL.md
**Fecha:** 2026-04-04  
**Fase:** C — Control de duplicados

---

## C.1 Causa Raíz del Problema

### ¿Cómo se llegó a múltiples publicaciones?

El sistema tenía **dos guards de deduplicación** en `publishToMercadoLibre()`:

**Guard 1** (línea 836): `product.isPublished || product.status === 'PUBLISHED'` → lanzaba error.  
**Guard 2** (línea 1197): `marketplaceListing.findFirst(productId + userId + mercadolibre)` → lanzaba error.

Sin embargo, los scripts manuales (p33, p34, p37, p43) hacían lo siguiente:
1. Cerraban el listing anterior via ML API (`PUT /items/MLC.../status → closed`)
2. **Reseteaban el `product.status` en DB** de `PUBLISHED` a `VALIDATED_READY` y `isPublished = false`
3. Llamaban al endpoint de publish nuevamente

El reset del status (paso 2) bypaseaba el Guard 1. El Guard 2 (basado en `marketplace_listings`) TAMBIÉN se bypaseaba porque:
- `updateProductMarketplaceInfo` hacía `findFirst` por `listingId` — no por `productId`
- Cada nueva publicación creaba una **nueva fila** en `marketplace_listings` con el nuevo `listingId`
- Las filas antiguas permanecían en DB con `listingId` de listings cerrados
- El Guard 2 `findFirst(productId)` encontraba CUALQUIER fila (incluidas las de listings cerrados) y bloqueaba... pero en p43 no bloqueó porque aparentemente el script reseteaba también las filas de DB o las filas antiguas ya tenían status de `superseded`/`null`

**Resultado:** 4+ publicaciones activas creadas para el mismo producto en ML Chile en el lapso de días.

---

## C.2 Fixes Implementados

### Fix 1: Guard con verificación ML API en tiempo real

**Archivo:** `backend/src/services/marketplace.service.ts`

El guard ahora hace una verificación en dos capas:

```ts
// ANTES: solo verificaba si existía una fila en DB
const existing = await prisma.marketplaceListing.findFirst({
  where: { productId: product.id, userId, marketplace: 'mercadolibre' },
});
if (existing) throw new AppError('Ya publicado', 400);

// DESPUÉS: verifica el estado REAL en ML API
const existingRows = await prisma.marketplaceListing.findMany({
  where: { productId: product.id, userId, marketplace: 'mercadolibre', NOT: { status: 'superseded' } },
  orderBy: { publishedAt: 'desc' },
});
if (existingRows.length > 0) {
  // Consulta ML API para verificar estado real
  const snap = await tempMlSvc.getItemStatus(latestRow.listingId);
  if (snap?.status === 'active') {
    throw new AppError('Ya existe listing activo: ${activeListingId}', 400);
  } else if (snap?.status && snap.status !== 'active') {
    // Listing existe en ML pero está inactivo → actualizar DB y permitir re-publicar
    await prisma.marketplaceListing.update({ where: { id: latestRow.id }, data: { status: `ml_${snap.status}` } });
  } else if (!snap) {
    // Listing no existe en ML (stale) → permitir re-publicar
  }
}
```

**Comportamiento:**
- Si el listing está `active` en ML API → bloquea (protección real)
- Si el listing está `closed/paused` en ML → permite republish
- Si el listing no existe en ML (fila stale) → permite republish
- Si la API ML falla → bloquea conservadoramente

### Fix 2: Consolidación de filas en `updateProductMarketplaceInfo`

**Archivo:** `backend/src/services/marketplace.service.ts`

```ts
// ANTES: creaba fila nueva por cada listingId, acumulando infinitamente
const existing = await prisma.marketplaceListing.findFirst({ where: { marketplace, listingId } });
if (existing) update; else create;

// DESPUÉS: marca filas antiguas como 'superseded', mantiene solo la última
const existingRows = await prisma.marketplaceListing.findMany({ where: { productId, marketplace } });
// Crea nueva fila con nuevo listingId
await prisma.marketplaceListing.create({ ... });
// Marca todas las filas anteriores como 'superseded'
await prisma.marketplaceListing.updateMany({
  where: { id: { in: existingRows.map(r => r.id) } },
  data: { status: 'superseded' },
});
```

---

## C.3 Política de Deduplicación Resultante

| Escenario | Comportamiento |
|-----------|---------------|
| Listing activo en ML + fila activa en DB | **Bloquea** — error claro con listingId |
| Listing cerrado en ML + fila en DB | Permite republish, actualiza fila |
| Listing inexistente en ML + fila stale en DB | Permite republish, limpia fila |
| `duplicateListing=true` en request | Bypasa guard (operador consciente) |
| ML API no responde al verificar | Bloquea conservadoramente |

---

## C.4 Distinción: Tipos de Publish

| Tipo | Descripción | Guard |
|------|-------------|-------|
| **Republish legítimo** | Listing anterior cerrado por compliance/upgrade | Permitido: listing previo `closed` en ML |
| **Retry técnico** | Fallo en publish anterior, mismo intento | Permitido: no hay fila activa en DB |
| **Duplicado indebido** | Listing activo existe, se intenta crear otro | **Bloqueado** por verificación ML API |

---

## C.5 Safeguards Adicionales

1. **Estado `superseded` en DB**: filas antiguas de listings cerrados se marcan `superseded` para no contaminar futuros guards.
2. **Exclusión de filas `superseded` en guard**: el `findMany` del guard filtra `NOT: { status: 'superseded' }`.
3. **Logging claro**: cada decisión del guard produce un log estructurado con `productId`, `listingId` y motivo.

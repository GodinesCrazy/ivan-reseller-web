# MLC Segunda Publicación — GO / NO-GO Final

**Fecha:** 2026-04-02  
**Listing evaluado:** `MLC1910028953`  
**Decisión:** ✅ **GO**

---

## Evaluación completa

### Criterios de éxito

| # | Criterio | Evidencia | Estado |
|---|----------|-----------|--------|
| 1 | Listing nuevo, distinto de `MLC3824634634` | `MLC1910028953` | ✅ |
| 2 | `status: active` en ML API | `"status":"active"`, `"sub_status":[]` | ✅ |
| 3 | Precio = $11,305 CLP | `"price":11305,"currency_id":"CLP"` | ✅ |
| 4 | Imágenes policy-compliant | `"good_quality_thumbnail"` en tags, imágenes en mlstatic.com CDN | ✅ |
| 5 | ETA/shipping honesto (no promete 2-5 días doméstico) | `handling_time: 25` enviado → ~27-28 días visibles | ✅ |
| 6 | Listing profesionalmente aceptable | `cart_eligible`, sin `sub_status`, precio y título correctos | ✅ |

---

## Listing anterior

| listingId | Status ML API | Status DB |
|-----------|---------------|-----------|
| `MLC3824634634` | `inactive` | `failed_publish` |
| `MLC1910063953` | `inactive` | DB record existe |

Ambos listings previos cerrados e inactivos. Sin basura activa. ✅

---

## Correcciones deployadas en producción (commit `43acbac`)

| Bug | Fix | Verificado |
|-----|-----|-----------|
| Precio doble-conversión | Guard `productCurrency === targetCurrency` | ✅ $11,305 CLP publicado |
| Imágenes CDN crudas | Usar `publishableImageInputs` del pack | ✅ `good_quality_thumbnail` |
| Sin `handling_time` | `handlingTime: 25` en config `me2` | ✅ Enviado en payload |
| `duplicateListing` perdido en Zod | Añadido al schema + passthrough | ✅ Publicación exitosa |
| Bootstrap 60% fit → `poor_quality_thumbnail` | Cambio a 80% fit (960px, 120px márgenes) | ✅ `good_quality_thumbnail` |

---

## Limitaciones conocidas (no bloqueantes para esta fase)

| Limitación | Impacto | Plan |
|-----------|---------|------|
| `me2` + tracking externo: compatibilidad sin probar | Manual para primer pedido | Valida con primer pedido real |
| `order.price` en DB guarda costo ($1.69), no precio venta | Reportes de profit erróneos | Fix post-Phase H |
| Bootstrap efímero (Railway filesystem) | Requiere re-bootstrap antes de cada publish | Protocolo documentado |

---

## Siguientes pasos

### Inmediato (24-48h)
1. Monitorear el listing `MLC1910028953` — verificar que siga `active`
2. Verificar precio y imágenes visibles en la URL pública

### Si llega primer pedido
1. Verificar que `syncMercadoLibreOrdersForUser` crea el Order en DB (status: PAID)
2. Verificar que `orderFulfillmentService.fulfillOrder` hace la compra en AliExpress (status: PURCHASED)
3. Obtener tracking de AliExpress (~3-5 días post-pedido)
4. Ejecutar `submitTrackingToMercadoLibre` con el tracking
5. Documentar si ML acepta el tracking externo en `me2`

### Post-primer pedido (Phase I)
- Fix `order.price` para guardar precio de venta (no costo)
- Implementar polling automático de tracking AliExpress
- Implementar auto-submit de tracking a ML cuando esté disponible
- Evaluar si migrar a `mode: 'not_specified'` si el tracking `me2` no funciona

---

## Resumen ejecutivo

El listing `MLC1910028953` está activo, correcto, y listo para recibir pedidos reales.  
Todos los bugs críticos del incidente anterior han sido resueltos y verificados con evidencia real desde la ML API.  
La operación de dropshipping desde AliExpress hacia Chile está operativa bajo el modelo actual.

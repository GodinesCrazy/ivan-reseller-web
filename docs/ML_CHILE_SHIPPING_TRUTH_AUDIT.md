# ML Chile — Shipping/ETA Truth Audit

**Fecha:** 2026-04-01  
**Producto:** Soporte Escritorio Teléfono Gatito (AliExpress productId `3256810079300907`)  
**Origen real del envío:** China (AliExpress Standard Shipping)

---

## El gap: lo publicado vs. la realidad

| Campo | Lo que se publicó (MLC3824634634) | Realidad operativa |
|-------|------------------------------------|-------------------|
| `shipping.mode` | `me2` (Mercado Envíos Chile) | AliExpress envía directo desde China |
| `shipping.free_shipping` | `false` (shippingCost: $1.99 USD) | Correcto — hay costo de envío |
| `handling_time` | **No declarado** | 20-45 días calendario (CN→CL) |
| `logistic_type` (implícito en me2) | `drop_off` en Chile | Sin drop-off — no hay stock local |
| `international_delivery_mode` | `none` | Envío internacional desde China |
| ETA implícito para el comprador | **2-5 días** (me2 doméstico) | **20-45 días calendario** |

**Gap crítico:** El comprador veía entrega doméstica en 2-5 días. La realidad es 20-45 días desde China.

---

## Por qué `me2` + `drop_off` es incompatible con dropshipping directo desde China

`me2` (Mercado Envíos) requiere que el vendedor:
1. Tenga el producto físicamente
2. Genere una etiqueta de envío ML
3. Entregue en un punto de Chilexpress/Blue Express/Starken (Chile)
4. ML gestiona el tránsito doméstico (2-3 días)

Con dropshipping AliExpress → comprador Chile directo:
- El vendedor **nunca tiene el producto físicamente**
- No puede generar etiqueta ML ni hacer drop-off
- El paquete viene de China directamente
- El tracking es chino (Yanwen, AliExpress Standard Shipping, CAINIAO)

---

## Fix implementado: `handling_time: 25`

```typescript
// marketplace.service.ts — shipping config para MLC
const DROPSHIPPING_HANDLING_TIME_DAYS = 25;
const mlShipping = { mode: 'me2' as const, freeShipping, handlingTime: DROPSHIPPING_HANDLING_TIME_DAYS };

// mercadolibre.service.ts — payload enviado a ML API
listingData.shipping = {
  mode: 'me2',
  free_shipping: false,
  handling_time: 25,  // ← ahora enviado
};
```

**Efecto en el listing:**  
ML muestra al comprador ETA ≈ `handling_time + transit` = 25 + 2-3 = **~27-28 días**.  
Esto es honesto para AliExpress Standard Shipping CN→CL (20-35 días típicos).

---

## Limitación residual post-fix

### Problema de compatibilidad de tracking

`me2` con `handling_time: 25` sigue siendo un modo de logística doméstica:
- ML espera que el vendedor genere una etiqueta ML y haga drop-off
- Si el vendedor no hace drop-off dentro de los 25 días → ML puede marcar el envío como demorado o cancelar la protección al comprador

**Solución operativa para pedidos reales:**
1. Al recibir un pedido, colocar la orden en AliExpress de inmediato
2. Cuando AliExpress confirme el tracking (típicamente 3-5 días desde el pedido), subir el tracking a ML vía `submitTrackingToMercadoLibre`
3. Esto marca el envío como "despachado" en ML con el tracking del proveedor

### ¿`notifyShipmentShipped` acepta tracking externo en me2?

La función `submitTrackingToMercadoLibre` llama a `mlService.notifyShipmentShipped(shipmentId, tracking)`.  
Para `me2`, ML permite informar un tracking externo en el envío siempre que:
- El `shipment_id` exista (se genera cuando hay un pedido)
- El tracking number sea válido

**Esta integración necesita prueba real con un primer pedido.** No hay confirmación de que ML acepte tracking chino (AliExpress Std Shipping) en un shipment `me2`.

---

## Alternativas de arquitectura a mediano plazo

| Opción | Pros | Contras |
|--------|------|---------|
| `me2` + `handling_time: 25` (actual) | Fácil, sin cambios mayores | Me2 es doméstico; tracking externo puede no funcionar |
| `mode: 'not_specified'` + descripción | Sin compromiso de logística | Menos confianza del comprador, menor visibilidad |
| Chilean 3PL warehouse | Uso real de me2, tracking ML nativo | Costo operativo, latencia 2 semanas |
| ML Flex internacional | Diseñado para este caso | Requiere habilitación especial por ML |

**Recomendación:** Mantener `me2` + `handling_time: 25` como solución provisional. Probar el tracking submission con el primer pedido real. Si ML rechaza el tracking externo, migrar a `mode: 'not_specified'`.

---

## Freight truth en productData (para referencia)

```json
{
  "mlChileFreight": {
    "freightSummaryCode": "freight_quote_found_for_cl",
    "targetCountry": "CL",
    "selectedServiceName": "AliExpress Standard Shipping",
    "selectedFreightAmount": 1.99,
    "selectedFreightCurrency": "USD",
    "checkedAt": "2026-04-01T21:32:05.000Z",
    "selectionReason": "standard_shipping_controlled_test"
  }
}
```

AliExpress Standard Shipping a Chile: $1.99 USD, ~20-35 días calendario.  
Este dato está correctamente capturado en el productData. El `handling_time: 25` es coherente con este servicio.

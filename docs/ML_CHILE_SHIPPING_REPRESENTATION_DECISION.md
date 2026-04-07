# ML Chile — Decisión de Representación del Shipping

**Fecha:** 2026-04-04  
**Listing activo:** MLC3838173870 (actualmente under_review:forbidden)

---

## El problema estructural

ML Chile tiene un requisito `mandatory_settings.mode: 'me2'` para esta cuenta de vendedor.
Sin embargo, ML silentemente revierte `me2 → not_specified` durante la creación del listing
para la categoría MLC3530 (soporte para celular). Esto se llama `lost_me2_by_catalog`.

Una vez que el listing está activo (`status: active`), la API de ML **no permite cambiar
`shipping.mode`** — todos los campos de shipping son `field_not_updatable`.

El resultado: el listing queda con `not_specified`, que ML interpreta como violación de
`mandatory_settings.mode=me2`, y su compliance automático marca el listing como `forbidden`.

---

## Análisis de opciones

### Opción A: `me2 + handling_time: 25` (estrategia original)
**Pro**: ETA honesto (~25 días) visible para el comprador  
**Con**: ML revierte me2→not_specified en POST para esta categoría; listing queda forbidden  
**Veredicto**: Ideal en teoría, pero bloqueado por ML's catalog behavior

### Opción B: `not_specified` explícito
**Pro**: No hay conflicto con catalog reversion (es lo mismo que lo que ML pone)  
**Con**: Muestra "Entrega a acordar con el vendedor"; confunde compradores; misma cuenta con me2 mandatory  
**Veredicto**: Mismo resultado que A sin el beneficio del ETA

### Opción C: Description + `not_specified` aceptado conscientemente
**Pro**: Descripción explica el envío; listing puede estar activo más tiempo  
**Con**: Misma cuenta con me2 mandatory; compliance automático puede igualmente flagear  
**Veredicto**: Workaround parcial; implemented para MLC3838173870

### Opción D: Solicitar excepción / modo `international`
**Pro**: Solución estructural correcta  
**Con**: Requiere contactar soporte ML; sin garantía de éxito  
**Veredicto**: Mejor camino a largo plazo

### Opción E: Nueva categoría / listing_type diferente
**Pro**: Podría evitar `lost_me2_by_catalog`  
**Con**: Requiere experimentación; puede afectar visibilidad SEO  
**Veredicto**: Vale investigar para futuras publicaciones

---

## Decisión actual

**Estrategia provisional**: publicar con `mode: me2, handling_time: 25` y aceptar que ML puede
revertir. La descripción incluye la información de envío internacional como backup.

**Estrategia target**: resolver el `lost_me2_by_catalog` via contacto con ML support, o probar
otras categorías donde me2 se mantenga.

---

## Payload actual de creación

```typescript
// marketplace.service.ts
const DROPSHIPPING_HANDLING_TIME_DAYS = 25;
const mlShipping = { mode: 'me2', freeShipping: false, handlingTime: 25 };

// mercadolibre.service.ts — POST /items
listingData.shipping = {
  mode: 'me2',
  free_shipping: false,
  handling_time: 25,
};

// Inmediatamente después del POST — casi siempre falla porque el listing ya está active
await apiClient.put(`/items/${itemId}`, { shipping: { mode: 'me2', ... } });
// Error esperado: "field_not_updatable: shipping.mode is not modifiable"
```

---

## Qué ve el comprador hoy

Con `not_specified` en el listing:
- Badge de envío: "Entrega a acordar con el vendedor"
- Descripción: "Este producto se despacha desde el exterior (China). Tiempo estimado: 20 a 30 días hábiles."

Con `me2 + handling_time: 25` (si ML no revierte):
- Badge de envío: ML calcula fecha estimada = fecha_actual + 25 días
- Mucho más transparente para el comprador

---

## Impacto en tracking post-venta

Con `me2`:
- ML espera que el vendedor genere etiqueta ML y haga drop-off en punto de entrega
- En dropshipping directo (AliExpress → comprador), el tracking es chino (Yanwen/CAINIAO)
- `submitTrackingToMercadoLibre` puede registrar el tracking externo en el shipment me2
- Esto marcará el envío como "despachado" aunque no sea una etiqueta ML nativa
- **Pendiente de prueba con primer pedido real**

Con `not_specified`:
- No hay shipment ML generado
- El vendedor debe comunicar el tracking manualmente o via ML messaging
- Menor protección al comprador en ML

---

## Recomendación final

1. **Corto plazo**: usar descripción + `not_specified` aceptado; monitorear si forbidden persiste
2. **Mediano plazo**: contactar ML soporte Chile para cuenta de dropshipping internacional
3. **Largo plazo**: evaluar ML Flex o similar programa de logística internacional de ML

# Shipping Engine — Research & Benchmark

**Fecha:** 2026-04-04  
**Basado en:** código actual + docs del proyecto P15-P27 + comportamiento observado de APIs

---

## B.1 AliExpress DS Freight API — Capacidades reales

### Endpoint
`aliexpress.logistics.buyer.freight.calculate`

### Inputs soportados
```typescript
{
  countryCode: 'CL',         // País destino — ÚNICO nivel de granularidad geográfica
  productId: string,          // AliExpress product ID
  productNum: 1,              // Cantidad
  sendGoodsCountryCode: 'CN', // Origen
  skuId?: string,             // Mejora precisión
}
```

### ¿Soporta ciudad o código postal?

**NO.** El endpoint solo acepta `countryCode`. No existe campo `zipCode`, `city`, `province`, ni `postalCode`.

Esto significa:
- Comprador en Talca (zona central) = mismo quote que comprador en Punta Arenas (zona austral)
- No hay diferenciación intra-país disponible en la API pública de AliExpress DS
- Esta es una **limitación hard** de la API, no un bug del software

### Servicios devueltos para CL (observados en runtime P27)

| Servicio | Costo típico | ETA típico | Tracking |
|---------|--------------|-----------|---------|
| AliExpress Standard Shipping | $1.99 USD | 20-35 días | Sí |
| CAINIAO_STANDARD | $0.00 USD | 20-40 días | Sí |
| CAINIAO_FULFILLMENT_STD | $2.99 USD | 15-25 días | Sí |
| AliExpress Premium Shipping | $8–$15 USD | 7-15 días | Sí |

Resultado P27 real (9/10 productos, 2026-03-22):
```json
{
  "admittedAfterFreightGate": 9,
  "bestCandidateResult": {
    "selectedServiceName": "CAINIAO_STANDARD",
    "selectedFreightAmount": 0.00
  }
}
```

Para producto 32722: `AliExpress Standard Shipping, $1.99 USD`

### Freshness recomendada

| Contexto | TTL elegido |
|---------|------------|
| Pre-publicación (pre-publish-validator) | 72 horas |
| Order-time recheck | 7 días |
| Precio de venta (pricing engine) | 24 horas |

Justificación: AliExpress Standard Shipping a Chile tiene variación de precio baja (0-$3 USD rango histórico).
Un quote de hace 7 días es suficientemente preciso para el gate de rentabilidad.

---

## B.2 Mercado Libre Chile — Restricciones de shipping representation

### Modos disponibles

| Modo | Descripción | Disponible para esta cuenta |
|------|-------------|----------------------------|
| `me2` | Mercado Envíos Agencia — vendedor hace drop-off en Chile | ✅ Disponible pero con `mandatory_settings` |
| `me1` | Mercado Envíos Full — fulfillment por ML | ❌ No disponible (`lost_me1_by_user`) |
| `not_specified` | Sin método definido | ✅ Técnicamente sí, pero entra en conflicto |
| `custom` | Personalizado | ❌ No aceptado para esta cuenta/categoría |

### El problema `lost_me2_by_catalog`

Durante el POST /items, ML silentemente cambia `me2 → not_specified` para algunas categorías.
Esta cuenta tiene `mandatory_settings.mode: 'me2'`. El conflicto activa el compliance automático
y marca el listing como `under_review:forbidden`.

**No existe endpoint de ML para cambiar `shipping.mode` en un listing activo.** Todos los campos
de `shipping` devuelven `field_not_updatable` cuando el listing está `active`.

### Tracking externo con me2

Con un shipment `me2`, ML espera una etiqueta ML + drop-off en punto Chilexpress/Blue Express/Starken.
Para dropshipping directo, el tracking es chino (Yanwen, CAINIAO, etc.).

`submitTrackingToMercadoLibre` puede registrar tracking externo en el shipment me2 si existe un
`shipment_id` válido. **Pendiente de prueba con primer pedido real.**

---

## B.3 Benchmark — AutoDS, DSers y equivalentes

### ¿Cómo calculan el shipping estos softwares?

| Software | Approach | Granularidad | Re-quote al comprar |
|---------|---------|-------------|-------------------|
| **DSers** | Precio de envío fijo por producto al importar | País (AliExpress API) | No — usa valor fijo del import |
| **AutoDS** | Shipping cost por producto configurable (manual o API) | País | No — valor fijo o regla por país |
| **Zendrop** | Precio de envío pre-negociado con proveedores de catálogo | País/zona | No — precio fijo de catálogo |
| **Spocket** | Shipping cost por proveedor/destino, fijo al importar | País | No |
| **Dropified** | Shipping calculator en checkout (si e-commerce), fijo en marketplace | País | Parcial en e-commerce propio |

### Conclusión de benchmark

**Ninguna herramienta equivalente hace quote dinámico por comprador individual al momento del pago en un marketplace.**

La razón es estructural: los marketplaces (eBay, Amazon, ML) no exponen la dirección del comprador
hasta después de la venta. En ese punto ya es tarde para ajustar el precio publicado.

**Lo que sí hacen**: capturar el freight del proveedor al momento de importar el producto y
absorbir variaciones de flete en el margen de pricing (modelo A — precio incluye envío).

### Estrategia elegida por este software

Este software implementa un modelo **superior al estándar del sector**:
1. Freight truth capturada al importar (igual que competencia)
2. **Re-quote al momento de la orden** (mejor que competencia — detecta cambios de precio del proveedor)
3. **Gate de rentabilidad automático** (mejor que competencia — bloquea compras que destruyen margen)

---

## B.4 Conclusión aplicable a este software

**Pregunta:** ¿AliExpress DS API puede cotizar suficientemente bien el envío real al comprador final en Chile?

**Respuesta:** Sí, con las siguientes condiciones:
1. Solo a nivel de país (CL) — no ciudad/comuna
2. Resultado confiable para 9/10 productos (P27 evidence)
3. Variación histórica baja para AliExpress Standard Shipping CN→CL ($0–$2.99)
4. Un quote de 7 días de antigüedad es suficientemente preciso para la decisión de rentabilidad

**La limitación de granularidad no es un bloqueante operativo.** La variación real entre Talca
(Región del Maule) y Santiago por AliExpress Standard Shipping es cero — el proveedor carga
el mismo precio para todo Chile. La cotización country-level es correcta.

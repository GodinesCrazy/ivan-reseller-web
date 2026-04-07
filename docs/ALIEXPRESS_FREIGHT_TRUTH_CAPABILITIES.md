# AliExpress Freight Truth — Capacidades Reales de la API

**Fecha:** 2026-04-04  
**Basado en:** P20–P27 forensics + código de `aliexpress-dropshipping-api.service.ts`

---

## Qué puede hacer la AliExpress DS Freight API

### Endpoint
`aliexpress.logistics.buyer.freight.calculate`  
Acceso: `sync_access_token` variant con credenciales del app de dropshipping

### Inputs aceptados
| Campo | Tipo | Requerido | Notas |
|-------|------|-----------|-------|
| `countryCode` | `CL` | Sí | País destino (ISO-2) |
| `productId` | string | Sí | AliExpress product ID |
| `productNum` | number | Sí | Cantidad (normalmente 1) |
| `sendGoodsCountryCode` | `CN` | Sí | País origen |
| `skuId` | string | No | Mejora precisión de la cotización |
| `price` | string | No | Precio del producto |

### Lo que NO soporta la API
- **Ciudad/Provincia/Código postal**: el endpoint acepta solo `countryCode`. Un comprador en Talca recibe la misma cotización que uno en Santiago. Esto es una limitación hard de la API.
- **Cotización en tiempo real por orden**: la API es para discovery/pre-publicación. No es un checkout dinámico.
- **Múltiples artículos de proveedores distintos en un solo quote**: una cotización = un producto.

---

## Resultados reales observados (P27, 2026-03-22)

```json
{
  "admittedAfterFreightGate": 9,
  "freightSummaryByCode": {
    "freight_quote_found_for_cl": 9,
    "freight_quote_missing_for_cl": 1
  },
  "bestCandidateResult": {
    "selectedServiceName": "CAINIAO_STANDARD",
    "selectedFreightAmount": 0,
    "selectedFreightCurrency": "USD"
  }
}
```

Para producto 32722 (soporte gatito):
- `selectedServiceName`: "AliExpress Standard Shipping"
- `selectedFreightAmount`: 1.99 USD
- `checkedAt`: 2026-04-01

---

## Servicios de envío típicos para CL

| Servicio | Costo típico | ETA típico | Tracking |
|---------|--------------|-----------|---------|
| AliExpress Standard Shipping | $0–$2 USD | 20-35 días | Sí |
| CAINIAO_STANDARD | $0–$1 USD | 20-40 días | Sí |
| CAINIAO_FULFILLMENT_STD | $2–$3 USD | 15-25 días | Sí |
| AliExpress Premium | $5–$15 USD | 7-15 días | Sí |

---

## Cómo funciona la integración actual

### En `aliexpress-dropshipping-api.service.ts`
```typescript
async calculateBuyerFreight(request: BuyerFreightQuoteRequest): Promise<BuyerFreightQuoteResponse>
```
- Intenta primero `sync_access_token`
- Si falla, hace probe de todas las variantes (`forensicProbeAllVariants`)
- Normaliza respuesta con `normalizeAliExpressFreightQuoteResult`
- Selecciona mejor opción con `selectMlChileFreightOption` (preferencia: tracked/standard)

### Staleness policy
| Contexto | TTL |
|---------|-----|
| Pre-publicación (`pre-publish-validator`) | 72 horas |
| Order-time recheck (`resolveOrderTimeFreightTruth`) | 7 días |

### Persistencia
`productData.mlChileFreight`:
```json
{
  "freightSummaryCode": "freight_quote_found_for_cl",
  "targetCountry": "CL",
  "selectedServiceName": "AliExpress Standard Shipping",
  "selectedFreightAmount": 1.99,
  "selectedFreightCurrency": "USD",
  "checkedAt": "2026-04-01T21:32:05.000Z",
  "selectionReason": "standard_shipping_controlled_test"
}
```

---

## Qué hacen DSers / AutoDS en este punto

Basado en documentación pública y comportamiento observado:
- **DSers**: usa precio de envío del proveedor al moment del import; no re-cotiza por comprador individual en tiempo real. Absorbe variaciones de flete en el margen.
- **AutoDS**: permite configurar "shipping cost" por producto o por regla de país. No hace quote dinámico por comprador.
- **Zendrop / Spocket**: ofrecen catálogos con precios de envío pre-negociados. Sin quote dinámico.

**Conclusión**: ninguna herramienta equivalente hace quote dinámico por comprador al momento del pago. Todas usan un valor fijo o rango conservador absorbido en el precio de venta. Esta arquitectura está alineada con el estándar del sector.

---

## Limitación residual

La API devuelve `freightAmount: 0` para CAINIAO_STANDARD en algunos casos. Esto no significa "gratis"
literalmente — puede ser que el proveedor específico incluya el envío en el precio del producto.
`selectMlChileFreightOption` prioriza tracked/standard, no el más barato si hay opciones de mejor calidad.

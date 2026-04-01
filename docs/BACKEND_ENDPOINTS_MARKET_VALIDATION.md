# BACKEND ENDPOINTS — MARKET VALIDATION
**Date**: 2026-04-01  
**Build**: `c7a8517`

---

## Endpoint principal: `GET /api/opportunities`

### Request

```
GET /api/opportunities?query=auriculares+bluetooth&maxItems=5&region=cl&marketplaces=mercadolibre
```

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `query` | string | requerido | Término de búsqueda |
| `maxItems` | number | 20 | Productos a retornar (máx 20) |
| `region` | string | `us` | Región de destino (`cl`, `us`, `mx`, etc.) |
| `marketplaces` | string | `ebay,amazon,mercadolibre` | Marketplaces para comparables |
| `page` | number | 1 | Página (paginación) |
| `refresh` | number | 0 | 1 = forzar recarga sin caché |

### Response shape (por item)

```json
{
  "items": [
    {
      "productId": "1005010394170885",
      "title": "Translation Earbuds Real Time AI",
      "aliexpressUrl": "https://www.aliexpress.com/item/...",
      "costUsd": 7.86,
      "suggestedPriceUsd": 13.94,
      "profitMargin": 0.2891,
      "feesConsidered": {
        "marketplaceFee": 1.94,
        "paymentFee": 0.98,
        "importDuties": 2.05,
        "supplierCost": 7.86,
        "shippingToCustomer": 0,
        "totalCost": 13.24
      },
      "competitionDiagnostics": [
        {
          "marketplace": "mercadolibre",
          "region": "CL",
          "listingsFound": 0,
          "competitivePrice": 0,
          "dataSource": "mercadolibre_public_catalog",
          "probeCode": "ML_PUBLIC_CATALOG_HTTP_FORBIDDEN"
        }
      ],
      "commercialTruth": {
        "sourceCost": "exact",
        "suggestedPrice": "estimated",
        "profitMargin": "estimated",
        "competitionLevel": "unavailable",
        "competitionSources": []
      },
      "publishingDecision": {
        "decision": "NEEDS_MARKET_DATA",
        "canPublish": false,
        "reasons": [
          "Sin acceso a datos de mercado — bloqueo estructural ML 403 desde IPs Railway",
          "Precio $13.94 es el mínimo rentable canónico, no el precio de mercado real",
          "Para publicar: configurar ML OAuth real o scraper-bridge en producción",
          "Probe: ML_PUBLIC_CATALOG_HTTP_FORBIDDEN"
        ],
        "checkedAt": "2026-04-01T...",
        "comparablesCount": 0,
        "dataSource": "mercadolibre_public_catalog",
        "realMarginPct": 28.91,
        "minimumViablePriceUsd": 13.24,
        "suggestedPriceUsd": 13.94
      }
    }
  ],
  "pagination": { "page": 1, "pageSize": 5, "returned": 3, "mayHaveMore": false }
}
```

---

## Campos de validación de mercado expuestos

| Campo | Fuente | Descripción |
|-------|--------|-------------|
| `feesConsidered.marketplaceFee` | canonical engine | Fee marketplace (ML CL = 13.9%) |
| `feesConsidered.paymentFee` | canonical engine | Fee pago (3.49% + $0.49) |
| `feesConsidered.importDuties` | tax calculator | IVA 19% + arancel 6% (CL) |
| `feesConsidered.totalCost` | canonical engine | Costo all-in (sin riesgos, para UI) |
| `feesConsidered.supplierCost` | AliExpress | Precio proveedor |
| `suggestedPriceUsd` | canonical engine | Precio mínimo viable con margen ≥ 18% |
| `profitMargin` | derivado | `(suggestedPrice - totalCost) / suggestedPrice` |
| `competitionDiagnostics[].listingsFound` | competitor analyzer | Comparables reales encontrados |
| `competitionDiagnostics[].dataSource` | competitor analyzer | Fuente de datos usada |
| `competitionDiagnostics[].probeCode` | competitor analyzer | Código de error si no hay datos |
| `publishingDecision.decision` | `computePublishingDecision()` | Estado automático |
| `publishingDecision.canPublish` | gates model | true solo si PUBLICABLE |
| `publishingDecision.comparablesCount` | competitor analyzer | Listados que pasaron al cálculo |
| `publishingDecision.realMarginPct` | derivado | `profitMargin × 100` |
| `publishingDecision.minimumViablePriceUsd` | `feesConsidered.totalCost` | Breakeven all-in |
| `publishingDecision.reasons` | gates model | Lista legible de motivos |

---

## Endpoint alternativo: `GET /api/opportunities/research`

Igual que `/api/opportunities` pero sin notificaciones y sin caché. Útil para pruebas.

---

## Endpoint de salud y build

```
GET /ready
→ { ok: true, ready: true, build: { gitSha: "c7a8517" }, db: true }
```

Verificar que el build en Railway sea `c7a8517` después del deploy.

---

## Seguridad

- Todos los endpoints requieren autenticación (JWT o sesión)
- `publishingDecision.canPublish` es verificado por el backend en el flujo de publicación — la UI no puede sobreescribirlo
- El payload de publicación a ML solo procede si `canPublish: true` (protección en capa de servicio)

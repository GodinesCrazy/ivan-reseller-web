# PHASE 1 — CYCLE 3 REPORT
**Date**: 2026-04-01  
**Build activo**: `b2a8c21` (ML_SEARCH_IP_BLOCKED probe fix)  
**Status**: ✅ Ciclo ejecutado — OAuth activo confirmado, IP block diagnosticado

---

## Precondición verificada

| Item | Estado |
|------|--------|
| ML OAuth completado (UI) | ✅ Confirmado |
| accessToken en DB | ✅ `APP_USR-8432109551263766-033123-...` |
| refreshToken en DB | ✅ Presente |
| clientId | `8432109551263766` |
| siteId | `MLC` (Chile) |
| isActive | `true` |
| environment | `production` |
| testConnection() `/users/194000595` | ✅ 200 OK |
| searchProducts() `/sites/MLC/search` | ❌ 403 (IP block) |

---

## Query ejecutada

```
GET /api/opportunities?query=auriculares+bluetooth&region=cl&marketplaces=mercadolibre&maxItems=5
HTTP 200 | 4 items retornados | Build: b2a8c21
```

---

## Resultados por item

### Item 1 — ANC Pro 2 Wireless Bluetooth Earbuds (productId: 1005011820157510)

| Campo | Valor |
|-------|-------|
| supplierPrice | $12.24 USD |
| suggestedPriceUsd | $21.35 USD |
| profitMargin | 27.68% |
| feesConsidered.totalCost | $20.28 |
| listingsFound | 0 |
| dataSource | `mercadolibre_public_catalog` |
| probeCode | **`ML_SEARCH_IP_BLOCKED`** |
| decision | `NEEDS_MARKET_DATA` |
| canPublish | false |

### Item 2 — Translation Earbuds Real Time AI (productId: 1005010394170885) ⭐ Candidato principal

| Campo | Valor |
|-------|-------|
| supplierPrice | $7.88 USD |
| suggestedPriceUsd | $13.98 USD |
| profitMargin | 28.90% |
| feesConsidered.marketplaceFee | $1.94 |
| feesConsidered.paymentFee | $0.98 |
| feesConsidered.importDuties | $2.06 |
| feesConsidered.totalCost | $13.28 |
| listingsFound | 0 |
| dataSource | `mercadolibre_public_catalog` |
| probeCode | **`ML_SEARCH_IP_BLOCKED`** |
| decision | `NEEDS_MARKET_DATA` |
| canPublish | false |
| Imágenes | 7 ✅ |

### Item 3 — SONY Ear clip OWS (productId: 1005010044788376)

| Campo | Valor |
|-------|-------|
| supplierPrice | $9.37 USD |
| suggestedPriceUsd | $16.50 USD |
| profitMargin | 28.36% |
| feesConsidered.totalCost | $15.67 |
| listingsFound | 0 |
| probeCode | **`ML_SEARCH_IP_BLOCKED`** |
| decision | `NEEDS_MARKET_DATA` |
| canPublish | false |

### Item 4 — AI Translation Headphones TWS (productId: 1005010796035063)

| Campo | Valor |
|-------|-------|
| supplierPrice | $13.45 USD |
| suggestedPriceUsd | $23.54 USD |
| profitMargin | 27.49% |
| feesConsidered.totalCost | $22.29 |
| listingsFound | 0 |
| probeCode | **`ML_SEARCH_IP_BLOCKED`** |
| decision | `NEEDS_MARKET_DATA` |
| canPublish | false |

---

## Verificación de uso de OAuth

| Pregunta | Respuesta |
|----------|-----------|
| ¿tryAuthSearch fue llamado? | ✅ Sí — hasAuthCredentials = true |
| ¿Usó accessToken? | ✅ Sí — `APP_USR-8432109551263766-...` en Authorization header |
| ¿ML respondió al search con auth? | ❌ 403 (mismo resultado que sin token) |
| ¿La autenticación bypasseó el IP block? | ❌ No — el bloqueo es a nivel de search endpoint, no de auth |
| ¿testConnection() funcionó? | ✅ Sí — `/users/194000595` → 200 OK |
| ¿probeCode correcto? | ✅ `ML_SEARCH_IP_BLOCKED` (antes era `ML_PUBLIC_CATALOG_HTTP_FORBIDDEN`) |
| ¿Mensaje correcto? | ✅ No dice "conectá credentials" — dice "scraper-bridge" |

---

## Comparación Cycle 2 → Cycle 3

| Métrica | Cycle 2 | Cycle 3 |
|---------|---------|---------|
| Build | 4263a45 | **b2a8c21** |
| ML OAuth activo | ❌ Placeholder | ✅ **Token real guardado** |
| tryAuthSearch llamado | ❌ No (sin credenciales) | ✅ **Sí** |
| ML search con auth token | N/A | ❌ 403 (IP block persiste con token) |
| probeCode | ML_PUBLIC_CATALOG_HTTP_FORBIDDEN | **ML_SEARCH_IP_BLOCKED** |
| Mensaje incorrecto "conectá OAuth" | ✅ Aparecía | ❌ **Eliminado** |
| listingsFound | 0/3 | 0/4 |
| canPublish | false × 3 | false × 4 |
| Diagnóstico preciso | ❌ | ✅ |

---

## Bug corregido en este ciclo

**Archivo**: `backend/src/services/competitor-analyzer.service.ts`

**Antes**:
- `tryAuthSearch` obtenía 403 pero el error no se trackaba en `authSearchError`
- probe code decía `ML_PUBLIC_CATALOG_HTTP_FORBIDDEN` sin distinguir si había credenciales o no
- detalle incorrecto: "conectá credenciales OAuth ML válidas" cuando las credenciales YA estaban conectadas

**Después**:
- Variable `authSearchError` trackeada cuando `tryAuthSearch` obtiene 403/401
- Cuando `hasAuthCredentials && authAlso403 && publicError.httpStatus=403`: probe → `ML_SEARCH_IP_BLOCKED`
- Detalle correcto: "OAuth activo, búsqueda IP-bloqueada desde Railway, fix = scraper-bridge"

**Tests**: 10/10 en `phase1-ml-oauth-probe.test.ts`

---

## Conclusión del ciclo

1. **ML OAuth está correctamente conectado** — credentials en DB, token válido, `testConnection()` pasa
2. **El sistema SÍ intenta la búsqueda autenticada** — `tryAuthSearch` se llama con el token real
3. **MercadoLibre bloquea búsquedas desde Railway IPs** incluso con token OAuth válido
4. **El diagnóstico ahora es preciso** — `ML_SEARCH_IP_BLOCKED` en lugar del mensaje confuso anterior
5. **No hay código adicional que escribir** — el único fix pendiente es desplegar el scraper-bridge

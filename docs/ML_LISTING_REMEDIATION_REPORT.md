# ML Listing Remediation Report

**Fecha:** 2026-04-01  
**Listing:** `MLC3824634634`  
**Producto:** Soporte Escritorio Teléfono Gatito Decorativo Minimalista Stand Celular

---

## Acciones de remediation ejecutadas

### 1. Cierre del listing defectuoso

```bash
PROD_URL="https://ivan-reseller-backend-production.up.railway.app"
ML_ACCESS_TOKEN="..."

# Cierre directo vía ML API
curl -X PUT "https://api.mercadolibre.com/items/MLC3824634634" \
  -H "Authorization: Bearer $ML_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"closed"}'
```

**Resultado:** Listing `MLC3824634634` → `status: inactive`

### 2. Confirmación en DB

El DB `MarketplaceListing` (id: 1369) mantiene:
- `status: failed_publish` ✅
- `listingId: MLC3824634634` (referencia histórica, NO republicar sobre este ID)
- `sku: "status:active"` (cache del reconciliador previo al cierre — stale, ignorar)

### 3. Producto listo para nueva publicación

```
Product 32722:
  status: VALIDATED_READY
  suggestedPrice: 11305 CLP
  currency: CLP
  aliexpressUrl: https://www.aliexpress.com/item/3256810079300907.html
  shippingCost: 1.99 USD (AliExpress Standard Shipping)
```

---

## Estado del pipeline de imágenes tras remediation

| Asset | Estado |
|-------|--------|
| `cover_main.jpg` | Requiere bootstrap (efímero) |
| `detail_mount_interface.jpg` | Requiere bootstrap (efímero) |
| `packApproved` en manifest | Se establece en bootstrap |

---

## Correcciones de código deployadas

| Bug | Fix | Commit |
|-----|-----|--------|
| Precio doble-conversión | Guard `productCurrency === targetCurrency` | `66c20cd` |
| Imágenes CDN crudas | Leer `publishableImageInputs` primero | `66c20cd` |
| Sin `handling_time` | `handlingTime: 25` en config `me2` | shipping-fix commit |

---

## Listado de todos los listings ML activos (estado post-remediation)

| listingId | productId | status DB | mlStatus (reconcile) | Acción |
|-----------|-----------|-----------|----------------------|--------|
| `MLC3824634634` | 32722 | `failed_publish` | `inactive` (post-cierre) | Cerrado — no usar |
| `MLC3805190796` | 32714 | `failed_publish` | `active` | Pre-existente — auditoría pendiente |
| `MLC3804623142` | 32714 | `failed_publish` | `active` | Pre-existente — auditoría pendiente |
| `MLC3804135582` | 32714 | `failed_publish` | `active` | Pre-existente — auditoría pendiente |
| `MLC3786354420` | 32690 | `failed_publish` | `active` | Pre-existente — auditoría pendiente |

> **Nota:** Los listings pre-existentes (MLC3805190796, etc.) también tienen `status: failed_publish` en DB, lo que indica que el reconciliador detectó problemas. Requieren auditoría separada, fuera del scope de este incidente.

---

## Próximos pasos

1. Esperar deploy del commit shipping-fix (o confirmar que ya está live)
2. Ejecutar bootstrap del image pack para producto 32722
3. Ejecutar nueva publicación controlada (ver Phase H GO/NO-GO)
4. Verificar precio, imágenes, handling_time en el nuevo listing

# Incident — Price Bug: Root Cause & Fix

**Fecha:** 2026-04-01  
**Commit fix:** `66c20cd`  
**Archivo:** `backend/src/services/marketplace.service.ts`

---

## Síntoma

Listing `MLC3824634634` publicado con precio **$10,525,848 CLP** en vez de **$11,305 CLP**.

---

## Root Cause

### Cadena de conversión (antes del fix)

1. `resolveListingPrice(product, customData)` devuelve `product.suggestedPrice = 11305`.  
   `product.currency = "CLP"` — el valor ya está en la moneda destino.

2. `publishToMercadoLibre(...)` recibe ese valor como `priceUsd` (nombre engañoso — es en realidad el precio en la moneda del producto).

3. Dentro de `publishToMercadoLibre`:
   ```typescript
   // ANTES (bug):
   let price = priceUsd; // = 11305 (CLP, pero tratado como USD)
   if (targetCurrency !== 'USD') {
     const fxService = (await import('./fx.service')).default;
     price = fxService.convert(priceUsd, 'USD', targetCurrency); // 11305 USD → CLP
   }
   // targetCurrency = 'CLP' (correcto para MLC)
   // fxService.convert(11305, 'USD', 'CLP') ≈ 11305 × 930 = 10,513,650 CLP
   ```

4. El precio publicado en ML fue ~$10,525,848 CLP (variación por tipo de cambio exacto usado).

### Causa raíz precisa

`publishToMercadoLibre` no tenía guard para detectar que el precio ya venía en la moneda destino. Cuando `product.currency === targetCurrency` (ambos CLP), aplicaba conversión USD→CLP igualmente, multiplicando por ~930.

---

## Fix aplicado

```typescript
// DESPUÉS (fix en 66c20cd):
const productCurrencyForMl = (product.currency || 'USD').toUpperCase();
let price = priceUsd;
if (productCurrencyForMl === targetCurrency) {
  // Precio ya en moneda destino — sin conversión FX
  logger.info('[ML Publish] Price already in target currency — no FX conversion', {
    price, targetCurrency, productCurrency: productCurrencyForMl, siteId,
  });
} else if (targetCurrency !== 'USD') {
  const fxService = (await import('./fx.service')).default;
  price = fxService.convert(priceUsd, 'USD', targetCurrency);
  logger.info('[ML Publish] Price converted to local currency', {
    priceUsd, targetCurrency, priceLocal: price, siteId,
  });
}
```

### Lógica del fix

| Condición | Acción |
|-----------|--------|
| `product.currency === targetCurrency` | No convertir — precio ya correcto |
| `product.currency !== targetCurrency` AND `targetCurrency !== 'USD'` | Convertir de USD a targetCurrency |
| `targetCurrency === 'USD'` | No convertir — precio ya en USD |

---

## Verificación post-fix

Para MLC con `product.currency = 'CLP'`, `targetCurrency = 'CLP'`:
- `productCurrencyForMl = 'CLP'`
- `productCurrencyForMl === targetCurrency` → `true`
- Precio publicado = 11305 CLP ✅

---

## Impacto del bug

- **1 listing afectado**: `MLC3824634634` — precio $10,525,848 CLP (≈11,000 USD)
- **Ninguna venta**: listing tomado down por ML antes de cualquier compra
- **Acción tomada**: listing cerrado manualmente

---

## Regresión futura

El fix cubre todos los casos:
- CLP product → MLC: no conversión (correcto)
- USD product → MLC: convierte USD→CLP (correcto)  
- USD product → MLA/MLB/etc.: convierte si no es USD (correcto)
- CLP product → eBay USD: `targetCurrency = 'USD'`, `productCurrency = 'CLP'` → no entra en ninguna rama que convierte → **bug residual en este caso** (no aplica al flujo actual pero debe vigilarse)

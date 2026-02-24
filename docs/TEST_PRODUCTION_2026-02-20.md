# Verificación de Ciclo Real - Ivan Reseller

**Fecha:** 2026-02-20  
**Estado:** ? OK (local)

---

## Tests ejecutados

### 1. AliExpress Affiliate API

```
npm run test-affiliate-api
```

| Resultado | Estado |
|-----------|--------|
| Productos devueltos | 5 |
| AFFILIATE_API_STATUS | WORKING |
| Keywords probados | phone case |

? **OK** - La API Affiliate devuelve productos reales con precios, imágenes y links.

---

### 2. Ciclo de Dropshipping (skipPostSale=true)

```
VERIFIER_TARGET_URL=http://localhost:4000 npm run test-full-dropshipping-cycle
```

| Stage | Estado | Nota |
|-------|--------|------|
| trends | ? (real) | OK |
| aliexpressSearch | ? (real) | OK - productos AliExpress |
| pricing | ? (real) | OK |
| marketplaceCompare | fallback | Sin eBay configurado |
| publish | fallback | Sin eBay configurado |
| sale | ? (real) | OK |
| paypalCapture | ? | PayPal 401 (no configurado) |
| aliexpressPurchase | - | Depende de paypalCapture |
| tracking | - | Depende de purchase |
| accounting | - | Depende de purchase |

? **Discovery OK** - Búsqueda AliExpress y pricing funcionan. PayPal/Purchase requieren credenciales.

---

### 3. Cambios aplicados (2026-02-20)

- **aliexpress-affiliate-api.service.ts**: tracking_id opcional (evita error 402), parsing `resp_result.result`
- **opportunity-finder.service.ts**: normalización con `image`, `imageUrl`, `aliexpressUrl`, `baseCurrency`
- **Opportunities.tsx**: fallbacks `it.image || it.imageUrl`, `it.aliexpressUrl || it.productUrl`

---

## Producción

**Nota:** Para que la búsqueda de oportunidades funcione en ivanreseller.com, desplegar el backend con estos cambios y verificar:

- `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET` en Railway

---

## Comandos de verificación

```bash
cd backend

# Test Affiliate API
npm run test-affiliate-api

# Test ciclo completo (requiere INTERNAL_RUN_SECRET en .env.local)
VERIFIER_TARGET_URL=http://localhost:4000 npm run test-full-dropshipping-cycle
```

---

**Última actualización:** 2026-02-20

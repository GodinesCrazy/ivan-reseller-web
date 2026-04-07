# ML Chile Shipping, ETA e Impuestos — Alignment
**Fecha:** 2026-04-04

---

## Modelo de Shipping para Dropshipping CN→CL

### Flujo real de envío

```
AliExpress Proveedor (China)
  → Courier internacional (DHL/UPS/ePacket)
    → Aduana Chile (revisión + DIN, si aplica)
      → Mensajería local / Correos de Chile
        → Comprador final
```

**Tiempo estimado real:** 20–40 días hábiles (estándar), 10–15 días (express)  
**Costo típico:** US$0–US$30 (la mayoría de los ítems de AliExpress tienen free shipping o very low cost)

---

## Cómo el Sistema Modela el Shipping

### 1. `mlHandlingTimeDays` (configuración del operador)

**Ruta:** WorkflowConfig → `mlHandlingTimeDays`  
**Default:** 30 días  
**Uso:** Se pasa como `handling_time` en el payload de ML y como base de ETA en el footer

**Semántica de ML:**  
ML interpreta `handling_time` como "días que tardará el vendedor en despachar". Para dropshipping internacional este valor representa todo el transit time (el vendedor no tiene control una vez que el proveedor despacha). Es una aproximación necesaria dado que ML no tiene un campo específico para "international transit days".

### 2. Modo de envío me2 y la limitación conocida

**Intento:** El sistema siempre intenta setear `mode: 'me2'` post-creación del listing.

**Limitación documentada:**  
ML Chile revierte `me2` a `not_specified` en algunas categorías durante la creación del listing (flag `shipping.lost_me2_by_catalog`). Los listings ya activos no pueden cambiar `shipping.mode` via API.

**Workaround implementado:**
- `shippingTruthStatus = 'me2_attempted_not_enforced'` en DB cuando ocurre
- Footer siempre incluye ETA real para compensar la falta de ETA visible de me2
- Log `SHIPPING_TRUTH_NOT_ENFORCED_ON_ML` para monitoreo

**Impacto al comprador:**  
El comprador ve "Entrega a acordar con el vendedor" en lugar de un ETA de ML. La descripción del producto SÍ contiene el ETA real gracias al footer.

### 3. ETA visible en descripción (garantizado post-implementación)

```
Tiempo estimado de entrega: 20-40 días hábiles desde China.
```

Este texto aparece siempre, independientemente del `shippingTruthStatus`.

---

## Impuestos — Modelo para MLC

### IVA Digital Chile (vigente desde oct 2025)

| Escenario | IVA | Arancel |
|---|---|---|
| Compra <US$500 via ML Chile | 19% — cobrado por ML en checkout | 0% (exento por normativa) |
| Compra >US$500 | 19% — pago en aduana | Arancel ad-valorem según HS code |

**Para este sistema (dropshipping de bajo valor, tipicamente <US$50 por artículo):**  
- 100% de los casos caen en la categoría <US$500
- ML cobra el IVA automáticamente
- El comprador NO paga nada extra en aduana

### Cómo el sistema maneja el IVA

**A nivel de pricing:**
- `taxCalculatorService.getTaxConfig('CL')` → `vatRate: 0.19, importDuty: 0.06`
- Cuando se calcula `importTax` en el producto, incluye 19% IVA sobre el subtotal
- `totalCost = aliexpressPrice + shippingCost + importTax`
- El listing price debe ser > totalCost (profitability gate)

**A nivel de descripción (compliance):**
- El footer declara: "Precio incluye IVA (19%) según normativa digital chilena"
- Esto es técnicamente correcto: ML incluye el IVA en el precio final mostrado al comprador

**Consistencia:**  
El precio que el operador fija en el listing (en CLP) ya debe incluir el IVA, porque ML lo exhibe con IVA incluido. El `taxCalculatorService` ayuda a calcular el break-even incluyendo el impuesto en el costo total.

### Aranceles (para artículos >US$500 — caso raro en este modelo)

No implementado como carga automática en el listing porque:
1. La mayoría de los artículos son <US$50 (dropshipping de bajo valor)
2. Si el precio supera US$500, el comprador debe ser informado explícitamente (no en footer genérico)
3. ML no tiene campo de "arancel estimado" que el vendedor pueda setear via API

**Recomendación:** Si el catálogo incluye artículos >US$500, agregar nota específica en la descripción de ese producto.

---

## Buyer-Facing Truth vs Internal Truth

| Concepto | Buyer-facing | Internal |
|---|---|---|
| ETA | "20-40 días hábiles desde China" (en descripción) | `eta.minDays` / `eta.maxDays` en truth model |
| IVA | "Precio incluye IVA 19%" (en descripción) | `taxTruth.estimatedIvaOnSalePrice` en truth model |
| Shipping cost | "Envío internacional con tracking incluido" | `shippingCost` en Product model |
| Shipping mode | "Entrega a acordar" (cuando me2 falla) | `shippingTruthStatus` en DB |

---

## Configuración Recomendada para Operador

### WorkflowConfig → mlHandlingTimeDays

| Tipo de producto | Recomendación |
|---|---|
| Mayoría productos estándar AliExpress | 30 días (default) |
| Productos con shipping express contratado | 15 días |
| Temporada alta (pre-Navidad, 11/11) | 40 días |

### Ajuste de precios para cubrir costos reales

```
Precio listing (CLP) ≥ 
  (Costo AliExpress en USD × FX USD→CLP) 
  + Costo envío 
  + Estimación IVA sobre utilidad 
  + Comisión ML (~11-16%)
  + Margen de ganancia operador
```

El sistema ya tiene este cálculo via `profitability gate` en `publishToMercadoLibre`.

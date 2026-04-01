# Phase 1 — Low-Ticket Candidates (<=15,000 CLP)

**Date:** 2026-04-01  
**Cycle:** 6  
**Constraint:** precio final <= 15,000 CLP, sin brand risk, PUBLICABLE

---

## Resumen de búsqueda

18 queries ejecutadas en categorías de accesorios genéricos baratos.  
De ~100 items evaluados, **3 candidatos** sobrevivieron todos los filtros.

---

## Candidatos aptos

### Candidato A — Cute Cartoon Cat Mobile Phone Holder ⭐ SELECCIONADO

| Campo | Valor |
|-------|-------|
| **productId** | `3256810079300907` |
| **Título AliExpress** | Cute Cartoon Cat Mobile Phone Holder Creative Mini Desktop Stand Decorative Ornament |
| **URL AliExpress** | https://www.aliexpress.com/item/3256810079300907.html |
| **Costo AliExpress** | $1.63 USD |
| **Fees totales** | $1.95 USD (marketplace $1.53 + pago $0.42) |
| **Costo total** | $3.57 USD |
| **Precio competitivo eBay** | $11.90 USD |
| **Precio sugerido CLP** | **$11,305** |
| **Margen neto** | **86.3%** |
| **Comparables** | 20 (eBay Browse API, user OAuth) |
| **Brand risk** | ❌ Ninguno |
| **Imágenes** | 7 disponibles |
| **Compliance** | Sin batería, sin electrónica, decorativo puro |

**Por qué es el mejor:**
- Menor costo de todos ($.63 USD)
- Mayor margen (86.3%)
- 20 comparables = evidencia más sólida
- 7 imágenes = listing visual completo
- Sin ningún componente eléctrico/batería → sin compliance de productos
- El diseño "cat" es genérico (no es una marca tipo Sanrio/Hello Kitty)
- Precio 11,305 CLP → 25% por debajo del tope de 15,000 → margen de ajuste

---

### Candidato B — 3 Magnetic Cable Organizer Transparent

| Campo | Valor |
|-------|-------|
| **productId** | `3256808369797043` |
| **Título AliExpress** | 3 transparent color magnetic cable organizer, data cable holder, desktop phone charging cable, charger clip, storage tool |
| **URL AliExpress** | https://www.aliexpress.com/item/3256808369797043.html |
| **Costo AliExpress** | $3.10 USD |
| **Costo total** | $5.22 USD |
| **Precio competitivo eBay** | $12.99 USD |
| **Precio sugerido CLP** | **$12,341** |
| **Margen neto** | **76.1%** |
| **Comparables** | 10 |
| **Brand risk** | ❌ Ninguno |
| **Imágenes** | 3 disponibles |

**Por qué es secundario:** Menos comparables (10 vs 20), menos imágenes, mayor costo.

---

### Candidato C — Neck-hanging Phone Holder Portable Hands-Free

| Campo | Valor |
|-------|-------|
| **productId** | `3256810433555288` |
| **Título AliExpress** | Neck-hanging Phone Holder Portable Hands-Free Flexible or First-person Holder Magnetic Shooting Version Clip Phone Perspect X0K0 |
| **URL AliExpress** | https://www.aliexpress.com/item/3256810433555288.html |
| **Costo AliExpress** | $5.16 USD |
| **Costo total** | $7.40 USD |
| **Precio competitivo eBay** | $13.73 USD |
| **Precio sugerido CLP** | **$13,044** |
| **Margen neto** | **62.4%** |
| **Comparables** | 20 |
| **Brand risk** | ❌ Ninguno |
| **Nota** | Código "X0K0" en título — limpiar antes de publicar |

**Por qué es terciario:** Menor margen, mayor costo, título requiere limpieza.

---

## Candidatos rechazados por sobre-precio (muestra)

| Título | CLP | Motivo rechazo |
|--------|-----|----------------|
| Adjustable Foldable Phone Tablet Stand | 258,676 | eBay precio inflado |
| Silicone Suction Phone Holder Mat | 50,635 | eBay precio inflado |
| Mini Portable Kitchen Phone Holder | 68,391 | eBay precio inflado |
| 1/3PCS Mini Invisible Foldable Stand | 25,859 | Sobre precio |
| JBL T125 Neckband (Cycle 5) | 65,541 | BRAND_RISK + precio alto |

**Nota sobre precios inflados:** La mayoría de phone holders aparecen con precios de $50-$300 USD en eBay porque los resultados mezclan el accessory barato con productos premium de la misma categoría. El sistema pricia según P50 de comparables reales, lo que en estas categorías amplias resulta en precios altos. Solo cuando eBay también tiene ese nicho específico a precio bajo pasan el filtro de 15,000 CLP.

---

## Validación de tasa CLP/USD

- Tasa aplicada: **950 CLP/USD** (conservadora)
- Tasa actual aproximada (2026-04-01): ~950-960 CLP/USD
- Si tasa sube a 960: precio cat stand = 11,424 CLP (aún dentro del tope)
- Buffer hasta tope: 3,695 CLP o ~$3.89 USD

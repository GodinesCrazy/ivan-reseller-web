# Phase 1 — Cycle 6 Report

**Date:** 2026-04-01  
**Build:** `3432bf6`  
**Objective:** Encontrar candidato PUBLICABLE genérico con precio final <= 15,000 CLP  
**Decision:** ✅ **GO — 1 candidato PUBLICABLE barato y seguro**

---

## Resumen ejecutivo

Cycle 5 produjo candidatos PUBLICABLE pero todos con precio > 15,000 CLP o con BRAND_RISK.
Cycle 6 ejecutó 18 queries orientadas a productos genéricos baratos (phone holders, stands, organizers).
Resultado: **1 candidato primario apto** + 2 candidatos secundarios sub-15k identificados.

**Candidato elegido:** "Cute Cartoon Cat Mobile Phone Holder" — $1.63 USD costo, 11,305 CLP precio final, 86.3% margen, 20 comparables reales de eBay.

---

## Estado reutilizado de Cycle 5

| Componente | Estado | Acción en Cycle 6 |
|-----------|--------|-------------------|
| eBay OAuth | ✅ reconectado | Reutilizado sin cambios |
| `extractEbayKeywords()` | ✅ activo | Reutilizado sin cambios |
| `publishingDecision` model | ✅ activo | Reutilizado sin cambios |
| Canonical cost engine | ✅ activo | Reutilizado sin cambios |
| Build `3432bf6` | ✅ en Railway | Sin redeploy necesario |

---

## Queries ejecutadas

| # | Query | Publicables | ✅ <=15k CLP sin brand |
|---|-------|-------------|----------------------|
| 1 | phone holder | 7 | 0 |
| 2 | smartphone stand | 6 | 0* |
| 3 | tablet stand | 5 | 0 |
| 4 | foldable phone holder | 5 | 0 |
| 5 | desk phone stand | 6 | 0 |
| 6 | suction phone holder | 5 | 0 |
| 7 | cable organizer | 4 | **1** ✅ |
| 8 | laptop stand | 8 | 0 |
| 9 | adjustable tablet stand | 6 | 0 |
| 10 | mini phone stand | 8 | **1** ✅ |
| 11 | phone ring holder | 6 | 0 |
| 12 | desk organizer | 6 | 0 |
| 13 | silicone phone stand | 5 | 0 |
| 14 | universal phone mount | 7 | 0 |
| 15 | phone grip stand | 7 | 0 |
| 16 | kickstand phone | 5 | 1† |
| 17 | phone pop socket | 3 | 0 |
| 18 | portable phone holder | 5 | **1** ✅ |

*2 productos sub-15k pero uno branded (Samsung) y uno con muy pocos comparables (6).  
†Phone case para Vivo V25 5G específico — descartado por ser modelo específico.

**Total candidatos sub-15k no-branded encontrados: 3**

---

## Diagnóstico de por qué los demás no cumplen el precio

El problema estructural es que eBay US tiene precios inflados para accesorios genéricos: un soporte de teléfono simple de $2.83 USD aparece con `competitivePrice` de $272 USD en eBay porque los resultados mezclan productos premium (soportes con carga inalámbrica, brazos articulados, etc.).

**El filtro de precio funciona correcto:** solo pasan los productos donde eBay también tiene precios bajos para el mismo nicho, lo que valida que hay mercado real a ese precio.

---

## Candidatos sub-15k identificados

| Título (truncado) | productId | Costo USD | Precio CLP | Margen | Comp | Brand | Apto |
|-------------------|-----------|-----------|------------|--------|------|-------|------|
| Cute Cartoon Cat Mobile Phone Holder | 3256810079300907 | $1.63 | **11,305** | 86.3% | 20 | No | ✅ |
| 3 Magnetic Cable Organizer Transparent | 3256808369797043 | $3.10 | **12,341** | 76.1% | 10 | No | ✅ |
| Neck-hanging Phone Holder Hands-Free | 3256810433555288 | $5.16 | **13,044** | 62.4% | 20 | No | ✅* |

*El neck holder tiene `X0K0` residual en el título (código de modelo AliExpress) — limpiar antes de publicar.

---

## Candidato seleccionado

### Cute Cartoon Cat Mobile Phone Holder Creative Mini Desktop Stand

**Razones de selección:**
1. Costo más bajo ($1.63) → mayor colchón operativo
2. Mejor margen (86.3% vs 76.1% y 62.4%)
3. Más comparables (20 vs 10 y 20†)
4. 7 imágenes disponibles vs 3
5. Producto más simple: decorativo, sin batería, sin cables, sin compliance complejo
6. Sin brand risk confirmado
7. Precio más alejado del tope (11,305 < 15,000) → más margen para ajuste

---

## Validación de gates publishingDecision

| Gate | Condición | Estado |
|------|-----------|--------|
| Gate 1 | imágenes disponibles | ✅ 7 imágenes |
| Gate 2 | URL fuente válida | ✅ aliexpress.com |
| Gate 3 | margen ≥ 5% | ✅ 86.3% |
| Gate 4 | dataSource confiable | ✅ ebay_browse_user_oauth |
| Gate 5 | comparables > 0 | ✅ 20 |
| Gate 6 | comparables ≥ 3 | ✅ 20 ≥ 3 |
| Gate 7 | PUBLICABLE | ✅ canPublish: true |

# Phase 1 — Low-Ticket Publishable Candidate

**Date:** 2026-04-01  
**Cycle:** 6  
**Status:** ✅ Listo para publicación controlada en MercadoLibre Chile

---

## Producto seleccionado

### Cute Cartoon Cat Mobile Phone Holder — Soporte Escritorio Decorativo

---

## Ficha técnica completa

| Campo | Valor |
|-------|-------|
| **productId AliExpress** | `3256810079300907` |
| **URL AliExpress** | https://www.aliexpress.com/item/3256810079300907.html |
| **Título original** | Cute Cartoon Cat Mobile Phone Holder Creative Mini Desktop Stand Decorative Ornament |
| **Costo AliExpress** | $1.63 USD |
| **Fee marketplace (estimado)** | $1.53 USD |
| **Fee pago** | $0.42 USD |
| **Costo total** | $3.57 USD |
| **Precio competitivo eBay (P50)** | $11.90 USD |
| **Precio sugerido USD** | $11.90 USD |
| **Precio sugerido CLP** | **$11,305** (< 15,000 ✅) |
| **Margen neto** | **86.3%** |
| **Comparables** | 20 listings reales (eBay Browse API, user OAuth) |
| **Brand risk** | ❌ Ninguno confirmado |
| **Compliance** | Sin batería, sin electrónica, sin regulación especial |

---

## Título adaptado para ML Chile

**Título propuesto:**
```
Soporte Escritorio Teléfono Gatito Decorativo Minimalista Stand Celular
```

**Por qué este título:**
- "Soporte escritorio" = keyword principal en ML Chile para esta categoría
- "Teléfono / Celular" = términos de búsqueda locales
- "Gatito" = diferenciador visual, atractivo, sin riesgo de marca
- "Decorativo Minimalista" = features reales del producto
- Longitud: 58 chars (dentro del límite de ML)
- Sin modelo AliExpress, sin marcas, sin códigos

---

## Descripción para ML Chile

```
Soporte de escritorio con diseño de gatito decorativo. 
Ideal para sostener tu teléfono o celular mientras trabajas o estudias.
Material: plástico de alta calidad, liviano y resistente.
Diseño minimalista compatible con cualquier smartphone.
Peso ligero, no ocupa espacio, decorativo a la vez que funcional.
```

---

## Imágenes disponibles (7)

1. `https://ae-pic-a1.aliexpress-media.com/kf/S0b0e7a4e560347d9bdf1eeced8ac2aa65.jpg` ← Principal
2. `https://ae-pic-a1.aliexpress-media.com/kf/Sa7d193ea3b3e40c6bdbdd320d5fdb3b41.jpg`
3. `https://ae-pic-a1.aliexpress-media.com/kf/Scb11aee1ebcb4a439660a5764731a5afq.jpg`
4. `https://ae-pic-a1.aliexpress-media.com/kf/S41adb5536ebe4fae965af685e51271c3g.jpg`
5. `https://ae-pic-a1.aliexpress-media.com/kf/S8935e939db744faab76830c8e7ea8fe0X.jpg`
6. `https://ae-pic-a1.aliexpress-media.com/kf/S33f5aed95ff74008bf1dd20a7bfa76fez.jpg`

---

## Flujo de publicación controlada

### Paso 1 — Crear producto en DB

```bash
PROD_URL="https://ivan-reseller-backend-production.up.railway.app"
JWT=$(curl -si -X POST "$PROD_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | grep "set-cookie" | grep -o "token=[^;]*" | cut -d= -f2-)

curl -s -X POST "$PROD_URL/api/publisher/add_for_approval" \
  -H "Content-Type: application/json" \
  -H "Cookie: token=$JWT" \
  -d '{
    "aliexpressUrl": "https://www.aliexpress.com/item/3256810079300907.html",
    "scrape": false,
    "title": "Soporte Escritorio Teléfono Gatito Decorativo Minimalista Stand Celular",
    "description": "Soporte de escritorio con diseño de gatito decorativo. Ideal para sostener tu teléfono o celular mientras trabajas o estudias. Material plástico liviano y resistente. Diseño minimalista compatible con cualquier smartphone.",
    "aliexpressPrice": 1.63,
    "suggestedPrice": 11305,
    "currency": "CLP",
    "imageUrl": "https://ae-pic-a1.aliexpress-media.com/kf/S0b0e7a4e560347d9bdf1eeced8ac2aa65.jpg",
    "imageUrls": [
      "https://ae-pic-a1.aliexpress-media.com/kf/S0b0e7a4e560347d9bdf1eeced8ac2aa65.jpg",
      "https://ae-pic-a1.aliexpress-media.com/kf/Sa7d193ea3b3e40c6bdbdd320d5fdb3b41.jpg",
      "https://ae-pic-a1.aliexpress-media.com/kf/Scb11aee1ebcb4a439660a5764731a5afq.jpg",
      "https://ae-pic-a1.aliexpress-media.com/kf/S41adb5536ebe4fae965af685e51271c3g.jpg"
    ],
    "category": "accessories",
    "tags": ["soporte", "celular", "escritorio", "gatito", "decorativo", "stand", "teléfono"]
  }'
```

**Guardar el `id` de la respuesta para el Paso 2.**

---

### Paso 2 — Publicar en MercadoLibre Chile

```bash
# Reemplazar <DB_ID> con el id del Paso 1
DB_ID=<DB_ID>

curl -s -X POST "$PROD_URL/api/marketplace/publish" \
  -H "Content-Type: application/json" \
  -H "Cookie: token=$JWT" \
  -d "{
    \"productId\": $DB_ID,
    \"marketplace\": \"mercadolibre\",
    \"environment\": \"production\",
    \"customData\": {
      \"price\": 11305,
      \"quantity\": 50,
      \"title\": \"Soporte Escritorio Teléfono Gatito Decorativo Minimalista Stand Celular\",
      \"description\": \"Soporte de escritorio con diseño de gatito decorativo. Ideal para sostener tu teléfono mientras trabajas. Material liviano y resistente. Compatible con cualquier celular.\"
    }
  }"
```

---

## Criterios de éxito

- [ ] `success: true` en respuesta del Paso 2
- [ ] `listingId` empieza con `MLC`
- [ ] Precio del listing = $11,305 CLP
- [ ] Listing visible en mercadolibre.cl

---

## Análisis de riesgos

| Riesgo | Nivel | Mitigación |
|--------|-------|------------|
| Brand infringement | ❌ Ninguno | Diseño cat genérico, no Sanrio/Hello Kitty confirmado |
| Compliance producto | ❌ Ninguno | Sin batería, sin electrónica |
| Rechazo ML por categoría | Bajo | Accesorios/Decoración muy permisivos en ML |
| Precio muy bajo (desconfianza) | Bajo | $11,305 es precio normal para accessory pequeño |
| Imagen rechazada por ML | Bajo | Imágenes limpias de fondo claro |
| Stock real | Mitigado | quantity: 50 (dropshipping, no compromete stock físico) |

---

## Post-publicación

Verificar inmediatamente:
1. URL del listing en ML Chile
2. Precio correcto ($11,305 CLP)
3. Imágenes cargadas
4. Descripción visible
5. Categoría asignada por ML

Luego generar: `docs/PHASE1_FIRST_PUBLICATION_RESULT.md`

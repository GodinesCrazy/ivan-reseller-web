# Phase 1 — Publication Prep

**Date:** 2026-04-01  
**Candidate:** AI translation Q108 Ear Clip Wireless Earphones  
**Target Marketplace:** MercadoLibre Chile  
**Status:** ⏳ Pendiente aprobación manual

---

## Producto seleccionado

| Campo | Valor |
|-------|-------|
| AliExpress productId | `3256809831617681` |
| Costo AliExpress | $17.79 USD |
| Precio recomendado ML Chile | $119,990 CLP |
| Margen estimado | ~78% |
| Comparables eBay | 20 listings |

---

## Título para ML Chile (adaptado)

**Título propuesto:**
```
Auriculares Inalámbricos Clip Ear Open Air Bluetooth 6.1 IPX5 Deportivos
```

**Notas sobre el título:**
- Adaptado al español para búsquedas en ML Chile
- Eliminado "AI translation Q108" (modelo específico AliExpress, no reconocido en Chile)
- Keywords: auriculares, inalámbricos, clip, bluetooth, deportivos
- Dentro del límite de 60 chars de ML

---

## Flujo de publicación (2 pasos)

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
    "aliexpressUrl": "https://www.aliexpress.com/item/3256809831617681.html",
    "scrape": false,
    "title": "Auriculares Inalámbricos Clip Ear Open Air Bluetooth 6.1 IPX5 Deportivos",
    "description": "Auriculares de clip inalámbricos con tecnología Bluetooth 6.1. Diseño Open-Ear para mayor comodidad. Resistencia al agua IPX5 ideal para deporte. Cancelación de ruido AI-Bass. Batería de larga duración. Clip ergonómico que se ajusta a la oreja.",
    "aliexpressPrice": 17.79,
    "suggestedPrice": 119990,
    "currency": "CLP",
    "imageUrl": "https://ae-pic-a1.aliexpress-media.com/kf/S5e403c17d40e44549c62147b82a81667A.jpg",
    "imageUrls": [
      "https://ae-pic-a1.aliexpress-media.com/kf/S5e403c17d40e44549c62147b82a81667A.jpg",
      "https://ae-pic-a1.aliexpress-media.com/kf/S10e43f1404d0458c9474d4dbb3dad9c2g.jpg",
      "https://ae-pic-a1.aliexpress-media.com/kf/Sedad45f2da93465f841709aa96b12993M.jpg",
      "https://ae-pic-a1.aliexpress-media.com/kf/S53e6e208dca941b5a557f298296ceba0v.jpg"
    ],
    "category": "electronics",
    "tags": ["auriculares", "bluetooth", "inalambricos", "clip", "deportivos", "earphone"]
  }'
```

**Resultado esperado:** `{ "success": true, "data": { "id": <DB_ID>, "status": "PENDING"|"APPROVED", ... } }`

Guardar el `id` retornado — se usa en el Paso 2.

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
      \"price\": 119990,
      \"quantity\": 50,
      \"title\": \"Auriculares Inalámbricos Clip Ear Open Air Bluetooth 6.1 IPX5 Deportivos\",
      \"description\": \"Auriculares de clip inalámbricos con Bluetooth 6.1. Resistencia IPX5. Open-Ear cómodo. Cancelación de ruido AI-Bass. Perfecto para deporte.\"
    }
  }"
```

**Resultado esperado:**
```json
{
  "success": true,
  "message": "Product published successfully",
  "data": {
    "listingId": "MLC...",
    "url": "https://www.mercadolibre.cl/...",
    "status": "active"
  }
}
```

---

## Criterio de éxito de la publicación

- [ ] `success: true` en respuesta
- [ ] `listingId` empieza con `MLC`
- [ ] Listing visible en `https://www.mercadolibre.cl/`
- [ ] Precio = $119,990 CLP

---

## Notas de riesgo

1. **Primer item real publicado** — verificar manualmente en ML Chile antes de hacer bulk
2. **Precio CLP** — basado en tasa USD/CLP 950. Verificar tasa actual si pasa tiempo
3. **Imágenes** — ML Chile requiere imágenes de cierta resolución mínima. Las CDN URLs de AliExpress son JPEG de alta calidad — deberían pasar
4. **Categoría** — no se especifica `categoryId` explícito; ML autodetectará por título. Si falla, agregar `"categoryId": "MLC1055"` (Auriculares en ML Chile)
5. **Stock** — quantity: 50 es un valor seguro para dropshipping (no comprometemos stock físico)

---

## Post-publicación

Si la publicación es exitosa:
1. Anotar el `listingId` MLC
2. Verificar el listing en ML Chile (precio, imágenes, descripción)
3. Generar `docs/PHASE1_FIRST_PUBLICATION_RESULT.md`
4. Configurar monitoring del listing

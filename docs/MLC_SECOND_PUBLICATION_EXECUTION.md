# MLC Segunda Publicación — Ejecución

**Fecha:** 2026-04-02  
**Commits involucrados:**

| Commit | Cambio |
|--------|--------|
| `66c20cd` | Fix precio doble-conversión + Fix imágenes (usar publishableImageInputs) |
| `8bfb09c` | Fix shipping: `handling_time: 25` para ETA honesto |
| `ec9d160` | Fix routes: `duplicateListing` perdido en Zod schema |
| `43acbac` | Fix bootstrap: 80% content fit (vs 60%) para pasar ML thumbnail quality |

---

## Fase A — Verificación pre-publish

| Check | Resultado |
|-------|-----------|
| `GET /api/health` | `{"status":"ok","timestamp":"2026-04-02T02:49:38Z"}` |
| `GET /api/version` gitSha | `ec9d160` (post shipping + routes fix) |
| Producto 32722 status | `VALIDATED_READY` |
| `suggestedPrice` | `"11305"` |
| `currency` | `"CLP"` |
| Listing anterior MLC3824634634 | `status: inactive` ✅ |

---

## Fase B — Bootstrap

| Intento | Commit runtime | packApproved | Resultado |
|---------|---------------|--------------|-----------|
| 1 | `8bfb09c` (60% fit) | `true` | ✅ — pero ML review flaggeó `poor_quality_thumbnail` |
| 2 (post 43acbac) | `43acbac` (80% fit) | `true` | ✅ — ML review PASS |

### Bootstrap exitoso (intento 2)

```
cover_main.jpg: 1200×1200, approvalState: approved, source: internal_processed
  fit: 80% (innerSide=960px, margin=120px each side), JPEG Q92
  portadaGateBypass: true (bypasses internal harsh-silhouette gate)
detail_mount_interface.jpg: 1200×1200, approvalState: approved
usage_context_clean: missing (optional, no generado)
```

---

## Fase C — Problemas encontrados y resueltos

### Problema 1: `duplicateListing` ignorado por Zod schema

**Error:** `"Este producto ya está publicado en Mercado Libre."`  
**Causa:** `publishProductSchema` en `marketplace.routes.ts` no incluía `duplicateListing`. El campo era stripped por Zod antes de llegar a `publishToMercadoLibre`. El guard de duplicado siempre activaba.  
**Fix:** Agregado `duplicateListing: z.boolean().optional()` al schema y pasado al `publishProduct` call. Commit `ec9d160`.

### Problema 2: `poor_quality_thumbnail` con 60% content fit

**Error:** Listing MLC1910063953 → `under_review` + `poor_quality_thumbnail`  
**Causa:** 60% fit = producto 720px en frame 1200px. ML's thumbnail quality scanner rechaza imágenes donde el producto ocupa menos del ~75-80% del frame.  
**Fix:** Cambio a 80% fit (innerSide=960px, margin=120px). Commit `43acbac`.  
**Acción:** Cerrado MLC1910063953 vía `PUT /items/MLC1910063953 {"status":"closed"}`.

---

## Fase C — Publicación final

**Payload enviado:**
```json
{
  "productId": 32722,
  "marketplace": "mercadolibre",
  "environment": "production",
  "duplicateListing": true,
  "customData": {
    "price": 11305,
    "quantity": 3,
    "title": "Soporte Escritorio Teléfono Gatito Decorativo Minimalista Stand Celular",
    "description": "Soporte de escritorio con diseño de gatito decorativo. Ideal para sostener tu teléfono mientras trabajas o estudias. Material plástico liviano y resistente. Diseño minimalista compatible con cualquier smartphone. Envío internacional desde origen, tiempo estimado de entrega 25-35 días hábiles."
  }
}
```

**Respuesta API:**
```json
{
  "success": true,
  "message": "Product published successfully",
  "data": {
    "success": true,
    "marketplace": "mercadolibre",
    "listingId": "MLC1910028953",
    "listingUrl": "https://articulo.mercadolibre.cl/MLC-1910028953-soporte-escritorio-telfono-gatito-decorativo-minimalista--_JM"
  }
}
```

---

## Histórico de listings MLC para producto 32722

| listingId | Motivo baja | Status final |
|-----------|-------------|--------------|
| `MLC3824634634` | Precio $10.5M CLP + imágenes CDN | `inactive` |
| `MLC1910063953` | `poor_quality_thumbnail` (60% fit) | `inactive` |
| `MLC1910028953` | **ACTIVO** — 80% fit, precio correcto | `active` ✅ |

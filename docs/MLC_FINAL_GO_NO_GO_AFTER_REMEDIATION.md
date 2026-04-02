# MLC Phase H — GO / NO-GO After Remediation

**Fecha:** 2026-04-02  
**Producto:** Soporte Escritorio Teléfono Gatito (productId: 32722)  
**Marketplace:** MercadoLibre Chile

---

## Criterios evaluados

### ✅ CORREGIDOS

| Criterio | Estado |
|----------|--------|
| **Precio correcto** — 11,305 CLP sin doble conversión | ✅ Fix en `66c20cd` |
| **Imágenes compliance** — pack aprobado (fondo blanco, sin texto) | ✅ Fix en `66c20cd` |
| **Shipping ETA honesto** — `handling_time: 25` declarado | ✅ Fix en shipping commit |
| **Listing defectuoso cerrado** — MLC3824634634 inactive | ✅ Cerrado vía ML API |
| **Producto en estado válido** — `VALIDATED_READY` | ✅ |
| **Deploy en producción** — health check OK | ✅ `2026-04-02T02:25:54Z` |
| **Proveedor AliExpress activo** — stock y precio auditados | ✅ auditedAt: 2026-04-01 |

---

### ⚠️ LIMITACIONES CONOCIDAS (no bloqueantes)

| Limitación | Impacto | Mitigación |
|-----------|---------|-----------|
| Railway filesystem efímero | Bootstrap requerido antes de cada publish | Protocolo documentado |
| Tracking submission sin prueba real | Primer pedido necesita seguimiento manual | Aceptable para test controlado |
| Order amount en DB guarda costo, no precio venta | Reportes de profit incorrectos | Fix pendiente (post-Phase H) |
| `me2` con tracking chino: compatibilidad sin confirmar | Posible rechazo del tracking por ML | Evaluar con primer pedido |

---

### ❌ NO HAY BLOQUEANTES PARA PHASE H

Todos los bugs críticos (precio, imagen, ETA) están corregidos y deployados.

---

## DECISIÓN: **GO CONDICIONAL**

**Phase H puede ejecutarse** bajo el siguiente protocolo estricto:

---

## Protocolo de publicación Phase H

### Paso 0 — Confirmar deploy (ejecutar antes de todo)

```bash
curl -s "https://ivan-reseller-backend-production.up.railway.app/api/health"
# Esperado: {"status":"ok",...}
```

### Paso 1 — Obtener JWT

```bash
PROD_URL="https://ivan-reseller-backend-production.up.railway.app"
JWT=$(curl -si -X POST "$PROD_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | grep "set-cookie" | grep -o "token=[^;]*" | cut -d= -f2-)
echo "JWT: ${#JWT} chars"
```

### Paso 2 — Bootstrap del image pack (OBLIGATORIO)

```bash
curl -s -X POST "$PROD_URL/api/publisher/bootstrap_image_pack/32722" \
  -H "Cookie: token=$JWT"
# Verificar: packApproved: true
# DETENER si packApproved !== true
```

### Paso 3 — Publicar (INMEDIATAMENTE después del bootstrap)

```bash
curl -s -X POST "$PROD_URL/api/marketplace/publish" \
  -H "Content-Type: application/json" \
  -H "Cookie: token=$JWT" \
  -d '{
    "productId": 32722,
    "marketplace": "mercadolibre",
    "environment": "production",
    "duplicateListing": true,
    "customData": {
      "price": 11305,
      "quantity": 3,
      "title": "Soporte Escritorio Teléfono Gatito Decorativo Minimalista Stand Celular",
      "description": "Soporte de escritorio con diseño de gatito decorativo. Ideal para sostener tu teléfono mientras trabajas. Material liviano y resistente. Compatible con cualquier celular. Envío internacional desde origen, tiempo estimado de entrega 25-35 días hábiles."
    }
  }'
```

> **Nota:** `"duplicateListing": true` permite republicar aunque exista el registro del listing anterior (MLC3824634634) en la misma DB.

### Paso 4 — Verificar el listing creado

```bash
# Usar la listingUrl retornada en el paso 3
# Verificar:
# 1. Precio = $11,305 CLP
# 2. ETA ≈ 27-28 días (no 2-5 días)
# 3. Imágenes: fondo blanco, sin logos
# 4. Título correcto
```

---

## Criterios de éxito Phase H

- [ ] `success: true` en respuesta publish
- [ ] `listingId` comienza con `MLC` (nuevo, diferente de MLC3824634634)
- [ ] Precio visible en listing = **$11,305 CLP**
- [ ] ETA visible ≈ 27-30 días (no 2-5 días)
- [ ] Imágenes: fondo blanco, sin texto, sin logos
- [ ] Listing status: `active`

---

## Acción en caso de fallo

| Error | Diagnóstico |
|-------|------------|
| `packApproved: false` en Paso 2 | Revisar logs de bootstrap; container puede haber reiniciado |
| Precio incorrecto en listing | Verificar que deploy de `66c20cd` está activo (git log en Railway) |
| `handling_time` no aparece en listing | Verificar que el shipping commit está deployado |
| `success: false` en publish | Leer body completo de error — no ignorar, no reintentar sin diagnóstico |

---

## Post-publicación inmediata

Si Phase H es exitosa:
1. Guardar el nuevo `listingId` en `docs/PHASE1_SECOND_PUBLICATION_RESULT.md`
2. Monitorear el listing por 24h
3. Si hay pedido: seguir protocolo manual de tracking (ver `POST_SALE_E2E_REAL_READINESS_AUDIT.md`)
4. No publicar nuevos productos hasta confirmar que el tracking submission funciona
